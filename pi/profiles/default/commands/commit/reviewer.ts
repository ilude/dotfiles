import { lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import timers from "node:timers/promises";
import { Agent } from "@earendil-works/pi-agent-core";
import { isContextOverflow, isRetryableAssistantError, type Api, type ImageContent, type Model, type TextContent, type Usage } from "@earendil-works/pi-ai";
import { createBashTool, createReadTool, type ExtensionAPI, type ExtensionContext, type ModelRuntime, withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { createProfileModelRuntime } from "../../lib/model-runtime.ts";
import { resolveLatestCodexModelFromRuntime } from "../../lib/model-selection.ts";
import { compareModelVersions, modelFamilyVersion } from "../../lib/model-family.ts";
import { normalizeRepositoryId, repositoryId, samePlatformPath } from "../../lib/path-identity.ts";
import { Type } from "typebox";
import { commitShellCommand, formatStatus } from "./tools.ts";
import { executeCommitPlan, parseCommitStatus, validateCommitPlan, type CommitPlan } from "./plan.ts";

const MODEL_FAMILY = "luna";
const FALLBACK_PROVIDER = "anthropic";
const FALLBACK_FAMILY = "haiku";
const WORKFLOW_TIMEOUT_MS = 180_000;
const GIT_TIMEOUT_MS = 15_000;
const PUBLICATION_TIMEOUT_MS = 120_000;
const RESPONSE_RETRIES = 3;
const PLAN_CORRECTIONS = 2;
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
	if (name === "ask_ignore") return `ignore decision: ${String(input.repo ?? ".")}/${String(input.candidate ?? input.path ?? "unknown")}`;
	if (name === "submit_commit_plan") return `commit plan: ${String(input.repo ?? ".")}`;
	return `tool ${name}`;
}

export function formatPublicationEligibility(push: boolean, branch: string): string {
	if (!push) return "";
	return branch
		? `Publication: code-owned; attached branch ${JSON.stringify(branch)}. The runner checks outgoing commits, integrates origin/${branch} with git pull --no-rebase --ff, and publishes after a successful pass.`
		: "Publication: ineligible; detached HEAD. Silently skip publication checks and actions for this repository; do not re-check its branch, outgoing commits, upstream, remotes, or push, and do not mention the skip.";
}

export function buildCommitTask(push: boolean, root: string, inventory: readonly string[], currentRepository = "."): string {
	return `Review the staged changes and submit a complete commit plan now. ${push ? "Publication is code-owned, including clean initialized submodules with outgoing referenced commits. Do not check outgoing commits or run pull/push. The runner integrates and publishes children before parents, silently skipping detached entries. It will request conflict resolution separately if needed." : "Push was NOT requested. Do not run publication-related branch, upstream, outgoing, remote, or push checks or commands."}

Location (JSON-quoted absolute path; decode and shell-quote as data):
Repository root: ${JSON.stringify(root)}
Host platform: ${process.platform}. Bash runs locally on this host. Use the supplied paths as data; on Windows this is not WSL: prefer root-relative paths or forward-slash Windows paths, not invented /mnt/c paths.

Current repository: ${currentRepository}. Work only in this repository for this pass. The runner has preserved index-only content, run git add -A, applied the settings policy, and staged child gitlinks before staged review. Read applicable instructions and staged diffs, then call submit_commit_plan covering every current changed path exactly once. Do not process other repositories in this pass.\n\nRepository inventory (boundaries and initial state, not a candidate list):
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
			const preservedIndex: string[] = [];
			const exclusionsByRepository = new Map<string, Map<string, string>>();
			const requiredExclusions = new Map<string, Map<string, string>>();
			const activeTools = new Map<string, { description: string; startedAt: number; terminal: boolean }>();
			const leftOut: string[] = [];
			const publicationBranches = new Map<string, { path: string; branch: string }>();
			let successfulPushes = 0;
			let attemptedPushes = 0;
			let unresolvedPublicationConflict: string | undefined;
			const unknownPushes = new Set<string>();
			const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
			const git = async (args: string[], requestSignal?: AbortSignal, cwd?: string, timeout = GIT_TIMEOUT_MS) => {
				const result = await pi.exec("git", ["-C", cwd ?? root ?? ctx.cwd, ...args], { signal: requestSignal, timeout });
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
				const discovered = await git(["submodule", "foreach", "--recursive", "--quiet", "printf '%s\\0' \"$toplevel/$sm_path\""], combined);
				const repositories = [root, ...discovered.split("\0").filter(Boolean).map((path) => realpathSync(path))]
					.filter((path, index, all) => all.indexOf(path) === index);
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
					progress(`Luna unavailable (${error instanceof Error ? error.message : String(error)}); using ${FALLBACK_FAMILY}…`);
					model = await resolveFallbackModel(runtime, combined);
					usedFallback = true;
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
				let invalidPlanAttempts = 0;
				let lastPlanErrors = "";
				let resolvingConflict = false;
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
					if (unfinished.length) throw new Error(`Uncommitted changes in ${repo}; publication has not run:\n${unfinished.join("\n")}`);
					if (publishedHeads.get(target.path) === await head(combined, target.path))
						return { content: [{ type: "text" as const, text: "This repository HEAD has already been published." }], details: {} };
					if (unresolvedPublicationConflict && unresolvedPublicationConflict !== normalizeRepositoryId(repo)) throw new Error("Publication blocked until the unresolved pull conflict is resolved and its repository is retried.");
					const ref = `refs/heads/${target.branch}`;
					const integrated = await pi.exec("git", ["-C", target.path, "pull", "--no-rebase", "--ff", "origin", target.branch], { signal: combined, timeout: PUBLICATION_TIMEOUT_MS });
					if (integrated.killed || integrated.code !== 0) {
						let remoteBranch: string | undefined;
						try { remoteBranch = await git(["ls-remote", "--heads", "origin", ref], combined, target.path, PUBLICATION_TIMEOUT_MS); }
						catch { /* A failed verification must not authorize publication. */ }
						if (integrated.killed) return { content: [{ type: "text" as const, text: `Pull before publication timed out or was cancelled for origin/${target.branch}. Do not push.` }], details: {}, isError: true };
						const conflicts = await git(["diff", "--name-only", "--diff-filter=U"], combined, target.path);
						if (conflicts) {
							unresolvedPublicationConflict = normalizeRepositoryId(repo);
							return { content: [{ type: "text" as const, text: `Pull from origin/${target.branch} established merge conflicts in: ${conflicts}. Do not publish this or any parent repository yet. Resolve only when intent is clear, stage and commit the merge with bash. The runner will verify the merge and retry publication; do not pull or push yourself.` }], details: {} };
						}
						if (remoteBranch === undefined || remoteBranch) return { content: [{ type: "text" as const, text: `Pull before publication failed without an established merge conflict: ${integrated.stderr.trim()}. Do not push.` }], details: {}, isError: true };
						// An empty origin branch is a valid first publication.
					}
					unresolvedPublicationConflict = undefined;
					const integratedLinks = await stageParentGitlinks(target.path);
					if (integratedLinks.length) return pendingResult(integratedLinks);
					const remaining = await unfinishedPaths(target.path, combined);
					if (remaining.length) throw new Error(`Uncommitted changes after publication integration in ${repo}:\n${remaining.join("\n")}`);
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
						let oid = await git(["stash", "create"], combined, repository);
						if (!oid) {
							// stash create can omit submodule-only differences. Retain the
							// index in the same ^2 layout without changing it or the worktree.
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
							requiredExclusions.set(repository, new Map([[".pi/settings.json", reason]]));
							exclusionsByRepository.set(repository, new Map([[".pi/settings.json", reason]]));
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
				const read = createReadTool(root);
				const shell = createBashTool(root);
				const conflictShell: typeof shell = {
					...shell,
					description: "Resolve only the current repository's established publication pull conflicts, then stage and commit the merge with normal hooks. Never pull, push, switch branches, rewrite history, or discard unrelated work. Actual mutation failure stops dependent work. " + shell.description,
					execute: (id, args, toolSignal, update) => shell.execute(id, { ...args, command: commitShellCommand(args.command), timeout: 15 }, toolSignal, update),
				};
				agent = new Agent({
					initialState: {
						model, thinkingLevel: "low",
						systemPrompt: readFileSync(join(dirname(fileURLToPath(import.meta.url)), "reviewer.md"), "utf8"),
						tools: [
							{
								name: "submit_commit_plan", label: "Submit commit plan",
								description: "Submit the complete reviewed whole-file plan for the current repository. Cover every path in current porcelain v1 -z status exactly once, in one commit or an exclusion with a concrete reason. Include both rename endpoints together. Subjects must be trimmed, nonempty single lines. An accepted plan ends review; code executes it. Validation errors allow two corrections before stopping without committing this repository.",
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
								...shell, name: "inspect", label: "Inspect repository",
								description: "Run read-only shell inspections, including Git status/diff/check-ignore and searches. Compound commands and pipes are allowed. Nonzero exits return to you for interpretation or correction, including normal no-match results. Never stage, unstage, write files, commit, pull, or push here. Normal review mutations belong to runner code; bash is available only during explicitly requested publication conflict resolution. " + shell.description,
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
								description: "After staging, ask whether an uncertain new file should be included, added to that repository's .gitignore, or left untracked. Exclusions are unstaged without deleting working contents; ignore changes are staged.",
								parameters: Type.Object({ repo: Type.String(), candidate: Type.String(), reason: Type.String(), pattern: Type.String() }),
								execute: async (_id, input) => {
									const { repo, candidate, reason, pattern } = input as { repo: string; candidate: string; reason: string; pattern: string };
									if (!ctx.hasUI) throw new Error(`User input required for ${candidate}: ${reason}. Run /commit interactively.`);
									const id = normalizeRepositoryId(repo);
									const repository = repositoriesById.get(id);
									if (!repository) throw new Error(`Repository is not in the supplied inventory: ${repo}`);
									if (repository !== currentRepository) throw new Error(`Ignore decisions must target the current repository: ${repositoryId(root!, currentRepository)}`);
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
											const explanation = `${answer} (${reason})`;
											const required = requiredExclusions.get(repository) ?? new Map<string, string>();
											required.set(candidate, explanation);
											requiredExclusions.set(repository, required);
											const excluded = exclusionsByRepository.get(repository) ?? new Map<string, string>();
											excluded.set(candidate, explanation);
											exclusionsByRepository.set(repository, excluded);
											leftOut.push(`${id === "." ? "" : `${id}/`}${candidate}: ${explanation}`);
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
					beforeToolCall: async ({ toolCall }) => {
						if (failure) return { block: true, reason: failure, terminate: true };
						if (submittedPlan) return { block: true, reason: "A plan was accepted; this repository pass is finished.", terminate: true };
						if (resolvingConflict && (toolCall.name === "ask_ignore" || toolCall.name === "submit_commit_plan")) return { block: true, reason: "Resolve only the established publication conflicts in this step." };
						return undefined;
					},
					finishTurn: () => failure || submittedPlan ? { action: "end" } : undefined,
				});
				unsubscribe = agent.subscribe((event) => {
					if (event.type === "tool_execution_start") {
						progress(event.toolName === "bash" || event.toolName === "inspect" ? "Running Git/shell command…" : event.toolName === "read" ? "Reading repository instructions and changes…" : event.toolName === "submit_commit_plan" ? "Validating commit plan…" : "Preparing ignore-file decision…");
						activeTools.set(event.toolCallId, { description: describeCommitTool(event.toolName, event.args), startedAt: Date.now(), terminal: event.toolName === "ask_ignore" || event.toolName === "bash" });
					}
					if (event.type === "tool_execution_end") {
						const active = activeTools.get(event.toolCallId);
						activeTools.delete(event.toolCallId);
						progress("Reviewing changes…");
						if (event.isError && event.toolName === "submit_commit_plan" && !resolvingConflict && !failure) {
							invalidPlanAttempts++;
							lastPlanErrors = (event.result.content as (TextContent | ImageContent)[]).filter(part => part.type === "text").map(part => part.text).join("\n");
							if (invalidPlanAttempts > PLAN_CORRECTIONS) {
								failure = `Commit plan invalid after ${PLAN_CORRECTIONS} corrections:\n${lastPlanErrors}`;
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
				const reviewRepository = async (task: string) => {
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
						// Luna failed after retries: continue the same transcript on Haiku.
						let fallback: Model<Api>;
						try { fallback = await resolveFallbackModel(runtime, combined); }
						catch { break; }
						usedFallback = true;
						model = fallback;
						selectedModel = fallback;
						progress(`Luna failed (${last.errorMessage ?? "error"}); retrying with ${fallback.id}…`);
						reviewer.state.messages = reviewer.state.messages.slice(0, -1);
						reviewer.state.model = fallback;
						await reviewer.continue();
					}
					combined.throwIfAborted();
					if (failure) throw new Error(failure);
					const last = [...reviewer.state.messages].reverse().find((message) => message.role === "assistant");
					if (!last || last.stopReason === "error" || last.stopReason === "aborted") throw new Error(last?.errorMessage || `${selectedModel?.id ?? "Model"} returned no response.`);
				};
				const acceptedPlan = (): CommitPlan | undefined => submittedPlan;
				const reviewAndExecute = async (task: string) => {
					submittedPlan = undefined;
					invalidPlanAttempts = 0;
					lastPlanErrors = "";
					await reviewRepository(`${task}\n\nCurrent staged-review status:\n${formatStatus(await git(STATUS_ARGS, combined, currentRepository))}${preservedIndex.length ? `\n${preservedIndex.join("\n")}\nInspect the retained stash's index tree (^2) if relevant to review; it is not applied or dropped.` : ""}`);
					const plan = acceptedPlan();
					if (!plan) {
						const status = await git(STATUS_ARGS, combined, currentRepository);
						if (status || lastPlanErrors) throw new Error(`No valid submit_commit_plan received for ${repositoryId(root!, currentRepository)}; commit workflow incomplete.${lastPlanErrors ? `\n${lastPlanErrors}` : `\n${formatStatus(status)}`}`);
						return;
					}
					const excluded = exclusionsByRepository.get(currentRepository) ?? new Map<string, string>();
					for (const entry of plan.exclusions) excluded.set(entry.path, entry.reason);
					exclusionsByRepository.set(currentRepository, excluded);
					progress("Executing reviewed commits…");
					const result = await executeCommitPlan(pi.exec.bind(pi), currentRepository, combined, plan);
					if (!result.ok) throw new Error(result.error ?? "Commit plan execution failed.");
				};
				const reviewTools = reviewer.state.tools;
				for (const repository of [...repositories].sort((a, b) => b.length - a.length)) {
					currentRepository = repository;
					const repo = repositoryId(root, repository);
					progress("Staging repository changes…");
					await prepareRepository(repository);
					await reviewAndExecute(buildCommitTask(push, root, inventory, repo));
					const target = publicationBranches.get(repo);
					if (push && target && await hasOutgoing(repository, target.branch)) {
						progress("Publishing repository…");
						let publication = await publishRepository(repo);
						while (unresolvedPublicationConflict || publication.needsReview) {
							const before = await head(combined, repository);
							if (publication.needsReview) await reviewAndExecute(`${publication.content.map(part => part.text).join("\n")}\nReview the staged diff and submit_commit_plan for this repository only.`);
							else {
								submittedPlan = undefined;
								resolvingConflict = true;
								reviewer.state.tools = [...reviewTools.filter(tool => tool.name !== "submit_commit_plan" && tool.name !== "ask_ignore"), conflictShell];
								try { await reviewRepository(`Publication conflict resolution for current repository ${repo}.\n${publication.content.map(part => part.text).join("\n")}\nUse bash only for this established conflict resolution, staging, and the normal merge commit. Do not pull or push.`); }
								finally { resolvingConflict = false; reviewer.state.tools = reviewTools; }
								const conflicts = await git(["diff", "--name-only", "--diff-filter=U", "-z"], combined, repository);
								const parents = (await git(["rev-list", "--parents", "-n", "1", "HEAD"], combined, repository)).split(" ");
								if (conflicts || parents.length < 3 || parents[1] !== before) throw new Error(`Unresolved publication conflict in ${repo}; a completed merge commit is required.`);
								const unfinished = await unfinishedPaths(repository, combined);
								if (unfinished.length) throw new Error(`Uncommitted changes after conflict resolution in ${repo}:\n${unfinished.join("\n")}`);
							}
							if (await head(combined, repository) === before) throw new Error(`Publication made no commit progress in ${repo}.`);
							publication = await publishRepository(repo);
						}
						if (publication.isError) throw new Error(publication.content.map(part => part.text).join("\n"));
					}
				}
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
						if (!failure) {
							const unfinished = await unfinishedPaths(repository);
							if (unfinished.length) failure = `Uncommitted changes remain in ${label}; commit workflow incomplete:\n${unfinished.join("\n")}`;
						}
					}
					summary = [commits.join("\n") || "No commits created.", remaining.length ? `Remaining changes:\n${remaining.join("\n")}` : ""].filter(Boolean).join("\n");
				} catch (error) { failure = [failure, `Status reporting failed: ${error instanceof Error ? error.message : String(error)}`].filter(Boolean).join("\n"); }
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
			return { text: report, elapsedMs: WORKFLOW_TIMEOUT_MS - remaining, model: `${selectedModel?.provider}/${selectedModel?.id}:low`, usage };
}
