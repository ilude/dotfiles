import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	judgeDamageControl,
	listDamageControlJudgeRecords,
	parseDamageControlJudgeVerdict,
	summarizeDamageControlJudge,
} from "../lib/damage-control-judge.ts";

type AssistantResponse = {
	content: Array<{ type: "text"; text: string }>;
	stopReason: "stop" | "error";
};

const registry = {
	find: vi.fn(() => ({
		provider: "openai-codex",
		id: "gpt-5.6-luna",
		api: "openai-codex-responses",
	})),
	complete: vi.fn(),
};

let tmpRoot: string;
let previousOperatorDir: string | undefined;

beforeEach(() => {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-damage-control-judge-"));
	previousOperatorDir = process.env.PI_OPERATOR_DIR;
	process.env.PI_OPERATOR_DIR = path.join(tmpRoot, "operator");
	registry.complete.mockReset();
	registry.find.mockClear();
});

afterEach(() => {
	if (previousOperatorDir === undefined) delete process.env.PI_OPERATOR_DIR;
	else process.env.PI_OPERATOR_DIR = previousOperatorDir;
	fs.rmSync(tmpRoot, { recursive: true, force: true });
	vi.useRealTimers();
});

function response(text: string): AssistantResponse {
	return { content: [{ type: "text", text }], stopReason: "stop" };
}

describe("damage-control judge", () => {
	it("uses a fresh, limited context and appends the parsed verdict", async () => {
		registry.complete.mockResolvedValue(response("allow contained delete"));

		const record = await judgeDamageControl({
			eventId: "event-1",
			command: "rm -rf build",
			cwd: "/repo",
			rule: "rm recursive force",
			reason: "recursive deletion",
			modelRegistry: registry,
		});

		expect(registry.find).toHaveBeenCalledWith("openai-codex", "gpt-5.6-luna");
		expect(registry.complete).toHaveBeenCalledWith(
			expect.objectContaining({ provider: "openai-codex", id: "gpt-5.6-luna" }),
			{
				systemPrompt: expect.stringContaining("allow or ask"),
				messages: [
					{
						role: "user",
						content:
							"command: rm -rf build\ncwd: /repo\nrule: rm recursive force\nreason: recursive deletion",
						timestamp: expect.any(Number),
					},
				],
			},
			expect.objectContaining({
				temperature: 0,
				timeoutMs: 20_000,
				maxRetries: 0,
			}),
		);
		expect(registry.complete.mock.calls[0]?.[2]).not.toHaveProperty("apiKey");
		expect(registry.complete.mock.calls[0]?.[2]).not.toHaveProperty("headers");
		expect(registry.complete.mock.calls[0]?.[2]).not.toHaveProperty("env");
		expect(record).toMatchObject({
			schemaVersion: 1,
			id: expect.any(String),
			ts: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
			eventId: "event-1",
			verdict: "allow",
			reason: "contained delete",
			model: "openai-codex/gpt-5.6-luna",
		});
		expect(record.ts).toBe(record.recordedAt);
		expect(listDamageControlJudgeRecords()).toMatchObject([record]);
	});

	it("reads legacy records without structured schema fields", () => {
		const file = path.join(
			process.env.PI_OPERATOR_DIR ?? "",
			"damage-control",
			"judge.jsonl",
		);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(
			file,
			`${JSON.stringify({
				eventId: "legacy-event",
				verdict: "ask",
				reason: "legacy record",
				model: "openai-codex/gpt-5.6-luna",
				latencyMs: 1,
				recordedAt: "2026-01-01T00:00:00.000Z",
			})}\n`,
			"utf-8",
		);

		expect(listDamageControlJudgeRecords()).toEqual([
			expect.objectContaining({
				eventId: "legacy-event",
				verdict: "ask",
				recordedAt: "2026-01-01T00:00:00.000Z",
			}),
		]);
	});

	it("accepts only a verdict and one non-empty line of reason", () => {
		expect(parseDamageControlJudgeVerdict("ask needs confirmation")).toEqual({
			verdict: "ask",
			reason: "needs confirmation",
		});
		expect(parseDamageControlJudgeVerdict("allow")).toBeUndefined();
		expect(parseDamageControlJudgeVerdict("ALLOW reason")).toBeUndefined();
		expect(
			parseDamageControlJudgeVerdict("allow reason\nmore"),
		).toBeUndefined();
	});

	it("contains judge persistence errors", async () => {
		registry.complete.mockResolvedValue(response("allow contained delete"));
		const operatorFile = path.join(tmpRoot, "operator-file");
		fs.writeFileSync(operatorFile, "not a directory", "utf-8");
		process.env.PI_OPERATOR_DIR = operatorFile;

		await expect(
			judgeDamageControl({
				eventId: "event-persistence",
				command: "rm -rf build",
				cwd: "/repo",
				rule: "rm recursive force",
				reason: "recursive deletion",
				modelRegistry: registry,
			}),
		).resolves.toMatchObject({ verdict: "allow" });
	});

	it("records an error row when model completion cannot resolve auth", async () => {
		registry.complete.mockRejectedValueOnce(new Error("not authenticated"));

		await expect(
			judgeDamageControl({
				eventId: "event-auth",
				command: "rm -rf build",
				cwd: "/repo",
				rule: "rm recursive force",
				reason: "recursive deletion",
				modelRegistry: registry,
			}),
		).resolves.toMatchObject({ verdict: "error", reason: "judge error" });
		expect(registry.complete).toHaveBeenCalledOnce();
	});

	it("records error for a timeout", async () => {
		vi.useFakeTimers();
		registry.complete.mockImplementation(() => new Promise(() => undefined));
		const pending = judgeDamageControl({
			eventId: "event-timeout",
			command: "rm -rf build",
			cwd: "/repo",
			rule: "rm recursive force",
			reason: "recursive deletion",
			modelRegistry: registry,
		});

		await vi.advanceTimersByTimeAsync(20_000);
		await expect(pending).resolves.toMatchObject({ verdict: "error" });
	});

	it("summarizes agreement with eval decisions by rule", () => {
		const stats = summarizeDamageControlJudge(
			[
				{
					eventId: "approved",
					verdict: "allow",
					reason: "contained",
					model: "openai-codex/gpt-5.6-luna",
					latencyMs: 2,
					recordedAt: "2026-01-01T00:00:00.000Z",
				},
				{
					eventId: "denied",
					verdict: "allow",
					reason: "incorrect",
					model: "openai-codex/gpt-5.6-luna",
					latencyMs: 2,
					recordedAt: "2026-01-01T00:00:00.000Z",
				},
			],
			[
				{ id: "approved", decisionType: "ask_approved", rule: "rm" },
				{ id: "denied", decisionType: "ask_denied", rule: "rm" },
			],
		);

		expect(stats).toMatchObject({
			total: 2,
			matched: 2,
			approvalAgreement: { matching: 1, total: 1 },
			judgeAllowOnDenied: 1,
			byRule: [
				{
					rule: "rm",
					total: 2,
					approvalAgreement: { matching: 1, total: 1 },
					judgeAllowOnDenied: 1,
				},
			],
		});
	});
});
