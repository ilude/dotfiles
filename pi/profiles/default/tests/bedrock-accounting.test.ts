import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendRecord, formatStatus, formatUsage, makeRecord, readRecords, summarize, writeBaseline } from "../lib/bedrock/ledger.ts";
import { parseCaller, parseResults } from "../lib/bedrock/cloudwatch-snapshot.ts";
import { estimateUsage } from "../lib/bedrock/pricing.ts";

const dirs: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function temp() { const dir = mkdtempSync(join(tmpdir(), "bedrock-ledger-")); dirs.push(dir); vi.stubEnv("PI_CODING_AGENT_DIR", dir); return dir; }

describe("Bedrock accounting", () => {
	it("prices only exact target catalog entries", () => {
		expect(estimateUsage("openai.gpt-5.6-luna", { input: 1_000_000 }).total).toBeCloseTo(0.22);
		expect(estimateUsage("unknown", { input: 10 }).status).toBe("unpriced");
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
		const baseline = parseResults(JSON.stringify({ status: "Complete", results: row }), principal, capturedAt.toISOString()).baseline!; await writeBaseline(baseline);
		const summary = await summarize(baseline.month); expect(summary.baseline).toBe(2.5); expect(summary.records.map(record => record.id)).toEqual([after.id]);
		expect(formatUsage(summary)).toBe("Bedrock local estimate:\n  CloudWatch baseline: $2.50 (4 invocation(s))\n  Total:  $2.50");
	});
});
