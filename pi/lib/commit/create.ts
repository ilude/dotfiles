import { git, requireRepoRoot } from "./git";
import { validateCommitMessage } from "./message";
import { createConfirmationToken, normalizeCommitPaths, timingSafeTokenEqual } from "./token";

export interface CommitCreateResult {
	hash: string;
	message: string;
	committedPaths: string[];
	pushed: false;
}

export function stagedPaths(cwd: string): string[] {
	const repoRoot = requireRepoRoot(cwd);
	const result = git(repoRoot, ["diff", "--cached", "--name-only", "-z"]);
	if (result.code !== 0) throw new Error(result.stderr.trim() || "git diff --cached failed");
	return normalizeCommitPaths(result.stdout.split("\0").filter(Boolean));
}

export function createCommit(cwd: string, message: string, expectedStagedPaths: string[], confirmationToken?: string): CommitCreateResult {
	const repoRoot = requireRepoRoot(cwd);
	const normalizedExpected = normalizeCommitPaths(expectedStagedPaths);
	const expectedToken = createConfirmationToken(repoRoot, normalizedExpected, "create");
	if (!timingSafeTokenEqual(confirmationToken, expectedToken)) throw new Error("commit_create requires a valid confirmation token for the exact staged path set.");
	const validation = validateCommitMessage(message);
	if (!validation.valid) throw new Error(validation.error ?? "Invalid commit message.");
	const actual = stagedPaths(repoRoot);
	if (actual.join("\0") !== normalizedExpected.join("\0")) throw new Error(`Staged set changed after confirmation. Expected ${normalizedExpected.join(", ") || "<none>"}; found ${actual.join(", ") || "<none>"}.`);
	if (actual.length === 0) throw new Error("Nothing is staged for commit.");
	const commit = git(repoRoot, ["commit", "-m", message]);
	if (commit.code !== 0) throw new Error(commit.stderr.trim() || commit.stdout.trim() || "git commit failed");
	const hash = git(repoRoot, ["rev-parse", "--short", "HEAD"]);
	if (hash.code !== 0) throw new Error(hash.stderr.trim() || "git rev-parse failed after commit");
	return { hash: hash.stdout.trim(), message, committedPaths: actual, pushed: false };
}
