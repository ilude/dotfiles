import {
	type GitAsyncRunner,
	type GitResult,
	git,
} from "./git";
import { normalizeCommitPaths } from "./status";


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

export function stagedRenameSources(output: string): Set<string> {
	const records = output.split("\0").filter(Boolean);
	const sources = new Set<string>();
	for (let index = 0; index < records.length; index += 1) {
		if (!/^R\d+$/.test(records[index] ?? "")) continue;
		const source = records[index + 1];
		if (source) sources.add(source.replace(/\\/g, "/"));
		index += 2;
	}
	return sources;
}

function pathsExcludingStagedRenameSources(
	paths: string[],
	result: GitResult,
): string[] {
	if (result.code !== 0) throw exactStageFailure(result);
	const sources = stagedRenameSources(result.stdout);
	return paths.filter((file) => !sources.has(file));
}

export function stageExactPathsWithRunner(
	cwd: string,
	paths: string[],
	runner: (cwd: string, args: string[]) => GitResult = git,
): string[] {
	const renameStatus = runner(cwd, [
		"diff",
		"--cached",
		"--name-status",
		"-z",
		"--find-renames",
	]);
	const plan = buildStagingPlan({
		files: pathsExcludingStagedRenameSources(paths, renameStatus),
	});
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
	const renameStatus = await runner(
		cwd,
		["diff", "--cached", "--name-status", "-z", "--find-renames"],
		signal,
	);
	const plan = buildStagingPlan({
		files: pathsExcludingStagedRenameSources(paths, renameStatus),
	});
	const staged = plan.addArgs.slice(3);
	if (staged.length === 0) return [];
	const result = await runner(cwd, plan.addArgs, signal);
	if (result.code !== 0) throw exactStageFailure(result);
	return staged;
}
