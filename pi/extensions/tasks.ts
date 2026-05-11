import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
	clearCompletedTasks,
	createTask,
	getTask,
	listTasks,
	safeTransitionTask,
	type TaskRecordV1,
	type TaskState,
	updateTask,
} from "../lib/task-registry.js";
import {
	formatTaskDetail,
	formatTaskList,
	groupTasksByUrgency,
	shortTaskId,
	truncateTaskText,
} from "../lib/task-renderer.js";
import { sanitizeTaskValue } from "../lib/task-security.js";
import {
	getTaskRenderMode,
	isTaskRenderMode,
	setTaskRenderMode,
} from "../lib/task-settings.js";

export { formatTaskDetail, formatTaskList, groupTasksByUrgency };

interface ParsedSubcommand {
	verb:
		| "list"
		| "show"
		| "create"
		| "start"
		| "complete"
		| "skip"
		| "cancel"
		| "retry"
		| "clear"
		| "settings"
		| "help";
	idArg?: string;
	text?: string;
	all?: boolean;
	mode?: string;
}

export function parseTasksArgs(args: string): ParsedSubcommand {
	const trimmed = args.trim();
	if (!trimmed) return { verb: "list" };
	const parts = trimmed.split(/\s+/);
	const head = parts[0].toLowerCase();
	if (head === "list") return { verb: "list", all: parts.includes("--all") };
	if (head === "show" && parts[1]) return { verb: "show", idArg: parts[1] };
	if (head === "create")
		return { verb: "create", text: trimmed.slice("create".length).trim() };
	if (head === "start" && parts[1]) return { verb: "start", idArg: parts[1] };
	if (head === "complete" && parts[1])
		return { verb: "complete", idArg: parts[1] };
	if (head === "skip" && parts[1])
		return { verb: "skip", idArg: parts[1], text: parts.slice(2).join(" ") };
	if (head === "cancel" && parts[1]) return { verb: "cancel", idArg: parts[1] };
	if ((head === "retry" || head === "reopen") && parts[1])
		return { verb: "retry", idArg: parts[1] };
	if (head === "clear" && parts[1]?.toLowerCase() === "completed")
		return { verb: "clear" };
	if (head === "settings") return { verb: "settings", mode: parts[2] };
	if (head === "help") return { verb: "help" };
	if (parts.length === 1) return { verb: "show", idArg: parts[0] };
	return { verb: "help" };
}

export function resolveTaskId(
	input: string,
	candidates: TaskRecordV1[],
): TaskRecordV1 | null {
	const trimmed = input.trim();
	if (trimmed.length < 4) return null;
	const exact = candidates.find((task) => task.id === trimmed);
	if (exact) return exact;
	const prefix = candidates.filter((task) => task.id.startsWith(trimmed));
	return prefix.length === 1 ? prefix[0] : null;
}

function helpText(): string {
	return "Usage: /tasks|/tasks list [--all]|show <id>|create <summary>|start <id>|complete <id>|skip <id> [reason]|cancel <id>|retry <id>|reopen <id>|clear completed|settings mode compact|full|hidden. Retry/reopen does not execute work.";
}

function notifyOutcome(
	ctx: {
		ui: {
			notify: (message: string, level?: "info" | "warning" | "error") => void;
		};
	},
	label: string,
	result: ReturnType<typeof safeTransitionTask>,
): void {
	if (result.outcome === "persisted" && result.record)
		ctx.ui.notify(`${label} ${shortTaskId(result.record.id)}.`, "info");
	else
		ctx.ui.notify(
			`${label} rejected: ${result.error ?? result.outcome}`,
			"warning",
		);
}

function toolResult(details: unknown) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(details) }],
		details,
	};
}

function asParams(params: unknown): Record<string, unknown> {
	return params && typeof params === "object"
		? (params as Record<string, unknown>)
		: {};
}

function originFrom(value: unknown): "subagent" | "team" | "shell" | "other" {
	return value === "subagent" || value === "team" || value === "shell"
		? value
		: "other";
}

function registerTaskTools(pi: ExtensionAPI): void {
	const taskParams = Type.Object(
		{
			origin: Type.Optional(
				Type.Union([
					Type.Literal("subagent"),
					Type.Literal("team"),
					Type.Literal("shell"),
					Type.Literal("other"),
				]),
			),
			summary: Type.Optional(Type.String()),
		},
		{ additionalProperties: true },
	);
	const batchTaskParams = Type.Object(
		{
			tasks: Type.Optional(Type.Array(taskParams)),
		},
		{ additionalProperties: true },
	);
	const taskIdParams = Type.Object(
		{
			id: Type.Optional(Type.String()),
		},
		{ additionalProperties: true },
	);
	const taskUpdateParams = Type.Object(
		{
			id: Type.Optional(Type.String()),
			state: Type.Optional(Type.String()),
			summary: Type.Optional(Type.String()),
		},
		{ additionalProperties: true },
	);
	const emptyParams = Type.Object({}, { additionalProperties: true });
	pi.registerTool({
		name: "task_create",
		label: "Task Create",
		description: "Create a durable sanitized task.",
		parameters: taskParams,
		execute: async (_toolCallId, params) => {
			const input = asParams(params);
			return toolResult({
				outcome: "persisted",
				record: createTask({
					origin: originFrom(input.origin),
					summary:
						typeof input.summary === "string" ? input.summary : "untitled task",
				}),
			});
		},
	});
	pi.registerTool({
		name: "task_batch_create",
		label: "Task Batch Create",
		description: "Create multiple durable sanitized tasks.",
		parameters: batchTaskParams,
		execute: async (_toolCallId, params) => {
			const input = asParams(params);
			const tasks = Array.isArray(input.tasks) ? input.tasks : [];
			return toolResult({
				outcome: "persisted",
				records: tasks.map((task) => {
					const item = asParams(task);
					return createTask({
						origin: originFrom(item.origin),
						summary:
							typeof item.summary === "string" ? item.summary : "untitled task",
					});
				}),
			});
		},
	});
	pi.registerTool({
		name: "task_list",
		label: "Task List",
		description: "List durable tasks.",
		parameters: emptyParams,
		execute: async () =>
			toolResult({
				outcome: "persisted",
				records: listTasks({ includeTombstones: true }),
			}),
	});
	pi.registerTool({
		name: "task_get",
		label: "Task Get",
		description: "Get one durable task.",
		parameters: taskIdParams,
		execute: async (_toolCallId, params) => {
			const id = asParams(params).id;
			const record = typeof id === "string" ? getTask(id) : null;
			return toolResult({
				outcome: record ? "persisted" : "not_found",
				record,
			});
		},
	});
	pi.registerTool({
		name: "task_update",
		label: "Task Update",
		description: "Update one durable task.",
		parameters: taskUpdateParams,
		execute: async (_toolCallId, params) => {
			const input = asParams(params);
			if (typeof input.id !== "string")
				return toolResult({ outcome: "not_found" });
			if (typeof input.state === "string")
				return toolResult(
					safeTransitionTask(input.id, input.state as TaskState),
				);
			try {
				return toolResult({
					outcome: "persisted",
					record: updateTask(input.id, {
						summary:
							typeof input.summary === "string" ? input.summary : undefined,
					}),
				});
			} catch (error) {
				return toolResult({
					outcome: "not_found",
					error: error instanceof Error ? error.message : String(error),
				});
			}
		},
	});
	for (const name of ["task_execute", "task_stop", "task_output"])
		pi.registerTool({
			name,
			label: name,
			description: "Deferred task execution tool; performs no execution.",
			parameters: taskIdParams,
			execute: async () => toolResult({ outcome: "deferred" }),
		});
}

export default function (pi: ExtensionAPI) {
	registerTaskTools(pi);
	pi.registerCommand("tasks", {
		description:
			"Task control plane. Use /tasks help for lifecycle, settings, and recovery commands.",
		handler: async (args, ctx) => {
			const parsed = parseTasksArgs(args);
			const all = listTasks({ includeTombstones: true });
			if (parsed.verb === "help") return ctx.ui.notify(helpText(), "info");
			if (parsed.verb === "settings") {
				if (parsed.mode && isTaskRenderMode(parsed.mode))
					ctx.ui.notify(
						`Task display mode: ${setTaskRenderMode(parsed.mode)}`,
						"info",
					);
				else
					ctx.ui.notify(
						`Task display mode: ${getTaskRenderMode()}. Use /tasks settings mode compact|full|hidden.`,
						"info",
					);
				return;
			}
			if (parsed.verb === "list")
				return ctx.ui.notify(
					formatTaskList(parsed.all ? all : listTasks(), getTaskRenderMode()),
					"info",
				);
			if (parsed.verb === "create") {
				const task = createTask({
					origin: "other",
					summary: sanitizeTaskValue(parsed.text || "untitled task"),
				});
				return ctx.ui.notify(
					`Created ${shortTaskId(task.id)}: ${truncateTaskText(task.summary, 80)}`,
					"info",
				);
			}
			if (parsed.verb === "clear")
				return ctx.ui.notify(
					`Cleared ${clearCompletedTasks().length} completed task(s).`,
					"info",
				);
			if (!parsed.idArg) return ctx.ui.notify(helpText(), "warning");
			const target = resolveTaskId(parsed.idArg, all);
			if (!target)
				return ctx.ui.notify(
					`No unique task found for "${parsed.idArg}".`,
					"warning",
				);
			if (parsed.verb === "show")
				return ctx.ui.notify(
					formatTaskDetail(getTask(target.id) ?? target),
					"info",
				);
			if (parsed.verb === "start")
				return notifyOutcome(
					ctx,
					"Started",
					safeTransitionTask(target.id, "running"),
				);
			if (parsed.verb === "complete")
				return notifyOutcome(
					ctx,
					"Completed",
					safeTransitionTask(target.id, "completed"),
				);
			if (parsed.verb === "skip")
				return notifyOutcome(
					ctx,
					"Skipped",
					safeTransitionTask(target.id, "skipped", { skipReason: parsed.text }),
				);
			if (parsed.verb === "cancel") {
				if (
					target.state === "completed" ||
					target.state === "cancelled" ||
					target.state === "skipped"
				) {
					return ctx.ui.notify(
						`Task ${shortTaskId(target.id)} is already ${target.state}.`,
						"warning",
					);
				}
				return notifyOutcome(
					ctx,
					"Cancelled",
					safeTransitionTask(target.id, "cancelled"),
				);
			}
			if (parsed.verb === "retry") {
				if (target.state !== "failed") {
					return ctx.ui.notify(
						`Retry only valid for failed tasks (this one is ${target.state}).`,
						"warning",
					);
				}
				const result = safeTransitionTask(target.id, "running");
				return ctx.ui.notify(
					result.outcome === "persisted" && result.record
						? `Reopened ${shortTaskId(target.id)} (retry x${result.record.retryCount}). This does not execute work.`
						: `Retry rejected: ${result.error ?? result.outcome}`,
					result.outcome === "persisted" ? "info" : "warning",
				);
			}
			return;
		},
	});
}
