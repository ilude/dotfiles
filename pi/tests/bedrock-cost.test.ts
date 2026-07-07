import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bedrockCostExtension, {
	formatBedrockStatus,
	shouldRecordBedrockMessage,
} from "../extensions/bedrock-cost.js";
import {
	getCurrentBedrockMonthSummary,
	recordBedrockUsage,
} from "../lib/bedrock-cost-ledger.js";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.js";

let tmpRoot: string;
let prevOperatorDir: string | undefined;

beforeEach(() => {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-bedrock-cost-ext-"));
	prevOperatorDir = process.env.PI_OPERATOR_DIR;
	process.env.PI_OPERATOR_DIR = path.join(tmpRoot, "operator");
});

afterEach(() => {
	if (prevOperatorDir === undefined) delete process.env.PI_OPERATOR_DIR;
	else process.env.PI_OPERATOR_DIR = prevOperatorDir;
	fs.rmSync(tmpRoot, { recursive: true, force: true });
});

async function fire(
	pi: ReturnType<typeof createMockPi>,
	eventName: string,
	event: Record<string, unknown>,
	ctx: Record<string, unknown>,
): Promise<void> {
	for (const hook of pi._getHook(eventName)) {
		await hook.handler(event, ctx);
	}
}

function setupExtension() {
	const pi = createMockPi();
	const setStatus = vi.fn();
	const notify = vi.fn();
	const ctx = createMockCtx({
		hasUI: true,
		ui: {
			notify,
			setStatus,
		},
	});
	bedrockCostExtension(pi as unknown as ExtensionAPI);
	return { pi, ctx, setStatus, notify };
}

describe("bedrock cost status formatting", () => {
	it("formats exact and partial month-to-date totals", () => {
		expect(
			formatBedrockStatus({ costTotal: 1.23456, unpricedRequestCount: 0 }),
		).toBe("bedrock $1.2346 mtd");
		expect(
			formatBedrockStatus({ costTotal: 1.23456, unpricedRequestCount: 2 }),
		).toBe("bedrock >= $1.2346 mtd");
	});
});

describe("bedrock message filtering", () => {
	it("accepts only completed assistant messages from amazon-bedrock", () => {
		expect(
			shouldRecordBedrockMessage({
				role: "assistant",
				provider: "amazon-bedrock",
				model: "anthropic.claude-test",
				content: [],
				api: "messages",
				usage: {
					input: 1,
					output: 1,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 2,
					cost: {
						input: 0,
						output: 0,
						cacheRead: 0,
						cacheWrite: 0,
						total: 0.001,
					},
				},
				stopReason: "stop",
				timestamp: Date.now(),
			}),
		).toBe(true);
		expect(
			shouldRecordBedrockMessage({
				role: "assistant",
				provider: "openai-codex",
				model: "gpt-test",
				content: [],
				api: "messages",
				stopReason: "stop",
				timestamp: Date.now(),
			} as unknown as AgentMessage),
		).toBe(false);
		expect(
			shouldRecordBedrockMessage({
				role: "user",
				content: "hello",
				timestamp: Date.now(),
			}),
		).toBe(false);
	});
});

describe("bedrock cost extension", () => {
	it("sets the footer status from the existing ledger on session_start", async () => {
		await recordBedrockUsage({
			model: "anthropic.claude-test",
			usage: { input: 10, output: 5, cost: { total: 1.23456 } },
		});
		const { pi, ctx, setStatus, notify } = setupExtension();

		await fire(pi, "session_start", { type: "session_start" }, ctx);

		expect(setStatus).toHaveBeenLastCalledWith(
			"bedrock",
			"bedrock $1.2346 mtd",
		);
		expect(notify).not.toHaveBeenCalled();
	});

	it("records only Bedrock assistant message usage and marks partial totals", async () => {
		const { pi, ctx, setStatus } = setupExtension();

		await fire(
			pi,
			"message_end",
			{
				type: "message_end",
				message: {
					role: "assistant",
					provider: "openai-codex",
					model: "gpt-test",
					usage: { input: 20, output: 10, cost: { total: 9 } },
				},
			},
			ctx,
		);
		expect((await getCurrentBedrockMonthSummary()).requestCount).toBe(0);
		expect(setStatus).not.toHaveBeenCalled();

		await fire(
			pi,
			"message_end",
			{
				type: "message_end",
				message: {
					role: "assistant",
					provider: "amazon-bedrock",
					model: "anthropic.claude-test",
					usage: { input: 20, output: 10, cost: { total: 0.01 } },
				},
			},
			ctx,
		);
		expect((await getCurrentBedrockMonthSummary()).requestCount).toBe(1);
		expect(setStatus).toHaveBeenLastCalledWith(
			"bedrock",
			"bedrock $0.0100 mtd",
		);

		await fire(
			pi,
			"message_end",
			{
				type: "message_end",
				message: {
					role: "assistant",
					provider: "amazon-bedrock",
					model: "anthropic.claude-test",
					usage: { input: 20, output: 10, cost: { total: 0 } },
				},
			},
			ctx,
		);
		const summary = await getCurrentBedrockMonthSummary();
		expect(summary.requestCount).toBe(2);
		expect(summary.unpricedRequestCount).toBe(1);
		expect(setStatus).toHaveBeenLastCalledWith(
			"bedrock",
			"bedrock >= $0.0100 mtd",
		);
	});
});
