import * as fs from "node:fs";
import * as path from "node:path";
import { git, requireRepoRoot, existsInGitDir } from "./git";
import { createConfirmationToken, normalizeCommitPaths } from "./token";
import type { CommitPathEntry, GitIndexStatus, GitPreflight, GitWorktreeStatus, CommitPlanResult } from "./types";

function decodePorcelainStatus(output: string): Array<{ x: string; y: string; path: string }> {
	const records = output.split("\0").filter(Boolean);
	const entries: Array<{ x: string; y: string; path: string }> = [];
	for (let i = 0; i < records.length; i++) {
		const record = records[i]!;
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

function isIgnored(repoRoot: string, file: string): boolean {
	const result = git(repoRoot, ["check-ignore", "-q", "--", file]);
	return result.code === 0;
}

function classify(entry: { x: string; y: string; path: string }, ignored: boolean): CommitPathEntry {
	const index = mapStatus(entry.x) as GitIndexStatus;
	const worktree = mapStatus(entry.y) as GitWorktreeStatus;
	if (entry.x === "U" || entry.y === "U") return { path: entry.path, index, worktree, classification: "unmerged", ignored, safeToGitAdd: false, recommendedAction: "block", reason: "Unmerged paths require manual conflict resolution." };
	if (entry.x === "D") return { path: entry.path, index, worktree, classification: "staged_deletion", ignored, safeToGitAdd: false, recommendedAction: "keep_staged", reason: ignored ? "Ignored staged deletion must not be re-added." : "Deletion is already staged." };
	if (entry.x === "?" || entry.y === "?" || (entry.x === "!" && entry.y === "!")) return { path: entry.path, index: "unknown", worktree: ignored ? "ignored" : "unknown", classification: ignored ? "ignored_untracked" : "untracked", ignored, safeToGitAdd: !ignored, recommendedAction: ignored ? "skip" : "stage", reason: ignored ? "Ignored untracked files are not force-added in V1." : "Untracked file can be staged explicitly." };
	if (entry.x !== " " && entry.x !== "?") return { path: entry.path, index, worktree, classification: "staged_change", ignored, safeToGitAdd: !ignored, recommendedAction: "keep_staged", reason: "Change is already staged." };
	return { path: entry.path, index, worktree, classification: "unstaged_change", ignored, safeToGitAdd: !ignored, recommendedAction: ignored ? "skip" : "stage", reason: ignored ? "Ignored path is unsafe to add." : "Tracked modification can be staged explicitly." };
}

export function preflightGitState(cwd: string): GitPreflight {
	const root = requireRepoRoot(cwd);
	const branch = git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
	const unmerged = git(root, ["diff", "--name-only", "--diff-filter=U"]);
	const sparse = git(root, ["config", "--bool", "core.sparseCheckout"]);
	const blocks = [] as string[];
	const state = {
		ok: true, blocked: blocks, warnings: [] as string[], detachedHead: branch.code !== 0,
		mergeInProgress: existsInGitDir(root, "MERGE_HEAD"), rebaseInProgress: existsInGitDir(root, "rebase-merge") || existsInGitDir(root, "rebase-apply"),
		cherryPickInProgress: existsInGitDir(root, "CHERRY_PICK_HEAD"), bisectInProgress: existsInGitDir(root, "BISECT_LOG"),
		hasUnmergedPaths: !!unmerged.stdout.trim(), isSubmodule: fs.existsSync(path.join(root, ".git")) && fs.statSync(path.join(root, ".git")).isFile(),
		isWorktree: git(root, ["rev-parse", "--is-inside-work-tree"]).stdout.trim() === "true" && git(root, ["rev-parse", "--git-common-dir"]).stdout.trim() !== ".git",
		sparseCheckout: sparse.stdout.trim() === "true", partialIndex: false,
	};
	for (const [key, label] of [["mergeInProgress","merge"],["rebaseInProgress","rebase"],["cherryPickInProgress","cherry-pick"],["bisectInProgress","bisect"],["hasUnmergedPaths","unmerged paths"],["detachedHead","detached HEAD"]] as const) if (state[key]) blocks.push(`Blocked during ${label}.`);
	state.ok = blocks.length === 0;
	return state;
}

export function buildCommitPlan(cwd: string): CommitPlanResult {
	const repoRoot = requireRepoRoot(cwd);
	const preflight = preflightGitState(repoRoot);
	const status = git(repoRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignored=matching"]);
	if (status.code !== 0) throw new Error(status.stderr.trim());
	const entries = decodePorcelainStatus(status.stdout).map((entry) => classify(entry, isIgnored(repoRoot, entry.path)));
	const safeStagePaths = normalizeCommitPaths(entries.filter((entry) => entry.recommendedAction === "stage" && entry.safeToGitAdd).map((entry) => entry.path));
	const alreadyStagedPaths = entries.filter((entry) => entry.recommendedAction === "keep_staged").map((entry) => entry.path);
	const expectedStagedPaths = normalizeCommitPaths([...alreadyStagedPaths, ...safeStagePaths]);
	return {
		repoRoot,
		preflight,
		entries,
		stageConfirmationToken: createConfirmationToken(repoRoot, safeStagePaths, "stage"),
		createConfirmationToken: createConfirmationToken(repoRoot, expectedStagedPaths, "create"),
		safeStagePaths,
		expectedStagedPaths,
	};
}
