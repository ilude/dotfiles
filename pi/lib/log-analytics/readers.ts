import {
	aggregateAnalytics,
	selectAnalytics,
	type AnalyticsOperationOptions,
} from "./api.ts";
import { definitionFor } from "./registry.ts";
import type { LogAnalyticsStore } from "./store.ts";

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

export type StructuralEvent = {
	event_id: string | null;
	timestamp: string | null;
	session_id: string | null;
	turn_id: string | null;
	trace_id: string | null;
	runtime_instance_id: string | null;
	event?: string | null;
	event_type?: string | null;
	event_name?: string | null;
	status?: string | null;
	provider?: string | null;
	model?: string | null;
	tool_name?: string | null;
	tool_call_id?: string | null;
	workflow_episode_id?: string | null;
	orchestration_id?: string | null;
	run_id?: string | null;
	task_id?: string | null;
	operation_id?: string | null;
	input_tokens?: number | bigint | null;
	output_tokens?: number | bigint | null;
	cache_read_tokens?: number | bigint | null;
	duration_ms?: number | null;
	cost_usd?: number | null;
};

export async function readStructuralEvents(
	store: LogAnalyticsStore,
	source: string,
	options: AnalyticsOperationOptions = {},
): Promise<StructuralEvent[]> {
	const definition = definitionFor(source);
	if (!definition) throw new Error(`unknown structural source: ${source}`);
	return selectAnalytics(
		store,
		{
			source: source as never,
			columns: definition.columns.map((column) => column.name),
		},
		options,
	) as Promise<StructuralEvent[]>;
}

export async function readMetricEvents(
	store: LogAnalyticsStore,
	options: AnalyticsOperationOptions = {},
): Promise<StructuralEvent[]> {
	return selectAnalytics(
		store,
		{
			source: "metric_events",
			columns: [
				"event_id",
				"timestamp",
				"session_id",
				"turn_id",
				"trace_id",
				"runtime_instance_id",
				"event",
				"status",
				"provider",
				"model",
				"tool_name",
				"input_tokens",
				"output_tokens",
				"cache_read_tokens",
				"duration_ms",
				"cost_usd",
			],
		},
		options,
	) as Promise<StructuralEvent[]>;
}

export async function countByStatus(
	store: LogAnalyticsStore,
	source: "metric_events" | "trace_events" | "workflow_events",
	options: AnalyticsOperationOptions = {},
) {
	return aggregateAnalytics(
		store,
		{ source, groupBy: ["status"], measures: [{ kind: "count", as: "count" }] },
		options,
	);
}

const readerColumns = {
	metric: [
		"event_id",
		"timestamp",
		"session_id",
		"turn_id",
		"trace_id",
		"runtime_instance_id",
		"event",
		"provider",
		"model",
		"tool_name",
		"command_name",
		"status",
		"input_tokens",
		"output_tokens",
		"cache_read_tokens",
		"duration_ms",
		"cost_usd",
	],
	trace: [
		"event_id",
		"timestamp",
		"session_id",
		"turn_id",
		"trace_id",
		"runtime_instance_id",
		"interaction_id",
		"workflow_episode_id",
		"orchestration_id",
		"run_id",
		"task_id",
		"goal_id",
		"tool_call_id",
		"operation_id",
		"event_type",
		"event_name",
		"status",
		"duration_ms",
	],
	workflow: [
		"event_id",
		"timestamp",
		"session_id",
		"turn_id",
		"trace_id",
		"runtime_instance_id",
		"interaction_id",
		"workflow_episode_id",
		"event_type",
		"event_name",
		"phase_id",
		"status",
		"duration_ms",
	],
	orchestration: [
		"event_id",
		"timestamp",
		"session_id",
		"turn_id",
		"trace_id",
		"runtime_instance_id",
		"interaction_id",
		"workflow_episode_id",
		"orchestration_id",
		"run_id",
		"task_id",
		"goal_id",
		"tool_call_id",
		"operation_id",
		"event_type",
		"event_name",
		"status",
		"provider",
		"model",
		"input_tokens",
		"output_tokens",
		"cache_read_tokens",
		"cost_usd",
		"bytes",
	],
	frictionInteraction: [
		"event_id",
		"timestamp",
		"session_id",
		"turn_id",
		"trace_id",
		"runtime_instance_id",
		"interaction_id",
		"workflow_episode_id",
		"event_name",
		"status",
		"duration_ms",
	],
	frictionReview: [
		"event_id",
		"timestamp",
		"session_id",
		"turn_id",
		"trace_id",
		"runtime_instance_id",
		"interaction_id",
		"event_name",
		"status",
	],
	damageControl: [
		"event_id",
		"timestamp",
		"session_id",
		"turn_id",
		"trace_id",
		"runtime_instance_id",
		"tool_call_id",
		"event",
		"event_name",
		"status",
	],
	permission: [
		"event_id",
		"timestamp",
		"session_id",
		"turn_id",
		"trace_id",
		"runtime_instance_id",
		"tool_call_id",
		"event",
		"event_name",
		"status",
	],
	usage: [
		"event_id",
		"timestamp",
		"session_id",
		"turn_id",
		"trace_id",
		"runtime_instance_id",
		"event",
		"provider",
		"model",
		"input_tokens",
		"output_tokens",
		"cache_read_tokens",
		"cost_usd",
	],
	backgroundTerminal: [
		"event_id",
		"timestamp",
		"session_id",
		"turn_id",
		"trace_id",
		"runtime_instance_id",
		"operation_id",
		"event",
		"event_name",
		"status",
		"duration_ms",
		"bytes",
	],
} as const;

type ReaderColumnSet = keyof typeof readerColumns;

async function readTypedSource(
	store: LogAnalyticsStore,
	source: string,
	reader: ReaderColumnSet,
	options: AnalyticsOperationOptions = {},
): Promise<StructuralEvent[]> {
	return selectAnalytics(
		store,
		{
			source: source as never,
			columns: readerColumns[reader],
		},
		options,
	) as Promise<StructuralEvent[]>;
}

export const readMetricAnalytics = (
	store: LogAnalyticsStore,
	options?: AnalyticsOperationOptions,
) => readTypedSource(store, "metric_events", "metric", options);
export const readTraceAnalytics = (
	store: LogAnalyticsStore,
	options?: AnalyticsOperationOptions,
) => readTypedSource(store, "trace_events", "trace", options);
export const readWorkflowAnalytics = (
	store: LogAnalyticsStore,
	options?: AnalyticsOperationOptions,
) => readTypedSource(store, "workflow_events", "workflow", options);
export const readOrchestrationAnalytics = (
	store: LogAnalyticsStore,
	options?: AnalyticsOperationOptions,
) => readTypedSource(store, "orchestration_events", "orchestration", options);
export const readFrictionInteractions = (
	store: LogAnalyticsStore,
	options?: AnalyticsOperationOptions,
) =>
	readTypedSource(
		store,
		"friction_interactions",
		"frictionInteraction",
		options,
	);
export const readFrictionReviews = (
	store: LogAnalyticsStore,
	options?: AnalyticsOperationOptions,
) => readTypedSource(store, "friction_reviews", "frictionReview", options);
export const readDamageControlAnalytics = (
	store: LogAnalyticsStore,
	options?: AnalyticsOperationOptions,
) => readTypedSource(store, "damage_control_events", "damageControl", options);
export const readPermissionAnalytics = (
	store: LogAnalyticsStore,
	options?: AnalyticsOperationOptions,
) => readTypedSource(store, "permission_decisions", "permission", options);
export const readUsageAnalytics = (
	store: LogAnalyticsStore,
	options?: AnalyticsOperationOptions,
) => readTypedSource(store, "usage_events", "usage", options);
export const readBackgroundTerminalAnalytics = (
	store: LogAnalyticsStore,
	options?: AnalyticsOperationOptions,
) =>
	readTypedSource(
		store,
		"background_terminal_events",
		"backgroundTerminal",
		options,
	);
