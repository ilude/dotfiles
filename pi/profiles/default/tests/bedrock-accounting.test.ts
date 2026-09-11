import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendRecord, createBaseline, formatStatus, formatUsage, makeRecord, readBaseline, readRecords, summarize } from "../lib/bedrock/ledger.ts";
import { parseCaller, parseResults } from "../lib/bedrock/cloudwatch-snapshot.ts";
import { estimateUsage } from "../lib/bedrock/pricing.ts";

const dirs: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function temp() { const dir = mkdtempSync(join(tmpdir(), "bedrock-ledger-")); dirs.push(dir); vi.stubEnv("PI_CODING_AGENT_DIR", dir); return dir; }

describe("Bedrock accounting", () => {
	it("keeps unknown targets unpriced", () => {
		expect(estimateUsage("openai.gpt-5.6-luna", { input: 1_000_000 }).total).toBeCloseTo(0.22);
		expect(estimateUsage("unknown", { input: 10 }).status).toBe("unpriced");
	});
	it.each([
		["anthropic.claude-opus-5", "global.anthropic.claude-opus-5", [5, 25, 0.5, 6.25]],
		["anthropic.claude-haiku-4-5", "global.anthropic.claude-haiku-4-5-20251001-v1:0", [1, 5, 0.1, 1.25]],
		["eu.anthropic.claude-opus-5", "eu.anthropic.claude-opus-5", [5.5, 27.5, 0.55, 6.875]],
	] as const)("prices %s using its explicit catalog target", (target, catalogTarget, rates) => {
		const price = estimateUsage(target, { input: 1_000_000, output: 1_000_000, cacheRead: 1_000_000, cacheWrite: 1_000_000 });
		expect(price.status).toBe("estimated");
		expect(price.catalogTarget).toBe(catalogTarget);
		expect(price.components).toEqual({ input: rates[0], output: rates[1], cacheRead: rates[2], cacheWrite: rates[3] });
		expect(price.total).toBeCloseTo(rates.reduce((sum, rate) => sum + rate, 0));
	});
	it("does not infer unknown releases, regional aliases, or missing targets", () => {
		for (const target of ["anthropic.claude-opus-99", "eu.anthropic.claude-haiku-4-5", undefined]) {
			expect(estimateUsage(target, { input: 100 }).status).toBe("unpriced");
		}
	});
	it("recovers old unpriced observations without altering the ledger or existing estimates", async () => {
		const dir = temp();
		const input = { timestamp: Date.parse("2026-09-11T12:00:00Z"), provider: "bedrock-mantle", model: "anthropic.claude-opus-5", usage: { input: 1_000_000 } };
		const oldPricing = { status: "unpriced", basis: "old-catalog", reason: "no exact catalog price" } as const;
		const recovered = { ...makeRecord({ ...input, target: input.model, session: "recovered" }), pricing: oldPricing };
		const missingTarget = { ...makeRecord({ ...input, session: "missing-target" }), pricing: oldPricing };
		const unknown = { ...makeRecord({ ...input, target: "unknown", session: "unknown" }), pricing: oldPricing };
		const preserved = makeRecord({ ...input, target: input.model, session: "preserved" });
		preserved.pricing = { status: "estimated", basis: "recorded-price", total: 7 };
		for (const record of [recovered, missingTarget, unknown, preserved]) await appendRecord(record);
		const file = join(dir, "bedrock-usage.jsonl"); const original = readFileSync(file, "utf8");
		const summary = await summarize(recovered.month);
		expect(summary.cost).toBe(12);
		expect(summary.unpriced).toBe(2);
		expect(summary.records.find(record => record.id === recovered.id)?.pricing.catalogTarget).toBe("global.anthropic.claude-opus-5");
		expect(summary.records.find(record => record.id === preserved.id)?.pricing).toEqual(preserved.pricing);
		expect(await summarize(recovered.month)).toEqual(summary);
		expect(readFileSync(file, "utf8")).toBe(original);
		expect((await readRecords())[0].pricing).toEqual(oldPricing);
	});
	it("deduplicates records and preserves observation-time estimates", async () => {
		temp(); const record = makeRecord({ timestamp: 1000, session: "s", provider: "amazon-bedrock", model: "openai.gpt-5.6-luna", usage: { input: 100 } });
		expect(await appendRecord(record)).toBe(true); expect(await appendRecord(record)).toBe(false);
		expect(await readRecords()).toEqual([record]); expect((await summarize(record.month)).cost).toBe(record.pricing.total);
	});
	it("serializes concurrent writers, skips malformed lines, and labels baseline/unpriced coverage", async () => {
		const dir = temp(); const now = Date.now(); const records = [1, 2, 3].map(offset => makeRecord({ timestamp: now + offset, session: `s${offset}`, provider: "bedrock-mantle", model: "logical", target: "unknown", usage: { output: 2 } }));
		await Promise.all(records.map(record => appendRecord(record)));
		writeFileSync(join(dir, "operator-footer-usage.json"), JSON.stringify({ [records[0].month]: 1.25 }));
		const summary = await summarize(records[0].month); expect(summary.records).toHaveLength(3); expect(summary.unpriced).toBe(3); expect(summary.baseline).toBe(1.25); expect(formatStatus(summary)).toContain("unpriced");
	});
	it("uses a matching personal CloudWatch snapshot and counts only later local records", async () => {
		temp(); const capturedAt = new Date(); const before = makeRecord({ timestamp: capturedAt.getTime() - 1, provider: "amazon-bedrock", model: "openai.gpt-5.6-luna", usage: { input: 100 } }); const after = makeRecord({ timestamp: capturedAt.getTime() + 1, provider: "amazon-bedrock", model: "openai.gpt-5.6-luna", usage: { input: 200 } }); await appendRecord(before); await appendRecord(after);
		const principal = parseCaller(JSON.stringify({ Arn: "arn:aws:iam::058264305403:user/mike.glenn" }));
		const row = [[{ field: "userArn", value: principal }, { field: "estimatedCost", value: "2.50" }, { field: "invocations", value: "4" }]];
		const baseline = parseResults(JSON.stringify({ status: "Complete", results: row }), principal, capturedAt.toISOString()).baseline!; expect(await createBaseline(baseline)).toBe(true);
		const summary = await summarize(baseline.month); expect(summary.baseline).toBe(2.5); expect(summary.records.map(record => record.id)).toEqual([after.id]);
		expect(formatUsage(summary)).toBe("Bedrock:     $2.50\n  baseline:  $2.50\n  Cache-read: 0.0%");
	});
	it("shows a weighted local cache-read rate without raw cache counts", () => {
		const records = [
			makeRecord({ provider: "amazon-bedrock", model: "anthropic.claude-opus-5", usage: { input: 100, output: 1000, cacheRead: 800, cacheWrite: 100 } }),
			makeRecord({ provider: "amazon-bedrock", model: "anthropic.claude-haiku-4-5", usage: { input: 1000, output: 1000 } }),
		];
		const report = formatUsage({ month: records[0].month, records, cost: 1, baseline: 0, unpriced: 0 });
		expect(report).toMatch(/^Bedrock: +\$1\.00\n/);
		expect(report.endsWith("  Cache-read: 40.0%")).toBe(true);
		expect(report).not.toContain("Total:");
		expect(report).toContain("Tokens:  100 in, 1.0K out");
		expect(report).not.toContain("cache read");
		expect(report).not.toContain("cache write");
		expect(formatUsage({ month: records[0].month, records: [], cost: 0, baseline: 1, unpriced: 0 })).toContain("Cache-read: unavailable");
	});
	it("aligns model names, costs, and token columns across different widths", () => {
		const records = [
			makeRecord({ provider: "amazon-bedrock", model: "opus-5", usage: { input: 8, output: 4500 } }),
			makeRecord({ provider: "amazon-bedrock", model: "fable-5-1", usage: { input: 14, output: 10200 } }),
		];
		records[0].pricing = { status: "estimated", basis: "test", total: 0.17 };
		records[1].pricing = { status: "estimated", basis: "test", total: 12.67 };
		const report = formatUsage({ month: records[0].month, records, cost: 12.84, baseline: 0, unpriced: 0 });
		const decimalColumns = report.split("\n").map(line => line.indexOf(".")).filter(column => column >= 0);
		expect(new Set(decimalColumns).size).toBe(1);
		expect(report.split("\n").slice(1, 3)).toEqual([
			"  opus-5:     $0.17 Tokens:  8 in,  4.5K out",
			"  fable-5-1: $12.67 Tokens: 14 in, 10.2K out",
		]);
	});
	it("publishes exactly one competing baseline and never alters existing state", async () => {
		const dir = temp(); const file = join(dir, "baseline.json");
		const first = { schemaVersion: 1, month: "2026-09", principal: "first", amount: 1, invocations: 1, capturedAt: "2026-09-01T00:00:00.000Z", source: "cloudwatch-bedrock-invocation-logs" } as const;
		const second = { ...first, month: "2026-10", principal: "second", amount: 2 };
		const results = await Promise.all([createBaseline(first, file), createBaseline(second, file)]);
		expect(results.sort()).toEqual([false, true]);
		const published = readFileSync(file, "utf8"); expect([first.principal, second.principal]).toContain((await readBaseline(file))?.principal);
		expect(await createBaseline(first, file)).toBe(false); expect(readFileSync(file, "utf8")).toBe(published);
		writeFileSync(file, "malformed"); expect(await createBaseline(second, file)).toBe(false); expect(readFileSync(file, "utf8")).toBe("malformed");
		expect(readdirSync(dir).filter(name => name.endsWith(".tmp"))).toEqual([]);
	});
	it("validates before publication without leaving blocking state", async () => {
		const dir = temp(); const file = join(dir, "baseline.json");
		await expect(createBaseline({ schemaVersion: 1 } as any, file)).rejects.toThrow("Invalid Bedrock cost baseline");
		expect(readdirSync(dir)).toEqual([]);
	});
});
