import { describe, expect, it } from "vitest";
import logAnalyticsTool from "../extensions/log-analytics-tool.ts";
import { analyticsCatalog } from "../lib/log-analytics/api.ts";
import { registeredSources } from "../lib/log-analytics/registry.ts";

describe("log_analytics tool", () => {
	it("registers catalog and direct query operations", () => {
		let registered: any;
		logAnalyticsTool({ registerTool: (tool: unknown) => { registered = tool; } } as never);
		expect(registered.name).toBe("log_analytics");
		const schema = JSON.stringify(registered.parameters);
		expect(schema).toContain("catalog");
		expect(schema).toContain("query");
		expect(schema).toContain("sources");
		expect(schema).toContain("sql");
		expect(schema).not.toContain("select");
		expect(schema).not.toContain("aggregate");
	});

	it("catalogs every T1 source with a same-named view and query hint", () => {
		const catalog = analyticsCatalog();
		expect(catalog.map((entry) => entry.source)).toEqual(registeredSources.map((source) => source.name));
		for (const entry of catalog) {
			expect(entry.view).toBe(entry.source);
			expect(entry.columns.map((column) => column.name)).toEqual(expect.arrayContaining(["_source_file", "_record_key", "_timestamp", "record"]));
			expect(entry.hint).toContain(entry.view);
		}
	});
});
