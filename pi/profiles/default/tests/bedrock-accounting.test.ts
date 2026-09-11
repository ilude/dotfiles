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
		expect(formatUsage(summary)).toBe("Bedrock local estimate:\n  CloudWatch baseline: $2.50 (4 invocation(s))\n  Total:  $2.50");
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
