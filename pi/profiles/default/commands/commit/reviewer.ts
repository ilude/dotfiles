import { lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import timers from "node:timers/promises";
import { Agent } from "@earendil-works/pi-agent-core";
import { isContextOverflow, isRetryableAssistantError, type Api, type ImageContent, type Model, type TextContent, type Usage } from "@earendil-works/pi-ai";
import { createBashTool, createReadTool, type ExtensionAPI, type ExtensionContext, type ModelRuntime, withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { createProfileModelRuntime } from "../../lib/model-runtime.ts";
import { resolveLatestCodexModelFromRuntime } from "../../lib/model-selection.ts";
import { compareModelVersions, modelFamilyVersion } from "../../lib/model-family.ts";
import { normalizeRepositoryId, repositoryId } from "../../lib/path-identity.ts";
import { Type } from "typebox";
import { commitShellCommand, formatStatus } from "./tools.ts";

const MODEL_FAMILY = "luna";
const FALLBACK_PROVIDER = "anthropic";
const FALLBACK_FAMILY = "haiku";
const WORKFLOW_TIMEOUT_MS = 180_000;
const RESPONSE_RETRIES = 3;

/** Latest undated Haiku from the Anthropic subscription provider. */
export async function resolveFallbackModel(runtime: Pick<ModelRuntime, "getAvailable">, signal?: AbortSignal): Promise<Model<Api>> {
	const models = await runtime.getAvailable(FALLBACK_PROVIDER, { signal });
	const model = models.filter((candidate) => !/-\d{8}$/.test(candidate.id)).flatMap((candidate) => {
		const parsed = modelFamilyVersion(candidate.id);
		return parsed?.family === FALLBACK_FAMILY ? [{ candidate, version: parsed.version }] : [];
	}).sort((a, b) => compareModelVersions(b.version, a.version))[0]?.candidate;
	if (!model) throw new Error(`No authenticated ${FALLBACK_PROVIDER} ${FALLBACK_FAMILY} model is available`);
	return model;
}

export function validateGitignorePattern(pattern: string): string {
	if (!pattern || pattern.includes("\n") || pattern.includes("\r") || pattern.trim() !== pattern)
		throw new Error("Proposed .gitignore rule must be one trimmed line.");
	if (pattern.startsWith("!")) throw new Error("Negated .gitignore rules are not allowed.");
	if (/^[A-Za-z]:/.test(pattern) && (pattern[2] === "/" || pattern[2] === "\\") || pattern.startsWith("\\\\") || pattern.startsWith("//")) throw new Error("Absolute filesystem paths are not allowed as .gitignore rules.");
	if (/^[*/]+$/.test(pattern)) throw new Error("Blanket .gitignore rules are not allowed.");
	return pattern;
}

export function appendGitignoreRule(repoPath: string, pattern: string, signal?: AbortSignal): Promise<boolean> {
	const rule = validateGitignorePattern(pattern);
	const file = join(repoPath, ".gitignore");
	return withFileMutationQueue(file, async () => {
		signal?.throwIfAborted();
		let existing = "";
		try {
			if (lstatSync(file).isSymbolicLink()) throw new Error("Refusing to update a symlinked .gitignore.");
			existing = readFileSync(file, "utf8");
		} catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
		if (existing.split(/\r?\n/).some((line) => line === rule)) return false;
		const newline = existing.includes("\r\n") ? "\r\n" : "\n";
		const separator = existing && !existing.endsWith("\n") && !existing.endsWith("\r") ? newline : "";
		signal?.throwIfAborted();
		writeFileSync(file, `${existing}${separator}${rule}${newline}`, "utf8");
		return true;
	});
}

export function describeCommitTool(name: string, args: unknown): string {
	const input = args && typeof args === "object" ? args as Record<string, unknown> : {};
	if (name === "bash" || name === "inspect") {
		const command = String(input.command ?? "");
		return `shell command${command ? `: ${command}` : ""}`;
	}
	if (name === "read") return `file read: ${String(input.path ?? "unknown")}`;
	if (name === "ask_ignore") return `ignore decision: ${String(input.repo ?? ".")}/${String(input.candidate ?? input.path ?? "unknown")}`;
	return `tool ${name}`;
}

export function formatPublicationEligibility(push: boolean, branch: string): string {
	if (!push) return "";
	return branch
		? `Publication: eligible; attached branch ${JSON.stringify(branch)}. Check outgoing commits and publish this repository when applicable.`
		: "Publication: ineligible; detached HEAD. Silently skip publication checks and actions for this repository; do not re-check its branch, outgoing commits, upstream, remotes, or push, and do not mention the skip.";
}

export function buildCommitTask(push: boolean, root: string, inventory: readonly string[]): string {
	return `Execute the commit workflow now. ${push ? "Use only each inventory entry's deterministic Publication annotation. For eligible attached repositories, check outgoing commits after local commit work and publish deepest-first with publish_repository, which runs --recurse-submodules=no origin HEAD:refs/heads/<own-branch> and records Git's actual result. This includes clean initialized submodules with outgoing referenced commits. Silently skip detached entries without branch, outgoing, upstream, remote, or push checks or output. Push parents only after children. No force-push, tags, other branches, or automatic merge/rebase." : "Push was NOT requested. Do not run publication-related branch, upstream, outgoing, remote, or push checks or commands."}

Location (JSON-quoted absolute path; decode and shell-quote as data):
Repository root: ${JSON.stringify(root)}
Host platform: ${process.platform}. Bash runs locally on this host. Use the supplied paths as data; on Windows this is not WSL: prefer root-relative paths or forward-slash Windows paths, not invented /mnt/c paths.

Repository inventory (boundaries and initial state, not a candidate list; work deepest-first, running git add -A in each repository before staged review, then shape commits; stage parent gitlinks after child commits):
${inventory.join("\n\n")}`;
}

export interface CommitRunResult {
	readonly text: string;
	readonly elapsedMs: number;
	readonly model: string;
	readonly usage: Usage;
}

/** Run the private Git reviewer for an operator command, not a model-facing tool. */
export async function runCommitReviewer(pi: ExtensionAPI, ctx: ExtensionContext, push: boolean, signal?: AbortSignal, onProgress?: (text: string) => void): Promise<CommitRunResult> {

			const deadline = new AbortController();
			const combined = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
			let remaining = WORKFLOW_TIMEOUT_MS;
			let activeSince = Date.now();
			let timer: ReturnType<typeof setTimeout>;
			const resumeTimer = () => { activeSince = Date.now(); timer = setTimeout(() => deadline.abort(), Math.max(0, remaining)); };
			const pauseTimer = () => { clearTimeout(timer); remaining -= Date.now() - activeSince; };
			resumeTimer();
			let agent: Agent | undefined;
			let selectedModel: Model<Api> | undefined;
			let unsubscribe: (() => void) | undefined;
			const abort = () => agent?.abort();
			combined.addEventListener("abort", abort, { once: true });
			const progress = (text: string) => onProgress?.(text);
			let root: string | undefined;
			const baselines = new Map<string, string>();
			let failure: string | undefined;
			let outcome = "";
			const activeTools = new Map<string, { description: string; startedAt: number; terminal: boolean }>();
			const leftOut: string[] = [];
			const publicationBranches = new Map<string, { path: string; branch: string }>();
			let successfulPushes = 0;
			const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
			const git = async (args: string[], requestSignal?: AbortSignal, cwd?: string) => {
				const result = await pi.exec("git", ["-C", cwd ?? root ?? ctx.cwd, ...args], { signal: requestSignal, timeout: 15000 });
				if (result.killed || result.code !== 0) throw new Error(`Git ${args[0]} failed: ${result.killed ? "cancelled or timed out" : result.stderr.trim()}`);
				return result.stdout.trimEnd();
			};
			// A repository with no commits legitimately has no HEAD yet.
			const head = async (requestSignal?: AbortSignal, cwd?: string) => {
				const result = await pi.exec("git", ["-C", cwd ?? root ?? ctx.cwd, "rev-parse", "--verify", "--quiet", "HEAD"], { signal: requestSignal, timeout: 15000 });
				if (!result.killed && result.code === 1) return "";
				if (result.killed || result.code !== 0) throw new Error(`Git HEAD lookup failed: ${result.stderr.trim()}`);
				return result.stdout.trim();
			};
			progress("Inspecting repositories…");
			try {
				combined.throwIfAborted();
				root = realpathSync(await git(["rev-parse", "--show-toplevel"], combined));
				const discovered = await git(["submodule", "foreach", "--recursive", "--quiet", "printf '%s\\0' \"$toplevel/$sm_path\""], combined);
				const repositories = [root, ...discovered.split("\0").filter(Boolean).map((path) => realpathSync(path))]
					.filter((path, index, all) => all.indexOf(path) === index);
				const inventory: string[] = [];
				const repositoriesById = new Map<string, string>();
				for (const repository of repositories) {
					const id = repositoryId(root, repository);
					repositoriesById.set(id, repository);
					baselines.set(repository, await head(combined, repository));
					const status = formatStatus(await git(["status", "--porcelain=v1", "-z", "--untracked-files=all"], combined, repository));
					const instructions = (await git(["ls-files", "--", "AGENTS.md", ":(glob)**/AGENTS.md"], combined, repository)).split("\n").filter(Boolean);
					const branch = push ? await git(["branch", "--show-current"], combined, repository) : "";
					if (branch) publicationBranches.set(id, { path: repository, branch });
					const publication = formatPublicationEligibility(push, branch);
					inventory.push(`Repository: ${id}\nInstruction files: ${instructions.length ? instructions.join(", ") : "none"}${publication ? `\n${publication}` : ""}\n${status}`);
				}
				progress("Resolving commit model…");
				const runtime = await createProfileModelRuntime(combined);
				let usedFallback = false;
				let model: Model<Api>;
				try { model = await resolveLatestCodexModelFromRuntime(MODEL_FAMILY, runtime, combined); }
				catch (error) {
					combined.throwIfAborted();
					progress(`Luna unavailable (${error instanceof Error ? error.message : String(error)}); using ${FALLBACK_FAMILY}…`);
					model = await resolveFallbackModel(runtime, combined);
					usedFallback = true;
				}
				selectedModel = model;
				const read = createReadTool(root);
				const shell = createBashTool(root);
				agent = new Agent({
					initialState: {
						model, thinkingLevel: "low",
						systemPrompt: readFileSync(join(dirname(fileURLToPath(import.meta.url)), "reviewer.md"), "utf8"),
						tools: [
							...(push ? [{
								name: "publish_repository", label: "Publish repository",
								description: "Push an eligible inventory repository's captured branch to origin. Use instead of shell git push so the runner records Git's actual result. Call deepest-first after outgoing checks.",
								parameters: Type.Object({ repo: Type.String() }),
								execute: async (_id: string, input: unknown) => {
									const { repo } = input as { repo: string };
									const target = publicationBranches.get(normalizeRepositoryId(repo));
									if (!target) throw new Error(`No attached publication target in inventory: ${repo}`);
									const output = await git(["push", "--recurse-submodules=no", "origin", `HEAD:refs/heads/${target.branch}`], combined, target.path);
									successfulPushes++;
									return { content: [{ type: "text" as const, text: output || "Push succeeded." }], details: {} };
								},
							}] : []),
							{
								...shell, name: "inspect", label: "Inspect repository",
								description: "Run read-only shell inspections, including Git status/diff/check-ignore and searches. Compound commands and pipes are allowed. Nonzero exits return to you for interpretation or correction, including normal no-match results. Never stage, unstage, write files, commit, or push here; use bash for mutations. " + shell.description,
								execute: (id, args, toolSignal, update) => shell.execute(id, { ...(args as Parameters<typeof shell.execute>[1]), timeout: 15 }, toolSignal, update),
							},
							{
								...shell,
								description: "Run repository mutations, including staging, unstaging, index preservation, and commits with normal hooks. Git commit automatically skips an empty staged index. A nonzero read-only Git check or a refused working-tree discard ends the call with an explanation instead of failing. Any actual mutation failure stops this workflow and blocks queued tools. Keep read-only inspections in inspect, not in mutation calls. " + shell.description,
								execute: (id, args, toolSignal, update) => {
									const input = args as Parameters<typeof shell.execute>[1];
									return shell.execute(id, { ...input, command: commitShellCommand(input.command), timeout: 15 }, toolSignal, update);
								},
							},
							{ ...read, execute: async (id, input, toolSignal, update) => {
								const args = input as Parameters<typeof read.execute>[1];
								try { return await read.execute(id, args, toolSignal, update); }
								catch (error) {
									if ((error as NodeJS.ErrnoException).code === "ENOENT" && /^(AGENTS(?:\.override)?\.md|CLAUDE\.md)$/i.test(basename(args.path))) {
										return { content: [{ type: "text" as const, text: "No optional instructions file here; continue." }], details: {} };
									}
									throw error;
								}
							} },
							{
								name: "ask_ignore", label: "Ignore decision",
								description: "After staging, ask whether an uncertain new file should be included, added to that repository's .gitignore, or left untracked. Exclusions are unstaged without deleting working contents; ignore changes are staged.",
								parameters: Type.Object({ repo: Type.String(), candidate: Type.String(), reason: Type.String(), pattern: Type.String() }),
								execute: async (_id, input) => {
									const { repo, candidate, reason, pattern } = input as { repo: string; candidate: string; reason: string; pattern: string };
									if (!ctx.hasUI) throw new Error(`User input required for ${candidate}: ${reason}. Run /commit interactively.`);
									const id = normalizeRepositoryId(repo);
									const repository = repositoriesById.get(id);
									if (!repository) throw new Error(`Repository is not in the supplied inventory: ${repo}`);
									if (!candidate || /^[\\/]/.test(candidate) || /^[A-Za-z]:/.test(candidate) || candidate.split(/[\\/]+/).includes(".."))
										throw new Error(`Candidate must be repository-relative: ${candidate}`);
									const added = await git(["--literal-pathspecs", "diff", "--cached", "--diff-filter=A", "--name-only", "-z", "--", candidate], combined, repository);
									if (!added.split("\0").includes(candidate)) throw new Error(`Ignore decisions require a staged new file, not a tracked modification: ${candidate}`);
									const rule = validateGitignorePattern(pattern);
									pauseTimer();
									progress("Waiting for ignore-file decision…");
									try {
										const answer = await ctx.ui.select(`Candidate: ${candidate}\nReason: ${reason}\nProposed rule: ${rule}`, ["Include in commit", "Add to .gitignore", "Leave untracked"], { signal: combined });
										if (!answer) throw new Error("Ignore-file decision cancelled.");
										if (answer !== "Include in commit") {
											combined.throwIfAborted();
											if (answer === "Add to .gitignore") await appendGitignoreRule(repository, rule, combined);
											// rm --cached also works before the repository's first commit.
											await git(["--literal-pathspecs", "rm", "--cached", "--", candidate], combined, repository);
											if (answer === "Add to .gitignore") await git(["add", "--", ".gitignore"], combined, repository);
											leftOut.push(`${id === "." ? "" : `${id}/`}${candidate}: ${answer} (${reason})`);
										}
										return { content: [{ type: "text" as const, text: `${answer}: ${id}/${candidate}` }], details: {} };
									} finally { resumeTimer(); progress("Reviewing changes…"); }
								},
							},
						],
					},
					// Response-level recovery below owns the retry budget, including stream failures.
					streamFn: (model, context, options) => runtime.streamSimple(model, context, { ...options, maxRetries: 0 }),
					toolExecution: "sequential",
					beforeToolCall: async () => {
						if (failure) return { block: true, reason: failure, terminate: true };
						return undefined;
					},
					finishTurn: () => failure ? { action: "end" } : undefined,
				});
				unsubscribe = agent.subscribe((event) => {
					if (event.type === "tool_execution_start") {
						progress(event.toolName === "bash" || event.toolName === "inspect" ? "Running Git/shell command…" : event.toolName === "read" ? "Reading repository instructions and changes…" : "Preparing ignore-file decision…");
						activeTools.set(event.toolCallId, { description: describeCommitTool(event.toolName, event.args), startedAt: Date.now(), terminal: event.toolName === "ask_ignore" || event.toolName === "publish_repository" || event.toolName === "bash" });
					}
					if (event.type === "tool_execution_end") {
						const active = activeTools.get(event.toolCallId);
						activeTools.delete(event.toolCallId);
						progress("Reviewing changes…");
						if (event.isError && active?.terminal && !failure) {
							const text = (event.result.content as (TextContent | ImageContent)[]).filter((part) => part.type === "text").map((part) => part.text).join("\n");
							failure = `${active?.description ?? `tool ${event.toolName}`} failed after ${active ? Date.now() - active.startedAt : "unknown"}ms\n${text}`;
						}
					}
					if (event.type === "message_end" && event.message.role === "assistant") {
						const item = event.message.usage;
						for (const key of ["input", "output", "cacheRead", "cacheWrite", "totalTokens"] as const) usage[key] += item[key];
						for (const key of ["input", "output", "cacheRead", "cacheWrite", "total"] as const) usage.cost[key] += item.cost[key];
					}
				});
				combined.throwIfAborted();
				progress("Reviewing changes…");
				await agent.prompt(buildCommitTask(push, root, inventory));
				const lastError = () => {
					const last = agent!.state.messages.at(-1);
					return last?.role === "assistant" && last.stopReason === "error" ? last : undefined;
				};
				for (;;) {
					for (let retry = 0; retry < RESPONSE_RETRIES; retry++) {
						combined.throwIfAborted();
						if (failure) throw new Error(failure);
						const last = lastError();
						if (!last
							|| (!isRetryableAssistantError(last) && last.errorMessage !== "WebSocket stream closed before response.completed")
							|| isContextOverflow(last, model.contextWindow)
							|| /timed?\s*out|timeout/i.test(last.errorMessage ?? "")) break;
						progress(`Retrying model response (${retry + 1}/${RESPONSE_RETRIES})…`);
						await timers.setTimeout(1000 * 2 ** retry, undefined, { signal: combined });
						combined.throwIfAborted();
						// Agent never executes tools from an errored response. Remove only that
						// response, keeping all completed tool results, as native Pi retry does.
						agent.state.messages = agent.state.messages.slice(0, -1);
						progress("Reviewing changes…");
						await agent.continue();
					}
					combined.throwIfAborted();
					if (failure) throw new Error(failure);
					const last = lastError();
					if (!last || usedFallback) break;
					// Luna failed after retries: continue the same transcript on Haiku.
					let fallback: Model<Api>;
					try { fallback = await resolveFallbackModel(runtime, combined); }
					catch { break; }
					usedFallback = true;
					model = fallback;
					selectedModel = fallback;
					progress(`Luna failed (${last.errorMessage ?? "error"}); retrying with ${fallback.id}…`);
					agent.state.messages = agent.state.messages.slice(0, -1);
					agent.state.model = fallback;
					await agent.continue();
				}
				combined.throwIfAborted();
				if (failure) throw new Error(failure);
				const last = [...agent.state.messages].reverse().find((message) => message.role === "assistant");
				if (!last || last.stopReason === "error" || last.stopReason === "aborted") throw new Error(last?.errorMessage || `${selectedModel?.id ?? "Model"} returned no response.`);
				outcome = last.content.filter((part) => part.type === "text").map((part) => part.text).join("\n").trim();
			} catch (error) {
				failure = signal?.aborted ? "Cancelled" : deadline.signal.aborted ? "Timed out" : error instanceof Error ? error.message : String(error);
			} finally {
				pauseTimer();
				combined.removeEventListener("abort", abort);
				agent?.abort();
				if (agent) await agent.waitForIdle();
				unsubscribe?.();
			}
			// Report Git's actual state even after cancellation/failure: a commit may already
			// have completed. These read-only queries do not reuse the cancelled signal.
			progress("Collecting commit results…");
			let summary = "";
			if (root && baselines.size) {
				try {
					const commits: string[] = [];
					const remaining: string[] = [];
					for (const [repository, base] of [...baselines].sort(([a], [b]) => b.length - a.length)) {
						const label = repositoryId(root, repository);
						const current = await head(undefined, repository);
						if (current && current !== base) {
							const log = await git(["log", "--reverse", "--format=%h %s", ...(base ? [`${base}..${current}`] : [current])], undefined, repository);
							commits.push(...log.split("\n").filter(Boolean).map((line) => label === "." ? line : `${line} (${label})`));
						}
						const status = await git(["status", "-s", "--untracked-files=all"], undefined, repository);
						if (status) remaining.push(`${label}:\n${status}`);
					}
					summary = [commits.join("\n") || "No commits created.", remaining.length ? `Remaining changes:\n${remaining.join("\n")}` : ""].filter(Boolean).join("\n");
				} catch (error) { failure = [failure, `Status reporting failed: ${error instanceof Error ? error.message : String(error)}`].filter(Boolean).join("\n"); }
			}
			const publication = push && publicationBranches.size > 0
				? successfulPushes > 0
					? failure ? `${successfulPushes} push${successfulPushes === 1 ? "" : "es"} succeeded before the workflow stopped.` : "Pushed."
					: "No pushes performed."
				: "";
			const preserved = outcome.split("\n").filter(line => line.startsWith("Preserved index content: ")).join("\n");
			const exclusions = outcome.split("\n").filter(line => line.startsWith("Left out: "));
			const report = [summary, preserved, leftOut.length ? `Left out: ${leftOut.join(", ")}` : "", ...exclusions, publication].filter(Boolean).join("\n");
			if (failure) throw new Error(`${failure}\n${report}\nStopped; existing commits and changes were not undone.`);
			return { text: report, elapsedMs: WORKFLOW_TIMEOUT_MS - remaining, model: `${selectedModel?.provider}/${selectedModel?.id}:low`, usage };
}
