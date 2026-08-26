import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { aggregateAnalytics, AnalyticsBoundaryError, openAnalyticsStore, refreshRegisteredAnalytics, selectAnalytics } from "../lib/log-analytics/api.ts";
import { definitionFor, discoverSourcePaths, registeredSources } from "../lib/log-analytics/registry.ts";
import { domainOwnedReaders } from "../lib/log-analytics/readers.ts";
import { resetLogAnalyticsStoreCacheForTests } from "../lib/log-analytics/store.ts";
import logAnalyticsTool from "../extensions/log-analytics-tool.ts";

const roots: string[] = [];
afterEach(async () => {
	await resetLogAnalyticsStoreCacheForTests();
	for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

function line(value: Record<string, unknown>): string {
	return `${JSON.stringify(value)}\n`;
}

describe("central analytics boundary", () => {
	it("discovers every registered active layout at its runtime root", async () => {
		const base = await fs.mkdtemp(path.join(os.tmpdir(), "pi-analytics-layouts-"));
		roots.push(base);
		const root = path.join(base, "agent");
		for (const source of registeredSources) {
			const layout = source.layouts[0];
			if (!layout) throw new Error(`${source.name} has no explicit layout`);
			const concreteLayout = layout.replaceAll("**", "nested").replaceAll("*", "sample");
			const file = path.join(root, concreteLayout);
			await fs.mkdir(path.dirname(file), { recursive: true });
			await fs.writeFile(file, line({ id: source.name, event: source.name.startsWith("orchestration") ? "orchestration_run" : source.name.startsWith("background") ? "background_terminal_started" : "structural" }));
			expect(await discoverSourcePaths(root, source.name)).toContain(path.resolve(file));
		}
		const workflow = path.join(root, "..", "workflow-telemetry", "episode-1", "events.jsonl");
		await fs.mkdir(path.dirname(workflow), { recursive: true });
		await fs.writeFile(workflow, line({ episode_id: "episode-1", event_id: "event-1" }));
		expect(await discoverSourcePaths(path.join(root, ".."), "workflow_events")).toContain(path.resolve(workflow));
	});

	it("projects only approved scalar structural fields and filters shared metric layouts", () => {
		const projection = definitionFor("background_terminal_events")?.parse({ id: "id", event: "background_terminal_started", data: { command: "secret", operationId: "op-1", bytes: 4 } }, 1, "fixture.jsonl");
		expect(projection).toMatchObject({ operation_id: "op-1", event: "background_terminal_started", bytes: 4 });
		expect(projection).not.toHaveProperty("data");
		expect(definitionFor("background_terminal_events")?.parse({ id: "id", event: "tool_use", data: { operationId: "op-1" } }, 1, "fixture.jsonl")).toBeUndefined();
	});

	it("refreshes actual layouts through typed bounded select and aggregate operations", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-analytics-refresh-"));
		roots.push(root);
		await fs.mkdir(path.join(root, "logs"), { recursive: true });
		await fs.writeFile(path.join(root, "logs", "metrics.jsonl"), line({ id: "m-1", event: "orchestration_run", model: "model", inputTokens: 2 }));
		const store = await openAnalyticsStore(path.join(root, "analytics.duckdb"));
		await refreshRegisteredAnalytics(store, root);
		expect(await selectAnalytics(store, { source: "metric_events", columns: ["event_id", "event"] })).toEqual([{ event_id: "m-1", event: "orchestration_run" }]);
		expect(await aggregateAnalytics(store, { source: "orchestration_events", measures: [{ kind: "count" }] })).toEqual([{ count: 1n }]);
		await expect(selectAnalytics(store, { source: "metric_events", columns: ["event_id"], limit: 1001 })).rejects.toBeInstanceOf(AnalyticsBoundaryError);
		await expect(selectAnalytics(store, { source: "metric_events", columns: ["event_id"], filters: [{ column: "event_id", op: "bogus", value: "x" }] } as never)).rejects.toBeInstanceOf(AnalyticsBoundaryError);
		await expect(aggregateAnalytics(store, { source: "metric_events", measures: [{ kind: "sum", column: "model" }] })).rejects.toBeInstanceOf(AnalyticsBoundaryError);
	});

	it("records domain operational readers as domain-owned", () => {
		expect(domainOwnedReaders).toEqual(["find_fails", "damage_control", "permissions", "workflow_friction", "usage_pricing"]);
	});
	it("registers a discriminated tool schema without caller SQL or path inputs", () => {
		let registered: any;
		logAnalyticsTool({ on: () => undefined, registerTool: (tool: unknown) => { registered = tool; } } as never);
		expect(registered.name).toBe("log_analytics");
		const schema = JSON.stringify(registered.parameters);
		expect(schema).toContain("catalog");
		expect(schema).toContain("select");
		expect(schema).toContain("aggregate");
		for (const forbidden of ["sql", "path", "pragma", "read_json", "read_text", "read_csv", "glob"]) expect(schema.toLowerCase()).not.toContain(forbidden);
	});
});
