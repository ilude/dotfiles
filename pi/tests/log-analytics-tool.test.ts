import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	aggregateAnalytics,
	analyticsCatalog,
	AnalyticsBoundaryError,
	openAnalyticsStore,
	selectAnalytics,
} from "../lib/log-analytics/api.ts";
import { resetLogAnalyticsStoreCacheForTests } from "../lib/log-analytics/store.ts";

const roots: string[] = [];
afterEach(async () => { await resetLogAnalyticsStoreCacheForTests(); for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });

async function fixture(): Promise<{ root: string; store: Awaited<ReturnType<typeof openAnalyticsStore>> }> {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-analytics-api-")); roots.push(root);
	await fs.writeFile(path.join(root, "metric_events.jsonl"), [
		JSON.stringify({ id: "one", event: "tool_use", model: "m", inputTokens: 2 }),
		JSON.stringify({ id: "two", event: "tool_use", model: "m", inputTokens: 3 }),
	].join("\n") + "\n");
	const store = await openAnalyticsStore(path.join(root, "analytics.duckdb"));
	const { definitionFor } = await import("../lib/log-analytics/registry.ts");
	const definition = definitionFor("metric_events", root)!;
	await store.refresh(definition, [path.join(root, "metric_events.jsonl")]);
	return { root, store };
}

describe("bounded analytics API", () => {
	it("exposes catalog IDs and typed select/aggregate only", async () => {
		const { store } = await fixture();
		expect(analyticsCatalog().some((item) => item.source === "metric_events")).toBe(true);
		expect(await selectAnalytics(store, { source: "metric_events", columns: ["event_id", "model"], orderBy: [{ column: "event_id" }] })).toEqual([
			{ event_id: "one", model: "m" }, { event_id: "two", model: "m" },
		]);
		expect(await aggregateAnalytics(store, { source: "metric_events", groupBy: ["model"], measures: [{ kind: "count" }, { kind: "sum", column: "input_tokens", as: "tokens" }] })).toEqual([{ model: "m", count: 2n, tokens: 5n }]);
		await expect(selectAnalytics(store, { source: "metric_events", columns: ["data"] } as never)).rejects.toBeInstanceOf(AnalyticsBoundaryError);
		await store.close();
	});

	it("rejects excess output and cancellation", async () => {
		const { store } = await fixture();
		await expect(selectAnalytics(store, { source: "metric_events", columns: ["event_id"], limit: 2 }, { maxRows: 1 })).rejects.toMatchObject({ code: "budget_exceeded" });
		await expect(selectAnalytics(store, { source: "metric_events", columns: ["event_id"] }, { signal: AbortSignal.abort() })).rejects.toMatchObject({ code: "cancelled" });
		await store.close();
	});
});
