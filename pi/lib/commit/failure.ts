import type { GitResult } from "./git";

const NOTHING_TO_COMMIT_PATTERN =
	/^(?:nothing to commit|nothing added to commit|no changes added to commit).*$/im;

export function commitFailureMessage(
	result: Pick<GitResult, "stdout" | "stderr">,
): string {
	const combined = `${result.stdout}\n${result.stderr}`;
	const nothingToCommit = combined.match(NOTHING_TO_COMMIT_PATTERN)?.[0]?.trim();
	if (nothingToCommit) return nothingToCommit;
	return result.stderr.trim() || result.stdout.trim() || "git commit failed";
}
