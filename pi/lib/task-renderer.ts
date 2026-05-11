import type { TaskRecordV1, TaskState } from "./task-registry.ts";
import { redactTaskText } from "./task-security.ts";
import type { TaskRenderMode } from "./task-settings.ts";

const URGENCY_ORDER: TaskState[] = [
	"blocked",
	"failed",
	"running",
	"pending",
	"completed",
	"cancelled",
	"skipped",
];
const COMPACT_PREVIEW_LEN = 60;
const TERMINAL = new Set<TaskState>(["completed", "cancelled", "skipped"]);

export interface TaskGroup {
	state: TaskState;
	tasks: TaskRecordV1[];
}

export function shortTaskId(id: string): string {
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

export function truncateTaskText(
	text: string | undefined,
	max: number,
): string {
	if (!text) return "";
	const redacted = redactTaskText(text);
	return redacted.length > max ? `${redacted.slice(0, max - 3)}...` : redacted;
}

export function groupTasksByUrgency(tasks: TaskRecordV1[]): TaskGroup[] {
	const groups = new Map<TaskState, TaskRecordV1[]>();
	for (const state of URGENCY_ORDER) groups.set(state, []);
	for (const task of tasks) groups.get(task.state)?.push(task);
	return URGENCY_ORDER.map((state) => ({
		state,
		tasks: groups.get(state) ?? [],
	})).filter((group) => group.tasks.length > 0);
}

export function formatCompactRow(task: TaskRecordV1): string {
	const summary = truncateTaskText(
		task.summary || task.agentName || "task",
		COMPACT_PREVIEW_LEN,
	);
	const ageSrc = task.endedAt || task.startedAt || task.createdAt;
	const retry = task.retryCount > 0 ? ` (retry x${task.retryCount})` : "";
	return `  ${shortTaskId(task.id)}  ${summary}${retry}  -- ${relativeTime(ageSrc)}`;
}

export function formatTaskList(
	tasks: TaskRecordV1[],
	mode: TaskRenderMode = "compact",
): string {
	if (mode === "hidden")
		return "Task display is hidden. Use /tasks settings mode compact to restore task output.";
	if (tasks.length === 0) return "No tasks recorded.";
	const groups = groupTasksByUrgency(tasks);
	const lines: string[] = [];
	for (const group of groups) {
		if (mode === "compact" && TERMINAL.has(group.state)) continue;
		lines.push(`${group.state} (${group.tasks.length})`);
		for (const task of group.tasks) lines.push(formatCompactRow(task));
	}
	const terminalCount = tasks.filter((task) => TERMINAL.has(task.state)).length;
	if (mode === "compact" && terminalCount > 0)
		lines.push(`terminal (${terminalCount})`);
	return lines.length > 0
		? lines.join("\n")
		: `No active tasks. terminal (${terminalCount})`;
}

export function formatTaskDetail(task: TaskRecordV1): string {
	const lines: string[] = [];
	lines.push(`task ${task.id}`);
	lines.push(`  state: ${task.state}`);
	lines.push(`  origin: ${task.origin}`);
	if (task.agentName)
		lines.push(`  agent: ${truncateTaskText(task.agentName, 120)}`);
	if (task.repoSlug)
		lines.push(`  repo: ${truncateTaskText(task.repoSlug, 120)}`);
	if (task.summary)
		lines.push(`  summary: ${truncateTaskText(task.summary, 200)}`);
	if (task.prompt)
		lines.push(`  prompt: ${truncateTaskText(task.prompt, 200)}`);
	if (task.preview)
		lines.push(`  preview: ${truncateTaskText(task.preview, 200)}`);
	lines.push(`  created: ${task.createdAt}`);
	if (task.startedAt) lines.push(`  started: ${task.startedAt}`);
	if (task.endedAt) lines.push(`  ended: ${task.endedAt}`);
	if (task.retryCount > 0) lines.push(`  retries: ${task.retryCount}`);
	if (task.blockReason)
		lines.push(`  blocked: ${truncateTaskText(task.blockReason, 200)}`);
	if (task.errorReason)
		lines.push(`  error: ${truncateTaskText(task.errorReason, 200)}`);
	if (task.skipReason)
		lines.push(`  skipped: ${truncateTaskText(task.skipReason, 200)}`);
	if (task.blockedBy?.length)
		lines.push(`  blockedBy: ${task.blockedBy.join(", ")}`);
	if (task.blocks?.length) lines.push(`  blocks: ${task.blocks.join(", ")}`);
	return lines.join("\n");
}
