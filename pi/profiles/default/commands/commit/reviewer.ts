import { lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import timers from "node:timers/promises";
import { Agent } from "@earendil-works/pi-agent-core";
import { isContextOverflow, isRetryableAssistantError, type Api, type ImageContent, type Model, type TextContent, type Usage } from "@earendil-works/pi-ai";
import { createBashTool, createReadTool, type ExtensionAPI, type ExtensionContext, type ModelRuntime, withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { createProfileModelRuntime } from "../../lib/model-runtime.ts";
import { accountHelperStream, helperResponseAccounting } from "../../lib/bedrock/helper-accounting.ts";
import { resolveLatestCodexModelFromRuntime } from "../../lib/model-selection.ts";
import { compareModelVersions, modelFamilyVersion } from "../../lib/model-family.ts";
import { normalizeRepositoryId, repositoryId, samePlatformPath } from "../../lib/path-identity.ts";
import { Type } from "typebox";
import { commitShellCommand, formatStatus } from "./tools.ts";
import { executeCommitPlan, parseCommitStatus, validateCommitPlan, type CommitPlan } from "./plan.ts";
import { discoverCommitRepositories } from "./repositories.ts";
import { withCommitStatusRetry } from "./status.ts";

const MODEL_FAMILY = "terra";
const FALLBACK_PROVIDER = "anthropic";
const FALLBACK_FAMILY = "haiku";
const GIT_TIMEOUT_MS = 15_000;
const PUBLICATION_TIMEOUT_MS = 120_000;
const RESPONSE_RETRIES = 3;
const STATUS_ARGS = ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignore-submodules=dirty"];

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
	if (name === "ask_ignore") return `ignore decision: ${String(input.candidate ?? input.path ?? "unknown")} (repository ${String(input.repo ?? ".")})`;
	if (name === "submit_commit_plan") return `commit plan: ${String(input.repo ?? ".")}`;
	return `tool ${name}`;
}

export function formatPublicationEligibility(push: boolean, branch: string): string {
	if (!push) return "";
	return branch
		? `Publication: code-owned; attached branch ${JSON.stringify(branch)}. The runner checks outgoing commits, fetches origin/${branch} and merges its resolved commit without rebasing or relying on FETCH_HEAD, and publishes after a successful pass.`
		: "Publication: ineligible; detached HEAD. Silently skip publication checks and actions for this repository; do not re-check its branch, outgoing commits, upstream, remotes, or push, and do not mention the skip.";
}

export function buildCommitTask(push: boolean, root: string, inventory: readonly string[], currentRepository = "."): string {
	return `Review the staged changes and submit a complete commit plan now. ${push ? "Publication is code-owned, including clean initialized submodules with outgoing referenced commits. Do not check outgoing commits or run pull/push. The runner integrates and publishes children before parents, silently skipping detached entries. It will request conflict resolution separately if needed." : "Push was NOT requested. Do not run publication-related branch, upstream, outgoing, remote, or push checks or commands."}

Location (JSON-quoted absolute path; decode and shell-quote as data):
Workflow root: ${JSON.stringify(root)}
Repository root: ${JSON.stringify(currentRepository === "." ? root : join(root, currentRepository))}
Host platform: ${process.platform}. Bash runs locally on this host. Use the supplied paths as data; on Windows this is not WSL: prefer repository-relative paths or forward-slash Windows paths, not invented /mnt/c paths.

Current repository: ${currentRepository}. Work only in this repository for this pass. The runner has preserved index-only content, run git add -A, applied the settings policy, and staged child gitlinks before staged review. Read applicable instructions and staged diffs, then call submit_commit_plan covering every current changed path exactly once. Do not process other repositories in this pass.\n\nRepository inventory (current repository details and other repository boundaries, not a cross-repository candidate list):
${inventory.map(entry => entry.startsWith(`Repository: ${currentRepository}\n`) ? entry : entry.split("\n")[0]).join("\n\n")}`;
}

export interface CommitRunResult {
	readonly text: string;
	readonly elapsedMs: number;
	readonly model: string;
	readonly usage: Usage;
}

/** Run the private Git reviewer for an operator command, not a model-facing tool. */
export async function runCommitReviewer(pi: ExtensionAPI, ctx: ExtensionContext, push: boolean, signal?: AbortSignal, onProgress?: (text: string) => void): Promise<CommitRunResult> {

			const account = helperResponseAccounting(ctx, pi);
			// A progressing multi-repository run must not cancel its final push just
			// because earlier repositories consumed an overall wall-clock budget.
			const combined = signal ?? new AbortController().signal;
			const startedAt = Date.now();
			let userWaitMs = 0;
			let agent: Agent | undefined;
			let selectedModel: Model<Api> | undefined;
			let thinkingLevel: "low" | "medium" = "medium";
			let unsubscribe: (() => void) | undefined;
			const abort = () => agent?.abort();
			combined.addEventListener("abort", abort, { once: true });
			const progress = (text: string) => onProgress?.(text);
			let root: string | undefined;
			const baselines = new Map<string, string>();
			let failure: string | undefined;
			const preservedIndex: string[] = [];
			const exclusionsByRepository = new Map<string, Map<string, string>>();
			const requiredExclusions = new Map<string, Map<string, string>>();
			const activeTools = new Map<string, { description: string; startedAt: number; terminal: boolean; mutating?: boolean }>();
			const leftOut: string[] = [];
			const publicationBranches = new Map<string, { path: string; branch: string }>();
			let successfulPushes = 0;
			let attemptedPushes = 0;
			let unresolvedPublicationConflict: string | undefined;
			const unknownPushes = new Set<string>();
			const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
			const exec = withCommitStatusRetry(pi.exec.bind(pi), message => { failure ??= message; }, progress);
			const git = async (args: string[], requestSignal?: AbortSignal, cwd?: string, timeout = GIT_TIMEOUT_MS) => {
				const result = await exec("git", ["-C", cwd ?? root ?? ctx.cwd, ...args], { signal: requestSignal, timeout });
				if (result.killed || result.code !== 0) throw new Error(`Git ${args[0]} failed: ${result.killed ? "cancelled or timed out" : result.stderr.trim()}`);
				return result.stdout.trimEnd();
			};
			// A repository with no commits legitimately has no HEAD yet.
			const head = async (requestSignal?: AbortSignal, cwd?: string) => {
				const result = await pi.exec("git", ["-C", cwd ?? root ?? ctx.cwd, "rev-parse", "--verify", "--quiet", "HEAD"], { signal: requestSignal, timeout: GIT_TIMEOUT_MS });
				if (!result.killed && result.code === 1) return "";
				if (result.killed || result.code !== 0) throw new Error(`Git HEAD lookup failed: ${result.stderr.trim()}`);
				return result.stdout.trim();
			};
			const unfinishedPaths = async (repository: string, requestSignal?: AbortSignal): Promise<string[]> => {
				const excluded = exclusionsByRepository.get(repository);
				return parseCommitStatus(await git(STATUS_ARGS, requestSignal, repository)).filter(entry => {
					const staged = entry.xy !== "??" && entry.xy[0] !== " ";
					return staged || !excluded?.has(entry.path) || (entry.source !== undefined && !excluded.has(entry.source));
				}).map(entry => `${entry.xy} ${JSON.stringify(entry.path)}`);
			};
			progress("Inspecting repositories…");
			try {
				combined.throwIfAborted();
				root = realpathSync(await git(["rev-parse", "--show-toplevel"], combined));
				const repositories = await discoverCommitRepositories(pi, root, combined, GIT_TIMEOUT_MS);
				const inventory: string[] = [];
				const repositoriesById = new Map<string, string>();
				for (const repository of repositories) {
					const id = repositoryId(root, repository);
					repositoriesById.set(id, repository);
					baselines.set(repository, await head(combined, repository));
					const status = formatStatus(await git(STATUS_ARGS, combined, repository));
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
					progress(`Terra unavailable (${error instanceof Error ? error.message : String(error)}); using ${FALLBACK_FAMILY}…`);
					model = await resolveFallbackModel(runtime, combined);
					usedFallback = true;
					thinkingLevel = "low";
				}
				selectedModel = model;

				// Only immediate initialized children contribute gitlinks to this index.
				const children = new Map<string, Array<{ repository: string; path: string }>>();
				for (const repository of repositories.filter(path => path !== root)) {
					const parent = repositories.filter(path => {
						const id = repositoryId(path, repository);
						return id !== "." && id !== ".." && !id.startsWith("../");
					})
						.sort((a, b) => b.length - a.length)[0];
					if (!parent) continue;
					const links = children.get(parent) ?? [];
					links.push({ repository, path: repositoryId(parent, repository) });
					children.set(parent, links);
				}
				const publishedHeads = new Map<string, string>();
				let currentRepository = "";
				let submittedPlan: CommitPlan | undefined;
				let lastPlanErrors = "";
				let resolvingConflict = false;
				let mutationProblem: string | undefined;
				let repairToolsPending = false;
				const stageParentGitlinks = async (repository: string): Promise<string[]> => {
					const links = children.get(repository) ?? [];
					if (!links.length) return [];
					const pending: string[] = [], stage: string[] = [];
					const parentHead = await head(combined, repository);
					for (const link of links) {
						if (exclusionsByRepository.get(repository)?.has(link.path)) continue;
						const childHead = await head(combined, link.repository);
						if (!childHead) continue;
						const index = await git(["--literal-pathspecs", "ls-files", "--stage", "-z", "--", link.path], combined, repository);
						// Respect staged removal/replacement of a submodule, not just exclusions.
						if (!index.startsWith("160000 ")) continue;
						const indexed = /^160000 ([0-9a-f]+) 0\t/.exec(index)?.[1];
						const committed = parentHead ? /^160000 commit ([0-9a-f]+)\t/.exec(await git(["--literal-pathspecs", "ls-tree", "-z", "HEAD", "--", link.path], combined, repository))?.[1] : undefined;
						if (committed === childHead) continue;
						const protectedIndex = indexed !== committed && indexed !== childHead;
						pending.push(`${link.path}: ${committed ?? "uncommitted"} -> ${childHead}${protectedIndex ? " (review existing index-only/conflicted content before staging)" : ""}`);
						if (!protectedIndex && indexed !== childHead) stage.push(link.path);
					}
					if (stage.length) await git(["--literal-pathspecs", "add", "--", ...stage], combined, repository);
					return pending;
				};
				const publishRepository = async (repo: string): Promise<{ content: Array<{ type: "text"; text: string }>; details: Record<string, never>; isError?: boolean; needsReview?: boolean }> => {
					const target = publicationBranches.get(normalizeRepositoryId(repo));
					if (!target) throw new Error(`No attached publication target in inventory: ${repo}`);
					const pendingResult = (pending: string[]) => ({ content: [{ type: "text" as const, text: `Updated child gitlinks need a reviewed plan before publishing ${repo}:\n${pending.join("\n")}` }], details: {}, needsReview: true });
					const pending = await stageParentGitlinks(target.path);
					if (pending.length) return pendingResult(pending);
					const unfinished = await unfinishedPaths(target.path, combined);
					if (unfinished.length) return { content: [{ type: "text" as const, text: `Review remaining changes before publishing ${repo}:\n${unfinished.join("\n")}` }], details: {}, needsReview: true };
					if (publishedHeads.get(target.path) === await head(combined, target.path))
						return { content: [{ type: "text" as const, text: "This repository HEAD has already been published." }], details: {} };
					if (unresolvedPublicationConflict && unresolvedPublicationConflict !== normalizeRepositoryId(repo)) throw new Error("Publication blocked until the unresolved pull conflict is resolved and its repository is retried.");
					const ref = `refs/heads/${target.branch}`;
					const remoteRef = `refs/remotes/origin/${target.branch}`;
					const fetched = await pi.exec("git", ["-C", target.path, "fetch", "--no-write-fetch-head", "origin", `+${ref}:${remoteRef}`], { signal: combined, timeout: PUBLICATION_TIMEOUT_MS });
					if (fetched.killed || fetched.code !== 0) {
						if (fetched.killed) return { content: [{ type: "text" as const, text: `Fetch before publication timed out or was cancelled for origin/${target.branch}. Do not push.` }], details: {}, isError: true };
						let remoteBranch: string | undefined;
						try { remoteBranch = await git(["ls-remote", "--heads", "origin", ref], combined, target.path, PUBLICATION_TIMEOUT_MS); }
						catch { /* A failed verification must not authorize publication. */ }
						if (remoteBranch === undefined || remoteBranch) return { content: [{ type: "text" as const, text: `Fetch before publication failed: ${fetched.stderr.trim()}. Do not push.` }], details: {}, isError: true };
						// An empty origin branch is a valid first publication.
					} else {
						// Background fetches share FETCH_HEAD and can change tracking refs.
						const fetchedHead = await git(["rev-parse", "--verify", `${remoteRef}^{commit}`], combined, target.path);
						const integrated = await pi.exec("git", ["-C", target.path, "merge", "--ff", "--no-edit", "-m", `Merge origin/${target.branch}`, fetchedHead], { signal: combined, timeout: PUBLICATION_TIMEOUT_MS });
						if (integrated.killed) return { content: [{ type: "text" as const, text: `Merge before publication timed out or was cancelled for origin/${target.branch}. Do not push.` }], details: {}, isError: true };
						if (integrated.code !== 0) {
							const conflicts = await git(["diff", "--name-only", "--diff-filter=U"], combined, target.path);
							if (conflicts) {
								unresolvedPublicationConflict = normalizeRepositoryId(repo);
								return { content: [{ type: "text" as const, text: `Merge from origin/${target.branch} established merge conflicts in: ${conflicts}. Do not publish this or any parent repository yet. Resolve only when intent is clear, stage and commit the merge with bash. The runner will verify the merge and retry publication; do not pull or push yourself.` }], details: {} };
							}
							return { content: [{ type: "text" as const, text: `Merge before publication failed without an established merge conflict: ${integrated.stderr.trim()}. Do not push.` }], details: {}, isError: true };
						}
					}
					unresolvedPublicationConflict = undefined;
					const integratedLinks = await stageParentGitlinks(target.path);
					if (integratedLinks.length) return pendingResult(integratedLinks);
					const remaining = await unfinishedPaths(target.path, combined);
					if (remaining.length) return { content: [{ type: "text" as const, text: `Review remaining changes after integration in ${repo}:\n${remaining.join("\n")}` }], details: {}, needsReview: true };
					const intendedHead = await head(combined, target.path);
					attemptedPushes++;
					unknownPushes.add(repo);
					const pushed = await pi.exec("git", ["-C", target.path, "push", "--recurse-submodules=no", "origin", `HEAD:${ref}`], { signal: combined, timeout: PUBLICATION_TIMEOUT_MS });
					let output = pushed.stdout.trimEnd();
					if (pushed.killed) {
						// A killed client may have already published. Observe the remote without
						// reusing a cancelled signal, and never retry the mutation automatically.
						let remote = "";
						try { remote = await git(["ls-remote", "--heads", "origin", ref], undefined, target.path, PUBLICATION_TIMEOUT_MS); }
						catch { /* Keep the publication outcome unknown when verification fails. */ }
						if (!intendedHead || !remote.split("\n").some(line => line === `${intendedHead}\t${ref}`))
							throw new Error(`Git push outcome unknown: cancelled or timed out; remote branch could not be confirmed at ${intendedHead}. Check origin ${ref} before retrying.`);
						output = "Push confirmed on the remote after cancellation or timeout.";
					} else if (pushed.code !== 0) {
						unknownPushes.delete(repo);
						throw new Error(`Git push failed: ${pushed.stderr.trim()}`);
					}
					unknownPushes.delete(repo);
					successfulPushes++;
					publishedHeads.set(target.path, intendedHead);
					return { content: [{ type: "text" as const, text: output || "Push succeeded." }], details: {} };
				};
				const prepareRepository = async (repository: string) => {
					const entries = parseCommitStatus(await git(STATUS_ARGS, combined, repository));
					if (entries.some(entry => /U|AA|DD/.test(entry.xy))) throw new Error(`Unresolved conflicts in ${repositoryId(root!, repository)} before review.`);
					if (entries.some(entry => entry.xy !== "??" && entry.xy[0] !== " " && entry.xy[1] !== " ")) {
						// stash create cannot walk both a gitlink and its former tracked
						// descendants. Use the index snapshot for structural replacements.
						const replacement = entries.some(parent => entries.some(child => child.path.startsWith(`${parent.path}/`)));
						let oid = replacement ? "" : await git(["stash", "create"], combined, repository);
						if (!oid) {
							// Also covers submodule-only differences omitted by stash create.
							// Retain the index in the same ^2 layout without changing working files.
							const base = await head(combined, repository);
							if (!base) throw new Error("Could not preserve index-only content before staging.");
							const tree = await git(["write-tree"], combined, repository);
							const index = await git(["commit-tree", tree, "-p", base, "-m", "Pre-commit index content"], combined, repository);
							oid = await git(["commit-tree", tree, "-p", base, "-p", index, "-m", "Pre-commit index content"], combined, repository);
						}
						await git(["stash", "store", "-m", "Pre-commit index content", oid], combined, repository);
						preservedIndex.push(`Preserved index content: ${oid} (${repositoryId(root!, repository)}; retained in refs/stash)`);
					}
					await git(["add", "-A"], combined, repository);
					const staged = parseCommitStatus(await git(STATUS_ARGS, combined, repository));
					if (staged.some(entry => entry.path === ".pi/settings.json")) {
						const commonDirectory = await git(["rev-parse", "--path-format=absolute", "--git-common-dir"], combined, repository);
						if (!samePlatformPath(commonDirectory, join(homedir(), ".dotfiles", ".git"))) {
							await appendGitignoreRule(repository, ".pi/settings.json", combined);
							if (await head(combined, repository)) await git(["--literal-pathspecs", "restore", "--staged", "--", ".pi/settings.json"], combined, repository);
							else await git(["--literal-pathspecs", "rm", "--cached", "--", ".pi/settings.json"], combined, repository);
							await git(["add", "--", ".gitignore"], combined, repository);
							const reason = "Repository-local Pi settings policy";
							const required = requiredExclusions.get(repository) ?? new Map<string, string>();
							required.set(".pi/settings.json", reason);
							requiredExclusions.set(repository, required);
							const excluded = exclusionsByRepository.get(repository) ?? new Map<string, string>();
							excluded.set(".pi/settings.json", reason);
							exclusionsByRepository.set(repository, excluded);
							leftOut.push(`${repositoryId(root!, repository) === "." ? "" : `${repositoryId(root!, repository)}/`}.pi/settings.json: ${reason}`);
						}
					}
					await stageParentGitlinks(repository);
				};
				const hasOutgoing = async (repository: string, branch: string): Promise<boolean> => {
					const current = await head(combined, repository);
					if (!current) return false;
					if (current !== baselines.get(repository)) return true;
					const remoteRef = `refs/remotes/origin/${branch}`;
					const refs = await git(["for-each-ref", "--format=%(refname)", remoteRef], combined, repository);
					return !refs.split("\n").includes(remoteRef) || Number(await git(["rev-list", "--count", `${remoteRef}..HEAD`], combined, repository)) > 0;
				};
				let read = createReadTool(root);
				let shell = createBashTool(root);
				const conflictShell: typeof shell = {
					...shell,
					description: "Resolve only the current repository's established publication pull conflicts, then stage and commit the merge with normal hooks. Inspect failures and correct the operation before continuing. Never pull, push, switch branches, rewrite history, or discard unrelated work. " + shell.description,
					execute: (id, args, toolSignal, update) => shell.execute(id, { ...args, command: commitShellCommand(args.command), timeout: 15 }, toolSignal, update),
				};
				const repairShell: typeof shell = {
					...conflictShell,
					description: "Repair the reported local commit or publication problem in this repository. Inspect actual state first and fix only issues whose resolution is clear, such as formatter changes or an incorrect command. Do not bypass hooks, checks, or ignore rules, discard work, switch branches, rewrite history, or change credentials. Leave ordinary staging, commits, pull, and push to the runner; you may stage resolved conflicts to clear an unmerged index. Report a blocker if user intent or access is required. After a successful repair call, the runner refreshes staging and returns current status for review. " + shell.description,
					execute: async (id, args, toolSignal, update) => {
						const result = await conflictShell.execute(id, args, toolSignal, update);
						if (result.isError) return result;
						await prepareRepository(currentRepository);
						return { ...result, content: [...result.content, { type: "text" as const, text: `Runner refreshed staging after repair:\n${formatStatus(await git(STATUS_ARGS, combined, currentRepository))}` }] };
					},
				};
				agent = new Agent({
					initialState: {
						model, thinkingLevel,
						systemPrompt: readFileSync(join(dirname(fileURLToPath(import.meta.url)), "reviewer.md"), "utf8"),
						tools: [
							{
								name: "submit_commit_plan", label: "Submit commit plan",
								description: "Submit the complete reviewed whole-file plan for the current repository. Cover every path in current porcelain v1 -z status exactly once, in one commit or an exclusion with a concrete reason. Include both rename endpoints together. Subjects must be trimmed, nonempty single lines. An accepted plan ends review; code executes it. Use validation errors to correct the plan and continue. Invalid plans never authorize commits.",
								parameters: Type.Object({
									repo: Type.String(),
									commits: Type.Array(Type.Object({ subject: Type.String(), paths: Type.Array(Type.String()) })),
									exclusions: Type.Array(Type.Object({ path: Type.String(), reason: Type.String() })),
								}),
								execute: async (_id, input) => {
									const status = await git(STATUS_ARGS, combined, currentRepository);
									const validation = validateCommitPlan(input, status, repositoryId(root!, currentRepository));
									if (!validation.ok) throw new Error(validation.errors.join("\n"));
									const mandatory = requiredExclusions.get(currentRepository);
									const errors = validation.plan.commits.flatMap(commit => commit.paths.filter(path => mandatory?.has(path)).map(path => `Path must remain excluded: ${JSON.stringify(path)} (${mandatory?.get(path)}).`));
									if (errors.length) throw new Error(errors.join("\n"));
									submittedPlan = validation.plan;
									return { content: [{ type: "text" as const, text: "Plan accepted. The runner will execute the reviewed commits." }], details: {}, terminate: true };
								},
							},
							{
								name: "report_commit_blocker", label: "Report commit blocker",
								description: "Stop only when you cannot safely resolve a commit problem within this task or need the user's decision or access. Explain the concrete obstacle and what is required. Do not use for routine correctable errors or newly discovered files; inspect, fix, and continue instead.",
								parameters: Type.Object({ reason: Type.String({ minLength: 1 }) }),
								execute: async (_id, input) => {
									const { reason } = input as { reason: string };
									if (!reason.trim()) throw new Error("Give the concrete unresolved obstacle.");
									failure = `Commit blocked: ${reason.trim()}`;
									return { content: [{ type: "text" as const, text: failure }], details: {}, terminate: true };
								},
							},
							{
								...shell, name: "inspect", label: "Inspect repository",
								description: "Run read-only shell inspections, including Git status/diff/check-ignore and searches. Compound commands and pipes are allowed. Nonzero exits return to you for interpretation or correction, including normal no-match results. Never stage, unstage, write files, commit, pull, or push here. Normal review mutations belong to runner code; bash is available only when the runner requests a repair or publication conflict resolution. " + shell.description,
								execute: (id, args, toolSignal, update) => shell.execute(id, { ...(args as Parameters<typeof shell.execute>[1]), timeout: 15 }, toolSignal, update),
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
								description: "After staging, ask only about a genuinely consequential inclusion ambiguity or a concrete reason to intentionally include an ignored new file. Exclude obvious generated artifacts and honor existing ignore rules through the commit plan without asking. Choices are include, add to that repository's .gitignore, or leave untracked. Exclusions are unstaged without deleting working contents; ignore changes are staged.",
								parameters: Type.Object({ repo: Type.String(), candidate: Type.String(), reason: Type.String(), pattern: Type.String() }),
								execute: async (_id, input) => {
									const { repo, candidate: candidatePath, reason, pattern } = input as { repo: string; candidate: string; reason: string; pattern: string };
									const candidate = normalizeRepositoryId(candidatePath);
									const active = activeTools.get(_id);
									const id = normalizeRepositoryId(repo);
									const repository = repositoriesById.get(id);
									if (!repository) throw new Error(`Repository is not in the supplied inventory: ${repo}`);
									if (repository !== currentRepository) throw new Error(`Ignore decisions must target the current repository: ${repositoryId(root!, currentRepository)}`);
									if (!candidate || /^[\\/]/.test(candidate) || /^[A-Za-z]:/.test(candidate) || candidate.split(/[\\/]+/).includes(".."))
										throw new Error(`Candidate must be repository-relative: ${candidate}`);
									// Bad arguments are correctable; cancelled decisions remain terminal.
									// Preserve the answer before attempting any correctable mutation.
									if (active) active.terminal = true;
									const added = await git(["--literal-pathspecs", "diff", "--cached", "--diff-filter=A", "--name-only", "-z", "--", candidate], combined, repository);
									if (active) active.terminal = false;
									if (!added.split("\0").includes(candidate)) {
										if (active) active.terminal = true;
										const entry = parseCommitStatus(await git(STATUS_ARGS, combined, repository)).find(entry => entry.path === candidate);
										if (active) active.terminal = false;
										if (!entry) throw new Error(`Path is not changed in ${id}: ${candidate}. Use this repository's current staged status.`);
										throw new Error(`Not a staged new file in ${id}: ${candidate} (status ${entry.xy}). ${entry.xy === "??" ? "Stage new files before requesting an ignore decision." : "Tracked modifications do not need ignore decisions."}`);
									}
									const rule = validateGitignorePattern(pattern);
									if (active) active.terminal = true;
									if (!ctx.hasUI) throw new Error(`User input required for ${candidate}: ${reason}. Run /commit interactively.`);
									const waitingSince = Date.now();
									progress("Waiting for ignore-file decision…");
									try {
										const answer = await ctx.ui.select(`Candidate: ${candidate}\nReason: ${reason}\nProposed rule: ${rule}`, ["Include in commit", "Add to .gitignore", "Leave untracked"], { signal: combined });
										if (!answer) throw new Error("Ignore-file decision cancelled.");
										if (answer !== "Include in commit") {
											combined.throwIfAborted();
											const explanation = `${answer} (${reason})`;
											const required = requiredExclusions.get(repository) ?? new Map<string, string>();
											required.set(candidate, explanation);
											requiredExclusions.set(repository, required);
											const excluded = exclusionsByRepository.get(repository) ?? new Map<string, string>();
											excluded.set(candidate, explanation);
											exclusionsByRepository.set(repository, excluded);
											leftOut.push(`${id === "." ? "" : `${id}/`}${candidate}: ${explanation}`);
											// Preserve the operator's choice even if its mutation needs repair.
											if (active) { active.terminal = false; active.mutating = true; }
											if (answer === "Add to .gitignore") await appendGitignoreRule(repository, rule, combined);
											// rm --cached also works before the repository's first commit.
											await git(["--literal-pathspecs", "rm", "--cached", "--", candidate], combined, repository);
											if (answer === "Add to .gitignore") await git(["add", "--", ".gitignore"], combined, repository);
										}
										return { content: [{ type: "text" as const, text: `${answer}: ${id}/${candidate}` }], details: {} };
									} finally { userWaitMs += Date.now() - waitingSince; progress("Reviewing changes…"); }
								},
							},
						],
					},
					// Response-level recovery below owns the retry budget, including stream failures.
					streamFn: async (model, context, options) => accountHelperStream(await runtime.streamSimple(model, context, { ...options, maxRetries: 0 }), account),
					toolExecution: "sequential",
					beforeToolCall: async ({ toolCall }) => {
						if (failure) return { block: true, reason: failure, terminate: true };
						if (mutationProblem) return { block: true, reason: `The previous mutation failed; inspect its result and correct the approach on your next turn.\n${mutationProblem}` };
						if (submittedPlan) return { block: true, reason: "A plan was accepted; this repository pass is finished.", terminate: true };
						if (resolvingConflict && (toolCall.name === "ask_ignore" || toolCall.name === "submit_commit_plan")) return { block: true, reason: "Resolve only the established publication conflicts in this step." };
						return undefined;
					},
					finishTurn: () => failure || submittedPlan || repairToolsPending ? { action: "end" } : undefined,
				});
				unsubscribe = agent.subscribe((event) => {
					if (event.type === "message_start" && event.message.role === "assistant") mutationProblem = undefined;
					if (event.type === "tool_execution_start") {
						progress(event.toolName === "bash" || event.toolName === "inspect" ? "Running Git/shell command…" : event.toolName === "read" ? "Reading repository instructions and changes…" : event.toolName === "submit_commit_plan" ? "Validating commit plan…" : "Preparing ignore-file decision…");
						activeTools.set(event.toolCallId, { description: describeCommitTool(event.toolName, event.args), startedAt: Date.now(), terminal: false });
					}
					if (event.type === "tool_execution_end") {
						const active = activeTools.get(event.toolCallId);
						activeTools.delete(event.toolCallId);
						progress("Reviewing changes…");
						if (event.isError && event.toolName === "submit_commit_plan" && !resolvingConflict && !failure) {
							lastPlanErrors = (event.result.content as (TextContent | ImageContent)[]).filter(part => part.type === "text").map(part => part.text).join("\n");
						}
						if (event.isError && !active?.terminal && (event.toolName === "bash" || active?.mutating)) {
							mutationProblem = `${active?.description ?? event.toolName}\n${(event.result.content as (TextContent | ImageContent)[]).filter(part => part.type === "text").map(part => part.text).join("\n")}`;
							if (!resolvingConflict && !agent!.state.tools.some(tool => tool.name === "bash")) {
								agent!.state.tools = [...agent!.state.tools, repairShell];
								// Agent snapshots callable tools for a run. End this run so the
								// next prompt can actually call the newly supplied repair tool.
								repairToolsPending = true;
							}
						}
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
				const reviewer = agent;
				const promptReviewer = async (task: string) => {
					repairToolsPending = false;
					await reviewer.prompt(task);
					const lastError = () => {
						const last = reviewer.state.messages.at(-1);
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
							reviewer.state.messages = reviewer.state.messages.slice(0, -1);
							progress("Reviewing changes…");
							await reviewer.continue();
						}
						combined.throwIfAborted();
						if (failure) throw new Error(failure);
						const last = lastError();
						if (!last || usedFallback) break;
						// Terra failed after retries: continue the same transcript on Haiku.
						let fallback: Model<Api>;
						try { fallback = await resolveFallbackModel(runtime, combined); }
						catch { break; }
						usedFallback = true;
						model = fallback;
						selectedModel = fallback;
						progress(`Terra failed (${last.errorMessage ?? "error"}); retrying with ${fallback.id}…`);
						reviewer.state.messages = reviewer.state.messages.slice(0, -1);
						reviewer.state.model = fallback;
						thinkingLevel = "low";
						reviewer.state.thinkingLevel = thinkingLevel;
						await reviewer.continue();
					}
					combined.throwIfAborted();
					if (failure) throw new Error(failure);
					const last = [...reviewer.state.messages].reverse().find((message) => message.role === "assistant");
					if (!last || last.stopReason === "error" || last.stopReason === "aborted") throw new Error(last?.errorMessage || `${selectedModel?.id ?? "Model"} returned no response.`);
				};
				const reviewRepository = async (task: string) => {
					try { await promptReviewer(task); }
					catch (error) {
						// Provider/lifecycle failures are not local Git problems the agent can fix.
						failure ??= error instanceof Error ? error.message : String(error);
						throw error;
					}
				};
				const reviewTools = reviewer.state.tools;
				const repairRepository = async (error: unknown) => {
					combined.throwIfAborted();
					if (failure) throw new Error(failure);
					submittedPlan = undefined;
					progress("Resolving commit problem…");
					reviewer.state.tools = [...reviewTools.filter(tool => tool.name !== "submit_commit_plan" && tool.name !== "ask_ignore"), repairShell];
					try { await reviewRepository(`The runner encountered a problem in the current repository:\n${error instanceof Error ? error.message : String(error)}\n\nInspect actual Git state and resolve the cause using bash if needed. Earlier operations may already have succeeded; preserve completed commits and unrelated work. Do not blindly repeat a failed mutation. Leave ordinary staging, commits, pull, and push to the runner; stage resolved conflicts only if necessary to clear an unmerged index. The runner will retry its normal workflow after your repair. When ready, finish this repair turn. If you cannot safely resolve it, call report_commit_blocker with the concrete obstacle.`); }
					catch (repairError) { throw new Error(`${error instanceof Error ? error.message : String(error)}\nRepair failed: ${repairError instanceof Error ? repairError.message : String(repairError)}`); }
					finally { reviewer.state.tools = reviewTools; }
				};
				const acceptedPlan = (): CommitPlan | undefined => submittedPlan;
				const reviewAndExecute = async (initialTask: string) => {
					let task = initialTask;
					let problem: string | undefined;
					try {
						for (;;) {
							combined.throwIfAborted();
							submittedPlan = undefined;
							lastPlanErrors = "";
							try { await prepareRepository(currentRepository); }
							catch (error) { await repairRepository(error); continue; }
							await reviewRepository(`${task}\n\nCurrent staged-review status:\n${formatStatus(await git(STATUS_ARGS, combined, currentRepository))}\nExisting exclusions: ${JSON.stringify([...exclusionsByRepository.get(currentRepository) ?? []])}. Preserve their reasons and operator choices in the revised plan.${preservedIndex.length ? `\n${preservedIndex.join("\n")}\nInspect the retained stash's index tree (^2) if relevant to review; it is not applied or dropped.` : ""}`);
							const plan = acceptedPlan();
							if (!plan) {
								const status = await git(STATUS_ARGS, combined, currentRepository);
								if (!status && !lastPlanErrors) return;
								task = `Review is incomplete. Submit a complete plan for the current status, correcting these errors if present:\n${lastPlanErrors}\nIf you cannot proceed, call report_commit_blocker rather than ending without a plan.`;
								continue;
							}
							const excluded = exclusionsByRepository.get(currentRepository) ?? new Map<string, string>();
							for (const group of plan.commits) for (const path of group.paths) excluded.delete(path);
							for (const entry of plan.exclusions) excluded.set(entry.path, entry.reason);
							exclusionsByRepository.set(currentRepository, excluded);
							progress("Executing reviewed commits…");
							const result = await executeCommitPlan(exec, currentRepository, combined, plan);
							if (failure) throw new Error(failure);
							if (result.ok) return;
							combined.throwIfAborted();
							progress("Resolving commit problem…");
							// Refresh and review a new snapshot, not the old groups. This covers
							// concurrent files, hook edits/failures, and partially completed plans.
							problem = result.error;
							task = `The previous plan did not finish:\n${JSON.stringify(result)}\nInspect the failure and actual state, repair clear local problems with bash if necessary, then submit a revised plan for the remaining work. Completed commits must not be repeated or undone. Do not bypass hooks or exclude eligible work just to hide a failure. Use report_commit_blocker only when you cannot safely resolve the cause.`;
							reviewer.state.tools = [...reviewTools, repairShell];
						}
					} catch (error) {
						throw new Error([problem, error instanceof Error ? error.message : String(error)].filter(Boolean).join("\n"));
					} finally { reviewer.state.tools = reviewTools; }
				};
				for (const repository of [...repositories].sort((a, b) => b.length - a.length)) {
					currentRepository = repository;
					// Each repository gets its own conversation and relative-path tools.
					// Keep retries/publication follow-ups within that repository's context.
					reviewer.reset();
					reviewer.state.tools = reviewTools;
					read = createReadTool(repository);
					shell = createBashTool(repository);
					const repo = repositoryId(root, repository);
					progress("Staging repository changes…");
					await reviewAndExecute(buildCommitTask(push, root, inventory, repo));
					const target = publicationBranches.get(repo);
					if (push && target && await hasOutgoing(repository, target.branch)) {
						progress("Publishing repository…");
						for (;;) {
							combined.throwIfAborted();
							let publication: Awaited<ReturnType<typeof publishRepository>>;
							try { publication = await publishRepository(repo); }
							catch (error) {
								// Never repeat a push whose remote outcome is still unknown.
								if (unknownPushes.has(repo)) throw error;
								await repairRepository(error);
								await reviewAndExecute("Review any changes after publication repair and submit the remaining plan.");
								continue;
							}
							if (publication.needsReview) {
								await reviewAndExecute(`${publication.content.map(part => part.text).join("\n")}\nReview the staged diff and submit_commit_plan for this repository only.`);
								continue;
							}
							if (unresolvedPublicationConflict) {
								const before = await head(combined, repository);
								submittedPlan = undefined;
								resolvingConflict = true;
								reviewer.state.tools = [...reviewTools.filter(tool => tool.name !== "submit_commit_plan" && tool.name !== "ask_ignore"), conflictShell];
								try { await reviewRepository(`Publication conflict resolution for current repository ${repo}.\n${publication.content.map(part => part.text).join("\n")}\nUse bash only for this established conflict resolution, staging, and the normal merge commit. Do not pull or push.`); }
								finally { resolvingConflict = false; reviewer.state.tools = reviewTools; }
								const conflicts = await git(["diff", "--name-only", "--diff-filter=U", "-z"], combined, repository);
								const parents = (await git(["rev-list", "--parents", "-n", "1", "HEAD"], combined, repository)).split(" ");
								if (conflicts || parents.length < 3 || parents[1] !== before) throw new Error(`Unresolved publication conflict in ${repo}; a completed merge commit is required.`);
								const unfinished = await unfinishedPaths(repository, combined);
								if (unfinished.length) await reviewAndExecute(`Review remaining changes after conflict resolution in ${repo}:\n${unfinished.join("\n")}`);
								continue;
							}
							if (publication.isError) {
								await repairRepository(publication.content.map(part => part.text).join("\n"));
								await reviewAndExecute("Review any changes after publication repair and submit the remaining plan.");
								continue;
							}
							break;
						}
					}
				}
			} catch (error) {
				failure = signal?.aborted ? "Cancelled" : error instanceof Error ? error.message : String(error);
			} finally {
				combined.removeEventListener("abort", abort);
				agent?.abort();
				if (agent) await agent.waitForIdle();
				unsubscribe?.();
			}
			const elapsedMs = Date.now() - startedAt - userWaitMs;
			// Report Git's actual state even after cancellation/failure: a commit may already
			// have completed. These read-only queries do not reuse the cancelled signal.
			progress("Collecting commit results…");
			let summary = "";
			if (root && baselines.size) {
				const commits: string[] = [], remaining: string[] = [], reportingErrors: string[] = [];
				for (const [repository, base] of [...baselines].sort(([a], [b]) => b.length - a.length)) {
					const label = repositoryId(root, repository);
					try {
						const current = await head(undefined, repository);
						if (current && current !== base) {
							const log = await git(["log", "--reverse", "--format=%h %s", ...(base ? [`${base}..${current}`] : [current])], undefined, repository);
							commits.push(...log.split("\n").filter(Boolean).map((line) => label === "." ? line : `${line} (${label})`));
						}
						const status = await git(["status", "-s", "--untracked-files=all"], undefined, repository);
						if (status) remaining.push(`${label}:\n${status}`);
						if (!failure) {
							const unfinished = await unfinishedPaths(repository);
							if (unfinished.length) failure = `Uncommitted changes remain in ${label}; commit workflow incomplete:\n${unfinished.join("\n")}`;
						}
					} catch (error) { reportingErrors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`); }
				}
				// A later status failure must not erase commits already observed above.
				summary = [commits.join("\n") || (reportingErrors.length ? "Commit reporting incomplete." : "No commits created."), remaining.length ? `Remaining changes:\n${remaining.join("\n")}` : ""].filter(Boolean).join("\n");
				if (reportingErrors.length) failure = [failure, `Status reporting failed: ${reportingErrors.join("\n")}`].filter(Boolean).join("\n");
			}
			const publication = push && publicationBranches.size > 0
				? [successfulPushes > 0
					? failure ? `${successfulPushes} push${successfulPushes === 1 ? "" : "es"} succeeded before the workflow stopped.` : "Pushed."
					: unknownPushes.size ? "" : attemptedPushes ? "No pushes confirmed." : "No pushes performed.",
					unknownPushes.size ? `Push outcome unknown for: ${[...unknownPushes].join(", ")}. Verify the remote branches before retrying.` : ""].filter(Boolean).join("\n")
				: "";
			const exclusions = [...exclusionsByRepository].flatMap(([repository, paths]) => {
				const id = repositoryId(root!, repository);
				return [...paths].filter(([path]) => !requiredExclusions.get(repository)?.has(path)).map(([path, reason]) => `Left out: ${id === "." ? "" : `${id}/`}${path}: ${reason}`);
			});
			const report = [summary, ...preservedIndex, ...leftOut.map(line => `Left out: ${line}`), ...exclusions, publication].filter(Boolean).join("\n");
			if (failure) throw new Error(`${failure}\n${report}\nStopped; existing commits and changes were not undone.`);
			return { text: report, elapsedMs, model: `${selectedModel?.provider}/${selectedModel?.id}:${thinkingLevel}`, usage };
}
