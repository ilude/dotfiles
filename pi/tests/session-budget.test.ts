import { describe, expect, it } from "vitest";
import {
	parseSessionBudgetConfig,
	SessionBudgetTracker,
	type SessionBudgetConfig,
} from "../lib/session-budget.ts";

const config: SessionBudgetConfig = {
	enabled: true,
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

function commandFailure(value: SessionBudgetTracker) {
	return value.process({
		type: "command_result",
		command: "bash:pnpm test",
		ok: false,
		errorSignature: "same-error",
		timestamp: 0,
	});
}

describe("session budget tracker", () => {
	it("uses repetition defaults and rejects invalid thresholds", () => {
		expect(parseSessionBudgetConfig(undefined)).toEqual({
			enabled: true,
			maxSameAgentSpawns: 1,
			maxCommandErrorRepeats: 3,
		});
		expect(() => parseSessionBudgetConfig({ maxSameAgentSpawns: 0 })).toThrow(
			"maxSameAgentSpawns must be a positive integer",
		);
	});

	it("never trips based on elapsed time or tool-call count", () => {
		const value = tracker();
		for (let index = 0; index < 500; index += 1) {
			expect(toolCall(value, 8 * 60 * 60_000)).toEqual([]);
		}
		expect(value.snapshot(8 * 60 * 60_000)).toMatchObject({
			elapsedMinutes: 480,
			toolCalls: 500,
		});
	});

	it("resets counters, findings, and footprint for a new epoch", () => {
		const value = tracker();
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
		expect(commandFailure(value)).toEqual([]);
		expect(commandFailure(value)).toEqual([]);
		expect(commandFailure(value)).toEqual([
			expect.objectContaining({
				sensor: "command_error_repeat",
				level: "soft",
				measured: 3,
			}),
		]);
		expect(commandFailure(value)).toEqual([]);
		expect(commandFailure(value)).toEqual([
			expect.objectContaining({
				sensor: "command_error_repeat",
				level: "hard",
				measured: 5,
			}),
		]);
	});

	it("does not trip when a changed command succeeds after two failures", () => {
		const value = tracker();
		for (let index = 0; index < 2; index += 1) {
			expect(commandFailure(value)).toEqual([]);
		}
		expect(
			value.process({
				type: "command_result",
				command: "bash:pnpm test focused",
				ok: true,
				timestamp: 0,
			}),
		).toEqual([]);
		expect(commandFailure(value)).toEqual([]);
		expect(value.snapshot(0).maxCommandErrorRepeats).toBe(1);
	});

	it("emits each soft finding once and allows hard escalation", () => {
		const value = tracker();
		for (let index = 0; index < 3; index += 1) commandFailure(value);
		expect(commandFailure(value)).toEqual([]);
		expect(commandFailure(value)).toEqual([
			expect.objectContaining({
				sensor: "command_error_repeat",
				level: "hard",
			}),
		]);
	});

	it("acknowledges a sensor for the rest of the epoch", () => {
		const value = tracker();
		value.acknowledge("command_error_repeat");
		for (let index = 0; index < 8; index += 1) {
			expect(commandFailure(value)).toEqual([]);
		}
		expect(value.snapshot(0).sensors.command_error_repeat.acknowledged).toBe(
			true,
		);
	});
});
