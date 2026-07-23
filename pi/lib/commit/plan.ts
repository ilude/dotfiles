import * as fs from "node:fs";
import * as path from "node:path";
import { type GitAsyncRunner, type GitResult, git } from "./git";
import { excludeDirtyOnlySubmodules } from "./submodule";
import { createConfirmationToken, normalizeCommitPaths } from "./token";
import type {
	CommitPathEntry,
	CommitPlanResult,
	GitIndexStatus,
	GitPreflight,
	GitWorktreeStatus,
} from "./types";

function decodePorcelainStatus(
	output: string,
): Array<{ x: string; y: string; path: string }> {
	const records = output.split("\0").filter(Boolean);
	const entries: Array<{ x: string; y: string; path: string }> = [];
	for (let i = 0; i < records.length; i++) {
		const record = records[i];
		if (!record || record.startsWith("## ")) continue;
		const x = record[0] ?? " ";
		const y = record[1] ?? " ";
		const rawPath = record.slice(3);
		if (x === "R" || x === "C") i++; // porcelain v1 -z stores the original path in the next record.
		entries.push({ x, y, path: rawPath });
	}
	return entries;
}

function mapStatus(ch: string): GitIndexStatus | GitWorktreeStatus {
	if (ch === " ") return "unmodified";
	if (ch === "M") return "modified";
	if (ch === "A") return "added";
	if (ch === "D") return "deleted";
	if (ch === "R") return "renamed";
	if (ch === "C") return "copied";
	if (ch === "U") return "unmerged";
	if (ch === "?") return "unknown";
	if (ch === "!") return "ignored";
	return "unknown";
}

const UNMERGED_STATUS_PAIRS = new Set([
	"DD",
	"AU",
	"UD",
	"UA",
	"DU",
	"AA",
	"UU",
]);

function isUnmerged(entry: { x: string; y: string }): boolean {
	return UNMERGED_STATUS_PAIRS.has(`${entry.x}${entry.y}`);
}

function ignoredPaths(repoRoot: string, files: string[]): Set<string> {
	if (files.length === 0) return new Set();
	const result = git(
		repoRoot,
		["check-ignore", "-z", "--stdin"],
		`${files.join("\0")}\0`,
	);
	if (result.code !== 0 && result.code !== 1)
		throw new Error(result.stderr.trim() || "git check-ignore failed");
	return new Set(result.stdout.split("\0").filter(Boolean));
}

function classify(
	entry: { x: string; y: string; path: string },
	ignored: boolean,
): CommitPathEntry {
	const index = mapStatus(entry.x) as GitIndexStatus;
	const worktree = mapStatus(entry.y) as GitWorktreeStatus;
	if (isUnmerged(entry))
		return {
			path: entry.path,
			index,
			worktree,
			classification: "unmerged",
			ignored,
			safeToGitAdd: false,
			recommendedAction: "block",
			reason: "Unmerged paths require manual conflict resolution.",
		};
	if (entry.x === "D")
		return {
			path: entry.path,
			index,
			worktree,
			classification: "staged_deletion",
			ignored,
			safeToGitAdd: false,
			recommendedAction: "keep_staged",
			reason: ignored
				? "Ignored staged deletion must not be re-added."
				: "Deletion is already staged.",
		};
	if (
		entry.x === "?" ||
		entry.y === "?" ||
		(entry.x === "!" && entry.y === "!")
	)
		return {
			path: entry.path,
			index: "unknown",
			worktree: ignored ? "ignored" : "unknown",
			classification: ignored ? "ignored_untracked" : "untracked",
			ignored,
			safeToGitAdd: !ignored,
			recommendedAction: ignored ? "skip" : "stage",
			reason: ignored
				? "Ignored untracked files are not force-added in V1."
				: "Untracked file can be staged explicitly.",
		};
	if (entry.x !== " " && entry.x !== "?")
		return {
			path: entry.path,
			index,
			worktree,
			classification: "staged_change",
			ignored,
			safeToGitAdd: !ignored,
			recommendedAction: "keep_staged",
			reason: "Change is already staged.",
		};
	return {
		path: entry.path,
		index,
		worktree,
		classification: "unstaged_change",
		ignored,
		safeToGitAdd: !ignored,
		recommendedAction: ignored ? "skip" : "stage",
		reason: ignored
			? "Ignored path is unsafe to add."
			: "Tracked modification can be staged explicitly.",
	};
}

function stripFinalLineDelimiter(output: string): string {
	if (output.endsWith("\r\n")) return output.slice(0, -2);
	if (output.endsWith("\n")) return output.slice(0, -1);
	return output;
}

function repoRoot(cwd: string): string {
	const worktree = git(cwd, ["rev-parse", "--is-inside-work-tree"]);
	if (
		worktree.code !== 0 ||
		stripFinalLineDelimiter(worktree.stdout) !== "true"
	)
		throw new Error(`Not a git repository: ${worktree.stderr.trim()}`);
	const result = git(cwd, ["rev-parse", "--show-cdup"]);
	if (result.code !== 0)
		throw new Error(`Not a git repository: ${result.stderr.trim()}`);
	return path.resolve(cwd, stripFinalLineDelimiter(result.stdout));
}

function gitDir(root: string): string {
	const dotGit = path.join(root, ".git");
	const dotGitStat = fs.statSync(dotGit);
	if (dotGitStat.isDirectory()) return dotGit;
	if (!dotGitStat.isFile()) throw new Error(`Invalid git directory: ${dotGit}`);
	const gitFile = fs.readFileSync(dotGit, "utf8");
	const prefix = "gitdir: ";
	if (!gitFile.startsWith(prefix))
		throw new Error(`Invalid git directory: ${dotGit}`);
	return path.resolve(
		root,
		stripFinalLineDelimiter(gitFile.slice(prefix.length)),
	);
}

function decideGitPreflight(
	root: string,
	resolvedGitDir: string,
	statusText: string,
	sparseCheckoutOutput: string,
): GitPreflight {
	const existsInResolvedGitDir = (rel: string) =>
		fs.existsSync(path.join(resolvedGitDir, rel));
	const blocks = [] as string[];
	const state = {
		ok: true,
		blocked: blocks,
		warnings: [] as string[],
		detachedHead: statusText
			.split("\0")
			.some((record) => record === "## HEAD (no branch)"),
		mergeInProgress: existsInResolvedGitDir("MERGE_HEAD"),
		rebaseInProgress:
			existsInResolvedGitDir("rebase-merge") ||
			existsInResolvedGitDir("rebase-apply"),
		cherryPickInProgress: existsInResolvedGitDir("CHERRY_PICK_HEAD"),
		bisectInProgress: existsInResolvedGitDir("BISECT_LOG"),
		hasUnmergedPaths: decodePorcelainStatus(statusText).some(isUnmerged),
		isSubmodule: fs.statSync(path.join(root, ".git")).isFile(),
		isWorktree: fs.existsSync(path.join(resolvedGitDir, "commondir")),
		sparseCheckout: sparseCheckoutOutput.trim() === "true",
		partialIndex: false,
	};
	for (const [key, label] of [
		["mergeInProgress", "merge"],
		["rebaseInProgress", "rebase"],
		["cherryPickInProgress", "cherry-pick"],
		["bisectInProgress", "bisect"],
		["hasUnmergedPaths", "unmerged paths"],
		["detachedHead", "detached HEAD"],
	] as const)
		if (state[key]) blocks.push(`Blocked during ${label}.`);
	state.ok = blocks.length === 0;
	return state;
}

function preflightGitStateForRoot(
	root: string,
	statusOutput?: string,
): GitPreflight {
	const status =
		statusOutput ?? git(root, ["status", "--porcelain=v1", "--branch", "-z"]);
	const statusText = typeof status === "string" ? status : status.stdout;
	const sparse = git(root, ["config", "--bool", "core.sparseCheckout"]);
	return decideGitPreflight(root, gitDir(root), statusText, sparse.stdout);
}

export function preflightGitState(
	cwd: string,
	statusOutput?: string,
): GitPreflight {
	return preflightGitStateForRoot(repoRoot(cwd), statusOutput);
}

export const GIT_PREFLIGHT_TIMEOUT_MS = 120_000;

function gitFailure(result: GitResult, args: string[]): Error {
	return new Error(
		(result.stderr || result.stdout || `git ${args.join(" ")} failed`).trim(),
	);
}

async function runRequiredGit(
	runner: GitAsyncRunner,
	cwd: string,
	args: string[],
	signal: AbortSignal,
): Promise<GitResult> {
	const result = await runner(cwd, args, signal);
	if (result.code !== 0) throw gitFailure(result, args);
	return result;
}

async function preflightGitStateWithRunner(
	cwd: string,
	runner: GitAsyncRunner,
	signal: AbortSignal,
): Promise<GitPreflight> {
	const rootResult = await runRequiredGit(
		runner,
		cwd,
		["rev-parse", "--show-toplevel"],
		signal,
	);
	const root = path.resolve(stripFinalLineDelimiter(rootResult.stdout));
	const gitDirResult = await runRequiredGit(
		runner,
		root,
		["rev-parse", "--git-dir"],
		signal,
	);
	const rawGitDir = stripFinalLineDelimiter(gitDirResult.stdout);
	const resolvedGitDir = path.isAbsolute(rawGitDir)
		? rawGitDir
		: path.join(root, rawGitDir);
	const status = await runRequiredGit(
		runner,
		root,
		["status", "--porcelain=v1", "--branch", "-z"],
		signal,
	);
	const sparse = await runner(
		root,
		["config", "--bool", "core.sparseCheckout"],
		signal,
	);
	return decideGitPreflight(root, resolvedGitDir, status.stdout, sparse.stdout);
}

export function preflightGitStateAsync(
	cwd: string,
	runner: GitAsyncRunner,
	signal?: AbortSignal,
): Promise<GitPreflight> {
	const controller = new AbortController();
	return new Promise((resolve, reject) => {
		let settled = false;
		const finish = (callback: () => void) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeoutId);
			signal?.removeEventListener("abort", onAbort);
			callback();
		};
		const onAbort = () => {
			controller.abort();
			finish(() => reject(new Error("Operation cancelled")));
		};
		const timeoutId = setTimeout(() => {
			controller.abort();
			finish(() =>
				reject(
					new Error(
						`Git preflight timed out after ${GIT_PREFLIGHT_TIMEOUT_MS / 1000}s`,
					),
				),
			);
		}, GIT_PREFLIGHT_TIMEOUT_MS);
		signal?.addEventListener("abort", onAbort, { once: true });
		if (signal?.aborted) {
			onAbort();
			return;
		}
		preflightGitStateWithRunner(cwd, runner, controller.signal).then(
			(value) => finish(() => resolve(value)),
			(error: unknown) => finish(() => reject(error)),
		);
	});
}

export function buildCommitPlan(cwd: string): CommitPlanResult {
	const root = repoRoot(cwd);
	const status = git(root, [
		"status",
		"--porcelain=v1",
		"--branch",
		"-z",
		"--untracked-files=all",
	]);
	if (status.code !== 0) throw new Error(status.stderr.trim());
	const preflight = preflightGitStateForRoot(root, status.stdout);
	const diffIndex = git(root, ["diff-index", "--raw", "-z", "HEAD"]);
	const committablePaths = new Set(
		excludeDirtyOnlySubmodules(
			decodePorcelainStatus(status.stdout).map((entry) => entry.path),
			diffIndex.code === 0 ? diffIndex.stdout : "",
		),
	);
	const statusEntries = decodePorcelainStatus(status.stdout).filter((entry) =>
		committablePaths.has(entry.path),
	);
	const ignored = ignoredPaths(
		root,
		statusEntries.map((entry) => entry.path),
	);
	const entries = statusEntries.map((entry) =>
		classify(entry, ignored.has(entry.path)),
	);
	const safeStagePaths = normalizeCommitPaths(
		entries
			.filter(
				(entry) => entry.recommendedAction === "stage" && entry.safeToGitAdd,
			)
			.map((entry) => entry.path),
	);
	const alreadyStagedPaths = entries
		.filter((entry) => entry.recommendedAction === "keep_staged")
		.map((entry) => entry.path);
	const expectedStagedPaths = normalizeCommitPaths([
		...alreadyStagedPaths,
		...safeStagePaths,
	]);
	return {
		repoRoot: root,
		preflight,
		entries,
		stageConfirmationToken: createConfirmationToken(
			root,
			safeStagePaths,
			"stage",
		),
		createConfirmationToken: createConfirmationToken(
			root,
			expectedStagedPaths,
			"create",
		),
		safeStagePaths,
		expectedStagedPaths,
	};
}
