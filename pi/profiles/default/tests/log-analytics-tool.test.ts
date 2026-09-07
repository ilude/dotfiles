import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerLogAnalytics } from "../extensions/log-analytics-tool.js";
import registerToolSearch from "../extensions/tool-search.js";
import registerToolVisibility from "../extensions/tool-visibility.js";
import { createMockPi } from "./helpers/mock-pi.js";
import { analyticsFixture, recentMessage } from "./helpers/analytics-fixture.js";
let fixture: Awaited<ReturnType<typeof analyticsFixture>>;
beforeEach(async () => { fixture = await analyticsFixture(); });
afterEach(async () => { await fixture.dispose(); });
function tool() {
	const pi = createMockPi();
	const resolver = vi.fn(async () => fixture.registry);
	registerLogAnalytics(pi as never, resolver);
	return { pi, resolver, execute: (params: unknown, signal?: AbortSignal) => pi._getTool("log_analytics")!.execute("id", params, signal) };
}

describe("log_analytics registered tool", () => {
	it("catalog is filesystem-independent and deferred search activates analytics", async () => {
		const { pi, resolver, execute } = tool();
		const result = await execute({ operation: "catalog" });
		expect(result.details.sources.map((item: { source: string }) => item.source)).toEqual(["session_entries", "bedrock_usage", "codex_cache_observations"]);
		expect(resolver).not.toHaveBeenCalled();
		registerToolSearch(pi as never); registerToolVisibility(pi as never);
		await pi._getHook("session_start")[0].handler({}, {});
		expect(pi.getActiveTools()).not.toContain("log_analytics");
		await pi._getTool("tool_search")!.execute("search", { query: "session analytics" });
		expect(pi.getActiveTools()).toContain("log_analytics");
	});

	it("supports default, legacy, combined and exact-session queries through the tool", async () => {
		await fixture.session("default", "one", [recentMessage]);
		await fixture.session("legacy", "two", [recentMessage]);
		const { execute } = tool();
		for (const profiles of [undefined, ["legacy"], ["default", "legacy"]]) {
			const request = { operation: "query", ...(profiles ? { profiles } : {}), sources: ["session_entries"], sql: "SELECT DISTINCT _profile FROM session_entries ORDER BY _profile" };
			expect((await execute(request)).details.rows.map((row: { _profile: string }) => row._profile)).toEqual(profiles ?? ["default"]);
		}
		const page = await execute({ operation: "sessions", profiles: ["default", "legacy"], maxRows: 1 });
		expect(page.details.nextCursor).toBeTruthy();
		const next = await execute({ operation: "sessions", profiles: ["default", "legacy"], maxRows: 1, cursor: page.details.nextCursor });
		expect(next.details.sessions[0].ref.profile).toBe("legacy");
		const selected = await execute({ operation: "query", profiles: ["default", "legacy"], sources: ["session_entries"], sessionRefs: [page.details.sessions[0].ref], sql: "SELECT session_id FROM session_entries LIMIT 1" });
		expect(selected.details.rows).toEqual([{ session_id: "one" }]);
		expect(selected.details.cost.filesScanned).toBe(1);
	});

	it("rejects wrong-operation fields, malformed parameters, unsupported pairs and abort", async () => {
		const { execute } = tool();
		for (const params of [
			{ operation: "query" }, { operation: "catalog", sql: "SELECT 1" },
			{ operation: "sessions", profiles: ["other"] }, { operation: "query", sources: ["session_entries"], sql: "SELECT 1", maxRows: 1001 },
			{ operation: "query", sources: ["session_entries"], sql: "SELECT 1", parameters: { bad: {} } },
			{ operation: "query", sources: ["session_entries"], sql: "SELECT 1", root: "/arbitrary" },
		]) await expect(execute(params)).rejects.toThrow();
		await expect(execute({ operation: "query", profiles: ["legacy"], sources: ["codex_cache_observations"], sql: "SELECT 1" })).rejects.toThrow("unsupported");
		await expect(execute({ operation: "query", sources: ["session_entries"], sql: "SELECT 1" }, AbortSignal.abort())).rejects.toThrow("cancelled");
	});
});
