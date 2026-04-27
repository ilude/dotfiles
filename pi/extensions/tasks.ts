/**
 * /tasks Operator Surface
 *
 * Reads the durable task registry (pi/lib/task-registry.ts) and exposes a
 * compact list grouped by urgency. Owned by .specs/pi-operator-layer-mvp/
 * plan.md (T4).
 *
 * Commands:
 *   /tasks                    -- urgency-grouped list (compact rows)
 *   /tasks <id>               -- detail view for a single task
 *   /tasks cancel <id>        -- transition running/blocked/pending -> cancelled
 *   /tasks retry <id>         -- transition failed -> running (registry bumps
 *                                retryCount and clears errorReason); does not
 *                                re-execute the work
 *
 * Task ids are UUIDv4. Prefix matching (first 8 chars) is supported for
 * convenience.
 */

import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	getTask,
	listTasks,
	type TaskRecordV1,
	type TaskState,
	transitionTask,
} from "../lib/task-registry.js";

/**
 * State display order (most urgent first). Tasks within the same group are
 * ordered newest-first by createdAt.
 */
const URGENCY_ORDER: TaskState[] = [
	"blocked",
	"failed",
	"running",
	"pending",
	"completed",
	"cancelled",
];

const COMPACT_PREVIEW_LEN = 60;
const TERMINAL_STATES_FOR_LIST = new Set<TaskState>(["completed", "cancelled"]);

export interface TaskGroup {
	state: TaskState;
	tasks: TaskRecordV1[];
}

export function groupTasksByUrgency(tasks: TaskRecordV1[]): TaskGroup[] {
	const groups: Record<TaskState, TaskRecordV1[]> = {
		blocked: [],
		failed: [],
		running: [],
		pending: [],
		completed: [],
		cancelled: [],
	};
	for (const t of tasks) groups[t.state].push(t);
	return URGENCY_ORDER.map((state) => ({ state, tasks: groups[state] })).filter(
		(g) => g.tasks.length > 0,
	);
}

function shortId(id: string): string {
	return id.slice(0, 8);
}

function relativeTime(iso: string): string {
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return "?";
	const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
	if (seconds < 60) return `${seconds}s ago`;
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
	return `${Math.floor(seconds / 86400)}d ago`;
}

function truncate(text: string | undefined, max: number): string {
	if (!text) return "";
	return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

export function formatCompactRow(task: TaskRecordV1): string {
	const summary = truncate(task.summary || task.agentName || "task", COMPACT_PREVIEW_LEN);
	const ageSrc = task.endedAt || task.startedAt || task.createdAt;
	const age = relativeTime(ageSrc);
	const retry = task.retryCount > 0 ? ` (retry x${task.retryCount})` : "";
	return `  ${shortId(task.id)}  ${summary}${retry}  -- ${age}`;
}

export function formatTaskList(tasks: TaskRecordV1[]): string {
	if (tasks.length === 0) return "No tasks recorded.";
	const groups = groupTasksByUrgency(tasks);
	const lines: string[] = [];
	for (const g of groups) {
		lines.push(`${g.state} (${g.tasks.length})`);
		for (const t of g.tasks) lines.push(formatCompactRow(t));
	}
	return lines.join("\n");
}

export function formatTaskDetail(task: TaskRecordV1): string {
	const lines: string[] = [];
	lines.push(`task ${task.id}`);
	lines.push(`  state: ${task.state}`);
	lines.push(`  origin: ${task.origin}`);
	if (task.agentName) lines.push(`  agent: ${task.agentName}`);
	if (task.repoSlug) lines.push(`  repo: ${task.repoSlug}`);
	if (task.summary) lines.push(`  summary: ${task.summary}`);
	if (task.prompt) lines.push(`  prompt: ${truncate(task.prompt, 200)}`);
	if (task.preview) lines.push(`  preview: ${truncate(task.preview, 200)}`);
	lines.push(`  created: ${task.createdAt}`);
	if (task.startedAt) lines.push(`  started: ${task.startedAt}`);
	if (task.endedAt) lines.push(`  ended: ${task.endedAt}`);
	if (task.retryCount > 0) lines.push(`  retries: ${task.retryCount}`);
	if (task.blockReason) lines.push(`  blocked: ${task.blockReason}`);
	if (task.errorReason) lines.push(`  error: ${task.errorReason}`);
	if (task.usage) {
		const usageParts: string[] = [];
		if (task.usage.inputTokens) usageParts.push(`in=${task.usage.inputTokens}`);
		if (task.usage.outputTokens) usageParts.push(`out=${task.usage.outputTokens}`);
		if (task.usage.totalTokens) usageParts.push(`total=${task.usage.totalTokens}`);
		if (usageParts.length > 0) lines.push(`  usage: ${usageParts.join(" ")}`);
	}
	return lines.join("\n");
}

/**
 * Resolve a task id from a partial input. Accepts full UUID, short prefix
 * (>= 4 chars), or returns null if no unique match.
 */
export function resolveTaskId(input: string, candidates: TaskRecordV1[]): TaskRecordV1 | null {
	const trimmed = input.trim();
	if (trimmed.length < 4) return null;
	const exact = candidates.find((t) => t.id === trimmed);
	if (exact) return exact;
	const prefix = candidates.filter((t) => t.id.startsWith(trimmed));
	return prefix.length === 1 ? prefix[0] : null;
}

interface ParsedSubcommand {
	verb: "list" | "show" | "cancel" | "retry";
	idArg?: string;
}

export function parseTasksArgs(args: string): ParsedSubcommand {
	const trimmed = args.trim();
	if (!trimmed) return { verb: "list" };
	const parts = trimmed.split(/\s+/);
	const head = parts[0].toLowerCase();
	if (head === "cancel" && parts[1]) return { verb: "cancel", idArg: parts[1] };
	if (head === "retry" && parts[1]) return { verb: "retry", idArg: parts[1] };
	// Anything else with one token is treated as an id for the show view
	if (parts.length === 1) return { verb: "show", idArg: parts[0] };
	return { verb: "list" };
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("tasks", {
		description:
			"Show durable subagent/team tasks grouped by urgency. " +
			"Usage: /tasks | /tasks <id-prefix> | /tasks cancel <id> | /tasks retry <id>.",
		handler: async (args, ctx) => {
			const parsed = parseTasksArgs(args);
			let all: TaskRecordV1[];
			try {
				all = listTasks();
			} catch (err) {
				ctx.ui.notify(
					`Failed to read task registry: ${err instanceof Error ? err.message : String(err)}`,
					"error",
				);
				return;
			}

			if (parsed.verb === "list") {
				// Hide ordinary terminal noise unless explicitly requested via show.
				const interesting = all.filter((t) => !TERMINAL_STATES_FOR_LIST.has(t.state) || true);
				ctx.ui.notify(formatTaskList(interesting), "info");
				return;
			}

			if (!parsed.idArg) {
				ctx.ui.notify("Usage: /tasks [<id> | cancel <id> | retry <id>]", "warning");
				return;
			}

			const target = resolveTaskId(parsed.idArg, all);
			if (!target) {
				ctx.ui.notify(`No unique task found for "${parsed.idArg}".`, "warning");
				return;
			}

			if (parsed.verb === "show") {
				const fresh = getTask(target.id) ?? target;
				ctx.ui.notify(formatTaskDetail(fresh), "info");
				return;
			}

			if (parsed.verb === "cancel") {
				if (target.state === "completed" || target.state === "cancelled") {
					ctx.ui.notify(`Task ${shortId(target.id)} is already ${target.state}.`, "warning");
					return;
				}
				try {
					const after = transitionTask(target.id, "cancelled");
					ctx.ui.notify(
						`Cancelled ${shortId(target.id)} (was ${target.state}; final summary: ${truncate(after.summary, 80)})`,
						"info",
					);
				} catch (err) {
					ctx.ui.notify(
						`Cancel rejected: ${err instanceof Error ? err.message : String(err)}`,
						"warning",
					);
				}
				return;
			}

			if (parsed.verb === "retry") {
				if (target.state !== "failed") {
					ctx.ui.notify(
						`Retry only valid for failed tasks (this one is ${target.state}).`,
						"warning",
					);
					return;
				}
				try {
					const after = transitionTask(target.id, "running");
					ctx.ui.notify(
						`Retried ${shortId(target.id)} (retry x${after.retryCount}). Re-issue the original work to drive execution.`,
						"info",
					);
				} catch (err) {
					ctx.ui.notify(
						`Retry rejected: ${err instanceof Error ? err.message : String(err)}`,
						"warning",
					);
				}
				return;
			}
		},
	});
}
