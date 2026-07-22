import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import damageControl, {
	RepeatedToolLoopGuard,
} from "../extensions/damage-control.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

let tempState: string;
let previousOperatorDir: string | undefined;
let previousMetricsDir: string | undefined;

beforeEach(() => {
	tempState = fs.mkdtempSync(path.join(os.tmpdir(), "pi-tool-loop-"));
	previousOperatorDir = process.env.PI_OPERATOR_DIR;
	previousMetricsDir = process.env.PI_METRICS_DIR;
	process.env.PI_OPERATOR_DIR = path.join(tempState, "operator");
	process.env.PI_METRICS_DIR = path.join(tempState, "metrics");
});

afterEach(() => {
	if (previousOperatorDir === undefined) delete process.env.PI_OPERATOR_DIR;
	else process.env.PI_OPERATOR_DIR = previousOperatorDir;
	if (previousMetricsDir === undefined) delete process.env.PI_METRICS_DIR;
	else process.env.PI_METRICS_DIR = previousMetricsDir;
	fs.rmSync(tempState, { recursive: true, force: true });
});

describe("repeated tool loop guard", () => {
	it("detects the third identical call after two identical results", () => {
		const guard = new RepeatedToolLoopGuard();
		const input = { path: "missing.ts" };
		const result = {
			content: [{ type: "text", text: "not found\r\n" }],
			details: { code: "ENOENT" },
			isError: true,
		};

		expect(guard.check("read", input)).toBeUndefined();
		guard.record("read", input, result);
		expect(guard.check("read", input)).toBeUndefined();
		guard.record("read", input, {
			...result,
			content: [{ type: "text", text: "not found\n" }],
		});
		expect(guard.check("read", input)).toMatchObject({ attemptCount: 3 });
	});

	it("counts identical successful no-op results and resets on changed output", () => {
		const guard = new RepeatedToolLoopGuard();
		const input = { command: "status" };
		guard.record("bash", input, { content: "still waiting", isError: false });
		guard.record("bash", input, { content: "progressed", isError: false });
		expect(guard.check("bash", input)).toBeUndefined();
		guard.record("bash", input, { content: "progressed", isError: false });
		expect(guard.check("bash", input)).toMatchObject({ attemptCount: 3 });
		guard.reset();
		expect(guard.check("bash", input)).toBeUndefined();
	});

	it("aborts the run, records telemetry, and resets only on user input", async () => {
		const pi = createMockPi();
		damageControl(pi as unknown as Parameters<typeof damageControl>[0]);
		const toolCall = pi._getHook("tool_call")[0].handler;
		const toolResult = pi._getHook("tool_result")[0].handler;
		const inputHook = pi._getHook("input")[0].handler;
		const ctx = createMockCtx({ cwd: tempState });
		const event = {
			toolCallId: "loop-call",
			toolName: "read",
			input: { path: "missing.ts" },
		};
		const result = {
			...event,
			content: [{ type: "text", text: "not found" }],
			details: { code: "ENOENT" },
			isError: true,
		};

		for (let attempt = 0; attempt < 2; attempt += 1) {
			expect(toolCall(event, ctx)).toBeUndefined();
			await toolResult(result, ctx);
		}
		await inputHook({ source: "extension", text: "automatic follow-up" }, ctx);
		expect(toolCall(event, ctx)).toMatchObject({
			block: true,
			reason: expect.stringContaining("repeated_tool_loop"),
		});
		expect(ctx.abort).toHaveBeenCalledTimes(1);
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("Stopped the current run"),
			"warning",
		);

		const evalLog = path.join(
			process.env.PI_OPERATOR_DIR as string,
			"damage-control",
			"events.jsonl",
		);
		expect(fs.readFileSync(evalLog, "utf8")).toContain(
			'"rule":"repeated_tool_loop"',
		);

		await inputHook({ source: "interactive", text: "try again" }, ctx);
		expect(toolCall(event, ctx)).toBeUndefined();
	});
});
