import type { GitAsyncRunner } from "./git";
import { requireRepoRoot } from "./git";
import { preflightGitState } from "./plan";

export interface CommitPushResult {
	branch: string;
	hash: string;
	pushed: boolean;
}

async function requiredGit(
	runner: GitAsyncRunner,
	cwd: string,
	args: string[],
	signal?: AbortSignal,
) {
	const result = await runner(cwd, args, signal);
	if (result.code !== 0) {
		throw new Error(
			result.stderr.trim() ||
				result.stdout.trim() ||
				`git ${args.join(" ")} failed`,
		);
	}
	return result.stdout.trim();
}

export async function pushCommit(
	cwd: string,
	expectedHead: string,
	runner: GitAsyncRunner,
	signal?: AbortSignal,
): Promise<CommitPushResult> {
	const repoRoot = requireRepoRoot(cwd);
	const preflight = preflightGitState(repoRoot);
	if (!preflight.ok) {
		throw new Error(
			`Cannot push while repository is unsafe: ${preflight.blocked.join("; ")}`,
		);
	}
	if (!/^[0-9a-f]{7,40}$/i.test(expectedHead)) {
		throw new Error("expectedHead must be a 7 to 40 character hexadecimal commit hash.");
	}
	const head = await requiredGit(runner, repoRoot, ["rev-parse", "HEAD"], signal);
	if (!head.toLowerCase().startsWith(expectedHead.toLowerCase())) {
		throw new Error(
			`HEAD changed before push. Expected ${expectedHead}; found ${head.slice(0, 12)}.`,
		);
	}
	const branch = await requiredGit(
		runner,
		repoRoot,
		["symbolic-ref", "--short", "HEAD"],
		signal,
	);
	const upstream = await requiredGit(
		runner,
		repoRoot,
		["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
		signal,
	);
	const remote = upstream.split("/", 1)[0];
	if (!remote) throw new Error("Could not determine the upstream remote.");
	await requiredGit(runner, repoRoot, ["fetch", "--prune", remote], signal);
	const divergence = await requiredGit(
		runner,
		repoRoot,
		["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
		signal,
	);
	const [aheadText, behindText] = divergence.split(/\s+/);
	const ahead = Number.parseInt(aheadText ?? "0", 10);
	const behind = Number.parseInt(behindText ?? "0", 10);
	if (!Number.isFinite(ahead) || !Number.isFinite(behind)) {
		throw new Error("Could not parse upstream divergence.");
	}
	if (behind > 0) {
		throw new Error(
			`Refusing to push because the branch is behind its upstream by ${behind} commit(s).`,
		);
	}
	if (ahead === 0) return { branch, hash: head.slice(0, 12), pushed: false };
	await requiredGit(runner, repoRoot, ["push", "--porcelain"], signal);
	return { branch, hash: head.slice(0, 12), pushed: true };
}
