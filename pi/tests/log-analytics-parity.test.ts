import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openAnalyticsStore, selectAnalytics } from "../lib/log-analytics/api.ts";
import { definitionFor } from "../lib/log-analytics/registry.ts";
import { resetLogAnalyticsStoreCacheForTests } from "../lib/log-analytics/store.ts";

const roots: string[] = [];
afterEach(async () => { await resetLogAnalyticsStoreCacheForTests(); for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });

describe("analytics reader parity boundary", () => {
	it("keeps structural event order and excludes arbitrary payload fields", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-analytics-parity-")); roots.push(root);
		const source = path.join(root, "metric_events.jsonl");
		await fs.writeFile(source, [
			JSON.stringify({ id: "b", event: "tool_result", ts: "2026-08-25T00:00:02Z", data: { message: "secret" } }),
			JSON.stringify({ id: "a", event: "tool_use", ts: "2026-08-25T00:00:01Z", data: { arguments: "secret" } }),
		].join("\n") + "\n");
		const store = await openAnalyticsStore(path.join(root, "analytics.duckdb"));
		const definition = definitionFor("metric_events", root)!;
		await store.refresh(definition, [source]);
		expect(await selectAnalytics(store, { source: "metric_events", columns: ["event_id", "event", "timestamp"], orderBy: [{ column: "timestamp" }] })).toEqual([
			{ event_id: "a", event: "tool_use", timestamp: "2026-08-25T00:00:01Z" },
			{ event_id: "b", event: "tool_result", timestamp: "2026-08-25T00:00:02Z" },
		]);
		await expect(selectAnalytics(store, { source: "metric_events", columns: ["data"] } as never)).rejects.toThrow("column");
		await store.close();
	});
});
