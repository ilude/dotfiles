import { withAnalyticsSession } from "./api.ts";
import { definitionFor } from "./registry.ts";

export type DomainOwnedReader = "find_fails" | "damage_control" | "permissions" | "workflow_friction" | "usage_pricing";
export const domainOwnedReaders: readonly DomainOwnedReader[] = ["find_fails", "damage_control", "permissions", "workflow_friction", "usage_pricing"];

export type StructuralEvent = {
	event_id: string | null; timestamp: string | null; session_id: string | null; turn_id: string | null; trace_id: string | null;
	event?: string | null; event_type?: string | null; event_name?: string | null; status?: string | null; provider?: string | null; model?: string | null;
	tool_name?: string | null; tool_call_id?: string | null; workflow_episode_id?: string | null; orchestration_id?: string | null; run_id?: string | null;
	task_id?: string | null; operation_id?: string | null; input_tokens?: number | bigint | null; output_tokens?: number | bigint | null;
	cache_read_tokens?: number | bigint | null; duration_ms?: number | null; cost_usd?: number | null;
};

type ReaderOptions = { signal?: AbortSignal; maxRows?: number; maxBytes?: number; maxElapsedMs?: number; diagnostics?: Map<string, number> };
const columns = {
	metric: ["event_id", "timestamp", "session_id", "turn_id", "trace_id", "runtime_instance_id", "event", "provider", "model", "tool_name", "command_name", "status", "input_tokens", "output_tokens", "cache_read_tokens", "duration_ms", "cost_usd"],
	trace: ["event_id", "timestamp", "session_id", "turn_id", "trace_id", "runtime_instance_id", "interaction_id", "workflow_episode_id", "orchestration_id", "run_id", "task_id", "goal_id", "tool_call_id", "operation_id", "event_type", "event_name", "status", "duration_ms"],
	workflow: ["event_id", "timestamp", "session_id", "turn_id", "trace_id", "runtime_instance_id", "interaction_id", "workflow_episode_id", "event_type", "event_name", "phase_id", "status", "duration_ms"],
	orchestration: ["event_id", "timestamp", "session_id", "turn_id", "trace_id", "runtime_instance_id", "interaction_id", "workflow_episode_id", "orchestration_id", "run_id", "task_id", "goal_id", "tool_call_id", "operation_id", "event_type", "event_name", "status", "provider", "model", "input_tokens", "output_tokens", "cache_read_tokens", "cost_usd", "bytes"],
	frictionInteraction: ["event_id", "timestamp", "session_id", "turn_id", "trace_id", "runtime_instance_id", "interaction_id", "workflow_episode_id", "event_name", "status", "duration_ms"],
	frictionReview: ["event_id", "timestamp", "session_id", "turn_id", "trace_id", "runtime_instance_id", "interaction_id", "event_name", "status"],
	damageControl: ["event_id", "timestamp", "session_id", "turn_id", "trace_id", "runtime_instance_id", "tool_call_id", "event", "event_name", "status"],
	permission: ["event_id", "timestamp", "session_id", "turn_id", "trace_id", "runtime_instance_id", "tool_call_id", "event", "event_name", "status"],
	usage: ["event_id", "timestamp", "session_id", "turn_id", "trace_id", "runtime_instance_id", "event", "provider", "model", "input_tokens", "output_tokens", "cache_read_tokens", "cost_usd"],
	backgroundTerminal: ["event_id", "timestamp", "session_id", "turn_id", "trace_id", "runtime_instance_id", "operation_id", "event", "event_name", "status", "duration_ms", "bytes"],
} as const;
type ReaderColumnSet = keyof typeof columns;

function quoteColumn(name: string): string { return `"${name.replaceAll('"', '""')}"`; }
async function readSource(root: string, source: string, selected: readonly string[], options: ReaderOptions = {}): Promise<StructuralEvent[]> {
	if (!definitionFor(source)) throw new Error(`unknown structural source: ${source}`);
	const result = await withAnalyticsSession({ root, sources: [source as never], signal: options.signal }, (session) => session.query({ sql: `SELECT ${selected.map(quoteColumn).join(", ")} FROM "${source}"`, maxRows: options.maxRows, maxBytes: options.maxBytes }));
	return result.rows as StructuralEvent[];
}

export function readStructuralEvents(root: string, source: string, options: ReaderOptions = {}): Promise<StructuralEvent[]> {
	const definition = definitionFor(source);
	if (!definition) throw new Error(`unknown structural source: ${source}`);
	return readSource(root, source, definition.columns.map((column) => column.name), options);
}
export function readMetricEvents(root: string, options: ReaderOptions = {}): Promise<StructuralEvent[]> { return readSource(root, "metric_events", columns.metric, options); }
export async function countByStatus(root: string, source: "metric_events" | "trace_events" | "workflow_events", options: ReaderOptions = {}): Promise<Record<string, unknown>[]> {
	const result = await withAnalyticsSession({ root, sources: [source], signal: options.signal }, (session) => session.query({ sql: `SELECT status, count(*) AS count FROM "${source}" GROUP BY status`, maxRows: options.maxRows, maxBytes: options.maxBytes }));
	return result.rows;
}

export const readMetricAnalytics = (root: string, options?: ReaderOptions) => readSource(root, "metric_events", columns.metric, options);
export const readTraceAnalytics = (root: string, options?: ReaderOptions) => readSource(root, "trace_events", columns.trace, options);
export const readWorkflowAnalytics = (root: string, options?: ReaderOptions) => readSource(root, "workflow_events", columns.workflow, options);
export const readOrchestrationAnalytics = (root: string, options?: ReaderOptions) => readSource(root, "orchestration_events", columns.orchestration, options);
export const readFrictionInteractions = (root: string, options?: ReaderOptions) => readSource(root, "friction_interactions", columns.frictionInteraction, options);
export const readFrictionReviews = (root: string, options?: ReaderOptions) => readSource(root, "friction_reviews", columns.frictionReview, options);
export const readDamageControlAnalytics = (root: string, options?: ReaderOptions) => readSource(root, "damage_control_events", columns.damageControl, options);
export const readPermissionAnalytics = (root: string, options?: ReaderOptions) => readSource(root, "permission_decisions", columns.permission, options);
export const readUsageAnalytics = (root: string, options?: ReaderOptions) => readSource(root, "usage_events", columns.usage, options);
export const readBackgroundTerminalAnalytics = (root: string, options?: ReaderOptions) => readSource(root, "background_terminal_events", columns.backgroundTerminal, options);
