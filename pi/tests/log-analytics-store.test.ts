import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { withAnalyticsSession } from "../lib/log-analytics/store.ts";

const roots: string[] = [];
async function fixture(lines: string[]): Promise<string> {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-direct-analytics-"));
	roots.push(root);
	await fs.mkdir(path.join(root, "sessions"), { recursive: true });
	await fs.writeFile(path.join(root, "sessions", "fixture.jsonl"), `${lines.join("\n")}\n`);
	return root;
}
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });

describe("invocation-local analytics session", () => {
	it("queries complete records with SQL predicates and stable coordinates", async () => {
		const root = await fixture([
			JSON.stringify({ id: "first", timestamp: "2026-08-01T00:00:00Z", message: "needle" }),
			"not json",
			JSON.stringify({ id: "second", timestamp: "2026-08-02T00:00:00Z", message: "other" }),
		]);
		await withAnalyticsSession({ root, sources: ["session_entries"] }, async (session) => {
			const result = await session.query({ sql: "SELECT _source_file, _record_key, _timestamp, record FROM session_entries WHERE _timestamp >= $date AND json_extract_string(record, '$.message') = $message ORDER BY _timestamp", parameters: { date: "2026-01-01", message: "needle" } });
			expect(result.rows).toHaveLength(1);
			expect(result.rows[0]).toMatchObject({ _record_key: "first", _timestamp: "2026-08-01T00:00:00Z" });
			expect(JSON.parse(String(result.rows[0]?.record))).toMatchObject({ id: "first", message: "needle" });
			expect(String(result.rows[0]?._source_file)).toContain("fixture.jsonl");
		});
	});

	it("enforces the cumulative encoded byte bound before accepting a row", async () => {
		const root = await fixture([
			JSON.stringify({ id: "one", value: "1234567890" }),
			JSON.stringify({ id: "two", value: "1234567890" }),
		]);
		await withAnalyticsSession({ root, sources: ["session_entries"] }, async (session) => {
			const result = await session.query({
				sql: "SELECT _record_key, record FROM session_entries ORDER BY _record_key",
				maxBytes: 100,
			});
			expect(result.rows).toHaveLength(1);
			expect(result.truncated).toBe(true);
			expect(Buffer.byteLength(JSON.stringify(result.rows), "utf8")).toBeLessThanOrEqual(100);
		});
	});

	it("keeps a record larger than one MiB and returns bounded incremental output", async () => {
		const root = await fixture(Array.from({ length: 50 }, (_, index) => JSON.stringify({ id: `row-${index}`, payload: "x".repeat(index === 0 ? 1_100_000 : 20) })));
		await withAnalyticsSession({ root, sources: ["session_entries"] }, async (session) => {
			const large = await session.query({ sql: "SELECT record FROM session_entries WHERE _record_key = 'row-0'", maxBytes: 2_000_000 });
			expect(JSON.stringify(large.rows[0]).length).toBeGreaterThan(1_000_000);
			const bounded = await session.query({ sql: "SELECT _record_key FROM session_entries ORDER BY _record_key", maxRows: 3 });
			expect(bounded.rows).toHaveLength(3);
			expect(bounded.truncated).toBe(true);
			const next = await session.query({ sql: "SELECT count(*) AS count FROM session_entries" });
			expect(next.rows[0]?.count).toBe("50");
		});
	});

	it("selects only explicitly supplied canonical files", async () => {
		const root = await fixture([JSON.stringify({ id: "selected" })]);
		const other = path.join(root, "sessions", "other.jsonl");
		await fs.writeFile(other, JSON.stringify({ id: "unselected" }) + "\n");
		await withAnalyticsSession({ root, sources: ["session_entries"], selectedFiles: { session_entries: [path.join(root, "sessions", "fixture.jsonl")] } }, async (session) => {
			expect((await session.query({ sql: "SELECT _record_key FROM session_entries ORDER BY _record_key" })).rows).toEqual([{ _record_key: "selected" }]);
		});
	});

	it("enforces DuckDB external-access isolation for arbitrary SQL", async () => {
		const root = await fixture([JSON.stringify({ id: "safe" })]);
		await withAnalyticsSession({ root, sources: ["session_entries"] }, async (session) => {
			for (const sql of [
				"ATTACH ':memory:' AS other",
				"COPY (SELECT 1) TO 'unsafe.csv'",
				"EXPORT DATABASE 'unsafe-export'",
				"SELECT * FROM read_csv('unsafe.csv')",
				"SELECT * FROM glob('*.jsonl')",
			])
				await expect(session.query({ sql })).rejects.toThrow();
		});
	});

	it("accepts CTE and JSON SQL and isolates simultaneous sessions", async () => {
		const rootA = await fixture([JSON.stringify({ id: "a", value: 1 })]);
		const rootB = await fixture([JSON.stringify({ id: "b", value: 2 })]);
		const [a, b] = await Promise.all(["a", "b"].map((id, index) => withAnalyticsSession({ root: index ? rootB : rootA, sources: ["session_entries"] }, async (session) => (await session.query({ sql: "WITH selected AS (SELECT record FROM session_entries) SELECT json_extract_string(record, '$.id') AS id FROM selected WHERE json_extract_string(record, '$.id') = $id", parameters: { id } })).rows)));
		expect(a).toEqual([{ id: "a" }]);
		expect(b).toEqual([{ id: "b" }]);
	});
});
