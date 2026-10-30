import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readGoalBedrockUsage, observeGoalCodexUsage, readGoalUsage, type GoalUsageAttribution } from "../lib/goal/usage.ts";
import { fetchCodexUsage } from "../lib/codex-usage.ts";
vi.mock("../lib/codex-usage.ts", () => ({ fetchCodexUsage: vi.fn() }));

const dirs: string[] = [], now = Date.parse("2026-09-13T12:00:00Z");
const attribution: GoalUsageAttribution = { runId: "run-1", launchedAt: now, sessions: [{ session: "root.jsonl", from: now }, { session: "child.jsonl", from: now + 10 }], complete: true };
function row(id: string, session = "root.jsonl", timestamp = now, total = 1) {
	return { id, session, timestamp: new Date(timestamp).toISOString(), provider: "amazon-bedrock", model: "unknown", usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 }, pricing: { status: "estimated", total } };
}
async function ledger(rows: unknown[]) {
	const dir = await mkdtemp(join(tmpdir(), "goal-usage-")); dirs.push(dir);
	const file = join(dir, "ledger.jsonl"); await writeFile(file, rows.map(value => JSON.stringify(value)).join("\n") + "\n"); return file;
}
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); vi.clearAllMocks(); });
describe("goal usage", () => {
	it("includes exact enrolled root and descendants only from launch/enrollment", async () => {
		const file = await ledger([row("old", "root.jsonl", now - 1), row("root"), row("before-enroll", "child.jsonl", now + 9), row("child", "child.jsonl", now + 10, 2), row("unrelated", "other.jsonl", now + 10, 999), row("inherited-tree", "ancestor.jsonl", now + 10, 999), row("future", "root.jsonl", now + 100)]);
		expect(await readGoalBedrockUsage(attribution, file, now + 20)).toMatchObject({ status: "available", usd: 3, responses: 2 });
	});
	it("uses enrollment end exclusively and excludes later work in reused sessions", async () => {
		const file = await ledger([row("root"), row("later", "root.jsonl", now + 20)]);
		expect(await readGoalBedrockUsage({ ...attribution, sessions: [{ session: "root.jsonl", from: now, until: now + 20 }] }, file, now + 30)).toMatchObject({ status: "available", usd: 1 });
	});
	it("reads older observations beyond a 1 MiB tail and deduplicates IDs", async () => {
		const first = row("first");
		const file = await ledger([first, { ...row("unrelated", "other.jsonl"), padding: "x".repeat(1_100_000) }, first, row("last", "child.jsonl", now + 10)]);
		expect(await readGoalBedrockUsage(attribution, file, now + 20)).toMatchObject({ status: "available", usd: 2, responses: 2 });
		await writeFile(file, [first, { ...first, pricing: { status: "estimated", total: 2 } }].map(row => JSON.stringify(row)).join("\n"));
		expect(await readGoalBedrockUsage(attribution, file, now + 20)).toMatchObject({ status: "unavailable" });
	});
	it("does not call a missing, malformed, unpriced, or failed-accounting ledger zero", async () => {
		const file = await ledger([]);
		expect(await readGoalBedrockUsage(attribution, file, now)).toMatchObject({ status: "available", usd: 0, responses: 0 });
		for (const rows of [[{ ...row("a"), pricing: { status: "unpriced" } }], [{ ...row("a"), pricing: { status: "estimated", total: -1 } }], [{ ...row("a"), usage: {} }]]) {
			await writeFile(file, rows.map(row => JSON.stringify(row)).join("\n"));
			expect(await readGoalBedrockUsage(attribution, file, now)).toMatchObject({ status: "unavailable" });
		}
		await writeFile(file, "{truncated");
		expect(await readGoalBedrockUsage(attribution, file, now)).toMatchObject({ status: "unavailable" });
		expect(await readGoalBedrockUsage(attribution, file + "missing", now)).toMatchObject({ status: "unavailable" });
		expect(await readGoalBedrockUsage({ ...attribution, complete: false, incompleteReason: "append failed in child" }, file, now)).toMatchObject({ status: "unavailable", reason: "append failed in child" });
	});
	it("recovers missing prices using existing resolver, preserving recorded prices", async () => {
		const file = await ledger([{ ...row("unpriced"), model: "anthropic.claude-haiku-4-5", usage: { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 }, pricing: { status: "unpriced" } }, row("fixed", "root.jsonl", now, 100)]);
		const result = await readGoalBedrockUsage(attribution, file, now);
		expect(result.status).toBe("available"); if (result.status === "available") expect(result.usd).toBeGreaterThan(100);
	});
	it("selects the real weekly quota rather than five-hour usage, normalizes reset time", () => {
		const result = observeGoalCodexUsage({ rate_limit: { primary_window: { used_percent: 99, limit_window_seconds: 18000 }, secondary_window: { used_percent: 6, limit_window_seconds: 604800, reset_at: (now + 604800_000) / 1000 } } }, now);
		expect(result).toMatchObject({ status: "available", usedPercent: 6, resetAt: now + 604800_000 });
		expect(observeGoalCodexUsage({ rate_limit: { secondary_window: { used_percent: 0, limit_window_seconds: 604800, reset_after_seconds: 10 } } }, now)).toMatchObject({ status: "available", usedPercent: 0, resetAt: now + 10_000 });
		for (const window of [{}, { used_percent: 6 }, { used_percent: -1, reset_after_seconds: 10 }, { used_percent: 101, reset_after_seconds: 10 }, { used_percent: 6, reset_at: now / 1000 }])
			expect(observeGoalCodexUsage({ rate_limit: { secondary_window: { limit_window_seconds: 604800, ...window } } }, now).status).toBe("unavailable");
	});
	it("uses existing registry quota fetch and reports failure as unavailable", async () => {
		const registry = { getProviderAuth: vi.fn() }, signal = new AbortController().signal;
		vi.mocked(fetchCodexUsage).mockResolvedValue({ rate_limit: { secondary_window: { used_percent: 6, limit_window_seconds: 604800, reset_after_seconds: 100 } } });
		expect((await readGoalUsage({ modelRegistry: registry, signal })).codex.status).toBe("available");
		expect(fetchCodexUsage).toHaveBeenCalledWith(registry, signal);
		vi.mocked(fetchCodexUsage).mockRejectedValue(new Error("secret auth response"));
		const result = await readGoalUsage({ modelRegistry: registry, signal });
		expect(result.codex.status).toBe("unavailable"); expect(JSON.stringify(result)).not.toContain("secret auth");
		const controller = new AbortController(); controller.abort();
		await expect(readGoalUsage({ modelRegistry: registry, signal: controller.signal })).rejects.toThrow();
	});
});
