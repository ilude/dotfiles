import {
	type GitAsyncRunner,
	type GitResult,
	git,
	requireRepoRoot,
} from "./git";
import { buildCommitPlan } from "./plan";
import {
	indexStateFingerprint,
	worktreeStateFingerprint,
} from "./state";
import {
	createConfirmationToken,
	normalizeCommitPaths,
	timingSafeTokenEqual,
} from "./token";

export interface StageResult {
	staged: string[];
	expectedStagedPaths: string[];
	createConfirmationToken: string;
}

export interface StagingPlan {
	addArgs: string[];
	unsafe: string[];
}

export function buildStagingPlan(input: {
	files: string[];
	ignoredFiles?: string[];
}): StagingPlan {
	const files = normalizeCommitPaths(input.files);
	const ignored = new Set(normalizeCommitPaths(input.ignoredFiles ?? []));
	return {
		addArgs: [
			"add",
			"-A",
			"--",
			...files.filter((file) => !ignored.has(file)),
		],
		unsafe: files.filter((file) => ignored.has(file)),
	};
}

function exactStageFailure(result: GitResult): Error {
	return new Error(
		result.stderr.trim() || result.stdout.trim() || "git add failed",
	);
}

export function stageExactPathsWithRunner(
	cwd: string,
	paths: string[],
	runner: (cwd: string, args: string[]) => GitResult = git,
): string[] {
	const plan = buildStagingPlan({ files: paths });
	const staged = plan.addArgs.slice(3);
	if (staged.length === 0) return [];
	const result = runner(cwd, plan.addArgs);
	if (result.code !== 0) throw exactStageFailure(result);
	return staged;
}

export async function stageExactPathsAsync(
	cwd: string,
	paths: string[],
	runner: GitAsyncRunner,
	signal?: AbortSignal,
): Promise<string[]> {
	const plan = buildStagingPlan({ files: paths });
	const staged = plan.addArgs.slice(3);
	if (staged.length === 0) return [];
	const result = await runner(cwd, plan.addArgs, signal);
	if (result.code !== 0) throw exactStageFailure(result);
	return staged;
}

function validateStageRequest(
	cwd: string,
	paths: string[],
	confirmationToken?: string,
): { repoRoot: string; normalized: string[] } {
	const repoRoot = requireRepoRoot(cwd);
	const normalized = normalizeCommitPaths(paths);
	const plan = buildCommitPlan(repoRoot);
	if (!plan.preflight.ok) throw new Error(`Cannot stage while repository is unsafe: ${plan.preflight.blocked.join("; ")}`);
	const byPath = new Map(plan.entries.map((entry) => [entry.path, entry]));
	const selectedEntries = normalized
		.map((file) => byPath.get(file))
		.filter((entry) => entry !== undefined);
	const expectedToken = createConfirmationToken(
		repoRoot,
		normalized,
		"stage",
		worktreeStateFingerprint(repoRoot, selectedEntries),
	);
	if (!timingSafeTokenEqual(confirmationToken, expectedToken)) throw new Error("commit_stage requires a valid confirmation token for the exact path set and worktree state.");

	for (const file of normalized) {
		const entry = byPath.get(file);
		if (!entry) throw new Error(`Cannot stage ${file}: path is not present in the commit plan.`);
		if (!entry.safeToGitAdd || entry.recommendedAction !== "stage") throw new Error(`Cannot stage ${file}: ${entry.reason}`);
	}
	return { repoRoot, normalized };
}

function stagedResult(repoRoot: string, staged: string[]): StageResult {
	const result = git(repoRoot, ["diff", "--cached", "--name-only", "-z"]);
	if (result.code !== 0) {
		throw new Error(result.stderr.trim() || "git diff --cached failed");
	}
	const expectedStagedPaths = normalizeCommitPaths(
		result.stdout.split("\0").filter(Boolean),
	);
	return {
		staged,
		expectedStagedPaths,
		createConfirmationToken: createConfirmationToken(
			repoRoot,
			expectedStagedPaths,
			"create",
			indexStateFingerprint(repoRoot),
		),
	};
}

export function stagePaths(cwd: string, paths: string[], confirmationToken?: string): StageResult {
	const { repoRoot, normalized } = validateStageRequest(
		cwd,
		paths,
		confirmationToken,
	);
	stageExactPathsWithRunner(repoRoot, normalized);
	return stagedResult(repoRoot, normalized);
}

export async function stagePathsAsync(
	cwd: string,
	paths: string[],
	confirmationToken: string | undefined,
	runner: GitAsyncRunner,
	signal?: AbortSignal,
): Promise<StageResult> {
	const { repoRoot, normalized } = validateStageRequest(
		cwd,
		paths,
		confirmationToken,
	);
	await stageExactPathsAsync(repoRoot, normalized, runner, signal);
	return stagedResult(repoRoot, normalized);
}
