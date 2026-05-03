import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { buildCommitPlan, preflightGitState } from "../lib/commit/plan.ts";
import { existsInGitDir } from "../lib/commit/git.ts";

const repos: string[] = [];
function run(cwd: string, args: string[], opts: { allowFailure?: boolean } = {}) {
	const result = spawnSync("git", args, { cwd, encoding: "utf8" });
	if (!opts.allowFailure && (result.status ?? 1) !== 0)
		throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
	return result;
}
function repo() {
	const dir = mkdtempSync(join(tmpdir(), "pi-commit-"));
	repos.push(dir);
	run(dir, ["init"]);
	run(dir, ["config", "user.email", "pi@example.invalid"]);
	run(dir, ["config", "user.name", "Pi Test"]);
	return dir;
}

afterEach(() => {
	for (const dir of repos.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("commit planning", () => {
	it("preserves tracked file -> ignored -> git rm --cached staged deletion", () => {
		const dir = repo();
		writeFileSync(join(dir, "generated.log"), "generated\n");
		run(dir, ["add", "--", "generated.log"]);
		run(dir, ["commit", "-m", "chore: seed fixture"]);
		writeFileSync(join(dir, ".gitignore"), "*.log\n");
		run(dir, ["rm", "--cached", "--", "generated.log"]);
		const plan = buildCommitPlan(dir);
		const entry = plan.entries.find((item) => item.path === "generated.log");
		expect(entry).toMatchObject({ classification: "staged_deletion", safeToGitAdd: false, recommendedAction: "keep_staged" });
	});

	it("marks ignored untracked files unsafe to add", () => {
		const dir = repo();
		writeFileSync(join(dir, ".gitignore"), "*.secret\n");
		writeFileSync(join(dir, "local.secret"), "x\n");
		const entry = buildCommitPlan(dir).entries.find((item) => item.path === "local.secret");
		expect(entry).toMatchObject({ classification: "ignored_untracked", safeToGitAdd: false, recommendedAction: "skip" });
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
		const rebaseActive = existsInGitDir(dir, "rebase-merge") || existsInGitDir(dir, "rebase-apply");
		expect(rebaseActive).toBe(true);
		const state = preflightGitState(dir);
		expect(state.ok).toBe(false);
		expect(state.rebaseInProgress).toBe(true);
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
		run(dir, ["merge", "--no-commit", "--no-ff", "feature"], { allowFailure: true });
		// precondition: MERGE_HEAD must exist (merge started)
		expect(existsInGitDir(dir, "MERGE_HEAD")).toBe(true);
		const state = preflightGitState(dir);
		expect(state.ok).toBe(false);
		expect(state.hasUnmergedPaths).toBe(true);
	});
});
