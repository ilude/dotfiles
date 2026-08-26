import fs from "node:fs/promises";
import path from "node:path";
import type { SourceDefinition, SourceColumn } from "./store.ts";

export type RegisteredSource = {
	name: string;
	columns: readonly SourceColumn[];
	layouts: readonly string[];
};

export type DomainOwnedReader =
	| "find_fails"
	| "damage_control"
	| "permissions"
	| "workflow_friction"
	| "usage_pricing";

export const domainOwnedReaders: readonly DomainOwnedReader[] = [
	"find_fails",
	"damage_control",
	"permissions",
	"workflow_friction",
	"usage_pricing",
];

const structuralColumns = {
	event_id: { name: "event_id", type: "VARCHAR" },
	timestamp: { name: "timestamp", type: "VARCHAR" },
	session_id: { name: "session_id", type: "VARCHAR" },
	turn_id: { name: "turn_id", type: "VARCHAR" },
	trace_id: { name: "trace_id", type: "VARCHAR" },
	runtime_instance_id: { name: "runtime_instance_id", type: "VARCHAR" },
	interaction_id: { name: "interaction_id", type: "VARCHAR" },
	workflow_episode_id: { name: "workflow_episode_id", type: "VARCHAR" },
	orchestration_id: { name: "orchestration_id", type: "VARCHAR" },
	run_id: { name: "run_id", type: "VARCHAR" },
	task_id: { name: "task_id", type: "VARCHAR" },
	goal_id: { name: "goal_id", type: "VARCHAR" },
	tool_call_id: { name: "tool_call_id", type: "VARCHAR" },
	operation_id: { name: "operation_id", type: "VARCHAR" },
	event: { name: "event", type: "VARCHAR" },
	event_type: { name: "event_type", type: "VARCHAR" },
	event_name: { name: "event_name", type: "VARCHAR" },
	status: { name: "status", type: "VARCHAR" },
	provider: { name: "provider", type: "VARCHAR" },
	model: { name: "model", type: "VARCHAR" },
	tool_name: { name: "tool_name", type: "VARCHAR" },
	command_name: { name: "command_name", type: "VARCHAR" },
	phase_id: { name: "phase_id", type: "VARCHAR" },
	input_tokens: { name: "input_tokens", type: "BIGINT" },
	output_tokens: { name: "output_tokens", type: "BIGINT" },
	cache_read_tokens: { name: "cache_read_tokens", type: "BIGINT" },
	duration_ms: { name: "duration_ms", type: "DOUBLE" },
	cost_usd: { name: "cost_usd", type: "DOUBLE" },
	bytes: { name: "bytes", type: "BIGINT" },
} as const satisfies Record<string, SourceColumn>;

const common = [
	structuralColumns.event_id,
	structuralColumns.timestamp,
	structuralColumns.session_id,
	structuralColumns.turn_id,
	structuralColumns.trace_id,
	structuralColumns.runtime_instance_id,
];
const lifecycle = [
	...common,
	structuralColumns.interaction_id,
	structuralColumns.workflow_episode_id,
	structuralColumns.orchestration_id,
	structuralColumns.run_id,
	structuralColumns.task_id,
	structuralColumns.goal_id,
	structuralColumns.tool_call_id,
	structuralColumns.operation_id,
	structuralColumns.event_type,
	structuralColumns.event_name,
	structuralColumns.status,
	structuralColumns.duration_ms,
];

export const registeredSources = [
	{
		name: "metric_events",
		columns: [
			...common,
			structuralColumns.event,
			structuralColumns.provider,
			structuralColumns.model,
			structuralColumns.tool_name,
			structuralColumns.command_name,
			structuralColumns.status,
			structuralColumns.input_tokens,
			structuralColumns.output_tokens,
			structuralColumns.cache_read_tokens,
			structuralColumns.duration_ms,
			structuralColumns.cost_usd,
		],
		layouts: [
			"metrics.jsonl",
			"metrics-*.jsonl",
			"logs/metrics.jsonl",
			"logs/metrics-*.jsonl",
			"agent/logs/metrics.jsonl",
			"agent/logs/metrics-*.jsonl",
		],
	},
	{
		name: "trace_events",
		columns: [...lifecycle],
		layouts: [
			"*.jsonl",
			"traces/*.jsonl",
			"trace/*.jsonl",
			"logs/traces/*.jsonl",
			"agent/traces/*.jsonl",
		],
	},
	{
		name: "workflow_events",
		columns: [
			...common,
			structuralColumns.interaction_id,
			structuralColumns.workflow_episode_id,
			structuralColumns.event_type,
			structuralColumns.event_name,
			structuralColumns.phase_id,
			structuralColumns.status,
			structuralColumns.duration_ms,
		],
		layouts: [
			"workflow-telemetry/episodes.jsonl",
			"workflow-telemetry/*/events.jsonl",
			"workflow-telemetry/**/*.jsonl",
			"logs/workflow-telemetry/**/*.jsonl",
			"agent/workflow-telemetry/**/*.jsonl",
		],
	},
	{
		name: "orchestration_events",
		columns: [
			...lifecycle,
			structuralColumns.provider,
			structuralColumns.model,
			structuralColumns.input_tokens,
			structuralColumns.output_tokens,
			structuralColumns.cache_read_tokens,
			structuralColumns.cost_usd,
			structuralColumns.bytes,
		],
		layouts: [
			"metrics.jsonl",
			"metrics-*.jsonl",
			"logs/metrics.jsonl",
			"logs/metrics-*.jsonl",
			"agent/logs/metrics.jsonl",
			"agent/logs/metrics-*.jsonl",
		],
	},
	{
		name: "friction_interactions",
		columns: [
			...common,
			structuralColumns.interaction_id,
			structuralColumns.workflow_episode_id,
			structuralColumns.status,
			structuralColumns.event_name,
			structuralColumns.duration_ms,
		],
		layouts: [
			"workflow-friction/interactions.jsonl",
			"logs/workflow-friction/interactions.jsonl",
			"agent/workflow-friction/interactions.jsonl",
			"interactions.jsonl",
		],
	},
	{
		name: "friction_reviews",
		columns: [
			...common,
			structuralColumns.interaction_id,
			structuralColumns.status,
			structuralColumns.event_name,
		],
		layouts: [
			"workflow-friction/reviews.jsonl",
			"logs/workflow-friction/reviews.jsonl",
			"agent/workflow-friction/reviews.jsonl",
			"reviews.jsonl",
		],
	},
	{
		name: "damage_control_events",
		columns: [
			...common,
			structuralColumns.tool_call_id,
			structuralColumns.event,
			structuralColumns.status,
			structuralColumns.event_name,
		],
		layouts: [
			"damage-control/events.jsonl",
			"operator/damage-control/events.jsonl",
			"logs/damage-control/events.jsonl",
			"events.jsonl",
		],
	},
	{
		name: "damage_control_judgments",
		columns: [
			...common,
			structuralColumns.tool_call_id,
			structuralColumns.event,
			structuralColumns.status,
			structuralColumns.event_name,
		],
		layouts: [
			"damage-control/judge.jsonl",
			"operator/damage-control/judge.jsonl",
			"logs/damage-control/judge.jsonl",
			"judge.jsonl",
		],
	},
	{
		name: "permission_decisions",
		columns: [
			...common,
			structuralColumns.tool_call_id,
			structuralColumns.event,
			structuralColumns.status,
			structuralColumns.event_name,
		],
		layouts: [
			"permissions/decisions.jsonl",
			"operator/permissions/decisions.jsonl",
			"logs/permissions/decisions.jsonl",
			"decisions.jsonl",
		],
	},
	{
		name: "usage_events",
		columns: [
			...common,
			structuralColumns.event,
			structuralColumns.provider,
			structuralColumns.model,
			structuralColumns.input_tokens,
			structuralColumns.output_tokens,
			structuralColumns.cache_read_tokens,
			structuralColumns.cost_usd,
		],
		layouts: ["logs/usage.jsonl", "usage.jsonl", "agent/logs/usage.jsonl"],
	},
	{
		name: "background_terminal_events",
		columns: [
			...common,
			structuralColumns.operation_id,
			structuralColumns.event,
			structuralColumns.event_name,
			structuralColumns.status,
			structuralColumns.duration_ms,
			structuralColumns.bytes,
		],
		layouts: [
			"metrics.jsonl",
			"metrics-*.jsonl",
			"logs/metrics.jsonl",
			"logs/metrics-*.jsonl",
			"agent/logs/metrics.jsonl",
			"agent/logs/metrics-*.jsonl",
		],
	},
	{
		name: "session_events",
		columns: [
			...common,
			structuralColumns.event_type,
			structuralColumns.event_name,
			structuralColumns.event,
			structuralColumns.tool_name,
			structuralColumns.tool_call_id,
			structuralColumns.provider,
			structuralColumns.model,
			structuralColumns.input_tokens,
			structuralColumns.output_tokens,
			structuralColumns.cache_read_tokens,
		],
		layouts: ["sessions/**/*.jsonl", "agent/sessions/**/*.jsonl"],
	},
] as const satisfies readonly RegisteredSource[];

function objectRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function nested(
	row: Record<string, unknown>,
	key: string,
	allowNested = true,
): unknown {
	const aliases: Record<string, string[]> = {
		session_id: ["session_id", "sessionId", "session"],
		turn_id: ["turn_id", "turnId"],
		trace_id: ["trace_id", "traceId"],
		runtime_instance_id: ["runtime_instance_id", "runtimeInstanceId"],
		event_id: ["event_id", "eventId", "id"],
		timestamp: [
			"timestamp",
			"ts",
			"created_at",
			"occurred_at",
			"started_at",
			"recordedAt",
		],
		workflow_episode_id: ["workflow_episode_id", "episode_id", "episodeId"],
		orchestration_id: ["orchestration_id", "orchestrationId"],
		run_id: ["run_id", "runId"],
		task_id: ["task_id", "taskId"],
		goal_id: ["goal_id", "goalId"],
		tool_call_id: ["tool_call_id", "toolCallId"],
		operation_id: ["operation_id", "operationId"],
		event_type: ["event_type", "eventType", "type", "decisionType"],
		event_name: ["event_name", "eventType", "event", "command"],
		tool_name: ["tool_name", "toolName", "name"],
		command_name: ["command_name", "command"],
		input_tokens: ["input_tokens", "inputTokens"],
		output_tokens: ["output_tokens", "outputTokens"],
		cache_read_tokens: ["cache_read_tokens", "cacheReadTokens"],
		duration_ms: ["duration_ms", "durationMs"],
		cost_usd: ["cost_usd", "costUsd"],
		bytes: ["bytes", "sizeBytes"],
	};
	for (const candidate of aliases[key] ?? [key]) {
		const value = row[candidate];
		if (typeof value === "string" && value.length > 0) return value;
		if (typeof value === "number" && Number.isFinite(value)) return value;
		if (typeof value === "boolean") return value;
	}
	if (!allowNested) return null;
	for (const container of [row.data, row.payload, row.info]) {
		if (
			container &&
			typeof container === "object" &&
			!Array.isArray(container)
		) {
			const value = nested(
				container as Record<string, unknown>,
				key,
				allowNested,
			);
			if (value !== undefined && value !== null) return value;
		}
	}
	return null;
}

export function definitionFor(
	name: string,
	canonicalRoot?: string | readonly string[],
): SourceDefinition | undefined {
	const source = registeredSources.find((item) => item.name === name);
	if (!source) return undefined;
	const roots =
		canonicalRoot === undefined
			? []
			: (Array.isArray(canonicalRoot) ? canonicalRoot : [canonicalRoot]).map(
					(root) => path.resolve(root),
				);
	return {
		name: source.name,
		columns: source.columns,
		...(roots.length > 0 ? { canonicalRoots: roots } : {}),
		parse: (value) => {
			const row = objectRecord(value);
			const allowNested = source.name !== "metric_events";
			const projection = Object.fromEntries(
				source.columns.map((column) => [
					column.name,
					nested(row, column.name, allowNested),
				]),
			);
			if (
				source.name === "background_terminal_events" &&
				!String(projection.event ?? "").startsWith("background_terminal_")
			)
				return undefined;
			if (
				source.name === "orchestration_events" &&
				!String(nested(row, "event", allowNested) ?? "").startsWith(
					"orchestration_",
				)
			)
				return undefined;
			return projection;
		},
	};
}

export function sourcePath(root: string, name: string): string[] {
	const source = registeredSources.find((item) => item.name === name);
	if (!source) throw new Error(`unknown analytics source: ${name}`);
	return source.layouts
		.filter((layout) => !layout.includes("*"))
		.map((layout) => path.join(path.resolve(root), layout));
}

export function runtimeRoots(root: string, name: string): string[] {
	if (!registeredSources.some((source) => source.name === name))
		throw new Error("unknown analytics source: " + name);
	const roots = [path.resolve(root)];
	if (name === "workflow_events") roots.push(path.resolve(root, ".."));
	if (
		[
			"metric_events",
			"orchestration_events",
			"usage_events",
			"background_terminal_events",
		].includes(name) &&
		process.env.PI_METRICS_DIR
	)
		roots.push(path.resolve(process.env.PI_METRICS_DIR));
	if (
		["friction_interactions", "friction_reviews"].includes(name) &&
		process.env.PI_WORKFLOW_FRICTION_DIR
	)
		roots.push(path.resolve(process.env.PI_WORKFLOW_FRICTION_DIR));
	if (
		[
			"damage_control_events",
			"damage_control_judgments",
			"permission_decisions",
		].includes(name) &&
		process.env.PI_OPERATOR_DIR
	)
		roots.push(path.resolve(process.env.PI_OPERATOR_DIR));
	return [...new Set(roots)];
}

async function expandLayout(root: string, layout: string): Promise<string[]> {
	const segments = layout.split("/");
	const walk = async (base: string, index: number): Promise<string[]> => {
		if (index === segments.length) return [base];
		const segment = segments[index];
		if (segment.includes("*") || segment.includes("?")) {
			let entries;
			try {
				entries = await fs.readdir(base, { withFileTypes: true });
			} catch {
				return [];
			}
			const pattern = new RegExp(
				`^${segment
					.replace(/[.+^${}()|[\]\\]/g, "\\$&")
					.replaceAll("*", ".*")
					.replaceAll("?", ".")}$`,
			);
			return (
				await Promise.all(
					entries
						.filter((entry) => pattern.test(entry.name))
						.map((entry) => walk(path.join(base, entry.name), index + 1)),
				)
			).flat();
		}
		return walk(path.join(base, segment), index + 1);
	};
	return walk(root, 0);
}

export async function discoverSourcePaths(
	root: string,
	name: string,
): Promise<string[]> {
	const source = registeredSources.find((item) => item.name === name);
	if (!source) throw new Error(`unknown analytics source: ${name}`);
	const paths = (
		await Promise.all(
			source.layouts.map((layout) => expandLayout(path.resolve(root), layout)),
		)
	).flat();
	const files: string[] = [];
	for (const item of [...new Set(paths)]) {
		try {
			if ((await fs.stat(item)).isFile()) files.push(item);
		} catch {}
	}
	return [...new Set(files)].sort();
}
