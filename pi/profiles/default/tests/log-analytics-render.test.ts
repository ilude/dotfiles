import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vitest";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { setKeybindings, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { getThemeByName, initTheme } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import { KeybindingsManager } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/keybindings.js";
import { registerLogAnalytics, type analyticsSchema, type LogAnalyticsInput } from "../extensions/log-analytics-tool.js";
import { createMockPi } from "./helpers/mock-pi.js";
import { analyticsFixture, recentMessage } from "./helpers/analytics-fixture.js";
import type { queryAnalytics } from "../lib/log-analytics/api.js";

type Tool = ToolDefinition<typeof analyticsSchema, unknown>;
type ToolRenderContext = Parameters<NonNullable<Tool["renderCall"]>>[2];
initTheme("dark", false);
setKeybindings(new KeybindingsManager());
const theme = getThemeByName("dark")!;
function context(args: Partial<LogAnalyticsInput>, expanded = false, isError = false): ToolRenderContext {
	return { args: args as LogAnalyticsInput, expanded, isError, state: {}, lastComponent: undefined, toolCallId: "test", cwd: "/fixture", executionStarted: true, argsComplete: true, isPartial: false, showImages: false, invalidate() {} };
}
function registered(): Tool {
	const pi = createMockPi();
	registerLogAnalytics(pi as never);
	return pi._getTool("log_analytics") as unknown as Tool;
}
function plain(component: Component, width = 100): string {
	const lines = component.render(width);
	for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(width);
	return lines.map(line => stripVTControlCharacters(line).trimEnd()).join("\n");
}
function rendered(details: unknown, expanded = false, width = 100): string {
	const tool = registered();
	return plain(tool.renderResult!({ content: [{ type: "text", text: JSON.stringify(details) }], details }, { expanded, isPartial: false }, theme, context({ operation: "query" }, expanded)), width);
}
function query(rows: Record<string, unknown>[], columns = Object.keys(rows[0] ?? {})): Awaited<ReturnType<typeof queryAnalytics>> {
	return { rows, columns, profiles: ["default"], sources: ["session_entries"], truncated: false,
		cost: { filesScanned: 2, bytesScanned: 2048, discoveryMs: 1.1, stagingMs: 2.2, queryMs: 3.3 },
		coverage: { files: "all selected files staged", records: "valid JSON only; malformed lines excluded; live files are not a snapshot" } };
}

describe("log analytics user-facing rendering", () => {
	it("shows scope and SQL preview, with full parameters and references only when expanded", () => {
		const tool = registered();
		const args: LogAnalyticsInput = { operation: "query", profiles: ["default", "legacy"], sources: ["session_entries"],
			sql: "SELECT tool_name, count(*) AS failures FROM session_entries WHERE is_error GROUP BY tool_name",
			parameters: { since: "2026-09-01" }, sessionRefs: [{ profile: "default", sessionId: "session-id", fileKey: "a".repeat(64) }] };
		const collapsed = plain(tool.renderCall!(args, theme, context(args)));
		expect(collapsed).toContain("Log Analytics · Query logs");
		expect(collapsed).toContain("default + legacy · session history");
		expect(collapsed).toContain("1 selected session");
		expect(collapsed).toContain("WHERE is_error");
		expect(collapsed).not.toContain("a".repeat(64));
		expect(collapsed).not.toContain("Parameter since");
		const expanded = plain(tool.renderCall!(args, theme, context(args, true)));
		expect(expanded).toContain("Parameter since: 2026-09-01");
		expect(expanded).toContain("a".repeat(64));
		expect(plain(tool.renderCall!({} as LogAnalyticsInput, theme, context({})))).toContain("Preparing request");
	});

	it("renders compact search progress and exact follow-up without fetching on expansion", () => {
		const search = { profiles: ["default", "legacy"], matches: [{ occurrence: { profile: "default", session: { profile: "default", sessionId: "last-week" }, fileKey: "a".repeat(64), byteOffset: 128, byteLength: 80, recordOrdinal: 2, recordKey: "failure" }, timestamp: "2026-09-05T00:00:00.000Z", entryType: "message", messageRole: "toolResult", toolName: "read", isError: true, snippet: "read failed" }], nextCursor: "cursor-secret", complete: false, stopReason: "result_limit", coverage: { selectedFiles: 4, selectedBytes: 4096, examinedFiles: 1, examinedRecords: 3, examinedBytes: 512, safelyPrunedFiles: 0, malformedRecords: 0, oversizedRecords: 0, timestampGaps: 0, diagnostics: [], diagnosticsTruncated: false, inventoryChanges: [], page: { examinedFiles: 1, examinedRecords: 3, examinedBytes: 512, malformedRecords: 0, oversizedRecords: 0 }, cumulative: { examinedFiles: 1, examinedRecords: 3, examinedBytes: 512, malformedRecords: 0, oversizedRecords: 0 }, remainingFiles: 3, capturedHorizons: [{ fileKey: "a".repeat(64), bytes: 4096 }], exclusions: { excludedFiles: 0, diagnostics: [], diagnosticsTruncated: false } } };
		const compact = rendered(search);
		expect(compact).toContain("1 match returned · default + legacy");
		expect(compact).toContain("More input available");
		expect(compact).toContain("3 records examined");
		expect(compact).toContain("Continue with nextCursor");
		expect(compact).not.toContain("a".repeat(64));
		const expanded = rendered(search, true);
		expect(expanded).toContain("offset 128 · ordinal 2");
		expect(expanded).toContain("Captured horizon");
		const follow = { occurrence: search.matches[0].occurrence, before: [{ occurrence: search.matches[0].occurrence, record: { message: { content: [{ type: "text", text: "before" }] } }, timestamp: null }], match: { occurrence: search.matches[0].occurrence, record: { message: { content: [{ type: "text", text: "exact" }] } }, timestamp: null }, after: [] };
		expect(rendered(follow)).toContain("Match:");
		expect(rendered(follow, true)).toContain('"exact"');
	});

	it("renders scalar query results as a table and preserves values at narrow widths", () => {
		const data = query([{ tool_name: "bash", failures: "12" }, { tool_name: "read", failures: "3" }]);
		const text = rendered(data);
		expect(text).toContain("2 rows returned · default · session history");
		expect(text).toMatch(/tool_name\s+failures\nbash\s+12\nread\s+3/);
		expect(text).not.toContain("bytesScanned");
		expect(text).toContain("ctrl+o for full returned values, SQL and diagnostics");
		const narrow = rendered(data, false, 16);
		expect(narrow).toContain("Row 1");
		expect(narrow).toContain("bash");
		const expanded = rendered(data, true);
		expect(expanded).toContain("Scanned: 2 files · 2.0 KiB");
		expect(expanded).toContain("discovery 1 ms · staging 2 ms · query 3 ms");
	});

	it("distinguishes preview clipping, backend truncation and excluded files", () => {
		const data = query(Array.from({ length: 5 }, (_, i) => ({ name: `item-${i}`, text: "x".repeat(200), c: null, d: false, e: 0, f: "", extra: "seventh" })));
		data.truncated = true;
		data.coverage.discovery = { excludedFiles: 1, diagnostics: [{ profile: "default", file: "bad.jsonl", fileKey: "b".repeat(64), reason: "invalid header" }], diagnosticsTruncated: true };
		const text = rendered(data);
		expect(text).toContain("Result truncated by row/byte limit");
		expect(text).toContain("Incomplete coverage: 1 file excluded");
		expect(text).toContain("2 more rows in expanded view");
		expect(text).toContain("1 more column in expanded view");
		expect(text).not.toContain("item-4");
		expect(text).not.toContain("seventh");
		expect(text).toContain("…");
		const expanded = rendered(data, true);
		expect(expanded).toContain("item-4");
		expect(expanded).toContain("seventh");
		expect(expanded).toContain("default/bad.jsonl: invalid header");
		expect(expanded).toContain("Additional file diagnostics omitted");
		expect(expanded).toContain("Result truncated");
	});

	it("formats real catalog and paginated discovery without changing the model result", async () => {
		const fixture = await analyticsFixture();
		try {
			await fixture.session("default", "one", [recentMessage]);
			await fixture.session("default", "two", [recentMessage]);
			const pi = createMockPi();
			registerLogAnalytics(pi as never, async () => fixture.registry);
			const execute = pi._getTool("log_analytics")!.execute;
			const catalog = await execute("catalog", { operation: "catalog" });
			expect(rendered(catalog.details)).toContain("3 available sources");
			expect(rendered(catalog.details)).not.toContain("VARCHAR");
			expect(rendered(catalog.details, true)).toContain("SQL view: session_entries");
			const sessions = await execute("sessions", { operation: "sessions", maxRows: 1 });
			const text = rendered(sessions.details);
			expect(text).toContain("1 session returned · default");
			expect(text).toContain("Created:");
			expect(text).toContain("More sessions available");
			expect(text).not.toContain(sessions.details.nextCursor);
			expect(text).not.toContain(sessions.details.sessions[0].ref.fileKey);
			expect(rendered(sessions.details, true)).toContain(sessions.details.sessions[0].ref.fileKey);
			const result = await execute("query", { operation: "query", sources: ["session_entries"], sql: "SELECT count(*) AS records FROM session_entries" });
			const before = JSON.stringify(result);
			expect(rendered(result.details)).toContain("records");
			expect(JSON.parse(result.content[0].text)).toEqual(result.details);
			expect(JSON.stringify(result)).toBe(before);
		} finally { await fixture.dispose(); }
	});

	it("handles empty results, errors and progress explicitly", () => {
		expect(rendered(query([]))).toContain("No rows matched the query");
		expect(rendered({ profiles: ["legacy"], sessions: [], truncated: false, nextCursor: null, coverage: { listing: "best-effort; not a snapshot" } })).toContain("No sessions matched these filters");
		const tool = registered();
		const result = { content: [{ type: "text" as const, text: "analytics query cancelled" }], details: undefined };
		expect(plain(tool.renderResult!(result, { expanded: false, isPartial: false }, theme, context({}, false, true)))).toContain("Failed: analytics query cancelled");
		expect(plain(tool.renderResult!(result, { expanded: false, isPartial: true }, theme, context({})))).toContain("Searching logs");
		expect(plain(tool.renderResult!(result, { expanded: false, isPartial: false }, theme, context({})))).toContain("analytics query cancelled");
	});

	it("renders multiline and Unicode values without emitting history terminal controls", () => {
		const data = query([{ text: "line one\nline two 界 😀\x1b[31mRED\x1b[0m\x1b]52;c;ZXZpbA==\x07", nested: { ok: true }, absent: null }]);
		for (const width of [1, 16, 80, 120]) {
			const expanded = rendered(data, true, width);
			expect(expanded).not.toContain("ZXZpbA");
			if (width > 16) expect(expanded).toContain("line two 界 😀RED");
		}
		expect(rendered(data, true)).toContain('nested: {"ok":true}');
		expect(rendered(data, true)).toContain("absent: null");
	});
});
