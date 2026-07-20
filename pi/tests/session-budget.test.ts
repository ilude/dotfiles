import { describe, expect, it } from "vitest";
import {
	parseSessionBudgetConfig,
	SessionBudgetTracker,
	type SessionBudgetConfig,
} from "../lib/session-budget.ts";

const config: SessionBudgetConfig = {
	enabled: true,
	softToolCalls: 3,
	hardToolCalls: 5,
	softMinutes: 2,
	hardMinutes: 4,
	maxSameAgentSpawns: 1,
	maxCommandErrorRepeats: 3,
};

function tracker() {
	const value = new SessionBudgetTracker(config);
	value.process({
		type: "epoch_start",
		epochId: "epoch-1",
		prompt: "Fix the issue",
		timestamp: 0,
	});
	return value;
}

function toolCall(value: SessionBudgetTracker, timestamp: number) {
	return value.process({ type: "tool_call", toolName: "read", timestamp });
}

describe("session budget tracker", () => {
	it("uses defaults for missing settings and rejects invalid thresholds", () => {
		expect(parseSessionBudgetConfig(undefined)).toMatchObject({
			enabled: true,
			softToolCalls: 25,
			hardToolCalls: 60,
		});
		expect(() =>
			parseSessionBudgetConfig({ softToolCalls: 10, hardToolCalls: 10 }),
		).toThrow("hardToolCalls must be greater");
	});

	it("trips soft and hard tool-call budgets only at their thresholds", () => {
		const value = tracker();
		expect(toolCall(value, 0)).toEqual([]);
		expect(toolCall(value, 0)).toEqual([]);
		expect(toolCall(value, 0)).toEqual([
			expect.objectContaining({
				sensor: "budget",
				level: "soft",
				metric: "tool_calls",
				measured: 3,
				threshold: 3,
			}),
		]);
		expect(toolCall(value, 0)).toEqual([]);
		expect(toolCall(value, 0)).toEqual([
			expect.objectContaining({
				sensor: "budget",
				level: "hard",
				measured: 5,
				threshold: 5,
			}),
		]);
	});

	it("trips time budgets using event timestamps and not before", () => {
		const value = tracker();
		expect(toolCall(value, 2 * 60_000 - 1)).toEqual([]);
		expect(toolCall(value, 2 * 60_000)).toEqual([
			expect.objectContaining({
				sensor: "budget",
				level: "soft",
				metric: "minutes",
				measured: 2,
			}),
		]);
		const hard = toolCall(value, 4 * 60_000);
		expect(hard).toEqual([
			expect.objectContaining({
				sensor: "budget",
				level: "hard",
				metric: "minutes",
				measured: 4,
			}),
		]);
	});

	it("resets counters, findings, and footprint for a new epoch", () => {
		const value = tracker();
		for (let i = 0; i < 3; i += 1) toolCall(value, 0);
		value.process({
			type: "tool_call",
			toolName: "edit",
			timestamp: 0,
			touchedPaths: ["a.ts"],
		});
		value.process({
			type: "epoch_start",
			epochId: "epoch-2",
			prompt: "Second request",
			timestamp: 10,
		});
		expect(value.snapshot(10)).toMatchObject({
			epochId: "epoch-2",
			prompt: "Second request",
			toolCalls: 0,
			filesTouched: [],
		});
	});

	it("trips on a repeated same-agent spawn with the same prompt hash", () => {
		const value = tracker();
		const spawn = (agentType: string, promptHash: string) =>
			value.process({
				type: "spawn",
				agentType,
				promptHash,
				timestamp: 0,
			});
		expect(spawn("reviewer", "same")).toEqual([]);
		expect(spawn("validator", "same")).toEqual([]);
		expect(spawn("reviewer", "different")).toEqual([]);
		expect(spawn("reviewer", "same")).toEqual([
			expect.objectContaining({
				sensor: "repeat_spawn",
				level: "hard",
				measured: 2,
			}),
		]);
	});

	it("trips command errors softly on the third repeat and hard on the fifth", () => {
		const value = tracker();
		const fail = () =>
			value.process({
				type: "command_result",
				command: "bash:pnpm test",
				ok: false,
				errorSignature: "same-error",
				timestamp: 0,
			});
		expect(fail()).toEqual([]);
		expect(fail()).toEqual([]);
		expect(fail()).toEqual([
			expect.objectContaining({
				sensor: "command_error_repeat",
				level: "soft",
				measured: 3,
			}),
		]);
		expect(fail()).toEqual([]);
		expect(fail()).toEqual([
			expect.objectContaining({
				sensor: "command_error_repeat",
				level: "hard",
				measured: 5,
			}),
		]);
	});

	it("does not trip when a changed command succeeds after two failures", () => {
		const value = tracker();
		for (let i = 0; i < 2; i += 1) {
			expect(
				value.process({
					type: "command_result",
					command: "bash:pnpm test old",
					ok: false,
					errorSignature: "failure",
					timestamp: 0,
				}),
			).toEqual([]);
		}
		expect(
			value.process({
				type: "command_result",
				command: "bash:pnpm test focused",
				ok: true,
				timestamp: 0,
			}),
		).toEqual([]);
		expect(
			value.process({
				type: "command_result",
				command: "bash:pnpm test old",
				ok: false,
				errorSignature: "failure",
				timestamp: 0,
			}),
		).toEqual([]);
		expect(value.snapshot(0).maxCommandErrorRepeats).toBe(1);
	});

	it("counts the first wait call but exempts identical repeated polls", () => {
		const value = tracker();
		for (let i = 0; i < 8; i += 1) {
			expect(
				value.process({
					type: "tool_call",
					toolName: "onclave_await",
					waitPollKey: "onclave_await:message-1",
					timestamp: 0,
				}),
			).toEqual([]);
		}
		expect(value.snapshot(0).toolCalls).toBe(1);
	});

	it("emits each soft finding once and allows hard escalation", () => {
		const value = tracker();
		for (let i = 0; i < 3; i += 1) toolCall(value, 0);
		expect(toolCall(value, 0)).toEqual([]);
		expect(toolCall(value, 0)).toEqual([
			expect.objectContaining({ sensor: "budget", level: "hard" }),
		]);
	});

	it("acknowledges a sensor for the rest of the epoch", () => {
		const value = tracker();
		value.acknowledge("budget");
		for (let i = 0; i < 8; i += 1) expect(toolCall(value, 0)).toEqual([]);
		expect(value.snapshot(0).sensors.budget.acknowledged).toBe(true);
	});
});
