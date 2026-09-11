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

	it("supports search, exact follow-up, and explicit large SQL through the registered boundary", async () => {
		const failure = (id: string, text: string, isError: boolean, role = "toolResult") => ({ type: "message", id, timestamp: "2026-09-05T00:00:00Z", message: { role, toolName: "read", toolCallId: `call-${id}`, isError, content: [{ type: "text", text }] } });
		await fixture.session("default", "last-week", [failure("bad-default", "read failed", true), failure("false-positive", "failure text but success", false), failure("user-note", "failure reported", false, "user")]);
		await fixture.session("legacy", "last-week-legacy", [failure("bad-legacy", "permission denied", true)]);
		const { execute } = tool();
		const request = { operation: "search" as const, profiles: ["default", "legacy"] as const, interval: { since: "2026-09-01T00:00:00Z", until: "2026-09-08T00:00:00Z" }, filters: { messageRoles: ["toolResult"], isError: true }, maxResults: 1 };
		const first = await execute(request);
		expect(first.details.matches).toHaveLength(1);
		const all = [...first.details.matches];
		let page = first.details;
		while (page.nextCursor) { page = (await execute({ ...request, cursor: page.nextCursor })).details; all.push(...page.matches); }
		expect(all.map((match: { occurrence: { session: { sessionId: string } } }) => match.occurrence.session.sessionId)).toEqual(["last-week", "last-week-legacy"]);
		expect(all.every((match: { isError: boolean }) => match.isError)).toBe(true);
		const context = await execute({ operation: "follow_up", occurrence: all[0].occurrence, before: 1, after: 1 });
		expect(context.details.match.record.message.content[0].text).toBe("read failed");
		const large = await execute({ operation: "query", profiles: ["default"], sources: ["session_entries"], execution: "large", sql: "SELECT count(*) AS records FROM session_entries" });
		expect(large.details.cost.execution).toBe("large");
		expect(large.details.cost.diskBudgetBytes).toBe(8 * 1024 ** 3);
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
			{ operation: "query" }, { operation: "catalog", sql: "SELECT 1" }, { operation: "catalog", profiles: ["default"] },
			{ operation: "sessions", profiles: ["other"] }, { operation: "sessions", sql: "SELECT 1" },
			{ operation: "query", sources: ["session_entries"], sql: "SELECT 1", maxRows: 1001 },
			{ operation: "query", sources: ["session_entries"], sql: "SELECT 1", parameters: { bad: {} } },
			{ operation: "query", sources: ["session_entries"], sql: "SELECT 1", root: "/arbitrary" },
			{ operation: "search", filters: { isError: true }, sql: "SELECT 1" },
			{ operation: "follow_up", occurrence: { profile: "default", fileKey: "bad", byteOffset: 0, byteLength: 1, recordOrdinal: 0, recordKey: null } },
		]) await expect(execute(params)).rejects.toThrow();
		await expect(execute({ operation: "query", profiles: ["legacy"], sources: ["codex_cache_observations"], sql: "SELECT 1" })).rejects.toThrow("unsupported");
		await expect(execute({ operation: "query", sources: ["session_entries"], sql: "SELECT 1" }, AbortSignal.abort())).rejects.toThrow("cancelled");
	});
});
