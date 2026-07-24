import { spawnSync } from "node:child_process";
import {
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { existsInGitDir, type GitAsyncRunner } from "../lib/commit/git.ts";
import {
	buildCommitPlan,
	GIT_PREFLIGHT_TIMEOUT_MS,
	preflightGitState,
	preflightGitStateAsync,
} from "../lib/commit/plan.ts";

const repos: string[] = [];
function run(
	cwd: string,
	args: string[],
	opts: { allowFailure?: boolean } = {},
) {
	const result = spawnSync("git", args, { cwd, encoding: "utf8" });
	if (!opts.allowFailure && (result.status ?? 1) !== 0)
		throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
	return result;
}
function repo() {
	const dir = mkdtempSync(join(tmpdir(), "pi-commit-"));
	repos.push(dir);
	run(dir, ["init", "--initial-branch", "main"]);
	run(dir, ["config", "user.email", "pi@example.invalid"]);
	run(dir, ["config", "user.name", "Pi Test"]);
	return dir;
}

afterEach(() => {
	for (const dir of repos.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

describe("commit planning", () => {
	it("matches synchronous preflight for a normal repository", async () => {
		const dir = repo();
		const runner: GitAsyncRunner = async (cwd, args) => {
			const result = run(cwd, args, { allowFailure: true });
			return {
				code: result.status ?? 1,
				stdout: result.stdout ?? "",
				stderr: result.stderr ?? "",
			};
		};

		await expect(preflightGitStateAsync(dir, runner)).resolves.toEqual(
			preflightGitState(dir),
		);
	});

	it("cancels while async preflight git is running", async () => {
		const controller = new AbortController();
		let runnerSignal: AbortSignal | undefined;
		const runner: GitAsyncRunner = (_cwd, _args, signal) => {
			runnerSignal = signal;
			return new Promise(() => {});
		};

		const pending = preflightGitStateAsync("/repo", runner, controller.signal);
		await Promise.resolve();
		controller.abort();

		await expect(pending).rejects.toThrow("Operation cancelled");
		expect(runnerSignal?.aborted).toBe(true);
	});

	it("times out while async preflight git is running", async () => {
		vi.useFakeTimers();
		try {
			let runnerSignal: AbortSignal | undefined;
			const runner: GitAsyncRunner = (_cwd, _args, signal) => {
				runnerSignal = signal;
				return new Promise(() => {});
			};
			const pending = preflightGitStateAsync("/repo", runner);
			const rejection = expect(pending).rejects.toThrow(
				"Git preflight timed out after 120s",
			);

			await vi.advanceTimersByTimeAsync(GIT_PREFLIGHT_TIMEOUT_MS);

			await rejection;
			expect(runnerSignal?.aborted).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	it("preserves tracked file -> ignored -> git rm --cached staged deletion", () => {
		const dir = repo();
		writeFileSync(join(dir, "generated.log"), "generated\n");
		run(dir, ["add", "--", "generated.log"]);
		run(dir, ["commit", "-m", "chore: seed fixture"]);
		writeFileSync(join(dir, ".gitignore"), "*.log\n");
		run(dir, ["rm", "--cached", "--", "generated.log"]);
		const plan = buildCommitPlan(dir);
		const entry = plan.entries.find((item) => item.path === "generated.log");
		expect(entry).toMatchObject({
			classification: "staged_deletion",
			safeToGitAdd: false,
			recommendedAction: "keep_staged",
		});
	});

	it("omits ignored untracked files from commit planning", () => {
		const dir = repo();
		writeFileSync(join(dir, ".gitignore"), "*.secret\n");
		writeFileSync(join(dir, "local.secret"), "x\n");
		const plan = buildCommitPlan(dir);
		expect(plan.entries.some((item) => item.path === "local.secret")).toBe(
			false,
		);
		expect(plan.safeStagePaths).toEqual([".gitignore"]);
	});

	it("blocks detached HEAD before mutation", () => {
		const dir = repo();
		writeFileSync(join(dir, "file.txt"), "x\n");
		run(dir, ["add", "--", "file.txt"]);
		run(dir, ["commit", "-m", "chore: seed fixture"]);
		run(dir, ["checkout", "--detach"]);
		const state = preflightGitState(dir);
		expect(state.ok).toBe(false);
		expect(state.detachedHead).toBe(true);
	});

	it("does not mistake an untracked HEAD (no branch) path for a branch header", () => {
		const dir = repo();
		writeFileSync(join(dir, "HEAD (no branch)"), "x\n");
		expect(buildCommitPlan(dir).preflight.detachedHead).toBe(false);
	});

	it("blocks mergeInProgress", () => {
		const dir = repo();
		// base commit on main
		writeFileSync(join(dir, "base.txt"), "base\n");
		run(dir, ["add", "--", "base.txt"]);
		run(dir, ["commit", "-m", "chore: base"]);
		// divergent commit on feature branch
		run(dir, ["checkout", "-b", "feature"]);
		writeFileSync(join(dir, "feature.txt"), "feature\n");
		run(dir, ["add", "--", "feature.txt"]);
		run(dir, ["commit", "-m", "feat: feature work"]);
		// back to main and start a no-commit merge
		run(dir, ["checkout", "main"]);
		run(dir, ["merge", "--no-commit", "--no-ff", "feature"]);
		// precondition: MERGE_HEAD must exist
		expect(existsInGitDir(dir, "MERGE_HEAD")).toBe(true);
		const state = preflightGitState(dir);
		expect(state.ok).toBe(false);
		expect(state.mergeInProgress).toBe(true);
	});

	it("blocks rebaseInProgress", () => {
		const dir = repo();
		// base commit on main
		writeFileSync(join(dir, "base.txt"), "base\n");
		run(dir, ["add", "--", "base.txt"]);
		run(dir, ["commit", "-m", "chore: base"]);
		// divergent commit on feature branch
		run(dir, ["checkout", "-b", "feature"]);
		writeFileSync(join(dir, "feature.txt"), "feature\n");
		run(dir, ["add", "--", "feature.txt"]);
		run(dir, ["commit", "-m", "feat: feature work"]);
		// add a conflicting commit on main so the rebase halts mid-way
		run(dir, ["checkout", "main"]);
		writeFileSync(join(dir, "feature.txt"), "conflict\n");
		run(dir, ["add", "--", "feature.txt"]);
		run(dir, ["commit", "-m", "chore: conflict setup"]);
		// rebase feature onto main -- will halt on conflict
		run(dir, ["checkout", "feature"]);
		run(dir, ["rebase", "main"], { allowFailure: true });
		// precondition: rebase-merge or rebase-apply must exist
		const rebaseActive =
			existsInGitDir(dir, "rebase-merge") ||
			existsInGitDir(dir, "rebase-apply");
		expect(rebaseActive).toBe(true);
		const state = preflightGitState(dir);
		expect(state.ok).toBe(false);
		expect(state.rebaseInProgress).toBe(true);
	});

	it.each(["UU"])("blocks porcelain v1 unmerged pair %s without an operation marker", (pair) => {
		const dir = repo();
		const state = preflightGitState(dir, `${pair} conflicted.txt\0`);
		expect(state.ok).toBe(false);
		expect(state.hasUnmergedPaths).toBe(true);
		expect(state.blocked).toContain("Blocked during unmerged paths.");
	});

	it("reads worktree markers through a CRLF gitfile", () => {
		const dir = repo();
		writeFileSync(join(dir, "base.txt"), "base\n");
		run(dir, ["add", "--", "base.txt"]);
		run(dir, ["commit", "-m", "chore: base"]);
		const worktree = mkdtempSync(join(tmpdir(), "pi-commit-worktree-"));
		rmSync(worktree, { recursive: true, force: true });
		repos.push(worktree);
		run(dir, ["worktree", "add", "--detach", worktree]);
		const gitfile = join(worktree, ".git");
		const crlfGitfile = join(worktree, ".git-crlf");
		writeFileSync(
			crlfGitfile,
			readFileSync(gitfile, "utf8").replace(/\n$/, "\r\n"),
		);
		renameSync(crlfGitfile, gitfile);
		const gitDir = run(worktree, ["rev-parse", "--git-dir"]).stdout.trim();
		const gitDirPath = isAbsolute(gitDir) ? gitDir : join(worktree, gitDir);
		writeFileSync(join(gitDirPath, "MERGE_HEAD"), "marker\n");

		const state = preflightGitState(worktree);
		expect(state.isWorktree).toBe(true);
		expect(state.mergeInProgress).toBe(true);
	});

	it("rejects bare repositories with the git repository domain error", () => {
		const dir = mkdtempSync(join(tmpdir(), "pi-commit-bare-"));
		repos.push(dir);
		run(dir, ["init", "--bare"]);
		expect(() => preflightGitState(dir)).toThrow(/^Not a git repository:/);
		expect(() => buildCommitPlan(dir)).toThrow(/^Not a git repository:/);
	});

	it("preserves a POSIX repository path ending in a newline", () => {
		if (process.platform === "win32") return;
		const originalDir = mkdtempSync(join(tmpdir(), "pi-commit-newline-"));
		const dir = `${originalDir}\n`;
		renameSync(originalDir, dir);
		repos.push(dir);
		run(dir, ["init", "--initial-branch", "main"]);
		run(dir, ["config", "user.email", "pi@example.invalid"]);
		run(dir, ["config", "user.name", "Pi Test"]);
		expect(buildCommitPlan(dir).repoRoot).toBe(dir);
	});

	it("blocks hasUnmergedPaths", () => {
		const dir = repo();
		// base commit on main with a file that will conflict
		writeFileSync(join(dir, "conflict.txt"), "main version\n");
		run(dir, ["add", "--", "conflict.txt"]);
		run(dir, ["commit", "-m", "chore: base"]);
		// feature branch with conflicting change
		run(dir, ["checkout", "-b", "feature"]);
		writeFileSync(join(dir, "conflict.txt"), "feature version\n");
		run(dir, ["add", "--", "conflict.txt"]);
		run(dir, ["commit", "-m", "feat: change conflict file"]);
		// back to main with another conflicting change
		run(dir, ["checkout", "main"]);
		writeFileSync(join(dir, "conflict.txt"), "main change\n");
		run(dir, ["add", "--", "conflict.txt"]);
		run(dir, ["commit", "-m", "chore: main change"]);
		// merge will produce unmerged paths
		run(dir, ["merge", "--no-commit", "--no-ff", "feature"], {
			allowFailure: true,
		});
		// precondition: MERGE_HEAD must exist (merge started)
		expect(existsInGitDir(dir, "MERGE_HEAD")).toBe(true);
		const state = preflightGitState(dir);
		expect(state.ok).toBe(false);
		expect(state.hasUnmergedPaths).toBe(true);
	});
});
