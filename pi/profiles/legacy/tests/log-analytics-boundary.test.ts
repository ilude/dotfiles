import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { withAnalyticsSession } from "../lib/log-analytics/store.ts";
import { registeredSources } from "../lib/log-analytics/registry.ts";

const roots: string[] = [];
async function rootWithMetrics(): Promise<string> {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-analytics-boundary-"));
	roots.push(root);
	await fs.mkdir(path.join(root, "logs"), { recursive: true });
	await fs.mkdir(path.join(root, "sessions"), { recursive: true });
	await fs.writeFile(path.join(root, "logs", "metrics.jsonl"), [
		JSON.stringify({ id: "orchestration", event: "orchestration_run", timestamp: "2026-08-01" }),
		JSON.stringify({ id: "terminal", event: "background_terminal_started", timestamp: "2026-08-02" }),
		JSON.stringify({ id: "ordinary", event: "tool_use", timestamp: "2026-08-03" }),
	].join("\n") + "\n");
	await fs.writeFile(path.join(root, "sessions", "one.jsonl"), JSON.stringify({ id: "session-1", event: "message" }) + "\n");
	return root;
}
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });

describe("analytics source boundary", () => {
	it("creates every registered view, filters shared event files, and leaves no database", async () => {
		const root = await rootWithMetrics();
		await withAnalyticsSession({ root, sources: registeredSources.map((source) => source.name) }, async (session) => {
			const names = registeredSources.map((source) => `'${source.name}'`).join(", ");
			const views = await session.query({ sql: `SELECT table_name FROM information_schema.views WHERE table_schema = 'main' AND table_name IN (${names}) ORDER BY table_name` });
			expect(views.rows.map((row) => row.table_name)).toEqual(registeredSources.map((source) => source.name).sort());
			expect((await session.query({ sql: "SELECT _record_key FROM orchestration_events" })).rows).toEqual([{ _record_key: "orchestration" }]);
			expect((await session.query({ sql: "SELECT _record_key FROM background_terminal_events" })).rows).toEqual([{ _record_key: "terminal" }]);
			expect((await session.query({ sql: "SELECT _record_key FROM metric_events ORDER BY _record_key" })).rows).toEqual([{ _record_key: "orchestration" }, { _record_key: "ordinary" }, { _record_key: "terminal" }]);
		});
		expect(await fs.readdir(root)).not.toContain("analytics");
		expect(await fs.readdir(root)).not.toContain("log-analytics.duckdb");
	});

	it("cancels a query without affecting a later query in the same session", async () => {
		const root = await rootWithMetrics();
		const controller = new AbortController();
		await withAnalyticsSession({ root, sources: ["session_entries"], signal: controller.signal }, async (session) => {
			controller.abort();
			await expect(session.query({ sql: "SELECT * FROM session_entries" })).rejects.toThrow("cancelled");
		});
	});
});
