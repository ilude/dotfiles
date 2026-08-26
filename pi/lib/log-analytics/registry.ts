import fs from "node:fs/promises";
import path from "node:path";

export type SourceColumn = { name: string; type: "VARCHAR" | "BIGINT" | "DOUBLE" | "BOOLEAN" };

export type SourceDefinition<T extends Record<string, unknown> = Record<string, unknown>> = {
	name: string;
	columns: readonly SourceColumn[];
	layouts?: readonly string[];
	predicate?: string;
};

const columns = {
	event_id: { name: "event_id", type: "VARCHAR" },
	timestamp: { name: "timestamp", type: "VARCHAR" },
	session_id: { name: "session_id", type: "VARCHAR" },
	turn_id: { name: "turn_id", type: "VARCHAR" },
	trace_id: { name: "trace_id", type: "VARCHAR" },
	event: { name: "event", type: "VARCHAR" },
	event_type: { name: "event_type", type: "VARCHAR" },
	tool_name: { name: "tool_name", type: "VARCHAR" },
	tool_call_id: { name: "tool_call_id", type: "VARCHAR" },
	provider: { name: "provider", type: "VARCHAR" },
	model: { name: "model", type: "VARCHAR" },
	input_tokens: { name: "input_tokens", type: "BIGINT" },
	output_tokens: { name: "output_tokens", type: "BIGINT" },
	cache_read_tokens: { name: "cache_read_tokens", type: "BIGINT" },
	cost_usd: { name: "cost_usd", type: "DOUBLE" },
	bytes: { name: "bytes", type: "BIGINT" },
} as const satisfies Record<string, SourceColumn>;

const common = [columns.event_id, columns.timestamp, columns.session_id, columns.turn_id, columns.trace_id];
const metricsLayouts = ["metrics.jsonl", "metrics-*.jsonl", "logs/metrics.jsonl", "logs/metrics-*.jsonl", "agent/logs/metrics.jsonl", "agent/logs/metrics-*.jsonl"];
const sessionColumns = [...common, columns.event_type, columns.event, columns.tool_name, columns.tool_call_id, columns.provider, columns.model, columns.input_tokens, columns.output_tokens, columns.cache_read_tokens];

export const registeredSources = [
	{ name: "session_entries", columns: sessionColumns, layouts: ["sessions/**/*.jsonl", "agent/sessions/**/*.jsonl"] },
	{ name: "metric_events", columns: [...common, columns.event, columns.provider, columns.model, columns.tool_name, columns.input_tokens, columns.output_tokens, columns.cache_read_tokens, columns.cost_usd], layouts: metricsLayouts },
	{ name: "trace_events", columns: [...common, columns.event_type, columns.event], layouts: ["*.jsonl", "traces/*.jsonl", "trace/*.jsonl", "logs/traces/*.jsonl", "agent/traces/*.jsonl"] },
	{ name: "workflow_events", columns: [...common, columns.event_type, columns.event], layouts: ["workflow-telemetry/episodes.jsonl", "workflow-telemetry/*/events.jsonl", "workflow-telemetry/**/*.jsonl", "logs/workflow-telemetry/**/*.jsonl", "agent/workflow-telemetry/**/*.jsonl"] },
	{ name: "orchestration_events", columns: [...common, columns.event, columns.provider, columns.model, columns.input_tokens, columns.output_tokens, columns.cache_read_tokens, columns.cost_usd, columns.bytes], layouts: metricsLayouts, predicate: "starts_with(coalesce(json_extract_string(json, '$.event'), ''), 'orchestration_')" },
	{ name: "friction_interactions", columns: [...common, columns.event, columns.event_type], layouts: ["workflow-friction/interactions.jsonl", "logs/workflow-friction/interactions.jsonl", "agent/workflow-friction/interactions.jsonl", "interactions.jsonl"] },
	{ name: "friction_reviews", columns: [...common, columns.event, columns.event_type], layouts: ["workflow-friction/reviews.jsonl", "logs/workflow-friction/reviews.jsonl", "agent/workflow-friction/reviews.jsonl", "reviews.jsonl"] },
	{ name: "damage_control_events", columns: [...common, columns.tool_call_id, columns.event, columns.event_type], layouts: ["damage-control/events.jsonl", "operator/damage-control/events.jsonl", "logs/damage-control/events.jsonl", "events.jsonl"] },
	{ name: "damage_control_judgments", columns: [...common, columns.tool_call_id, columns.event, columns.event_type], layouts: ["damage-control/judge.jsonl", "operator/damage-control/judge.jsonl", "logs/damage-control/judge.jsonl", "judge.jsonl"] },
	{ name: "permission_decisions", columns: [...common, columns.tool_call_id, columns.event, columns.event_type], layouts: ["permissions/decisions.jsonl", "operator/permissions/decisions.jsonl", "logs/permissions/decisions.jsonl", "decisions.jsonl"] },
	{ name: "usage_events", columns: [...common, columns.event, columns.provider, columns.model, columns.input_tokens, columns.output_tokens, columns.cache_read_tokens, columns.cost_usd], layouts: ["logs/usage.jsonl", "usage.jsonl", "agent/logs/usage.jsonl"] },
	{ name: "background_terminal_events", columns: [...common, columns.event, columns.event_type, columns.bytes], layouts: metricsLayouts, predicate: "starts_with(coalesce(json_extract_string(json, '$.event'), ''), 'background_terminal_')" },
] as const satisfies readonly SourceDefinition[];

export type AnalyticsSourceId = (typeof registeredSources)[number]["name"];

export function definitionFor(name: string): SourceDefinition | undefined {
	return registeredSources.find((source) => source.name === name);
}

export function runtimeRoots(root: string, name: string): string[] {
	if (!definitionFor(name)) throw new Error(`unknown analytics source: ${name}`);
	const roots = [path.resolve(root)];
	if (name === "workflow_events") roots.push(path.resolve(root, ".."));
	if (["metric_events", "orchestration_events", "usage_events", "background_terminal_events"].includes(name) && process.env.PI_METRICS_DIR) roots.push(path.resolve(process.env.PI_METRICS_DIR));
	if (["friction_interactions", "friction_reviews"].includes(name) && process.env.PI_WORKFLOW_FRICTION_DIR) roots.push(path.resolve(process.env.PI_WORKFLOW_FRICTION_DIR));
	if (["damage_control_events", "damage_control_judgments", "permission_decisions"].includes(name) && process.env.PI_OPERATOR_DIR) roots.push(path.resolve(process.env.PI_OPERATOR_DIR));
	return [...new Set(roots)];
}

async function expandLayout(root: string, layout: string): Promise<string[]> {
	const segments = layout.split("/");
	const walk = async (base: string, index: number): Promise<string[]> => {
		if (index === segments.length) return [base];
		const segment = segments[index];
		if (segment === "**") {
			const matches = await walk(base, index + 1);
			let entries;
			try { entries = await fs.readdir(base, { withFileTypes: true }); } catch { return matches; }
			const nested = (await Promise.all(entries.filter((entry) => entry.isDirectory()).map((entry) => walk(path.join(base, entry.name), index)))).flat();
			return [...matches, ...nested];
		}
		if (!segment.includes("*") && !segment.includes("?")) return walk(path.join(base, segment), index + 1);
		let entries;
		try { entries = await fs.readdir(base, { withFileTypes: true }); } catch { return []; }
		const pattern = new RegExp(`^${segment.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*").replaceAll("?", ".")}$`);
		return (await Promise.all(entries.filter((entry) => pattern.test(entry.name)).map((entry) => walk(path.join(base, entry.name), index + 1)))).flat();
	};
	return walk(root, 0);
}

export async function discoverSourcePaths(root: string, name: string, candidateRoots?: readonly string[]): Promise<string[]> {
	const source = definitionFor(name);
	if (!source) throw new Error(`unknown analytics source: ${name}`);
	const roots = candidateRoots ?? runtimeRoots(root, name);
	const paths = (await Promise.all((source.layouts ?? []).flatMap((layout) => roots.map((candidate) => expandLayout(candidate, layout))))).flat();
	const files: string[] = [];
	for (const item of [...new Set(paths)]) {
		try { if ((await fs.stat(item)).isFile()) files.push(path.resolve(item)); } catch {}
	}
	return [...new Set(files)].sort();
}
