import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { buildCommitPlan } from "../lib/commit/plan.ts";
import { stagePaths } from "../lib/commit/stage.ts";
import { createCommit } from "../lib/commit/create.ts";

const repos: string[] = [];
function run(cwd: string, args: string[]) {
	const result = spawnSync("git", args, { cwd, encoding: "utf8" });
	if ((result.status ?? 1) !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
	return result.stdout;
}
function repo() {
	const dir = mkdtempSync(join(tmpdir(), "pi-commit-mutation-"));
	repos.push(dir);
	run(dir, ["init"]);
	run(dir, ["config", "user.email", "pi@example.invalid"]);
	run(dir, ["config", "user.name", "Pi Test"]);
	return dir;
}

afterEach(() => {
	for (const dir of repos.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("commit mutation safety", () => {
	it("commit_stage rejects missing token and never stages unsafe ignored paths", () => {
		const dir = repo();
		writeFileSync(join(dir, ".gitignore"), "*.secret\n");
		writeFileSync(join(dir, "safe.txt"), "safe\n");
		writeFileSync(join(dir, "local.secret"), "secret\n");
		const plan = buildCommitPlan(dir);
		expect(() => stagePaths(dir, ["safe.txt"])).toThrow(/confirmation token/);
		expect(() => stagePaths(dir, ["local.secret"], plan.stageConfirmationToken)).toThrow(/confirmation token|Ignored untracked|unsafe|not present/);
		const result = stagePaths(dir, plan.safeStagePaths, plan.stageConfirmationToken);
		expect(result.staged).toEqual([".gitignore", "safe.txt"]);
	});

	it("commit_create revalidates staged set and message immediately before commit", () => {
		const dir = repo();
		writeFileSync(join(dir, "safe.txt"), "safe\n");
		let plan = buildCommitPlan(dir);
		stagePaths(dir, plan.safeStagePaths, plan.stageConfirmationToken);
		plan = buildCommitPlan(dir);
		writeFileSync(join(dir, "drift.txt"), "drift\n");
		run(dir, ["add", "--", "drift.txt"]);
		expect(() => createCommit(dir, "feat: add safe file", plan.expectedStagedPaths, plan.createConfirmationToken)).toThrow(/Staged set changed/);
		run(dir, ["reset", "--", "drift.txt"]);
		expect(() => createCommit(dir, "bad message", plan.expectedStagedPaths, plan.createConfirmationToken)).toThrow(/conventional/);
		const commit = createCommit(dir, "feat: add safe file", plan.expectedStagedPaths, plan.createConfirmationToken);
		expect(commit.committedPaths).toEqual(["safe.txt"]);
		expect(commit.pushed).toBe(false);
	});
});
