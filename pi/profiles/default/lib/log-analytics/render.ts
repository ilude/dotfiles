import { stripVTControlCharacters } from "node:util";
import { keyHint, type Theme, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import type { analyticsSchema } from "../../extensions/log-analytics-tool.js";
import type { analyticsCatalog, queryAnalytics, sessionAnalytics } from "./api.js";

type Tool = ToolDefinition<typeof analyticsSchema, unknown>;
type QueryResult = Awaited<ReturnType<typeof queryAnalytics>>;
type SessionsResult = Awaited<ReturnType<typeof sessionAnalytics>>;
type CatalogResult = { sources: ReturnType<typeof analyticsCatalog>; defaults: Record<string, unknown>; limits: string };
const sourceNames: Record<string, string> = {
	session_entries: "session history", bedrock_usage: "Bedrock usage", codex_cache_observations: "Codex cache observations",
};
const PREVIEW_ROWS = 3;

// History may contain terminal escapes. Render it as text, never terminal commands.
function clean(value: unknown): string {
	const text = value === null ? "null" : typeof value === "string" ? value : JSON.stringify(value) ?? "";
	return stripVTControlCharacters(text).replace(/\r\n?/g, "\n").replace(/\t/g, "  ").replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");
}
function preview(value: unknown, limit = 160): string {
	const text = clean(value).replace(/\s+/g, " ");
	return text.length > limit ? `${text.slice(0, limit)}…` : text || '""';
}
function count(n: number, noun: string): string { return `${n} ${noun}${n === 1 ? "" : "s"}`; }
function sources(ids: readonly string[]): string { return ids.map(id => sourceNames[id] ?? clean(id)).join(", "); }
function bytes(n: number): string { return n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KiB` : `${(n / 1024 ** 2).toFixed(1)} MiB`; }
function component(build: (width: number) => string[]): Component {
	return { render: width => width < 1 ? [] : new Text(build(width).join("\n"), 0, 0).render(width).map(line => truncateToWidth(line, width)), invalidate() {} };
}

export const renderAnalyticsCall: NonNullable<Tool["renderCall"]> = (args, theme, context) => component(() => {
	const expanded = context.expanded;
	const lines = [theme.fg("toolTitle", theme.bold("Log Analytics")) + " · " + (
		args.operation === "catalog" ? "Available sources" : args.operation === "sessions" ? "Find sessions" : args.operation === "query" ? "Query logs" : "Preparing request…")];
	if (args.operation === "catalog" || !args.operation) return lines;
	lines.push(theme.fg("muted", `Profiles: ${args.profiles?.join(" + ") || "active profile"}${args.sources?.length ? ` · ${sources(args.sources)}` : ""}`));
	if (args.cwd !== undefined) lines.push(`Project: ${expanded ? clean(args.cwd) : preview(args.cwd)}`);
	if (args.sessionRefs?.length) lines.push(`Scope: ${count(args.sessionRefs.length, "selected session")}`);
	if (args.sessionIds?.length) lines.push(`Filter: ${count(args.sessionIds.length, "session ID")}`);
	if (args.cursor) lines.push(theme.fg("muted", "Continuing session listing"));
	if (args.sql) lines.push(theme.fg("muted", expanded ? `SQL:\n${clean(args.sql)}` : `SQL: ${preview(args.sql)}`));
	if (expanded) {
		if (args.maxRows !== undefined) lines.push(`Row limit: ${args.maxRows}`);
		for (const [key, value] of Object.entries(args.parameters ?? {})) lines.push(`Parameter ${clean(key)}: ${clean(value)}`);
		for (const ref of args.sessionRefs ?? []) lines.push(`Session: ${clean(ref.profile)}/${clean(ref.sessionId)}${ref.fileKey ? ` · file key: ${clean(ref.fileKey)}` : ""}`);
		if (args.sessionIds?.length) lines.push(`Session IDs: ${args.sessionIds.map(clean).join(", ")}`);
	}
	return lines;
});

/** Tables for short scalar results; labeled records for long text or narrow terminals. */
function rowsView(rows: Record<string, unknown>[], columns: readonly string[], expanded: boolean, width: number, theme: Theme): string[] {
	if (!rows.length) return [];
	const selected = expanded ? rows : rows.slice(0, PREVIEW_ROWS);
	const fields = expanded ? columns : columns.slice(0, 6);
	const cells = selected.map(row => fields.map(key => expanded ? clean(row[key]) || '""' : preview(row[key])));
	const widths = fields.map((key, i) => Math.max(visibleWidth(clean(key)), ...cells.map(row => visibleWidth(row[i]))));
	const table = fields.length > 0 && widths.reduce((a, b) => a + b, 0) + (fields.length - 1) * 3 <= width && cells.every(row => row.every(cell => !cell.includes("\n")));
	const lines: string[] = [];
	if (table) {
		const line = (values: string[]) => values.map((value, i) => value + " ".repeat(Math.max(0, widths[i] - visibleWidth(value)))).join("   ").trimEnd();
		lines.push(theme.fg("muted", line(fields.map(clean))), ...cells.map(line));
	} else {
		selected.forEach((_row, i) => {
			if (selected.length > 1) lines.push(theme.fg("muted", `Row ${i + 1}`));
			fields.forEach((key, j) => lines.push(`  ${theme.fg("accent", clean(key))}: ${cells[i][j]}`));
		});
	}
	if (!expanded && columns.length > fields.length) lines.push(theme.fg("dim", `${count(columns.length - fields.length, "more column")} in expanded view`));
	if (!expanded && rows.length > selected.length) lines.push(theme.fg("dim", `${count(rows.length - selected.length, "more row")} in expanded view`));
	return lines;
}

function coverageLines(coverage: QueryResult["coverage"] | SessionsResult["coverage"], expanded: boolean, theme: Theme): string[] {
	const lines: string[] = [];
	const discovery = coverage.discovery;
	if (discovery?.excludedFiles) lines.push(theme.fg("warning", `Incomplete coverage: ${count(discovery.excludedFiles, "file")} excluded due to invalid session headers.`));
	if (expanded) {
		if ("listing" in coverage) lines.push(theme.fg("dim", `Coverage: ${coverage.listing}`));
		if ("records" in coverage) lines.push(theme.fg("dim", `Coverage: ${coverage.files}; ${coverage.records}`));
		for (const diagnostic of discovery?.diagnostics ?? []) lines.push(theme.fg("warning", `${clean(diagnostic.profile)}/${clean(diagnostic.file)}: ${clean(diagnostic.reason)}`));
		if (discovery?.diagnosticsTruncated) lines.push(theme.fg("warning", "Additional file diagnostics omitted."));
	}
	return lines;
}

export const renderAnalyticsResult: NonNullable<Tool["renderResult"]> = (result, { expanded, isPartial }, theme, context) => component(width => {
	const fallback = () => result.content.filter(item => item.type === "text").map(item => item.text).join("\n");
	if (context.isError) return [theme.fg("error", `Failed: ${expanded ? clean(fallback()) : preview(fallback(), 400)}`)];
	if (isPartial) return [theme.fg("muted", "Searching logs…")];
	const details = result.details;
	if (!details || typeof details !== "object") return [expanded ? clean(fallback()) : preview(fallback(), 400)];
	let lines: string[];
	if ("rows" in details && Array.isArray(details.rows)) {
		const data = details as QueryResult;
		lines = [theme.bold(`${count(data.rows.length, "row")} returned`) + ` · ${data.profiles.join(" + ")} · ${sources(data.sources)}`];
		if (data.truncated) lines.push(theme.fg("warning", "Result truncated by row/byte limit. Narrow the query to retrieve omitted results; expanding only shows returned rows."));
		if (!data.rows.length) lines.push("No rows matched the query.");
		lines.push(...coverageLines(data.coverage, expanded, theme), ...rowsView(data.rows, data.columns, expanded, width, theme));
		if (expanded) {
			const cost = data.cost;
			lines.push(theme.fg("dim", `Scanned: ${count(cost.filesScanned, "file")} · ${bytes(cost.bytesScanned)}`));
			lines.push(theme.fg("dim", `Time: discovery ${Math.round(cost.discoveryMs)} ms · staging ${Math.round(cost.stagingMs)} ms · query ${Math.round(cost.queryMs)} ms`));
		}
	} else if ("sessions" in details && Array.isArray(details.sessions)) {
		const data = details as SessionsResult;
		lines = [theme.bold(`${count(data.sessions.length, "session")} returned`) + ` · ${data.profiles.join(" + ")}`];
		if (data.truncated) lines.push(theme.fg("warning", "More sessions available. The agent must request the next page; expanding does not fetch it."));
		if (!data.sessions.length) lines.push("No sessions matched these filters.");
		lines.push(...coverageLines(data.coverage, expanded, theme));
		const selected = expanded ? data.sessions : data.sessions.slice(0, PREVIEW_ROWS);
		for (const item of selected) {
			lines.push(`${theme.fg("accent", clean(item.ref.profile))} · ${expanded ? clean(item.ref.sessionId) : preview(item.ref.sessionId, 12)} · ${expanded ? clean(item.cwd ?? "unknown project") : preview(item.cwd ?? "unknown project", 100)}`);
			lines.push(theme.fg("muted", `  Created: ${clean(item.created ?? "unknown")} · ${bytes(item.bytes)}`));
			if (expanded) lines.push(theme.fg("dim", `  File modified: ${clean(item.modified)}\n  File key: ${clean(item.ref.fileKey ?? "unavailable")}`));
		}
		if (!expanded && data.sessions.length > selected.length) lines.push(theme.fg("dim", `${count(data.sessions.length - selected.length, "more session")} in expanded view`));
	} else if ("sources" in details && Array.isArray(details.sources)) {
		const data = details as CatalogResult;
		lines = [theme.bold(`${count(data.sources.length, "available source")}`)];
		for (const source of data.sources) {
			lines.push(`${theme.fg("accent", sources([source.source]))} · ${source.profiles.join(" + ")} · ${count(source.columns.length, "column")}`);
			if (expanded) {
				lines.push(`  SQL view: ${clean(source.view)}`);
				for (const column of source.columns) lines.push(`  ${clean(column.name)}: ${clean(column.type)}`);
			}
		}
		if (expanded) {
			lines.push("Resource defaults:");
			for (const [key, value] of Object.entries(data.defaults)) lines.push(`  ${key}: ${clean(value)}`);
			lines.push(clean(data.limits));
		}
	} else return [expanded ? clean(fallback()) : preview(fallback(), 400)];
	if (!expanded) lines.push(theme.fg("dim", keyHint("app.tools.expand", "for full returned values, SQL and diagnostics")));
	return lines;
});
