import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withAnalyticsSession } from "../lib/log-analytics/store.js";
import { analyticsFixture } from "./helpers/analytics-fixture.js";
let fixture: Awaited<ReturnType<typeof analyticsFixture>>;
beforeEach(async () => { fixture = await analyticsFixture(); });
afterEach(async () => { vi.unstubAllEnvs(); await fixture.dispose(); });

describe("read-only analytics boundary", () => {
	it("rejects multiple statements, mutations, external reads, ATTACH, COPY, LOAD and INSTALL", async () => {
		const sentinel = path.join(fixture.scratch, "secret.jsonl").replaceAll("\\", "/");
		const output = path.join(fixture.scratch, "output.txt").replaceAll("\\", "/");
		await fs.writeFile(sentinel, '{"secret":"sentinel"}\n');
		await withAnalyticsSession({ registry: fixture.registry, sources: ["session_entries"] }, async session => {
			for (const sql of [
				"SELECT 1; SELECT 2", "SELECT 1; SET enable_external_access=true", "CREATE TABLE bad(i INT)",
				"DELETE FROM _prepared_session_entries", "WITH x AS (SELECT 1) DELETE FROM _prepared_session_entries",
				"SET enable_external_access=true", `ATTACH '${output}' AS bad`, `COPY (SELECT 1) TO '${output}'`,
				"INSTALL httpfs", "LOAD httpfs", `SELECT * FROM read_json_objects('${sentinel}')`,
				`SELECT * FROM read_text('${sentinel}')`, `SELECT * FROM glob('${sentinel}')`,
				`EXPLAIN ANALYZE COPY (SELECT 1) TO '${output}'`,
			]) await expect(session.query({ sql }), sql).rejects.toThrow();
			expect((await session.query({ sql: "/* valid DuckDB SQL */ WITH x AS (SELECT $n::INTEGER AS n) SELECT * FROM x", parameters: { n: 7 } })).rows).toEqual([{ n: 7 }]);
		});
		await expect(fs.stat(output)).rejects.toThrow();
	});

	it("rejects unknown sources, unsupported pairs, unselected views, and invalid environment bounds", async () => {
		await expect(withAnalyticsSession({ registry: fixture.registry, sources: ["unknown" as never] }, async () => {})).rejects.toThrow("unknown analytics source");
		await expect(withAnalyticsSession({ registry: fixture.registry, profiles: ["legacy"], sources: ["bedrock_usage"] }, async () => {})).rejects.toThrow("unsupported");
		await expect(withAnalyticsSession({ registry: fixture.registry, sources: ["bedrock_usage"], sessionRefs: [{ profile: "default", sessionId: "one" }] }, async () => {})).rejects.toThrow("requires session_entries");
		await withAnalyticsSession({ registry: fixture.registry, sources: ["session_entries"] }, async session => {
			await expect(session.query({ sql: "SELECT * FROM bedrock_usage" })).rejects.toThrow();
		});
		vi.stubEnv("PI_ANALYTICS_MAX_INPUT_BYTES", "bad");
		await expect(withAnalyticsSession({ registry: fixture.registry, sources: ["session_entries"] }, async () => {})).rejects.toThrow("PI_ANALYTICS_MAX_INPUT_BYTES");
		vi.stubEnv("PI_ANALYTICS_LARGE_DISK_BUDGET_BYTES", "bad");
		await expect(withAnalyticsSession({ registry: fixture.registry, sources: ["session_entries"], execution: "large" }, async () => {})).rejects.toThrow("PI_ANALYTICS_LARGE_DISK_BUDGET_BYTES");
	});

	it("does not discover generic root JSONL or follow ledger link escapes", async () => {
		await fs.writeFile(path.join(fixture.registry.roots.default, "events.jsonl"), "sensitive root data");
		await withAnalyticsSession({ registry: fixture.registry, sources: ["session_entries", "bedrock_usage", "codex_cache_observations"] }, async session => {
			expect((await session.query({ sql: "SELECT count(*) n FROM session_entries" })).cost.filesScanned).toBe(0);
		});
		// Directory junctions work without Windows symlink privileges and exercise ledger containment.
		const external = path.join(fixture.scratch, "outside");
		await fs.mkdir(external);
		await fs.symlink(external, path.join(fixture.registry.roots.default, "bedrock-usage.jsonl"), process.platform === "win32" ? "junction" : "dir");
		await expect(withAnalyticsSession({ registry: fixture.registry, sources: ["bedrock_usage"] }, async () => {})).rejects.toThrow("escapes");
	});
});
