import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import herdrMetadata, {
	isHerdrMetadataEnvironment,
	normalizeHerdrMetadataValue,
} from "../extensions/herdr-metadata.js";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.js";

const mockRuntime = vi.hoisted(() => ({
	listeners: new Set<() => void>(),
	runs: [] as Array<{ status: string }>,
	tasks: [] as Array<{
		state: string;
		sessionId: string;
	}>,
	unsubscribeCount: 0,
}));

vi.mock("../extensions/subagent/run-manager.js", () => ({
	subagentRunManager: {
		list: vi.fn(() => mockRuntime.runs),
		subscribe: vi.fn((listener: () => void) => {
			mockRuntime.listeners.add(listener);
			return () => {
				mockRuntime.listeners.delete(listener);
				mockRuntime.unsubscribeCount += 1;
			};
		}),
	},
}));

vi.mock("../lib/task-registry.js", () => ({
	listTasks: vi.fn(() => mockRuntime.tasks),
}));

function metadataContext(
	overrides: Record<string, unknown> = {},
): ReturnType<typeof createMockCtx> {
	return createMockCtx({
		mode: "tui",
		sessionManager: { getSessionId: () => "current-session" },
		model: { id: "gpt-5.6-sol", name: "GPT-5.6 Sol" },
		getContextUsage: () => ({
			tokens: 25_000,
			contextWindow: 100_000,
			percent: 25,
		}),
		...overrides,
	});
}

async function emitHook(
	pi: ReturnType<typeof createMockPi>,
	event: string,
	ctx = metadataContext(),
): Promise<void> {
	for (const hook of pi._getHook(event)) {
		await hook.handler({ type: event, reason: "startup" }, ctx);
	}
}

function commandArgs(
	pi: ReturnType<typeof createMockPi>,
	callIndex: number,
): string[] {
	return pi.exec.mock.calls[callIndex][1] as string[];
}

function commandSeq(args: string[]): number {
	return Number(args[args.indexOf("--seq") + 1]);
}

describe("Herdr metadata extension", () => {
	beforeEach(() => {
		vi.stubEnv("HERDR_ENV", "1");
		vi.stubEnv("HERDR_PANE_ID", "w1:p1");
		vi.stubEnv("HERDR_SOCKET_PATH", "herdr-test");
		vi.stubEnv("HERDR_BIN_PATH", "C:\\Herdr\\herdr.exe");
		mockRuntime.listeners.clear();
		mockRuntime.runs.length = 0;
		mockRuntime.tasks.length = 0;
		mockRuntime.unsubscribeCount = 0;
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("requires a complete Herdr pane environment", () => {
		expect(
			isHerdrMetadataEnvironment({
				HERDR_ENV: "1",
				HERDR_PANE_ID: "w1:p1",
				HERDR_SOCKET_PATH: "herdr-test",
			}),
		).toBe(true);
		expect(
			isHerdrMetadataEnvironment({
				HERDR_ENV: "1",
				HERDR_PANE_ID: "w1:p1",
			}),
		).toBe(false);
		expect(isHerdrMetadataEnvironment({})).toBe(false);
	});

	it("normalizes metadata to Herdr's value limit", () => {
		expect(normalizeHerdrMetadataValue("  one\n two  ")).toBe("one two");
		expect(normalizeHerdrMetadataValue("x".repeat(90))).toHaveLength(80);
		expect(normalizeHerdrMetadataValue(" \t ")).toBeUndefined();
	});

	it("does not register hooks or execute Herdr outside a managed pane", () => {
		vi.stubEnv("HERDR_SOCKET_PATH", "");
		const pi = createMockPi();

		herdrMetadata(pi as Parameters<typeof herdrMetadata>[0]);

		expect(pi.on).not.toHaveBeenCalled();
		expect(pi.exec).not.toHaveBeenCalled();
		expect(mockRuntime.listeners.size).toBe(0);
	});

	it("does not report metadata from headless child sessions", async () => {
		const pi = createMockPi();
		herdrMetadata(pi as Parameters<typeof herdrMetadata>[0]);
		const ctx = metadataContext({ mode: "json", hasUI: false });

		await emitHook(pi, "session_start", ctx);
		await emitHook(pi, "model_select", ctx);
		await emitHook(pi, "tool_result", ctx);
		await emitHook(pi, "agent_settled", ctx);

		expect(pi.exec).not.toHaveBeenCalled();
		expect(mockRuntime.listeners.size).toBe(0);
	});

	it("reports model, context, subagent, and current-session task metadata", async () => {
		mockRuntime.runs.push({ status: "running" }, { status: "completed" });
		mockRuntime.tasks.push(
			{ state: "running", sessionId: "current-session" },
			{ state: "blocked", sessionId: "current-session" },
			{ state: "running", sessionId: "other-session" },
		);
		const pi = createMockPi();
		herdrMetadata(pi as Parameters<typeof herdrMetadata>[0]);

		await emitHook(pi, "session_start");

		expect(pi.exec).toHaveBeenCalledOnce();
		expect(pi.exec).toHaveBeenCalledWith(
			"C:\\Herdr\\herdr.exe",
			[
				"pane",
				"report-metadata",
				"w1:p1",
				"--source",
				"pi:metadata",
				"--seq",
				expect.any(String),
				"--token",
				"model=gpt-5.6-sol",
				"--token",
				"context=ctx 25%",
				"--token",
				"subagents=subagents 1",
				"--token",
				"tasks=tasks 2 (1 running, 1 blocked)",
			],
			{ timeout: 5_000 },
		);
	});

	it("deduplicates unchanged state and clears optional values", async () => {
		mockRuntime.runs.push({ status: "running" });
		mockRuntime.tasks.push({
			state: "running",
			sessionId: "current-session",
		});
		const pi = createMockPi();
		herdrMetadata(pi as Parameters<typeof herdrMetadata>[0]);
		const initialCtx = metadataContext();

		await emitHook(pi, "session_start", initialCtx);
		await emitHook(pi, "agent_settled", initialCtx);
		expect(pi.exec).toHaveBeenCalledOnce();

		mockRuntime.runs.length = 0;
		for (const listener of [...mockRuntime.listeners]) listener();
		await vi.waitFor(() => expect(pi.exec).toHaveBeenCalledTimes(2));
		expect(commandArgs(pi, 1)).toEqual([
			"pane",
			"report-metadata",
			"w1:p1",
			"--source",
			"pi:metadata",
			"--seq",
			expect.any(String),
			"--clear-token",
			"subagents",
		]);

		mockRuntime.tasks.length = 0;
		await emitHook(
			pi,
			"agent_settled",
			metadataContext({
				model: undefined,
				getContextUsage: () => ({
					tokens: null,
					contextWindow: 100_000,
					percent: null,
				}),
			}),
		);
		expect(pi.exec).toHaveBeenCalledTimes(3);
		expect(commandArgs(pi, 2)).toEqual([
			"pane",
			"report-metadata",
			"w1:p1",
			"--source",
			"pi:metadata",
			"--seq",
			expect.any(String),
			"--clear-token",
			"model",
			"--clear-token",
			"context",
			"--clear-token",
			"tasks",
		]);
		expect(commandSeq(commandArgs(pi, 0))).toBeLessThan(
			commandSeq(commandArgs(pi, 1)),
		);
		expect(commandSeq(commandArgs(pi, 1))).toBeLessThan(
			commandSeq(commandArgs(pi, 2)),
		);
	});

	it("refreshes model selection and removes the subagent listener on shutdown", async () => {
		const pi = createMockPi();
		herdrMetadata(pi as Parameters<typeof herdrMetadata>[0]);

		await emitHook(pi, "session_start");
		await emitHook(
			pi,
			"model_select",
			metadataContext({
				model: { id: "claude-sonnet-5", name: "Claude Sonnet 5" },
			}),
		);
		expect(commandArgs(pi, 1)).toContain("model=claude-sonnet-5");
		expect(mockRuntime.listeners.size).toBe(1);

		await emitHook(pi, "session_shutdown");
		expect(mockRuntime.listeners.size).toBe(0);
		expect(mockRuntime.unsubscribeCount).toBe(1);
	});
});
