import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import registerCommitTools from "../extensions/commit.js";
import { createMockPi } from "./helpers/mock-pi.js";
import { buildCommitPlan } from "../lib/commit/plan.ts";

const repos: string[] = [];
function run(cwd: string, args: string[]) {
	const result = spawnSync("git", args, { cwd, encoding: "utf8" });
	if ((result.status ?? 1) !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
	return result.stdout;
}
function repo() {
	const dir = mkdtempSync(join(tmpdir(), "pi-commit-ext-"));
	repos.push(dir);
	run(dir, ["init"]);
	run(dir, ["config", "user.email", "pi@example.invalid"]);
	run(dir, ["config", "user.name", "Pi Test"]);
	return dir;
}

afterEach(() => {
	for (const dir of repos.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("commit extension registration", () => {
	it("registers commit_plan, commit_stage, and commit_create as callable tools", () => {
		const pi = createMockPi();
		registerCommitTools(pi as any);

		expect(pi._getTool("commit_plan")).toBeDefined();
		expect(pi._getTool("commit_validate_message")).toBeDefined();
		expect(pi._getTool("commit_stage")).toBeDefined();
		expect(pi._getTool("commit_create")).toBeDefined();
	});

	it("commit_stage returns formatToolError envelope on failure instead of throwing", async () => {
		const pi = createMockPi();
		registerCommitTools(pi as any);

		const tool = pi._getTool("commit_stage")!;
		const ctx = { cwd: "/nonexistent-repo-path" };
		const params = { paths: ["file.txt"], confirmationToken: "invalid" };

		const result = await tool.execute("id", params, undefined, undefined, ctx);

		expect(result).toHaveProperty("isError", true);
		expect(result.content).toBeInstanceOf(Array);
		expect(result.content[0]).toHaveProperty("type", "text");
		expect(typeof result.content[0].text).toBe("string");
	});

	it("commit_create returns formatToolError envelope on failure instead of throwing", async () => {
		const pi = createMockPi();
		registerCommitTools(pi as any);

		const tool = pi._getTool("commit_create")!;
		const ctx = { cwd: "/nonexistent-repo-path" };
		const params = { message: "feat: test", expectedStagedPaths: ["file.txt"], confirmationToken: "invalid" };

		const result = await tool.execute("id", params, undefined, undefined, ctx);

		expect(result).toHaveProperty("isError", true);
		expect(result.content[0]).toHaveProperty("type", "text");
	});

	it("commit_stage succeeds with a valid plan and returns staged paths", async () => {
		const dir = repo();
		writeFileSync(join(dir, "hello.txt"), "hello\n");

		const pi = createMockPi();
		registerCommitTools(pi as any);

		const planTool = pi._getTool("commit_plan")!;
		const stageTool = pi._getTool("commit_stage")!;
		const ctx = { cwd: dir };

		const planResult = await planTool.execute("id", {}, undefined, undefined, ctx);
		const plan = planResult.details as ReturnType<typeof buildCommitPlan>;

		const stageResult = await stageTool.execute(
			"id",
			{ paths: plan.safeStagePaths, confirmationToken: plan.stageConfirmationToken },
			undefined,
			undefined,
			ctx,
		);

		expect(stageResult).not.toHaveProperty("isError");
		expect(stageResult.details.staged).toContain("hello.txt");
	});
});
