import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import logAnalyticsTool from "../extensions/log-analytics-tool.ts";
import { analyticsCatalog } from "../lib/log-analytics/api.ts";
import { registeredSources } from "../lib/log-analytics/registry.ts";

describe("log_analytics tool", () => {
	it("registers catalog and direct query operations", () => {
		let registered: any;
		logAnalyticsTool({ registerTool: (tool: unknown) => { registered = tool; } } as never);
		expect(registered.name).toBe("log_analytics");
		expect(registered.parameters.type).toBe("object");
		const schema = JSON.stringify(registered.parameters);
		expect(schema).toContain("catalog");
		expect(schema).toContain("query");
		expect(schema).toContain("sources");
		expect(schema).toContain("sql");
		expect(schema).not.toContain("select");
		expect(schema).not.toContain("aggregate");
	});

	it("rejects a query without its operation-specific fields", async () => {
		let registered: any;
		logAnalyticsTool({ registerTool: (tool: unknown) => { registered = tool; } } as never);

		await expect(
			registered.execute(
				"test",
				{ operation: "query" },
				new AbortController().signal,
				undefined,
				{},
			),
		).rejects.toThrow("log_analytics query requires sources and sql");
	});

	it("executes a bounded session_entries SQL query through the registered tool", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-log-analytics-tool-"));
		const previousRoot = process.env.PI_ANALYTICS_SOURCE_ROOT;
		try {
			await fs.mkdir(path.join(root, "sessions"), { recursive: true });
			await fs.writeFile(path.join(root, "sessions", "fixture.jsonl"), `${JSON.stringify({ id: "entry-1", timestamp: "2026-08-27T00:00:00Z", type: "message", content: "bounded fixture" })}\n`);
			process.env.PI_ANALYTICS_SOURCE_ROOT = root;
			let registered: any;
			logAnalyticsTool({ registerTool: (tool: unknown) => { registered = tool; } } as never);

			const result = await registered.execute("test", {
				operation: "query",
				sources: ["session_entries"],
				sql: "SELECT _record_key, _timestamp, record FROM session_entries WHERE _timestamp >= $start ORDER BY _timestamp LIMIT 1",
				parameters: { start: "2026-08-01" },
				maxRows: 1,
			}, new AbortController().signal, undefined, {});

			expect(result.details.rows).toHaveLength(1);
			expect(result.details.rows[0]).toMatchObject({ _record_key: "entry-1", _timestamp: "2026-08-27T00:00:00Z" });
			expect(result.details.truncated).toBe(false);
		} finally {
			if (previousRoot === undefined) delete process.env.PI_ANALYTICS_SOURCE_ROOT;
			else process.env.PI_ANALYTICS_SOURCE_ROOT = previousRoot;
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	it("catalogs every T1 source with a same-named view and query hint", () => {
		const catalog = analyticsCatalog();
		expect(catalog.map((entry) => entry.source)).toEqual(registeredSources.map((source) => source.name));
		for (const entry of catalog) {
			expect(entry.view).toBe(entry.source);
			expect(entry.columns.map((column) => column.name)).toEqual(expect.arrayContaining(["_source_file", "_record_key", "_timestamp", "record"]));
			expect(entry.hint).toContain(entry.view);
		}
		const session = catalog.find((entry) => entry.source === "session_entries");
		expect(session?.columns).toEqual(expect.arrayContaining([
			expect.objectContaining({ name: "message_role", type: "VARCHAR" }),
			expect.objectContaining({ name: "is_error", type: "BOOLEAN" }),
		]));
	});
});
