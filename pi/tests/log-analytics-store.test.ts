import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setStagingObserver, withAnalyticsSession } from "../lib/log-analytics/store.ts";

const roots: string[] = [];
async function fixture(lines: string[]): Promise<string> {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-direct-analytics-"));
	roots.push(root);
	await fs.mkdir(path.join(root, "sessions"), { recursive: true });
	await fs.writeFile(path.join(root, "sessions", "fixture.jsonl"), `${lines.join("\n")}\n`);
	return root;
}
afterEach(async () => {
	setStagingObserver(undefined);
	vi.restoreAllMocks();
	for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

function parseDuckDBBytes(value: string): number {
	const match = /^(\d+(?:\.\d+)?)\s+(KiB|MiB|GiB)$/.exec(value);
	if (!match) throw new Error(`unexpected DuckDB byte setting: ${value}`);
	return Number(match[1]) * 1024 ** ({ KiB: 1, MiB: 2, GiB: 3 }[match[2]!]!);
}

const longQuery = "SELECT count(*) FROM range(100000000) a CROSS JOIN range(1000) b";

describe("duckdb contracts", () => {
	it("applies configured thread and memory limits", async () => {
		const instance = await DuckDBInstance.create(":memory:", { threads: "2", memory_limit: "1GB" });
		const connection = await instance.connect();
		try {
			const result = await connection.runAndReadAll("SELECT current_setting('threads') AS threads, current_setting('memory_limit') AS memory_limit");
			const [settings] = result.getRowObjectsJson() as Array<{ threads: string; memory_limit: string }>;
			expect(Number(settings?.threads)).toBe(2);
			expect(parseDuckDBBytes(settings!.memory_limit)).toBeCloseTo(1_000_000_000, -6);
		} finally {
			connection.closeSync();
			instance.closeSync();
		}
	});

});

describe("invocation-local analytics session", () => {
	it("projects nested failed tool results without flattening message content", async () => {
		const root = await fixture([
			JSON.stringify({ type: "session", id: "session-1", timestamp: "2026-08-01T00:00:00Z" }),
			JSON.stringify({ id: "assistant-1", message: { role: "assistant", content: [
				{ type: "toolCall", id: "call-1", name: "edit", arguments: {} },
				{ type: "toolCall", id: "call-2", name: "edit", arguments: {} },
			], timestamp: "2026-08-01T00:00:01Z" } }),
			JSON.stringify({ id: "result-1", message: { role: "toolResult", toolCallId: "call-1", toolName: "edit", isError: false, timestamp: "2026-08-01T00:00:02Z", content: [{ type: "text", text: "ok" }] } }),
			JSON.stringify({ id: "result-2", message: { role: "toolResult", toolCallId: "call-2", toolName: "edit", isError: true, timestamp: "2026-08-01T00:00:03Z", content: [{ type: "text", text: "failed" }] } }),
		]);
		await withAnalyticsSession({ root, sources: ["session_entries"] }, async (session) => {
			const result = await session.query({ sql: "SELECT _timestamp, message_role, tool_name, tool_call_id, is_error FROM session_entries WHERE message_role = 'toolResult' ORDER BY tool_call_id" });
			expect(result.rows).toEqual([
				{ _timestamp: "2026-08-01T00:00:02Z", message_role: "toolResult", tool_name: "edit", tool_call_id: "call-1", is_error: false },
				{ _timestamp: "2026-08-01T00:00:03Z", message_role: "toolResult", tool_name: "edit", tool_call_id: "call-2", is_error: true },
			]);
			const aggregate = await session.query({ sql: "SELECT count(*) AS rows, count(tool_name) AS tool_names, sum(CASE WHEN is_error THEN 1 ELSE 0 END) AS errors FROM session_entries WHERE message_role = 'toolResult'" });
			expect(aggregate.rows).toEqual([{ rows: "2", tool_names: "2", errors: "1" }]);
		});
	});

	it("keeps nested successful results and flat source fields compatible", async () => {
		const root = await fixture([
			JSON.stringify({ id: "nested-success", message: { role: "toolResult", toolName: "edit", toolCallId: "call-1", isError: false, timestamp: "2026-08-02T00:00:00Z" } }),
			JSON.stringify({ id: "flat", timestamp: "2026-08-02T00:00:01Z", tool_name: "legacy", tool_call_id: "legacy-call" }),
		]);
		await withAnalyticsSession({ root, sources: ["session_entries"] }, async (session) => {
			const result = await session.query({ sql: "SELECT _record_key, _timestamp, message_role, tool_name, tool_call_id, is_error FROM session_entries ORDER BY _record_key" });
			expect(result.rows).toEqual([
				{ _record_key: "flat", _timestamp: "2026-08-02T00:00:01Z", message_role: null, tool_name: "legacy", tool_call_id: "legacy-call", is_error: null },
				{ _record_key: "nested-success", _timestamp: "2026-08-02T00:00:00Z", message_role: "toolResult", tool_name: "edit", tool_call_id: "call-1", is_error: false },
			]);
		});
	});

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

	it("rejects input over the byte bound before creating DuckDB", async () => {
		const root = await fixture([JSON.stringify({ id: "bounded" })]);
		const file = path.join(root, "sessions", "fixture.jsonl");
		const size = (await fs.stat(file)).size;
		const create = vi.spyOn(DuckDBInstance, "create");
		await expect(withAnalyticsSession({ root, sources: ["session_entries"], maxInputBytes: size - 1 }, async () => undefined))
			.rejects.toThrow(`analytics input ${size} bytes exceeds bound ${size - 1}`);
		expect(create).not.toHaveBeenCalled();
	});

	it.each([
		["timeoutMs", { timeoutMs: 0 }],
		["threads", { threads: 0 }],
		["memoryLimit", { memoryLimit: "" }],
		["maxInputBytes", { maxInputBytes: -1 }],
	] as const)("rejects an invalid %s option", async (_name, invalid) => {
		const root = await fixture([JSON.stringify({ id: "invalid" })]);
		await expect(withAnalyticsSession({ root, sources: ["session_entries"], ...invalid }, async () => undefined))
			.rejects.toThrow(/invalid analytics/);
	});

	it("interrupts a query at the session deadline and still cleans up the callback", async () => {
		const root = await fixture([JSON.stringify({ id: "deadline" })]);
		let callbackCleanedUp = false;
		await expect(withAnalyticsSession({ root, sources: ["session_entries"], timeoutMs: 200 }, async (session) => {
			try {
				await session.query({ sql: longQuery });
			} finally {
				callbackCleanedUp = true;
			}
		})).rejects.toThrow("analytics session exceeded 200 ms");
		expect(callbackCleanedUp).toBe(true);
	});

	it("stages concurrent sessions strictly one at a time", async () => {
		const rootA = await fixture([JSON.stringify({ id: "a" })]);
		const rootB = await fixture([JSON.stringify({ id: "b" })]);
		const events: string[] = [];
		let enterFirst!: () => void;
		const firstEntered = new Promise<void>((resolve) => { enterFirst = resolve; });
		let releaseFirst!: () => void;
		const holdFirst = new Promise<void>((resolve) => { releaseFirst = resolve; });
		setStagingObserver(async ({ root }) => {
			events.push(`start:${root}`);
			if (root === rootA) {
				enterFirst();
				await holdFirst;
			}
			events.push(`end:${root}`);
		});
		const first = withAnalyticsSession({ root: rootA, sources: ["session_entries"] }, async () => undefined);
		await firstEntered;
		const second = withAnalyticsSession({ root: rootB, sources: ["session_entries"] }, async () => undefined);
		expect(events).toEqual([`start:${rootA}`]);
		releaseFirst();
		await Promise.all([first, second]);
		expect(events).toEqual([`start:${rootA}`, `end:${rootA}`, `start:${rootB}`, `end:${rootB}`]);
	});

	it("releases the staging lock when the first session fails", async () => {
		const rootA = await fixture([JSON.stringify({ id: "a" })]);
		const rootB = await fixture([JSON.stringify({ id: "b" })]);
		const staged: string[] = [];
		setStagingObserver(({ root }) => {
			staged.push(root);
			if (root === rootA) throw new Error("first staging failed");
		});
		const first = withAnalyticsSession({ root: rootA, sources: ["session_entries"] }, async () => undefined);
		const second = withAnalyticsSession({ root: rootB, sources: ["session_entries"] }, async () => undefined);
		await expect(first).rejects.toThrow("first staging failed");
		await expect(second).resolves.toBeUndefined();
		expect(staged).toHaveLength(2);
		expect(staged).toEqual(expect.arrayContaining([rootA, rootB]));
	});

	it("reports the staged file count, bytes, and phase timings", async () => {
		const root = await fixture([JSON.stringify({ id: "cost" })]);
		const size = (await fs.stat(path.join(root, "sessions", "fixture.jsonl"))).size;
		await withAnalyticsSession({ root, sources: ["session_entries"] }, async (session) => {
			const result = await session.query({ sql: "SELECT _record_key FROM session_entries" });
			expect(result.cost).toMatchObject({ filesScanned: 1, bytesScanned: size });
			expect(result.cost.stagingMs).toBeGreaterThanOrEqual(0);
			expect(result.cost.queryMs).toBeGreaterThanOrEqual(0);
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
