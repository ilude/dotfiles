import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import registerScheduler, { parseAtTime } from "../extensions/scheduler.ts";
import {
	ProcessScheduler,
	getProcessScheduler,
	resetProcessScheduler,
} from "../lib/process-scheduler.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

let metricsDir: string;
let priorMetricsDir: string | undefined;

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-01-01T00:00:30.000Z"));
	metricsDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-scheduler-test-"));
	priorMetricsDir = process.env.PI_METRICS_DIR;
	process.env.PI_METRICS_DIR = metricsDir;
	resetProcessScheduler();
});

afterEach(() => {
	resetProcessScheduler();
	vi.useRealTimers();
	if (priorMetricsDir === undefined) delete process.env.PI_METRICS_DIR;
	else process.env.PI_METRICS_DIR = priorMetricsDir;
	fs.rmSync(metricsDir, { recursive: true, force: true });
});

describe("ProcessScheduler", () => {
	it("fires one-shot prompts and removes the completed schedule", async () => {
		const events = vi.fn();
		const scheduler = new ProcessScheduler(events);
		const delivery = vi.fn();
		scheduler.bind(delivery);
		scheduler.scheduleAt(new Date(Date.now() + 60_000), "continue work");

		await vi.advanceTimersByTimeAsync(60_000);

		expect(delivery).toHaveBeenCalledWith(
			expect.objectContaining({ kind: "at", prompt: "continue work" }),
		);
		expect(scheduler.list()).toHaveLength(0);
		expect(events).toHaveBeenCalledWith(
			expect.objectContaining({ event: "schedule_fired" }),
		);
	});

	it("coalesces recurring prompts until the agent settles", async () => {
		const scheduler = new ProcessScheduler(vi.fn());
		const delivery = vi.fn();
		scheduler.bind(delivery);
		scheduler.scheduleCron("* * * * *", "check status", "UTC");

		await vi.advanceTimersByTimeAsync(30_000);
		expect(delivery).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(60_000);
		expect(delivery).toHaveBeenCalledTimes(1);

		scheduler.markAgentSettled();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(delivery).toHaveBeenCalledTimes(2);
	});

	it("queues one due prompt while unbound and delivers it after rebinding", async () => {
		const scheduler = new ProcessScheduler(vi.fn());
		scheduler.scheduleAt(new Date(Date.now() + 60_000), "resume here");

		await vi.advanceTimersByTimeAsync(60_000);
		expect(scheduler.list()[0]).toMatchObject({ state: "queued" });

		const delivery = vi.fn();
		scheduler.bind(delivery);
		expect(delivery).toHaveBeenCalledOnce();
		expect(scheduler.list()).toHaveLength(0);
	});
});

describe("scheduler extension", () => {
	it("keeps schedules across session replacement and rebinds delivery", async () => {
		const firstPi = createMockPi();
		registerScheduler(firstPi as unknown as ExtensionAPI);
		const ctx = createMockCtx({ mode: "tui" });
		for (const hook of firstPi._getHook("session_start"))
			await hook.handler({ reason: "startup" }, ctx);
		const atCommand = firstPi._commands.find(
			(command) => command.name === "at",
		);
		await atCommand?.handler("1m -- continue in the active session", ctx);

		for (const hook of firstPi._getHook("session_shutdown"))
			await hook.handler({ reason: "new" }, ctx);

		const secondPi = createMockPi();
		registerScheduler(secondPi as unknown as ExtensionAPI);
		for (const hook of secondPi._getHook("session_start"))
			await hook.handler({ reason: "new" }, ctx);

		await vi.advanceTimersByTimeAsync(60_000);
		expect(firstPi.sendUserMessage).not.toHaveBeenCalled();
		expect(secondPi.sendUserMessage).toHaveBeenCalledWith(
			"continue in the active session",
			{ deliverAs: "followUp" },
		);
	});

	it("creates, lists, and cancels cron schedules through commands", async () => {
		const pi = createMockPi();
		registerScheduler(pi as unknown as ExtensionAPI);
		const ctx = createMockCtx({ mode: "tui" });
		const cronCommand = pi._commands.find((command) => command.name === "cron");
		const scheduleCommand = pi._commands.find(
			(command) => command.name === "schedule",
		);

		await cronCommand?.handler(
			'"0 9 * * 1-5" --tz America/New_York -- review open tasks',
			ctx,
		);
		const [job] = getProcessScheduler().list();
		expect(job).toMatchObject({
			kind: "cron",
			pattern: "0 9 * * 1-5",
			timezone: "America/New_York",
		});

		await scheduleCommand?.handler("list", ctx);
		expect(pi.sendMessage).toHaveBeenLastCalledWith(
			expect.objectContaining({
				content: expect.stringContaining("review open tasks"),
			}),
			expect.objectContaining({ triggerTurn: false }),
		);

		await scheduleCommand?.handler(`cancel ${job.id.slice(0, 8)}`, ctx);
		expect(getProcessScheduler().list()).toHaveLength(0);
	});

	it("mutates schedules without confirmation and rejects slash prompts", async () => {
		const pi = createMockPi();
		registerScheduler(pi as unknown as ExtensionAPI);
		const tool = pi._getTool("schedule") as any;
		const confirm = vi.fn(async () => false);
		const ctx = createMockCtx({ mode: "rpc", ui: { confirm } });

		const created = await tool.execute(
			"call-1",
			{ action: "create_at", when: "1m", prompt: "continue work" },
			undefined,
			undefined,
			ctx,
		);
		expect(created.details.outcome).toBe("scheduled");
		const [job] = getProcessScheduler().list();
		expect(confirm).not.toHaveBeenCalled();

		const cancelled = await tool.execute(
			"call-2",
			{ action: "cancel", id: job.id },
			undefined,
			undefined,
			ctx,
		);
		expect(cancelled.details.outcome).toBe("cancelled");
		expect(getProcessScheduler().list()).toHaveLength(0);
		expect(confirm).not.toHaveBeenCalled();

		const rejected = await tool.execute(
			"call-3",
			{ action: "create_at", when: "1m", prompt: "/commit" },
			undefined,
			undefined,
			ctx,
		);
		expect(rejected.isError).toBe(true);
	});

	it("parses explicit durations and rejects ambiguous at input", () => {
		const now = new Date("2026-01-01T00:00:00.000Z");
		expect(parseAtTime("15m", now).toISOString()).toBe(
			"2026-01-01T00:15:00.000Z",
		);
		expect(() => parseAtTime("tomorrow morning", now)).toThrow(
			"Use an ISO timestamp",
		);
	});
});
