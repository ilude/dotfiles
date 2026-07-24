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

function readTextFiles(root: string): string {
	if (!fs.existsSync(root)) return "";
	return fs
		.readdirSync(root, { withFileTypes: true })
		.flatMap((entry) => {
			const entryPath = path.join(root, entry.name);
			return entry.isDirectory()
				? [readTextFiles(entryPath)]
				: [fs.readFileSync(entryPath, "utf8")];
		})
		.join("\n");
}

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
	it.each([
		["edit", { path: "missing.ts", edits: [{ oldText: "old", newText: "new" }] }],
		["read", { path: "missing.ts" }],
		["bash", { command: "synthetic failure" }],
		["vendor.synthetic_tool", { operation: "fail" }],
	])("blocks the fifth identical failed %s call", (toolName, input) => {
		const guard = new RepeatedToolLoopGuard();
		const result = {
			content: [{ type: "text", text: "synthetic failure" }],
			details: { code: "SYNTHETIC_FAILURE" },
			isError: true,
		};

		for (let attempt = 0; attempt < 4; attempt += 1) {
			expect(guard.check(toolName, input)).toBeUndefined();
			guard.record(toolName, input, result);
		}
		expect(guard.check(toolName, input)).toMatchObject({ attemptCount: 5 });
	});

	it("normalizes structured input without erasing meaningful edit changes", () => {
		const guard = new RepeatedToolLoopGuard();
		const result = {
			content: [{ type: "text", text: "no match\r\n" }],
			details: { status: 422 },
			isError: true,
		};
		const firstInput = {
			path: "source.ts",
			edits: [{ oldText: "const  value = 1;  \r\n", newText: "updated\r\n" }],
			options: { beta: true, alpha: 1 },
		};
		const equivalentInput = {
			options: { alpha: 1, beta: true },
			edits: [{ newText: "updated\n", oldText: "const  value = 1;\n" }],
			path: "source.ts",
		};

		for (let attempt = 0; attempt < 4; attempt += 1) {
			guard.record("EDIT", firstInput, result);
		}
		expect(guard.check(" edit ", equivalentInput)).toMatchObject({
			attemptCount: 5,
		});
		expect(
			guard.check("edit", {
				...equivalentInput,
				edits: [{ newText: "updated\n", oldText: "const value = 1;\n" }],
			}),
		).toBeUndefined();
		expect(
			guard.check("edit", {
				...equivalentInput,
				edits: [...equivalentInput.edits].reverse().concat({
					oldText: "second",
					newText: "change",
				}),
			}),
		).toBeUndefined();
	});

	it("uses stable failure text, code, and status while excluding volatile values", () => {
		const guard = new RepeatedToolLoopGuard();
		const input = { path: "missing.ts" };

		for (let attempt = 0; attempt < 4; attempt += 1) {
			guard.record("read", input, {
				content: [
					{
						type: "text",
						text: `Request ID: req-${attempt} failed at 2026-07-24T12:0${attempt}:00.000Z after ${attempt + 1}ms`,
					},
				],
				details: {
					code: "ENOENT",
					status: 404,
					requestId: `req-${attempt}`,
					timestamp: 1_753_360_000_000 + attempt,
					durationMs: attempt + 1,
				},
				isError: true,
			});
		}
		expect(guard.check("read", input)).toMatchObject({ attemptCount: 5 });
	});

	it("starts a distinct count for changed input or failure signature", () => {
		const guard = new RepeatedToolLoopGuard();
		const input = { path: "missing.ts" };
		const result = {
			content: [{ type: "text", text: "not found" }],
			details: { code: "ENOENT" },
			isError: true,
		};

		for (let attempt = 0; attempt < 4; attempt += 1) {
			guard.record("read", input, result);
		}
		expect(guard.check("read", { path: "other.ts" })).toBeUndefined();
		guard.record("read", input, {
			...result,
			content: [{ type: "text", text: "permission denied" }],
			details: { code: "EACCES" },
		});
		expect(guard.check("read", input)).toBeUndefined();
	});

	it("counts identical successful no-op results and resets on changed output", () => {
		const guard = new RepeatedToolLoopGuard();
		const input = { command: "status" };
		guard.record("bash", input, { content: "still waiting", isError: false });
		guard.record("bash", input, { content: "progressed", isError: false });
		expect(guard.check("bash", input)).toBeUndefined();
		for (let attempt = 1; attempt < 5; attempt += 1) {
			guard.record("bash", input, { content: "progressed", isError: false });
		}
		expect(guard.check("bash", input)).toMatchObject({ attemptCount: 6 });
		guard.reset();
		expect(guard.check("bash", input)).toBeUndefined();
	});

	it("does not accumulate identical results across settled scheduled runs", async () => {
		const pi = createMockPi();
		damageControl(pi as unknown as Parameters<typeof damageControl>[0]);
		const toolCall = pi._getHook("tool_call")[0].handler;
		const toolResult = pi._getHook("tool_result")[0].handler;
		const inputHook = pi._getHook("input")[0].handler;
		const agentSettled = pi._getHook("agent_settled")[0].handler;
		const ctx = createMockCtx({ cwd: tempState });
		const event = {
			toolCallId: "scheduled-check",
			toolName: "bash",
			input: { command: "check deployment" },
		};
		const result = {
			...event,
			content: [{ type: "text", text: "healthy" }],
			details: {},
			isError: false,
		};

		for (let run = 0; run < 6; run += 1) {
			await inputHook({ source: "extension", text: "scheduled check" }, ctx);
			expect(toolCall(event, ctx)).toBeUndefined();
			await toolResult(result, ctx);
			await agentSettled({}, ctx);
		}

		expect(ctx.abort).not.toHaveBeenCalled();
	});

	it("aborts an unsettled run, records telemetry, and resets on user input", async () => {
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

		for (let attempt = 0; attempt < 4; attempt += 1) {
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
			expect.stringContaining("same failure 4 times"),
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

	it("records only hashes and counts for a repeated failure", async () => {
		const pi = createMockPi();
		damageControl(pi as unknown as Parameters<typeof damageControl>[0]);
		const toolCall = pi._getHook("tool_call")[0].handler;
		const toolResult = pi._getHook("tool_result")[0].handler;
		const ctx = createMockCtx({ cwd: tempState });
		const rawInput = "private-input-sentinel";
		const rawError = "private-error-sentinel";
		const event = {
			toolCallId: "telemetry-call",
			toolName: "vendor.synthetic_tool",
			input: { operation: rawInput },
		};

		for (let attempt = 0; attempt < 4; attempt += 1) {
			await toolResult(
				{
					...event,
					content: [{ type: "text", text: rawError }],
					details: { code: "SYNTHETIC_FAILURE" },
					isError: true,
				},
				ctx,
			);
		}
		expect(toolCall(event, ctx)).toMatchObject({ block: true });

		const telemetry = readTextFiles(tempState);
		expect(telemetry).toContain('"attemptCount":5');
		expect(telemetry).toMatch(/"callFingerprint":"[a-f0-9]{64}"/);
		expect(telemetry).toMatch(/"resultFingerprint":"[a-f0-9]{64}"/);
		expect(telemetry).not.toContain(rawInput);
		expect(telemetry).not.toContain(rawError);
	});
});
