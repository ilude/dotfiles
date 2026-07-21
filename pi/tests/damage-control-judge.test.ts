import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const complete = vi.hoisted(() => vi.fn());

vi.mock("@earendil-works/pi-ai/compat", () => ({ complete }));

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
	getApiKeyAndHeaders: vi.fn(async () => ({
		ok: true as const,
		apiKey: "test-key",
		headers: { authorization: "Bearer test-key" },
		env: { TEST_JUDGE: "1" },
	})),
};

let tmpRoot: string;
let previousOperatorDir: string | undefined;

beforeEach(() => {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-damage-control-judge-"));
	previousOperatorDir = process.env.PI_OPERATOR_DIR;
	process.env.PI_OPERATOR_DIR = path.join(tmpRoot, "operator");
	complete.mockReset();
	registry.find.mockClear();
	registry.getApiKeyAndHeaders.mockClear();
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
		complete.mockResolvedValue(response("allow contained delete"));

		const record = await judgeDamageControl({
			eventId: "event-1",
			command: "rm -rf build",
			cwd: "/repo",
			rule: "rm recursive force",
			reason: "recursive deletion",
			modelRegistry: registry,
		});

		expect(registry.find).toHaveBeenCalledWith("openai-codex", "gpt-5.6-luna");
		expect(complete).toHaveBeenCalledWith(
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
				apiKey: "test-key",
				headers: { authorization: "Bearer test-key" },
				env: { TEST_JUDGE: "1" },
			}),
		);
		expect(record).toMatchObject({
			eventId: "event-1",
			verdict: "allow",
			reason: "contained delete",
			model: "openai-codex/gpt-5.6-luna",
		});
		expect(listDamageControlJudgeRecords()).toMatchObject([record]);
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
		complete.mockResolvedValue(response("allow contained delete"));
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

	it("records an error row when auth cannot be resolved", async () => {
		registry.getApiKeyAndHeaders.mockResolvedValueOnce({
			ok: false,
			error: "not authenticated",
		});

		await expect(
			judgeDamageControl({
				eventId: "event-auth",
				command: "rm -rf build",
				cwd: "/repo",
				rule: "rm recursive force",
				reason: "recursive deletion",
				modelRegistry: registry,
			}),
		).resolves.toMatchObject({ verdict: "error", reason: "auth error" });
		expect(complete).not.toHaveBeenCalled();
	});

	it("records error for a timeout", async () => {
		vi.useFakeTimers();
		complete.mockImplementation(() => new Promise(() => undefined));
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
