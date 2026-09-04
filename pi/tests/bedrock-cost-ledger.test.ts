import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	currentMonthKey,
	formatMoney,
	formatTokenCount,
	getBedrockCostLedgerPath,
	getCurrentBedrockMonthSummary,
	normalizeUsageRecord,
	readBedrockCostLedger,
	recordBedrockUsage,
	summarizeMonth,
} from "../lib/bedrock-cost-ledger.js";

let tmpRoot: string;
let tmpOperatorDir: string;
let prevOperatorDir: string | undefined;

beforeEach(() => {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-bedrock-cost-ledger-"));
	tmpOperatorDir = path.join(tmpRoot, "operator");
	prevOperatorDir = process.env.PI_OPERATOR_DIR;
	process.env.PI_OPERATOR_DIR = tmpOperatorDir;
});

afterEach(() => {
	if (prevOperatorDir === undefined) delete process.env.PI_OPERATOR_DIR;
	else process.env.PI_OPERATOR_DIR = prevOperatorDir;
	fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("currentMonthKey", () => {
	it("uses local calendar month boundaries", () => {
		const beforeMidnight = new Date(2026, 0, 31, 23, 59, 59);
		const afterMidnight = new Date(2026, 1, 1, 0, 0, 0);
		expect(currentMonthKey(beforeMidnight)).toBe("2026-01");
		expect(currentMonthKey(afterMidnight)).toBe("2026-02");
	});
});

describe("storage path", () => {
	it("defaults under PI_OPERATOR_DIR", () => {
		expect(getBedrockCostLedgerPath()).toBe(
			path.join(tmpOperatorDir, "bedrock-costs.json"),
		);
	});

	it("honors an explicit file path", () => {
		const filePath = path.join(tmpRoot, "custom", "costs.json");
		expect(getBedrockCostLedgerPath({ filePath })).toBe(filePath);
	});
});

describe("normalizeUsageRecord", () => {
	it("ignores provider cost and flags unknown token usage as unpriced", () => {
		expect(
			normalizeUsageRecord({
				model: "anthropic.claude-test",
				usage: { input: 10, output: 5, cost: { total: 0 } },
				date: new Date(2026, 2, 4),
			}),
		).toMatchObject({
			month: "2026-03",
			provider: "amazon-bedrock",
			model: "anthropic.claude-test",
			inputTokens: 10,
			outputTokens: 5,
			costTotal: 0,
			requestCount: 1,
			unpricedRequestCount: 1,
		});
	});

	it("does not flag unpriced requests when no tokens were reported", () => {
		const got = normalizeUsageRecord({
			provider: "amazon-bedrock",
			model: "anthropic.claude-test",
			usage: {},
		});
		expect(got.unpricedRequestCount).toBe(0);
	});
});

describe("readBedrockCostLedger", () => {
	it("returns an empty ledger when the file is missing", async () => {
		await expect(readBedrockCostLedger()).resolves.toEqual({
			schemaVersion: 1,
			months: {},
		});
	});

	it("reads schema-v1 data and reprices historical totals from tokens", async () => {
		const filePath = path.join(tmpRoot, "schema-v1.json");
		fs.writeFileSync(
			filePath,
			JSON.stringify({
				schemaVersion: 1,
				months: {
					"2026-08": {
						models: {
							"bedrock-mantle/anthropic.claude-fable-5": {
								provider: "bedrock-mantle",
								model: "anthropic.claude-fable-5",
								inputTokens: 0,
								outputTokens: 0,
								cacheReadTokens: 0,
								cacheWriteTokens: 1_000_000,
								costTotal: 999,
								requestCount: 2,
								unpricedRequestCount: 0,
							},
						},
					},
				},
			}),
			"utf-8",
		);

		const ledger = await readBedrockCostLedger({ filePath });
		expect(ledger.months["2026-08"]?.models[
			"bedrock-mantle/anthropic.claude-fable-5"
		]?.costTotal).toBe(999);
		expect(summarizeMonth(ledger, "2026-08").costTotal).toBeCloseTo(22);
	});

	it("throws an explicit error for malformed JSON", async () => {
		const filePath = path.join(tmpRoot, "bad.json");
		fs.writeFileSync(filePath, "not json", "utf-8");
		await expect(readBedrockCostLedger({ filePath })).rejects.toThrow(
			/Malformed Bedrock cost ledger JSON/,
		);
	});

	it("throws an explicit error for the wrong shape", async () => {
		const filePath = path.join(tmpRoot, "wrong-shape.json");
		fs.writeFileSync(
			filePath,
			JSON.stringify({ schemaVersion: 1, months: { "2026-01": [] } }),
			"utf-8",
		);
		await expect(readBedrockCostLedger({ filePath })).rejects.toThrow(
			/Invalid Bedrock cost ledger/,
		);
	});
});

describe("recordBedrockUsage", () => {
	it("aggregates per provider and model", async () => {
		const filePath = path.join(tmpRoot, "isolated", "bedrock-costs.json");
		await recordBedrockUsage(
			{
				provider: "amazon-bedrock",
				model: "us.anthropic.claude-fable-5",
				usage: {
					input: 100,
					output: 25,
					cacheRead: 10,
					cacheWrite: 5,
					cost: { total: 0.0123 },
				},
				date: new Date(2026, 0, 5),
			},
			{ filePath },
		);
		await recordBedrockUsage(
			{
				provider: "amazon-bedrock",
				model: "us.anthropic.claude-fable-5",
				usage: { input: 7, output: 3, cost: { total: 0.004 } },
				date: new Date(2026, 0, 20),
			},
			{ filePath },
		);
		await recordBedrockUsage(
			{
				provider: "amazon-bedrock",
				model: "anthropic.claude-fable-5",
				usage: { input: 50, output: 10, cost: { total: 0.02 } },
				date: new Date(2026, 0, 20),
			},
			{ filePath },
		);

		const ledger = await readBedrockCostLedger({ filePath });
		const summary = summarizeMonth(ledger, "2026-01");
		expect(summary).toMatchObject({
			month: "2026-01",
			inputTokens: 157,
			outputTokens: 38,
			cacheReadTokens: 10,
			cacheWriteTokens: 5,
			requestCount: 3,
			unpricedRequestCount: 0,
		});
		expect(summary.costTotal).toBeCloseTo(0.003838);
		expect(summary.models).toHaveLength(2);
		expect(summary.models[0]).toMatchObject({
			provider: "amazon-bedrock",
			model: "anthropic.claude-fable-5",
			inputTokens: 50,
			outputTokens: 10,
			requestCount: 1,
		});
		expect(summary.models[0]?.costTotal).toBeCloseTo(0.001);
		expect(summary.models[1]).toMatchObject({
			provider: "amazon-bedrock",
			model: "us.anthropic.claude-fable-5",
			inputTokens: 107,
			outputTokens: 28,
			cacheReadTokens: 10,
			cacheWriteTokens: 5,
			requestCount: 2,
		});
		expect(summary.models[1]?.costTotal).toBeCloseTo(0.002838);
	});

	it("serializes concurrent updates without losing usage", async () => {
		const filePath = path.join(tmpRoot, "concurrent.json");
		const date = new Date(2026, 0, 20);
		await Promise.all(
			Array.from({ length: 20 }, () =>
				recordBedrockUsage(
					{
						provider: "bedrock-mantle",
						model: "anthropic.claude-fable-5-1",
						usage: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 },
						date,
					},
					{ filePath },
				),
			),
		);

		const summary = await getCurrentBedrockMonthSummary({ filePath }, date);
		expect(summary).toMatchObject({
			inputTokens: 20,
			outputTokens: 40,
			cacheReadTokens: 60,
			cacheWriteTokens: 80,
			requestCount: 20,
		});
	});

	it("counts unpriced requests without inventing cost", async () => {
		const filePath = path.join(tmpRoot, "unpriced.json");
		await recordBedrockUsage(
			{
				model: "anthropic.claude-1",
				usage: { input: 100, output: 25 },
				date: new Date(2026, 3, 1),
			},
			{ filePath },
		);
		await recordBedrockUsage(
			{
				model: "anthropic.claude-1",
				usage: { input: 50, output: 5, cost: { total: -1 } },
				date: new Date(2026, 3, 2),
			},
			{ filePath },
		);

		const summary = summarizeMonth(
			await readBedrockCostLedger({ filePath }),
			"2026-04",
		);
		expect(summary.costTotal).toBe(0);
		expect(summary.requestCount).toBe(2);
		expect(summary.unpricedRequestCount).toBe(2);
	});

	it("keeps temp storage isolated from the real home directory", async () => {
		await recordBedrockUsage({
			model: "anthropic.claude-1",
			usage: { input: 1, output: 1, cost: { total: 0.001 } },
		});
		const expectedPath = path.join(tmpOperatorDir, "bedrock-costs.json");
		expect(fs.existsSync(expectedPath)).toBe(true);
		expect(expectedPath.startsWith(tmpRoot)).toBe(true);
	});
});

describe("getCurrentBedrockMonthSummary", () => {
	it("reads the latest persisted month summary", async () => {
		const filePath = path.join(tmpRoot, "current-summary.json");
		const date = new Date(2026, 5, 15);
		expect(
			(await getCurrentBedrockMonthSummary({ filePath }, date)).requestCount,
		).toBe(0);

		await recordBedrockUsage(
			{
				model: "anthropic.claude-1",
				usage: { input: 10, output: 5, cost: { total: 0.01 } },
				date,
			},
			{ filePath },
		);

		expect(
			(await getCurrentBedrockMonthSummary({ filePath }, date)).requestCount,
		).toBe(1);
	});

	it("summarizes the selected month from isolated storage", async () => {
		const filePath = path.join(tmpRoot, "month-summary.json");
		await recordBedrockUsage(
			{
				model: "anthropic.claude-1",
				usage: { input: 10, output: 5, cost: { total: 0.01 } },
				date: new Date(2026, 5, 1),
			},
			{ filePath },
		);
		const summary = await getCurrentBedrockMonthSummary(
			{ filePath },
			new Date(2026, 5, 15),
		);
		expect(summary.month).toBe("2026-06");
		expect(summary.requestCount).toBe(1);
	});
});

describe("formatting helpers", () => {
	it("formats money and token counts", () => {
		expect(formatMoney(1.23456)).toBe("$1.2346");
		expect(formatMoney(undefined as unknown as number)).toBe("$0.0000");
		expect(formatTokenCount(1234567)).toBe("1,234,567");
	});
});
