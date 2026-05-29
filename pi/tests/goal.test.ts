import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import goal, { goalTestApi } from "../extensions/goal.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

function writeFile(filePath: string, content: string | Buffer) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, content);
}

describe("goal extension", () => {
	let tmp: string;

	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), "goal-extension-"));
	});

	afterEach(() => {
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	it("registers /goal and provider-safe goal_complete schema", () => {
		const pi = createMockPi();
		goal(pi as unknown as ExtensionAPI);

		expect(pi._commands.map((command) => command.name)).toContain("goal");
		const tool = pi._getTool("goal_complete");
		expect(tool).toBeTruthy();
		expect(tool?.parameters).toMatchObject({
			type: "object",
			properties: {
				summary: expect.objectContaining({ type: "string" }),
				validation: expect.objectContaining({ type: "string" }),
				knownGaps: expect.objectContaining({ type: "string" }),
				nextSteps: expect.objectContaining({ type: "string" }),
			},
		});
	});

	it("starts inline goals through the registered command and enforces the 15000 character limit", async () => {
		const pi = createMockPi();
		goal(pi as unknown as ExtensionAPI);
		const command = pi._commands.find((item) => item.name === "goal");
		expect(command).toBeTruthy();

		await command?.handler(
			"Finish this concrete task",
			createMockCtx({ cwd: tmp }),
		);

		expect(pi.appendEntry).toHaveBeenCalledWith(
			"local-goal-state",
			expect.objectContaining({
				goal: expect.objectContaining({ mode: "inline", status: "active" }),
			}),
		);
		expect(pi.sendUserMessage).toHaveBeenCalledWith(
			expect.stringContaining("Active goal started"),
		);

		const accepted = goalTestApi.goalFromInline("x".repeat(15_000));
		expect(accepted.ok).toBe(true);
		const rejected = goalTestApi.goalFromInline("x".repeat(15_001));
		expect(rejected).toMatchObject({ ok: false });
		if (!rejected.ok) expect(rejected.message).toContain("/goal <path>");
	});

	it("handles file-backed goals and compact reminders without repeating full file contents", async () => {
		const pi = createMockPi();
		goal(pi as unknown as ExtensionAPI);
		const fileContent = `${"important objective detail ".repeat(80)}finish safely`;
		writeFile(path.join(tmp, "goal.md"), fileContent);

		await pi._commands
			.find((item) => item.name === "goal")
			?.handler("goal.md", createMockCtx({ cwd: tmp }));
		const beforeHook = pi._getHook("before_agent_start")[0].handler;
		const result = await beforeHook(
			{ systemPrompt: "base" },
			createMockCtx({ cwd: tmp }),
		);

		expect(pi.sendUserMessage).toHaveBeenCalledWith(
			expect.stringContaining("Preview:"),
		);
		expect(result.systemPrompt).toContain("File-backed goal: goal.md");
		expect(result.systemPrompt).toContain("sha256");
		expect(result.systemPrompt).not.toContain(fileContent);
		expect(result.systemPrompt.length).toBeLessThan(1200);
	});

	it("rejects unsafe or ambiguous file path inputs", () => {
		writeFile(path.join(tmp, "ok.md"), "safe goal");
		fs.mkdirSync(path.join(tmp, "folder.md"));
		writeFile(path.join(tmp, "binary.md"), Buffer.from([0, 1, 2, 3]));
		writeFile(path.join(tmp, "large.md"), "x".repeat(256 * 1024 + 1));
		const outside = fs.mkdtempSync(path.join(os.tmpdir(), "goal-outside-"));
		writeFile(path.join(outside, "outside.md"), "outside");

		try {
			expect(goalTestApi.parseGoal("missing.md", tmp)).toMatchObject({
				ok: false,
			});
			expect(goalTestApi.parseGoal("folder.md", tmp)).toMatchObject({
				ok: false,
			});
			expect(goalTestApi.parseGoal("../outside.md", tmp)).toMatchObject({
				ok: false,
			});
			expect(
				goalTestApi.parseGoal(path.join(outside, "outside.md"), tmp),
			).toMatchObject({ ok: false });
			expect(goalTestApi.parseGoal("binary.md", tmp)).toMatchObject({
				ok: false,
			});
			expect(goalTestApi.parseGoal("large.md", tmp)).toMatchObject({
				ok: false,
			});
			expect(goalTestApi.parseGoal("ok.md", tmp)).toMatchObject({ ok: true });
			const inline = goalTestApi.parseGoal("missing md words", tmp);
			expect(inline).toMatchObject({
				ok: true,
				goal: expect.objectContaining({ mode: "inline" }),
			});
		} finally {
			fs.rmSync(outside, { recursive: true, force: true });
		}
	});

	it("rejects symlink escapes when the platform supports creating them", () => {
		const outside = fs.mkdtempSync(
			path.join(os.tmpdir(), "goal-link-outside-"),
		);
		writeFile(path.join(outside, "linked.md"), "outside");
		try {
			fs.symlinkSync(
				path.join(outside, "linked.md"),
				path.join(tmp, "linked.md"),
			);
			expect(goalTestApi.parseGoal("linked.md", tmp)).toMatchObject({
				ok: false,
			});
		} catch (error) {
			expect(error).toBeTruthy();
		} finally {
			fs.rmSync(outside, { recursive: true, force: true });
		}
	});

	it("restores session state, completes the goal, clears active state, and returns closeout fields", async () => {
		const pi = createMockPi();
		goal(pi as unknown as ExtensionAPI);
		const parsed = goalTestApi.parseGoal("Finish restored task", tmp);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;

		const sessionStart = pi._getHook("session_start")[0].handler;
		await sessionStart(
			{},
			createMockCtx({
				cwd: tmp,
				sessionManager: {
					getBranch: () => [
						{ customType: "local-goal-state", data: { goal: parsed.goal } },
					],
				},
			}),
		);
		const beforeHook = pi._getHook("before_agent_start")[0].handler;
		expect(
			(await beforeHook({ systemPrompt: "base" }, createMockCtx({ cwd: tmp })))
				.systemPrompt,
		).toContain("Active /goal reminder");

		const tool = pi._getTool("goal_complete");
		const result = await tool?.execute(
			"call-1",
			{
				summary: "Implemented the goal command",
				validation: "pnpm test goal.test.ts passed",
				knownGaps: "None",
				nextSteps: "Archive the plan",
			},
			undefined,
			undefined,
			createMockCtx({ cwd: tmp }),
		);

		const report = result.content[0].text;
		expect(report).toContain("# Goal Closeout");
		expect(report).toContain("Accomplished work: Implemented the goal command");
		expect(report).toContain("Validation: pnpm test goal.test.ts passed");
		expect(report).toContain(
			"Current state: goal marked complete and active state cleared",
		);
		expect(report).toContain("Known gaps: None");
		expect(report).toContain("Next steps to consider: Archive the plan");
		expect(pi.appendEntry).toHaveBeenLastCalledWith(
			"local-goal-state",
			expect.objectContaining({ goal: null }),
		);
		expect(
			await beforeHook({ systemPrompt: "base" }, createMockCtx({ cwd: tmp })),
		).toBeUndefined();
	});
});
