import * as fs from "node:fs";
import * as path from "node:path";
import { type GitAsyncRunner, type GitResult, git } from "./git";
import {
	indexStateFingerprint,
	worktreeStateFingerprint,
} from "./state";
import {
	isDirtyOnlySubmodule,
	parsePorcelainV2Status,
	PORCELAIN_V2_STATUS_ARGS,
	statusHasUnmergedPaths,
	type PorcelainV2StatusEntry,
} from "./status";
import { createConfirmationToken, normalizeCommitPaths } from "./token";
import type {
	CommitPathEntry,
	CommitPlanResult,
	GitIndexStatus,
	GitPreflight,
	GitWorktreeStatus,
} from "./types";

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
	entry: PorcelainV2StatusEntry,
	ignored: boolean,
): CommitPathEntry {
	const index = mapStatus(entry.x) as GitIndexStatus;
	const worktree = mapStatus(entry.y) as GitWorktreeStatus;
	if (entry.kind === "u")
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
			.some(
				(record) =>
					record === "## HEAD (no branch)" ||
					record === "# branch.head (detached)",
			),
		mergeInProgress: existsInResolvedGitDir("MERGE_HEAD"),
		rebaseInProgress:
			existsInResolvedGitDir("rebase-merge") ||
			existsInResolvedGitDir("rebase-apply"),
		cherryPickInProgress: existsInResolvedGitDir("CHERRY_PICK_HEAD"),
		bisectInProgress: existsInResolvedGitDir("BISECT_LOG"),
		hasUnmergedPaths: statusHasUnmergedPaths(statusText),
		isSubmodule: fs.statSync(path.join(root, ".git")).isFile(),
		isWorktree: fs.existsSync(path.join(resolvedGitDir, "commondir")),
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
		statusOutput ??
		git(root, [...PORCELAIN_V2_STATUS_ARGS]);
	const statusText = typeof status === "string" ? status : status.stdout;
	return decideGitPreflight(root, gitDir(root), statusText);
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

export interface GitPreflightInspection {
	preflight: GitPreflight;
	statusOutput: string;
}

async function inspectGitStateWithRunner(
	cwd: string,
	runner: GitAsyncRunner,
	signal: AbortSignal,
): Promise<GitPreflightInspection> {
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
		[...PORCELAIN_V2_STATUS_ARGS],
		signal,
	);
	return {
		preflight: decideGitPreflight(root, resolvedGitDir, status.stdout),
		statusOutput: status.stdout,
	};
}

export function inspectGitStateAsync(
	cwd: string,
	runner: GitAsyncRunner,
	signal?: AbortSignal,
): Promise<GitPreflightInspection> {
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
		inspectGitStateWithRunner(cwd, runner, controller.signal).then(
			(value) => finish(() => resolve(value)),
			(error: unknown) => finish(() => reject(error)),
		);
	});
}

export async function preflightGitStateAsync(
	cwd: string,
	runner: GitAsyncRunner,
	signal?: AbortSignal,
): Promise<GitPreflight> {
	return (await inspectGitStateAsync(cwd, runner, signal)).preflight;
}

export function buildCommitPlan(
	cwd: string,
	requestedPaths?: string[],
): CommitPlanResult {
	const root = repoRoot(cwd);
	const status = git(root, [...PORCELAIN_V2_STATUS_ARGS]);
	if (status.code !== 0) throw new Error(status.stderr.trim());
	const preflight = preflightGitStateForRoot(root, status.stdout);
	const statusEntries = parsePorcelainV2Status(status.stdout).filter(
		(entry) => !isDirtyOnlySubmodule(entry),
	);
	const ignored = ignoredPaths(
		root,
		statusEntries.map((entry) => entry.path),
	);
	const entries = statusEntries.map((entry) =>
		classify(entry, ignored.has(entry.path)),
	);
	const normalizedRequested = requestedPaths
		? normalizeCommitPaths(requestedPaths)
		: undefined;
	const byPath = new Map(entries.map((entry) => [entry.path, entry]));
	if (normalizedRequested) {
		const missing = normalizedRequested.filter((file) => !byPath.has(file));
		if (missing.length > 0) {
			throw new Error(
				`Requested paths are not present in the commit plan: ${missing.join(", ")}`,
			);
		}
		const unselectedStaged = entries
			.filter(
				(entry) =>
					entry.recommendedAction === "keep_staged" &&
					!normalizedRequested.includes(entry.path),
			)
			.map((entry) => entry.path);
		if (unselectedStaged.length > 0) {
			throw new Error(
				`Unselected staged paths would be included in the commit: ${unselectedStaged.join(", ")}`,
			);
		}
	}
	const selectedEntries = normalizedRequested
		? entries.filter((entry) => normalizedRequested.includes(entry.path))
		: entries;
	const selectedPaths = normalizeCommitPaths(
		selectedEntries.map((entry) => entry.path),
	);
	const safeStagePaths = normalizeCommitPaths(
		selectedEntries
			.filter(
				(entry) => entry.recommendedAction === "stage" && entry.safeToGitAdd,
			)
			.map((entry) => entry.path),
	);
	const alreadyStagedPaths = selectedEntries
		.filter((entry) => entry.recommendedAction === "keep_staged")
		.map((entry) => entry.path);
	const expectedStagedPaths = normalizeCommitPaths([
		...alreadyStagedPaths,
		...safeStagePaths,
	]);
	const stageEntries = selectedEntries.filter((entry) =>
		safeStagePaths.includes(entry.path),
	);
	const stageFingerprint = worktreeStateFingerprint(root, stageEntries);
	const createFingerprint =
		safeStagePaths.length === 0 ? indexStateFingerprint(root) : undefined;
	return {
		repoRoot: root,
		preflight,
		entries,
		selectedPaths,
		stageConfirmationToken: createConfirmationToken(
			root,
			safeStagePaths,
			"stage",
			stageFingerprint,
		),
		createConfirmationToken: createFingerprint
			? createConfirmationToken(
					root,
					expectedStagedPaths,
					"create",
					createFingerprint,
				)
			: undefined,
		safeStagePaths,
		expectedStagedPaths,
	};
}
