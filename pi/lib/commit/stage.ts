import { git, requireRepoRoot } from "./git";
import { buildCommitPlan } from "./plan";
import { createConfirmationToken, normalizeCommitPaths, timingSafeTokenEqual } from "./token";

export interface StageResult {
	staged: string[];
}

export function stagePaths(cwd: string, paths: string[], confirmationToken?: string): StageResult {
	const repoRoot = requireRepoRoot(cwd);
	const normalized = normalizeCommitPaths(paths);
	const expectedToken = createConfirmationToken(repoRoot, normalized, "stage");
	if (!timingSafeTokenEqual(confirmationToken, expectedToken)) throw new Error("commit_stage requires a valid confirmation token for the exact path set.");

	const plan = buildCommitPlan(repoRoot);
	if (!plan.preflight.ok) throw new Error(`Cannot stage while repository is unsafe: ${plan.preflight.blocked.join("; ")}`);
	const byPath = new Map(plan.entries.map((entry) => [entry.path, entry]));
	for (const file of normalized) {
		const entry = byPath.get(file);
		if (!entry) throw new Error(`Cannot stage ${file}: path is not present in the commit plan.`);
		if (!entry.safeToGitAdd || entry.recommendedAction !== "stage") throw new Error(`Cannot stage ${file}: ${entry.reason}`);
	}
	if (normalized.length === 0) return { staged: [] };
	const result = git(repoRoot, ["add", "--", ...normalized]);
	if (result.code !== 0) throw new Error(result.stderr.trim() || result.stdout.trim() || "git add failed");
	return { staged: normalized };
}
