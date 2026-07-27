import { commitFailureMessage } from "./failure";
import { type GitAsyncRunner, git, requireRepoRoot } from "./git";
import { validateCommitMessage } from "./message";
import { indexStateFingerprint } from "./state";
import {
	createConfirmationToken,
	normalizeCommitPaths,
	timingSafeTokenEqual,
} from "./token";
import { scanSecrets } from "../secret-scan";

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

function validateCreateRequest(
	cwd: string,
	message: string,
	expectedStagedPaths: string[],
	confirmationToken?: string,
): { repoRoot: string; normalizedExpected: string[] } {
	const repoRoot = requireRepoRoot(cwd);
	const normalizedExpected = normalizeCommitPaths(expectedStagedPaths);
	const expectedToken = createConfirmationToken(
		repoRoot,
		normalizedExpected,
		"create",
		indexStateFingerprint(repoRoot),
	);
	if (!timingSafeTokenEqual(confirmationToken, expectedToken)) throw new Error("commit_create requires a valid confirmation token for the exact staged path set.");
	const validation = validateCommitMessage(message);
	if (!validation.valid) throw new Error(validation.error ?? "Invalid commit message.");
	const actual = stagedPaths(repoRoot);
	if (actual.join("\0") !== normalizedExpected.join("\0")) throw new Error(`Staged set changed after confirmation. Expected ${normalizedExpected.join(", ") || "<none>"}; found ${actual.join(", ") || "<none>"}.`);
	if (actual.length === 0) throw new Error("Nothing is staged for commit.");
	const stagedDiff = git(repoRoot, [
		"diff",
		"--cached",
		"--no-ext-diff",
		"--no-color",
		"--unified=0",
		"--diff-filter=ACMR",
	]);
	if (stagedDiff.code !== 0) {
		throw new Error(stagedDiff.stderr.trim() || "git diff --cached failed");
	}
	const addedText = stagedDiff.stdout
		.split("\n")
		.filter((line) => line.startsWith("+") && !line.startsWith("+++"))
		.map((line) => line.slice(1))
		.join("\n");
	const findings = scanSecrets(addedText);
	if (findings.length > 0) {
		const kinds = [...new Set(findings.map((finding) => finding.kind))].join(", ");
		throw new Error(`Secret scan blocked the commit: ${kinds}.`);
	}
	return { repoRoot, normalizedExpected };
}

export function createCommit(cwd: string, message: string, expectedStagedPaths: string[], confirmationToken?: string): CommitCreateResult {
	const { repoRoot, normalizedExpected } = validateCreateRequest(
		cwd,
		message,
		expectedStagedPaths,
		confirmationToken,
	);
	const whitespace = git(repoRoot, ["diff", "--cached", "--check"]);
	if (whitespace.code !== 0) {
		throw new Error(whitespace.stderr.trim() || whitespace.stdout.trim() || "git diff --cached --check failed");
	}
	const commit = git(repoRoot, ["commit", "-m", message]);
	if (commit.code !== 0) throw new Error(commitFailureMessage(commit));
	const hash = git(repoRoot, ["rev-parse", "--short", "HEAD"]);
	if (hash.code !== 0) throw new Error(hash.stderr.trim() || "git rev-parse failed after commit");
	return { hash: hash.stdout.trim(), message, committedPaths: normalizedExpected, pushed: false };
}

export async function createCommitAsync(
	cwd: string,
	message: string,
	expectedStagedPaths: string[],
	confirmationToken: string | undefined,
	runner: GitAsyncRunner,
	signal?: AbortSignal,
): Promise<CommitCreateResult> {
	const { repoRoot, normalizedExpected } = validateCreateRequest(
		cwd,
		message,
		expectedStagedPaths,
		confirmationToken,
	);
	const whitespace = await runner(repoRoot, ["diff", "--cached", "--check"], signal);
	if (whitespace.code !== 0) {
		throw new Error(whitespace.stderr.trim() || whitespace.stdout.trim() || "git diff --cached --check failed");
	}
	const commit = await runner(repoRoot, ["commit", "-m", message], signal);
	if (commit.code !== 0) throw new Error(commitFailureMessage(commit));
	const hash = await runner(repoRoot, ["rev-parse", "--short", "HEAD"], signal);
	if (hash.code !== 0) throw new Error(hash.stderr.trim() || "git rev-parse failed after commit");
	return {
		hash: hash.stdout.trim(),
		message,
		committedPaths: normalizedExpected,
		pushed: false,
	};
}
