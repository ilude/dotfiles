import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
	loadSessionBudgetConfig,
	registerSessionBudget,
	type SessionBudgetDependencies,
} from "../extensions/session-budget.ts";
import type { SessionBudgetConfig } from "../lib/session-budget.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

const baseConfig: SessionBudgetConfig = {
	enabled: true,
	maxSameAgentSpawns: 1,
	maxCommandErrorRepeats: 3,
};

function setup(
	config: SessionBudgetConfig = baseConfig,
	overrides: Partial<SessionBudgetDependencies> = {},
) {
	let now = 0;
	const pi = createMockPi();
	const recordEvent = vi.fn();
	registerSessionBudget(pi as never, {
		loadConfig: () => config,
		now: () => now,
		recordEvent,
		...overrides,
	});
	const ctx = createMockCtx();
	const hook = (name: string) => {
		const registered = pi._getHook(name)[0];
		if (!registered) throw new Error(`Missing ${name} hook`);
		return registered.handler;
	};
	return {
		pi,
		ctx,
		recordEvent,
		setNow(value: number) {
			now = value;
		},
		input: hook("input"),
		toolCall: hook("tool_call"),
		toolResult: hook("tool_result"),
	};
}

async function startEpoch(runtime: ReturnType<typeof setup>) {
	await runtime.input(
		{
			type: "input",
			text: "Fix only the requested bug",
			source: "interactive",
		},
		runtime.ctx,
	);
}

async function callTool(
	runtime: ReturnType<typeof setup>,
	id: string,
	toolName = "read",
	input: Record<string, unknown> = { path: "a.ts" },
) {
	return runtime.toolCall(
		{ type: "tool_call", toolCallId: id, toolName, input },
		runtime.ctx,
	);
}

async function failCommand(runtime: ReturnType<typeof setup>, index: number) {
	const toolCallId = `bash-${index}`;
	await callTool(runtime, toolCallId, "bash", { command: "pnpm test" });
	await runtime.toolResult(
		{
			type: "tool_result",
			toolCallId,
			toolName: "bash",
			input: { command: "pnpm test" },
			content: [{ type: "text", text: "same failure" }],
			isError: true,
			details: {},
		},
		runtime.ctx,
	);
}

async function repeatSpawn(runtime: ReturnType<typeof setup>) {
	const input = { agent: "reviewer", task: "Review the same plan" };
	await callTool(runtime, "spawn-1", "subagent", input);
	return callTool(runtime, "spawn-2", "subagent", input);
}

function hiddenMessages(runtime: ReturnType<typeof setup>) {
	return runtime.pi.sendMessage.mock.calls.filter(
		([message]) => message.customType === "session-budget.notice",
	);
}

describe("session budget extension", () => {
	it("registers only the budget command when disabled", async () => {
		const pi = createMockPi();
		registerSessionBudget(pi as never, {
			loadConfig: () => ({ ...baseConfig, enabled: false }),
		});

		expect(pi._hooks).toHaveLength(0);
		const command = pi._commands.find((item) => item.name === "budget");
		expect(command).toBeDefined();
		await command?.handler("", createMockCtx());
		expect(pi.sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				customType: "session-budget.status",
				content: "Session watchdog: disabled by configuration.",
			}),
			expect.objectContaining({ triggerTurn: false }),
		);
	});

	it("ignores project overrides when loading user-owned configuration", () => {
		const root = fs.mkdtempSync(
			path.join(os.tmpdir(), "session-budget-settings-"),
		);
		const userPath = path.join(root, "user-settings.json");
		const projectRoot = path.join(root, "repo");
		fs.mkdirSync(path.join(projectRoot, ".pi"), { recursive: true });
		fs.writeFileSync(
			userPath,
			JSON.stringify({
				sessionBudget: {
					enabled: true,
					maxCommandErrorRepeats: 4,
					softToolCalls: 1,
					hardMinutes: 1,
				},
			}),
		);
		fs.writeFileSync(
			path.join(projectRoot, ".pi", "settings.json"),
			JSON.stringify({
				sessionBudget: { enabled: false, maxCommandErrorRepeats: 999 },
			}),
		);
		try {
			expect(loadSessionBudgetConfig(projectRoot, userPath)).toEqual({
				enabled: true,
				maxSameAgentSpawns: 1,
				maxCommandErrorRepeats: 4,
			});
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("injects one soft notice after repeated failures", async () => {
		const runtime = setup();
		await startEpoch(runtime);
		for (let index = 1; index <= 3; index += 1) {
			await failCommand(runtime, index);
		}

		const notices = hiddenMessages(runtime);
		expect(notices).toHaveLength(1);
		expect(notices[0][0].content).toContain("Fix only the requested bug");
		expect(notices[0][0].content).toContain("3 tool calls");
		expect(notices[0][1]).toEqual({
			triggerTurn: true,
			deliverAs: "steer",
		});
		expect(runtime.recordEvent).toHaveBeenCalledTimes(1);
		expect(runtime.recordEvent.mock.calls[0][0]).toMatchObject({
			eventType: "budget_trip",
			data: {
				sensor: "command_error_repeat",
				level: "soft",
				measured: 3,
				threshold: 3,
			},
		});
	});

	it("starts an epoch for extension-originated user messages", async () => {
		const runtime = setup();
		await runtime.input(
			{
				type: "input",
				text: "Continue the queued workflow",
				source: "extension",
			},
			runtime.ctx,
		);
		for (let index = 1; index <= 3; index += 1) {
			await failCommand(runtime, index);
		}
		expect(hiddenMessages(runtime)[0][0].content).toContain(
			"Continue the queued workflow",
		);
	});

	it.each([
		["continue as scoped", false, undefined],
		["wrap up now", true, undefined],
		[
			"stop",
			true,
			{ block: true, reason: "Stopped by session watchdog user decision." },
		],
	] as const)("handles the hard choice %s before the pending tool", async (choice, expectsDirective, expectedDecision) => {
		const runtime = setup();
		runtime.ctx.ui.select.mockResolvedValue(choice);
		await startEpoch(runtime);
		const decision = await repeatSpawn(runtime);

		expect(runtime.ctx.ui.select).toHaveBeenCalledWith(
			expect.stringContaining("Session watchdog hard check-in"),
			["continue as scoped", "wrap up now", "stop"],
		);
		expect(decision).toEqual(expectedDecision);
		const directive = hiddenMessages(runtime).some(([message]) =>
			String(message.content).includes(
				`decision: ${choice === "stop" ? "stop" : "wrap up now"}`,
			),
		);
		expect(directive).toBe(expectsDirective);
		expect(runtime.recordEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				eventType: "budget_response",
				data: expect.objectContaining({ response: choice }),
			}),
		);
	});

	it("keeps a stop decision active until the next user input", async () => {
		const runtime = setup();
		runtime.ctx.ui.select.mockResolvedValue("stop");
		await startEpoch(runtime);
		await expect(repeatSpawn(runtime)).resolves.toEqual({
			block: true,
			reason: "Stopped by session watchdog user decision.",
		});
		await expect(callTool(runtime, "read-5")).resolves.toEqual({
			block: true,
			reason: "Stopped by session watchdog user decision.",
		});
		expect(runtime.ctx.ui.select).toHaveBeenCalledTimes(1);
		await runtime.input(
			{ type: "input", text: "Start a new request", source: "interactive" },
			runtime.ctx,
		);
		await expect(callTool(runtime, "new-read")).resolves.toBeUndefined();
	});

	it("blocks a hard trip when interactive input is unavailable", async () => {
		const runtime = setup();
		runtime.ctx.hasUI = false;
		await startEpoch(runtime);
		await expect(repeatSpawn(runtime)).resolves.toEqual({
			block: true,
			reason: "Session watchdog hard check-in requires interactive user input.",
		});
		await expect(callTool(runtime, "read-5")).resolves.toEqual({
			block: true,
			reason: "Session watchdog hard check-in requires interactive user input.",
		});
	});

	it("keeps a cancelled hard check-in pending", async () => {
		const runtime = setup();
		runtime.ctx.ui.select.mockResolvedValue(undefined);
		await startEpoch(runtime);
		await expect(repeatSpawn(runtime)).resolves.toEqual({
			block: true,
			reason: "Session watchdog hard check-in was cancelled.",
		});
		await expect(callTool(runtime, "read-5")).resolves.toEqual({
			block: true,
			reason: "Session watchdog hard check-in was cancelled.",
		});
		expect(runtime.ctx.ui.select).toHaveBeenCalledTimes(2);
	});

	it("hard-gates a repeated same-agent spawn with the same normalized prompt", async () => {
		const runtime = setup();
		runtime.ctx.ui.select.mockResolvedValue("continue as scoped");
		await startEpoch(runtime);
		const input = { agent: "reviewer", task: "Review the same plan" };
		await callTool(runtime, "spawn-1", "subagent", input);
		await callTool(runtime, "spawn-2", "subagent", {
			agent: "reviewer",
			task: "  review   the SAME plan ",
		});

		expect(runtime.ctx.ui.select).toHaveBeenCalledTimes(1);
		expect(runtime.ctx.ui.select.mock.calls.flat().join(" ")).toContain(
			"repeat_spawn",
		);
	});

	it("observes durable task executions as subagent spawns", async () => {
		const runtime = setup(baseConfig, {
			resolveTaskSpawn: () => ({
				agentType: "reviewer",
				prompt: "Review the durable task",
			}),
		});
		runtime.ctx.ui.select.mockResolvedValue("continue as scoped");
		await startEpoch(runtime);
		await callTool(runtime, "task-1", "task", {
			action: "execute",
			id: "task-1",
		});
		await callTool(runtime, "task-2", "task", {
			action: "execute",
			id: "task-2",
		});
		expect(runtime.ctx.ui.select.mock.calls.flat().join(" ")).toContain(
			"repeat_spawn",
		);
	});

	it("ignores durable task executions that are not eligible to start", async () => {
		const resolveTaskSpawn = vi.fn(() => undefined);
		const runtime = setup(baseConfig, { resolveTaskSpawn });
		await startEpoch(runtime);
		await callTool(runtime, "blocked", "task", {
			action: "execute",
			id: "blocked-task",
		});
		await callTool(runtime, "foreign", "task", {
			action: "execute",
			id: "foreign-task",
		});
		await callTool(runtime, "many", "task", {
			action: "execute_many",
			ids: ["dependency-task", "terminal-task"],
		});
		expect(resolveTaskSpawn).toHaveBeenCalledTimes(4);
		expect(runtime.ctx.ui.select).not.toHaveBeenCalled();
	});

	it("queues a hard command-error trip and gates the next tool call", async () => {
		const runtime = setup();
		runtime.ctx.ui.select.mockResolvedValue("continue as scoped");
		await startEpoch(runtime);
		for (let index = 1; index <= 5; index += 1) {
			await failCommand(runtime, index);
		}
		expect(runtime.ctx.ui.select).not.toHaveBeenCalled();
		await callTool(runtime, "next-read");
		expect(runtime.ctx.ui.select).toHaveBeenCalledTimes(1);
		expect(runtime.ctx.ui.select.mock.calls.flat().join(" ")).toContain(
			"command_error_repeat",
		);
		const tripEvents = runtime.recordEvent.mock.calls.filter(
			([event]) => event.eventType === "budget_trip",
		);
		expect(tripEvents).toHaveLength(2);
	});

	it("does not interrupt long-running work based on time or tool count", async () => {
		const runtime = setup();
		await startEpoch(runtime);
		runtime.setNow(8 * 60 * 60_000);
		for (let index = 1; index <= 100; index += 1) {
			await callTool(runtime, `read-${index}`);
		}
		expect(hiddenMessages(runtime)).toHaveLength(0);
		expect(runtime.ctx.ui.select).not.toHaveBeenCalled();
	});

	it("reports informational footprint and repetition thresholds through /budget", async () => {
		const runtime = setup();
		await startEpoch(runtime);
		await callTool(runtime, "edit-1", "edit", { path: "src/a.ts" });
		await callTool(runtime, "spawn-1", "subagent", {
			agent: "reviewer",
			task: "Review once",
		});
		const command = runtime.pi._commands.find((item) => item.name === "budget");
		await command?.handler("", runtime.ctx);

		const status = runtime.pi.sendMessage.mock.calls.find(
			([message]) => message.customType === "session-budget.status",
		)?.[0].content;
		expect(status).toContain("Tool calls: 2");
		expect(status).toContain("Files touched: 1 - src/a.ts");
		expect(status).toContain("Spawns: reviewer=1");
		expect(status).toContain("Repeated command errors: 0");
	});

	it("keeps enforcement active when telemetry recording fails", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		try {
			const runtime = setup(baseConfig, {
				recordEvent: vi.fn(() => {
					throw new Error("telemetry unavailable");
				}),
			});
			await startEpoch(runtime);
			for (let index = 1; index <= 3; index += 1) {
				await failCommand(runtime, index);
			}
			expect(hiddenMessages(runtime)).toHaveLength(1);
			expect(runtime.ctx.ui.notify).not.toHaveBeenCalled();
			expect(consoleError).toHaveBeenCalledWith(
				"[session-budget] telemetry failed: telemetry unavailable",
			);
		} finally {
			consoleError.mockRestore();
		}
	});

	it("preserves a stop decision when response telemetry fails", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		try {
			const runtime = setup(baseConfig, {
				recordEvent: vi.fn((event) => {
					if (event.eventType === "budget_response")
						throw new Error("response telemetry unavailable");
					return {} as never;
				}),
			});
			runtime.ctx.ui.select.mockResolvedValue("stop");
			await startEpoch(runtime);
			await expect(repeatSpawn(runtime)).resolves.toEqual({
				block: true,
				reason: "Stopped by session watchdog user decision.",
			});
			expect(consoleError).toHaveBeenCalledWith(
				"[session-budget] telemetry failed: response telemetry unavailable",
			);
		} finally {
			consoleError.mockRestore();
		}
	});

	it("disables itself after a non-telemetry handler error", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		try {
			let calls = 0;
			const runtime = setup(baseConfig, {
				now: () => {
					calls += 1;
					if (calls >= 3) throw new Error("clock unavailable");
					return 0;
				},
			});
			await startEpoch(runtime);
			await expect(callTool(runtime, "read-1")).resolves.toBeUndefined();
			expect(runtime.ctx.ui.notify).toHaveBeenCalledWith(
				"Session watchdog disabled for this session: clock unavailable",
				"error",
			);
			await expect(callTool(runtime, "read-2")).resolves.toBeUndefined();
			expect(consoleError).toHaveBeenCalledWith(
				"[session-budget] disabled: clock unavailable",
			);
		} finally {
			consoleError.mockRestore();
		}
	});
});
