import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { buildCommitPlan, preflightGitState } from "../lib/commit/plan.ts";

const repos: string[] = [];
function run(cwd: string, args: string[]) {
	const result = spawnSync("git", args, { cwd, encoding: "utf8" });
	if ((result.status ?? 1) !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
	return result.stdout;
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
});
