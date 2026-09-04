import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
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
	it("activates commit tools only for commit intent", async () => {
		const pi = createMockPi();
		registerCommitTools(pi as any);
		await pi._getHook("session_start")[0].handler({}, {});
		expect(pi.getActiveTools()).not.toContain("commit_plan");

		await pi._getHook("before_agent_start")[0].handler(
			{ prompt: "Explain the current implementation" },
			{},
		);
		expect(pi.getActiveTools()).not.toContain("commit_plan");
		await pi._getHook("before_agent_start")[0].handler(
			{ prompt: "Commit these changes" },
			{},
		);
		expect(pi.getActiveTools()).toEqual(
			expect.arrayContaining([
				"commit_plan",
				"commit_validate_message",
				"commit_stage",
				"commit_create",
			]),
		);
	});

	it("commit_stage throws on failure so Pi marks the tool call failed", async () => {
		const pi = createMockPi();
		registerCommitTools(pi as any);

		const tool = pi._getTool("commit_stage")!;
		const ctx = { cwd: "/nonexistent-repo-path" };
		const params = { planId: "missing" };

		await expect(
			tool.execute("id", params, undefined, undefined, ctx),
		).rejects.toThrow(/Unknown or expired commit planId/);
	});

	it("commit_create throws on failure so Pi marks the tool call failed", async () => {
		const pi = createMockPi();
		registerCommitTools(pi as any);

		const tool = pi._getTool("commit_create")!;
		const ctx = { cwd: "/nonexistent-repo-path" };
		const params = { message: "feat: test", stageId: "missing" };

		await expect(
			tool.execute("id", params, undefined, undefined, ctx),
		).rejects.toThrow(/Unknown or expired commit stageId/);
	});

	it("commit_stage succeeds with a valid plan and returns staged paths", async () => {
		const dir = repo();
		writeFileSync(join(dir, "hello.txt"), "hello\n");

		const pi = createMockPi();
		pi.exec.mockImplementation(async (command, args, options) => {
			const result = spawnSync(command, args, {
				cwd: options?.cwd,
				encoding: "utf8",
			});
			return {
				code: result.status ?? 1,
				stdout: result.stdout ?? "",
				stderr: result.stderr ?? "",
			};
		});
		registerCommitTools(pi as any);

		const planTool = pi._getTool("commit_plan")!;
		const stageTool = pi._getTool("commit_stage")!;
		const createTool = pi._getTool("commit_create")!;
		const ctx = { cwd: dir };

		const planResult = await planTool.execute("id", {}, undefined, undefined, ctx);
		const plan = planResult.details as ReturnType<typeof buildCommitPlan> & {
			planId: string;
		};
		const visiblePlan = JSON.parse(planResult.content[0].text);
		expect(visiblePlan.safeStagePaths).toEqual(["hello.txt"]);
		expect(visiblePlan.planId).toBe(plan.planId);
		expect(visiblePlan).not.toHaveProperty("stageConfirmationToken");

		const stageResult = await stageTool.execute(
			"id",
			{ planId: visiblePlan.planId },
			undefined,
			undefined,
			ctx,
		);

		expect(stageResult).not.toHaveProperty("isError");
		expect(stageResult.details.staged).toContain("hello.txt");
		const visibleStage = JSON.parse(stageResult.content[0].text);
		expect(visibleStage.stageId).toBe(stageResult.details.stageId);
		expect(visibleStage).not.toHaveProperty("createConfirmationToken");

		const createResult = await createTool.execute(
			"id",
			{ message: "feat: add hello", stageId: visibleStage.stageId },
			undefined,
			undefined,
			ctx,
		);
		expect(JSON.parse(createResult.content[0].text).hash).toMatch(/^[a-f0-9]+$/);
	});
});
