import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() =>
	vi.fn(() => ({ pid: 4242, unref: vi.fn() })),
);
vi.mock("node:child_process", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:child_process")>();
	return { ...actual, spawn: spawnMock };
});

import goal, { goalTestApi } from "../extensions/goal.ts";
import { readLoopJob, updateLoopJob } from "../extensions/loop.ts";
import { getTask, transitionTask } from "../lib/task-registry.ts";
import { closeTaskDatabase, initializeTaskStore } from "../lib/task-store.ts";
import { initializeGitRepository } from "./helpers/git-fixture.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

function writeFile(filePath: string, content: string | Buffer) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, content);
}

function readyPlan(
	slug: string,
	tasks: Array<{ key: string; summary: string; dependsOn?: string[] }>,
): string {
	return [
		"---",
		"created: 2026-08-15",
		"status: ready",
		"completed:",
		"---",
		"",
		"# Plan",
		"",
		"## Objective",
		"",
		"Complete the fixture objective.",
		"",
		"## Completion Evidence",
		"",
		"- Evidence: The fixture objective works through its supported entrypoint.",
		"- Fails when: The supported entrypoint does not produce the expected result.",
		"",
		"## Boundaries",
		"",
		"- In scope: Fixture work.",
		"- Out of scope: Other work.",
		"",
		"## Tasks",
		"",
		...tasks.flatMap((task) => [
			`- [ ] **${task.key}: ${task.summary}**`,
			"  - Files: fixture.txt",
			`  - Depends on: ${task.dependsOn?.join(", ") ?? "none"}`,
			"  - Change: Complete the fixture task.",
			"  - Done when: The fixture task is complete.",
			"  - Verify: Run the fixture check.",
		]),
		"",
		"## Validation",
		"",
		"- [ ] Run the fixture check.",
		"",
		"## Retention",
		"",
		`Archive to .specs/archive/${slug}/.`,
		"",
		"## Execution Status",
		"",
		"- State: planned, not started",
		`- Resume: /do-it .specs/${slug}/plan.md`,
		"",
	].join("\n");
}

function initializeRepository(workspace: string): string {
	initializeGitRepository(workspace, {
		name: "Goal Test",
		email: "goal-test@example.invalid",
	});
	execFileSync("git", ["add", "--", "."], { cwd: workspace });
	execFileSync("git", ["commit", "-q", "-m", "test: initialize goal"], {
		cwd: workspace,
	});
	return execFileSync("git", ["rev-parse", "HEAD"], {
		cwd: workspace,
		encoding: "utf8",
	}).trim();
}

function configureGitExec(pi: ReturnType<typeof createMockPi>, workspace: string) {
	pi.exec.mockImplementation(async (command: string, args: string[]) => {
		if (command !== "git") throw new Error(`Unexpected command: ${command}`);
		try {
			return {
				stdout: execFileSync("git", args, { cwd: workspace, encoding: "utf8" }),
				stderr: "",
				code: 0,
				killed: false,
			};
		} catch (error) {
			return {
				stdout: "",
				stderr: error instanceof Error ? error.message : String(error),
				code: 1,
				killed: false,
			};
		}
	});
}

describe("goal extension", () => {
	let tmp: string;
	let runtimeRoot: string;
	let priorLoopDir: string | undefined;
	let priorGoalId: string | undefined;
	let priorOperatorDir: string | undefined;

	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), "goal-extension-"));
		runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "goal-runtime-"));
		priorLoopDir = process.env.PI_LOOP_DIR;
		priorGoalId = process.env.PI_GOAL_ID;
		priorOperatorDir = process.env.PI_OPERATOR_DIR;
		process.env.PI_LOOP_DIR = path.join(runtimeRoot, "loops");
		process.env.PI_OPERATOR_DIR = path.join(runtimeRoot, "operator");
		initializeTaskStore(process.env.PI_OPERATOR_DIR);
		delete process.env.PI_GOAL_ID;
	});

	afterEach(() => {
		if (priorLoopDir === undefined) delete process.env.PI_LOOP_DIR;
		else process.env.PI_LOOP_DIR = priorLoopDir;
		if (priorGoalId === undefined) delete process.env.PI_GOAL_ID;
		else process.env.PI_GOAL_ID = priorGoalId;
		closeTaskDatabase(path.join(runtimeRoot, "operator"));
		if (priorOperatorDir === undefined) delete process.env.PI_OPERATOR_DIR;
		else process.env.PI_OPERATOR_DIR = priorOperatorDir;
		vi.clearAllMocks();
		fs.rmSync(tmp, { recursive: true, force: true });
		fs.rmSync(runtimeRoot, { recursive: true, force: true });
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

	it("starts ordinary inline goals directly in the active session and enforces the 15000 character limit", async () => {
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
				goal: expect.objectContaining({
					mode: "inline",
					status: "active",
				}),
			}),
		);
		expect(pi.sendUserMessage).toHaveBeenCalledWith(
			expect.stringContaining("Work interactively and directly in this session"),
		);
		expect(pi.sendUserMessage).not.toHaveBeenCalledWith(
			expect.stringContaining("Use plan_progress"),
		);
		expect(pi.exec).not.toHaveBeenCalled();
		expect(pi.getActiveTools()).toContain("goal_complete");
		expect(pi.getActiveTools()).not.toContain("goal_progress");
		const toolCall = pi._getHook("tool_call")[0]?.handler;
		expect(
			await toolCall?.({ toolName: "edit", input: { path: "fixture.txt" } }),
		).toBeUndefined();

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
		writeFile(path.join(tmp, ".specs", "file-goal", "goal.md"), fileContent);
		writeFile(
			path.join(tmp, ".specs", "file-goal", "plan.md"),
			readyPlan("file-goal", [{ key: "T1", summary: "Finish safely" }]),
		);

		await pi._commands
			.find((item) => item.name === "goal")
			?.handler(".specs/file-goal/goal.md", createMockCtx({ cwd: tmp }));
		const beforeHook = pi._getHook("before_agent_start")[0].handler;
		const result = await beforeHook(
			{ systemPrompt: "base" },
			createMockCtx({ cwd: tmp }),
		);

		expect(pi.sendUserMessage).toHaveBeenCalledWith(
			expect.stringContaining("Preview:"),
		);
		expect(result.systemPrompt).toContain(
			"File-backed goal: .specs/file-goal/goal.md",
		);
		expect(result.systemPrompt).toContain("<!-- pi-runtime-context:goal -->");
		expect(result.systemPrompt.indexOf("base")).toBeLessThan(
			result.systemPrompt.indexOf("<!-- pi-runtime-context:goal -->"),
		);
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

	it("leaves generated completion evidence for operator settlement", () => {
		const parsed = goalTestApi.parseGoal("Complete ambiguous work", tmp);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;

		const plan = goalTestApi.attachOrCreatePlan(parsed.parsed, tmp);
		const content = fs.readFileSync(path.join(tmp, plan), "utf8");
		expect(content).toContain("## Completion Evidence");
		expect(content).toContain(
			"Settle concise `Evidence:` and `Fails when:` statements with the operator before readiness.",
		);
		expect(content).not.toMatch(/^\s*-\s+Evidence:/m);
		expect(content).not.toMatch(/^\s*-\s+Fails when:/m);
	});

	it("rejects generated plan paths that traverse a directory link", () => {
		const outside = fs.mkdtempSync(path.join(os.tmpdir(), "goal-plan-outside-"));
		try {
			try {
				fs.symlinkSync(
					outside,
					path.join(tmp, ".specs"),
					process.platform === "win32" ? "junction" : "dir",
				);
			} catch {
				return;
			}
			const parsed = goalTestApi.parseGoal("Complete linked work", tmp);
			expect(parsed.ok).toBe(true);
			if (parsed.ok)
				expect(() =>
					goalTestApi.attachOrCreatePlan(parsed.parsed, tmp),
				).toThrow("cannot traverse a symlink or junction");
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
					getSessionId: () => "goal-session",
					getBranch: () => [
						{ customType: "local-goal-state", data: { goal: parsed.goal } },
					],
				},
			}),
		);
		expect(pi.getActiveTools()).toContain("goal_complete");
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
		expect(pi.getActiveTools()).not.toContain("goal_complete");
		expect(
			await beforeHook({ systemPrompt: "base" }, createMockCtx({ cwd: tmp })),
		).toBeUndefined();
	});

	it("materializes and idempotently reconciles the canonical task dependency graph", () => {
		writeFile(path.join(tmp, "goal.md"), "Complete the dependent work.\n");
		writeFile(
			path.join(tmp, "plan.md"),
			[
				"- [ ] **T1: Prepare the input**",
				"- [ ] **T2: Consume the input**",
				"  - Depends on: T1",
				"  - Done when: The fixture task is complete.",
				"  - Verify: Run the fixture check.",
			].join("\n"),
		);
		initializeRepository(tmp);
		const parsed = goalTestApi.parseGoal("goal.md", tmp);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		const first = goalTestApi.createUnattendedGoal(
			parsed.parsed,
			tmp,
			"plan.md",
		);
		const second = goalTestApi.createUnattendedGoal(
			parsed.parsed,
			tmp,
			"plan.md",
		);
		expect(second.items.T1.taskId).toBe(first.items.T1.taskId);
		expect(second.items.T2.taskId).toBe(first.items.T2.taskId);
		const prerequisite = getTask(first.items.T1.taskId);
		const dependent = getTask(first.items.T2.taskId);
		expect(dependent?.blockedBy).toEqual([prerequisite?.id]);
		expect(dependent).toMatchObject({
			instructions:
				"Done when: The fixture task is complete. Verify: Run the fixture check.",
			metadata: {
				goalId: first.id,
				canonicalPlanPath: "plan.md",
				planTaskKey: "T2",
			},
		});
	});

	it("launches, correlates, reports, stops, and resumes an unattended goal without a loop id", async () => {
		writeFile(path.join(tmp, ".specs", "demo", "goal.md"), "Ship the demo safely.\n");
		writeFile(
			path.join(tmp, ".specs", "demo", "plan.md"),
			readyPlan("demo", [{ key: "T1", summary: "Ship the demo" }]),
		);
		initializeRepository(tmp);
		const pi = createMockPi();
		configureGitExec(pi, tmp);
		goal(pi as unknown as ExtensionAPI);
		const command = pi._commands.find((item) => item.name === "goal");
		const shutdown = vi.fn();
		const ctx = createMockCtx({ cwd: tmp, mode: "tui", shutdown });

		await command?.handler("--unattended .specs/demo/goal.md", ctx);

		expect(spawnMock).toHaveBeenCalledOnce();
		expect(shutdown).toHaveBeenCalledOnce();
		const [jobId] = fs.readdirSync(process.env.PI_LOOP_DIR as string);
		const job = readLoopJob(jobId);
		expect(job.goal).toMatchObject({
			id: jobId,
			state: "running",
			objectivePath: ".specs/demo/goal.md",
			plans: [".specs/demo/plan.md"],
		});
		expect(spawnMock.mock.calls[0]?.[1]).toContain("-GoalId");

		await command?.handler("status", ctx);
		expect(pi.sendMessage).toHaveBeenLastCalledWith(
			expect.objectContaining({ content: expect.stringContaining(`Goal ${jobId}:`) }),
			{ triggerTurn: false },
		);
		await command?.handler("stop", ctx);
		expect(readLoopJob(jobId).goal?.state).toBe("stopped");
		await command?.handler("resume", ctx);
		expect(spawnMock).toHaveBeenCalledTimes(2);
		expect(readLoopJob(jobId).goal?.state).toBe("running");
	});

	it("reconciles an archive move that completed before goal metadata persisted", async () => {
		writeFile(
			path.join(tmp, ".specs", "demo", "goal.md"),
			"Archive the completed directory.\n",
		);
		writeFile(
			path.join(tmp, ".specs", "demo", "plan.md"),
			readyPlan("demo", [
				{ key: "T1", summary: "Complete the archive fixture" },
			]),
		);
		initializeRepository(tmp);
		const pi = createMockPi();
		configureGitExec(pi, tmp);
		goal(pi as unknown as ExtensionAPI);
		const command = pi._commands.find((item) => item.name === "goal");
		if (!command) throw new Error("Goal command was not registered.");
		const ctx = createMockCtx({ cwd: tmp, mode: "tui", shutdown: vi.fn() });
		await command.handler("--unattended .specs/demo/goal.md", ctx);
		await command.handler("stop", ctx);
		fs.mkdirSync(path.join(tmp, ".specs", "archive"), { recursive: true });
		fs.renameSync(
			path.join(tmp, ".specs", "demo"),
			path.join(tmp, ".specs", "archive", "demo"),
		);
		execFileSync("git", ["add", "--", ".specs/demo", ".specs/archive/demo"], {
			cwd: tmp,
		});
		execFileSync("git", ["commit", "-q", "-m", "docs: archive fixture"], {
			cwd: tmp,
		});
		await command.handler("resume", ctx);
		const [jobId] = fs.readdirSync(process.env.PI_LOOP_DIR as string);
		expect(readLoopJob(jobId).goal).toMatchObject({
			state: "running",
			objectivePath: ".specs/archive/demo/goal.md",
			plans: [".specs/archive/demo/plan.md"],
			archivedPlanPath: ".specs/archive/demo/plan.md",
			closeoutState: "archived_pending_commit",
		});
	});

	async function setupUnattendedGoalRecovery() {
		writeFile(
			path.join(tmp, ".specs", "recovery", "goal.md"),
			"Complete both independent tasks.\n",
		);
		writeFile(
			path.join(tmp, ".specs", "recovery", "plan.md"),
			readyPlan("recovery", [
				{ key: "T1", summary: "Repair the first item" },
				{ key: "T2", summary: "Complete the independent item" },
			]),
		);
		initializeRepository(tmp);
		const pi = createMockPi();
		configureGitExec(pi, tmp);
		goal(pi as unknown as ExtensionAPI);
		const command = pi._commands.find((item) => item.name === "goal");
		const progress = pi._getTool("goal_progress");
		if (!command || !progress)
			throw new Error("Goal command or progress tool was not registered.");
		const ctx = createMockCtx({ cwd: tmp, mode: "tui", shutdown: vi.fn() });
		await command.handler("--unattended .specs/recovery/goal.md", ctx);
		const [jobId] = fs.readdirSync(process.env.PI_LOOP_DIR as string);
		const runningGoal = readLoopJob(jobId).goal;
		if (!runningGoal) throw new Error("Unattended goal was not created.");
		const first = getTask(runningGoal.items.T1.taskId);
		const second = getTask(runningGoal.items.T2.taskId);
		if (!first || !second) throw new Error("Goal root tasks were not created.");
		return { pi, command, ctx, progress, first, second, jobId };
	}

	it("persists recovery exhaustion and leaves independent work runnable", async () => {
		const { progress, first, second, jobId } =
			await setupUnattendedGoalRecovery();
		await updateLoopJob(jobId, (current) => ({
			...current,
			goal: current.goal
				? {
						...current.goal,
						items: {
							...current.goal.items,
							T1: {
								...current.goal.items.T1,
								qualifyingFailures: 19,
								phase: "ordinary",
							},
						},
					}
				: undefined,
		}));

		const started = await progress.execute("begin", {
			action: "begin_attempt",
			key: "T1",
			strategy: { agent: "builder" },
		});
		expect(started.isError).not.toBe(true);
		await progress.execute("outcome", {
			action: "record_outcome",
			key: "T1",
			outcome: "error",
		});
		expect(readLoopJob(jobId).goal?.items.T1).toMatchObject({
			qualifyingFailures: 20,
			phase: "re_evaluation_required",
		});

		const replacement = await progress.execute("replace-link", {
			action: "link_tasks",
			items: [{ key: "T1", taskId: second.id }],
		});
		expect(replacement.isError).toBe(true);
		const suspended = await progress.execute("suspended", {
			action: "begin_attempt",
			key: "T1",
			strategy: { agent: "builder" },
		});
		expect(suspended.isError).toBe(true);

		await progress.execute("reevaluate", {
			action: "re_evaluate",
			key: "T1",
			evidence: "The original evidence source was incomplete.",
			assumptions: "The failure may be fixture-specific.",
			message: "Use an independent evidence source and validation method.",
		});
		await progress.execute("recovery-1", {
			action: "begin_attempt",
			key: "T1",
			strategy: { agent: "reviewer" },
		});
		await progress.execute("recovery-1-result", {
			action: "record_outcome",
			key: "T1",
			outcome: "verifier_contradiction",
		});
		const identical = await progress.execute("identical", {
			action: "begin_attempt",
			key: "T1",
			strategy: { agent: "reviewer" },
		});
		expect(identical.isError).toBe(true);
		await progress.execute("reevaluate-2", {
			action: "re_evaluate",
			key: "T1",
			evidence: "The first recovery still contradicted the verifier.",
			assumptions: "The evidence source may be coupled to the failure.",
			message: "Use an independent fixture and validation method.",
		});
		await progress.execute("recovery-2", {
			action: "begin_attempt",
			key: "T1",
			strategy: { evidenceSource: "independent fixture" },
		});
		await progress.execute("recovery-2-result", {
			action: "record_outcome",
			key: "T1",
			outcome: "inconclusive",
		});

		expect(readLoopJob(jobId).goal?.items.T1).toMatchObject({
			qualifyingFailures: 22,
			phase: "needs_operator",
		});
		expect(getTask(first.id)?.state).toBe("assigned");
		const blockedRetry = await progress.execute("blocked-retry", {
			action: "begin_attempt",
			key: "T1",
			strategy: { validationMethod: "operator-free retry" },
		});
		expect(blockedRetry.isError).toBe(true);

		const independent = await progress.execute("independent", {
			action: "begin_attempt",
			key: "T2",
			strategy: { agent: "builder" },
		});
		expect(independent.isError).not.toBe(true);
		expect(getTask(second.id)?.state).toBe("assigned");
	});

	it("requires reconciliation before replaying a stale attempt", async () => {
		const { pi, progress, second, jobId } =
			await setupUnattendedGoalRecovery();
		await progress.execute("independent", {
			action: "begin_attempt",
			key: "T2",
			strategy: { agent: "builder" },
		});
		await updateLoopJob(jobId, (current) => ({
			...current,
			goal: current.goal
				? {
						...current.goal,
						items: {
							...current.goal.items,
							T2: {
								...current.goal.items.T2,
								activeAttempt: {
									...current.goal.items.T2.activeAttempt!,
									ownerPid: process.pid,
									ownerInstanceId: "stale-process-instance",
								},
							},
						},
					}
				: undefined,
		}));
		const toolCallHook = pi._getHook("tool_call")[0]?.handler;
		expect(
			await toolCallHook?.({ toolName: "bash", input: { command: "echo no" } }),
		).toMatchObject({ block: true });
		await progress.execute("stale-reconcile", {
			action: "reconcile",
			key: "T2",
			message: "The prior process ended before modification.",
		});
		const replay = await progress.execute("independent-again", {
			action: "begin_attempt",
			key: "T2",
			strategy: { evidenceSource: "post-reconciliation evidence" },
		});
		expect(replay.isError).not.toBe(true);
		expect(getTask(second.id)?.state).toBe("assigned");
	});

	it("preserves permission gates and exhausted recovery on resume", async () => {
		const { pi, command, ctx, progress, first, second, jobId } =
			await setupUnattendedGoalRecovery();
		await progress.execute("independent", {
			action: "begin_attempt",
			key: "T2",
			strategy: { agent: "builder" },
		});
		const toolResultHook = pi._getHook("tool_result")[0]?.handler;
		await toolResultHook?.({
			content: [
				{
					type: "text",
					text: JSON.stringify({
						outcome: "needs_approval",
						decisionId: "permission-123",
					}),
				},
			],
		});
		expect(getTask(second.id)?.state).toBe("assigned");
		expect(readLoopJob(jobId).goal).toMatchObject({
			state: "waiting_for_operator",
			items: {
				T2: { qualifyingFailures: 1, phase: "re_evaluation_required" },
			},
		});

		const deniedReplay = await progress.execute("denied-replay", {
			action: "begin_attempt",
			key: "T2",
			strategy: { agent: "builder" },
		});
		expect(deniedReplay.isError).toBe(true);
		await progress.execute("permission-reevaluation", {
			action: "re_evaluate",
			key: "T2",
			evidence: "The requested mutation requires operator approval.",
			assumptions: "Read-only inspection does not require that approval.",
			message: "Use the authorized read-only evidence path.",
		});
		const safer = await progress.execute("safer-alternative", {
			action: "begin_attempt",
			key: "T2",
			strategy: { toolApproach: "read-only evidence inspection" },
		});
		expect(safer.isError).not.toBe(true);
		await toolResultHook?.({
			content: [
				{
					type: "text",
					text: JSON.stringify({
						outcome: "needs_approval",
						decisionId: "permission-456",
					}),
				},
			],
		});
		const secondAlternative = await progress.execute("second-alternative", {
			action: "begin_attempt",
			key: "T2",
			strategy: { evidenceSource: "another source" },
		});
		expect(secondAlternative.isError).toBe(true);

		const recoveryReason =
			"recovery_exhausted: two materially different recovery attempts failed";
		// An assigned task remains assigned while recovery waits for the operator.
		await updateLoopJob(jobId, (current) => ({
			...current,
			goal: current.goal
				? {
						...current.goal,
						items: {
							...current.goal.items,
							T1: {
								...current.goal.items.T1,
								phase: "needs_operator",
								needsOperatorReason: recoveryReason,
								wait: {
									reason: "recovery_exhausted",
									evidence: "Two materially different recovery attempts failed.",
									operatorAction: "Choose a new strategy or stop this item.",
									recordedAt: "2026-08-15T00:00:00.000Z",
								},
								recoveryStrategies: [
									{ agent: "reviewer" },
									{ evidenceSource: "independent fixture" },
								],
							},
						},
						blockers: [
							...current.goal.blockers,
							`T1: ${recoveryReason}`,
						],
					}
				: undefined,
		}));

		await command.handler("resume", ctx);
		const resumed = readLoopJob(jobId).goal;
		expect(resumed?.items.T1.phase).toBe("needs_operator");
		expect(resumed?.items.T1.wait?.reason).toBe("recovery_exhausted");
		expect(resumed?.blockers).toContain(`T1: ${recoveryReason}`);
		expect(resumed?.blockers).toContain(
			"Permission decision permission-456 blocks T2.",
		);
	});

	it("rejects incomplete linked work and accepts only evidence-backed unattended completion", async () => {
		writeFile(
			path.join(tmp, ".specs", "demo", "goal.md"),
			"Finish the verified item.\n",
		);
		const planPath = path.join(tmp, ".specs", "demo", "plan.md");
		const completedPlanContent = [
			"---",
			"created: 2026-08-15",
			"status: complete",
			"completed: 2026-08-15",
			"---",
			"",
			"# Plan",
			"",
			"## Tasks",
			"",
			"- [x] **T1: Finish the verified item**",
			"  - State: complete",
			"- [x] **T2: Finish the second required item**",
			"  - State: complete",
			"",
			"## Validation",
			"",
			"- [x] Focused checks passed",
			"",
			"## Execution Status",
			"",
			"- State: complete",
			"",
		].join("\n");
		writeFile(
			planPath,
			readyPlan("demo", [
				{ key: "T1", summary: "Finish the verified item" },
				{ key: "T2", summary: "Finish the second required item" },
			]),
		);
		initializeRepository(tmp);
		const pi = createMockPi();
		configureGitExec(pi, tmp);
		goal(pi as unknown as ExtensionAPI);
		const command = pi._commands.find((item) => item.name === "goal");
		await command?.handler(
			"--unattended .specs/demo/goal.md",
			createMockCtx({ cwd: tmp, mode: "tui", shutdown: vi.fn() }),
		);
		const progress = pi._getTool("goal_progress");
		const [runningJobId] = fs.readdirSync(
			process.env.PI_LOOP_DIR as string,
		);
		const runningGoal = readLoopJob(runningJobId).goal;
		if (!runningGoal) throw new Error("Unattended goal was not created.");
		const task = getTask(runningGoal.items.T1.taskId);
		const secondTask = getTask(runningGoal.items.T2.taskId);
		if (!task || !secondTask)
			throw new Error("Required durable root tasks were not created.");
		const complete = pi._getTool("goal_complete");
		const completionEvidence = {
			conditionJudgments: [
				{
					id: "G1",
					evidence: "The fixture objective works through its supported entrypoint.",
					passed: true,
				},
			],
			integrationJudgment: "All current condition evidence composes into the goal.",
		};
		const rejected = await complete?.execute("complete-1", {
			summary: "Finished the item",
		});
		expect(rejected.content[0].text).toContain(
			"every current goal condition requires a judgment",
		);
		expect(rejected.isError).toBe(true);
		expect(rejected.content[0].text).toContain("linked task is unassigned");
		expect(rejected.content[0].text).toContain("no relevant validation evidence");
		expect(runningGoal.items.T2.required).toBe(true);
		const replacement = await progress?.execute("replace-linked", {
			action: "link_tasks",
			items: [{ key: "T2", taskId: task.id }],
		});
		expect(replacement.isError).toBe(true);
		expect(replacement.content[0].text).toContain(
			"already linked and cannot be replaced",
		);
		const unobservedValidation = await progress?.execute("unobserved-validation", {
			action: "validation",
			command: "pnpm test goal.test.ts",
			passed: true,
		});
		expect(unobservedValidation.isError).toBe(true);
		expect(unobservedValidation.content[0].text).toContain("observed");
		await pi._getHook("tool_result")[0]?.handler({
			toolName: "bash",
			input: { command: "pnpm test goal.test.ts" },
			content: [{ type: "text", text: "passed" }],
			isError: false,
		});
		await progress?.execute("stale-validation", {
			action: "validation",
			command: "pnpm test goal.test.ts",
			passed: true,
			summary: "recorded before required tasks completed",
		});
		await new Promise((resolve) => setTimeout(resolve, 5));
		for (const linkedTask of [task, secondTask]) {
			transitionTask(linkedTask.id, "assigned");
			transitionTask(linkedTask.id, "completed");
		}
		const stale = await complete?.execute("complete-stale", {
			summary: "Finished the verified item",
			...completionEvidence,
		});
		expect(stale.isError).toBe(true);
		expect(stale.content[0].text).toContain(
			"validation predates required task completion",
		);
		await progress?.execute("validation", {
			action: "validation",
			command: "pnpm test goal.test.ts",
			passed: true,
			summary: "focused lifecycle checks passed",
		});
		writeFile(planPath, completedPlanContent);
		execFileSync("git", ["add", "--", ".specs/demo/plan.md"], { cwd: tmp });
		execFileSync("git", ["commit", "-q", "-m", "docs: complete plan"], {
			cwd: tmp,
		});
		const archived = await complete?.execute("complete-2", {
			summary: "Finished the verified item",
			knownGaps: "None",
			...completionEvidence,
		});
		expect(archived.isError).not.toBe(true);
		expect(archived.content[0].text).toContain(
			"Archived .specs/demo/plan.md to .specs/archive/demo/plan.md",
		);
		const [jobId] = fs.readdirSync(process.env.PI_LOOP_DIR as string);
		expect(readLoopJob(jobId).goal).toMatchObject({
			state: "running",
			closeoutState: "archived_pending_commit",
			archivedPlanPath: ".specs/archive/demo/plan.md",
		});
		execFileSync("git", ["add", "--", ".specs/demo", ".specs/archive/demo"], {
			cwd: tmp,
		});
		execFileSync("git", ["commit", "-q", "-m", "docs: archive completed plan"], {
			cwd: tmp,
		});
		const accepted = await complete?.execute("complete-3", {
			summary: "Finished the verified item",
			knownGaps: "None",
			...completionEvidence,
		});
		expect(accepted.isError, accepted.content[0].text).not.toBe(true);
		expect(accepted.content[0].text).toContain("Repository state:");
		expect(accepted.content[0].text).toContain("Exact next action:");
		expect(readLoopJob(jobId).goal).toMatchObject({
			state: "completed",
			finalWorktree: "clean",
		});
		const immutable = await progress?.execute("after-complete", {
			action: "validation",
			command: "pnpm test goal.test.ts",
			passed: true,
		});
		expect(immutable.isError).toBe(true);
		expect(immutable.content[0].text).toContain("No unattended /goal is active");
		await command?.handler("stop", createMockCtx({ cwd: tmp }));
		expect(readLoopJob(jobId).goal?.state).toBe("completed");
		await command?.handler("resume", createMockCtx({ cwd: tmp }));
		expect(readLoopJob(jobId).goal?.state).toBe("completed");
		expect(spawnMock).toHaveBeenCalledTimes(1);
	});
});
