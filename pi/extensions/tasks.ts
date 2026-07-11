import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
	clearCompletedTasks,
	createTask,
	getTask,
	getUnmetBlockers,
	listTasks,
	partitionReadyTasks,
	resolveTaskWorkspace,
	type SubagentTaskExecution,
	safeTransitionTask,
	type TaskRecordV1,
	type TaskState,
	tasksByIdSnapshot,
	tombstoneTask,
	transitionTask,
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
import { TaskExecutionCoordinator } from "./tasks/execution.js";

export { formatTaskDetail, formatTaskList, groupTasksByUrgency };

interface ParsedSubcommand {
	verb:
		| "list"
		| "ready"
		| "blocked"
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
	if (head === "ready") return { verb: "ready" };
	if (head === "blocked") return { verb: "blocked" };
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
	return "Usage: /tasks|/tasks list [--all]|ready|blocked|show <id>|create <summary>|start <id>|complete <id>|skip <id> [reason]|cancel <id>|retry <id>|reopen <id>|clear completed|settings mode compact|full|hidden. Examples: /tasks ready (what can I work on now?), /tasks blocked (why can't this start?). Retry/reopen does not execute work.";
}

function formatBlockedView(tasks: readonly TaskRecordV1[]): string {
	const byId = tasksByIdSnapshot(tasks);
	const { waiting, blocked } = partitionReadyTasks(tasks);
	const rows = [...waiting, ...blocked];
	if (rows.length === 0) return "No waiting or blocked tasks.";
	return rows
		.map((task) => {
			const unmet = getUnmetBlockers(task, byId);
			const blockers = unmet.length
				? unmet
						.map((item) => {
							const summary = item.task?.summary
								? ` ${truncateTaskText(item.task.summary, 80)}`
								: "";
							const hint =
								item.status === "missing" || item.status === "tombstoned"
									? " Next: update/remove the stale dependency when a dependency-edit command is available."
									: "";
							return `${shortTaskId(item.id)} (${item.status})${summary}.${hint}`;
						})
						.join(" ")
				: "explicit blocked state";
			return `${shortTaskId(task.id)} ${truncateTaskText(task.summary, 80)} -- waiting on ${blockers} Next: /tasks show ${shortTaskId(task.id)} or /tasks blocked`;
		})
		.join("\n");
}

function formatStartBlockedMessage(
	task: TaskRecordV1,
	tasks: readonly TaskRecordV1[],
): string | null {
	const unmet = getUnmetBlockers(task, tasksByIdSnapshot(tasks));
	if (unmet.length === 0) return null;
	const blocker = unmet[0];
	const summary = blocker.task?.summary
		? ` ${truncateTaskText(blocker.task.summary, 80)}`
		: "";
	const recovery =
		blocker.status === "missing" || blocker.status === "tombstoned"
			? " Recovery: dependency is stale; update/remove it when a dependency-edit command is available."
			: "";
	return `Cannot start ${shortTaskId(task.id)}: waiting on ${shortTaskId(blocker.id)} (${blocker.status})${summary}. Next: /tasks show ${shortTaskId(blocker.id)} or /tasks blocked.${recovery}`;
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

interface LegacyTodoItem {
	id: string;
	title: string;
	status: "pending" | "in_progress" | "done" | "blocked";
	depends_on?: string[];
	notes?: string;
}

function isLegacyTodoItem(value: unknown): value is LegacyTodoItem {
	if (!value || typeof value !== "object") return false;
	const item = value as Record<string, unknown>;
	return (
		typeof item.id === "string" &&
		typeof item.title === "string" &&
		["pending", "in_progress", "done", "blocked"].includes(String(item.status))
	);
}

export function importLegacyTodos(
	cwd: string,
	sourceDir = cwd,
): TaskRecordV1[] {
	const filePath = path.join(sourceDir, ".pi", "todo.json");
	if (!fs.existsSync(filePath)) return [];
	const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as {
		items?: unknown[];
	};
	const items = Array.isArray(parsed.items)
		? parsed.items.filter(isLegacyTodoItem)
		: [];
	const workspace = resolveTaskWorkspace(cwd);
	const existing = listTasks({ includeTombstones: true });
	const byLegacyId = new Map<string, TaskRecordV1>();
	for (const record of existing) {
		if (
			record.metadata?.legacyTodoWorkspace === workspace &&
			typeof record.metadata.legacyTodoId === "string"
		)
			byLegacyId.set(record.metadata.legacyTodoId, record);
	}
	const imported: TaskRecordV1[] = [];
	const newlyCreated = new Set<string>();
	for (const item of items) {
		if (byLegacyId.has(item.id)) continue;
		const record = createTask({
			origin: "other",
			summary: item.title,
			notes: item.notes,
			workspace,
			metadata: {
				legacyTodoId: item.id,
				legacyTodoWorkspace: workspace,
				legacyTodoImportedAt: new Date().toISOString(),
			},
		});
		byLegacyId.set(item.id, record);
		newlyCreated.add(record.id);
		imported.push(record);
	}
	for (const item of items) {
		const record = byLegacyId.get(item.id);
		if (!record || !newlyCreated.has(record.id)) continue;
		const blockedBy = (item.depends_on ?? [])
			.map((id) => byLegacyId.get(id)?.id)
			.filter((id): id is string => Boolean(id));
		updateTask(record.id, { blockedBy });
		if (item.status === "in_progress") transitionTask(record.id, "running");
		if (item.status === "done") {
			transitionTask(record.id, "running");
			transitionTask(record.id, "completed");
		}
	}
	return imported.map((record) => getTask(record.id) ?? record);
}

function originFrom(value: unknown): "subagent" | "team" | "shell" | "other" {
	return value === "subagent" || value === "team" || value === "shell"
		? value
		: "other";
}

function executionFrom(
	input: Record<string, unknown>,
	fallbackCwd: string,
): SubagentTaskExecution | undefined {
	const hasExecution = input.agent !== undefined || input.task !== undefined;
	if (!hasExecution) return undefined;
	if (typeof input.agent !== "string" || !input.agent.trim())
		throw new Error("Executable tasks require a non-empty agent.");
	if (typeof input.task !== "string" || !input.task.trim())
		throw new Error("Executable tasks require a non-empty task.");
	const agentScope =
		input.agentScope === "project" || input.agentScope === "both"
			? input.agentScope
			: "user";
	const modelSize =
		input.modelSize === "small" ||
		input.modelSize === "medium" ||
		input.modelSize === "large"
			? input.modelSize
			: undefined;
	return {
		kind: "subagent",
		agent: input.agent,
		task: input.task,
		cwd:
			typeof input.cwd === "string" && input.cwd.trim()
				? input.cwd
				: fallbackCwd,
		agentScope,
		model:
			typeof input.model === "string" && input.model.trim()
				? input.model
				: undefined,
		modelSize,
		status: "pending",
	};
}

function validatedBlockers(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const ids = value.filter((item): item is string => typeof item === "string");
	for (const id of ids) {
		if (!getTask(id)) throw new Error(`task dependency not found: ${id}`);
	}
	return ids;
}

function createTaskFromInput(
	input: Record<string, unknown>,
	cwd: string,
): TaskRecordV1 {
	const execution = executionFrom(input, cwd);
	return createTask({
		origin: originFrom(input.origin),
		summary:
			typeof input.summary === "string"
				? input.summary
				: (execution?.task ?? "untitled task"),
		agentName: execution?.agent,
		prompt: execution?.task,
		execution,
		workspace: resolveTaskWorkspace(cwd),
		notes: typeof input.notes === "string" ? input.notes : undefined,
		blockedBy: validatedBlockers(input.blockedBy),
	});
}

function taskOutputResult(coordinator: TaskExecutionCoordinator, id: string) {
	const result = coordinator.output(id);
	const execution = result.record?.execution;
	return {
		content: [
			{
				type: "text" as const,
				text: `${result.output ?? "(no output available)"}\n\n${JSON.stringify({
					outcome: result.outcome,
					truncated: result.truncated,
					execution: execution
						? {
								status: execution.status,
								agent: execution.agent,
								model: execution.model,
								modelSize: execution.modelSize,
								outputPath: execution.outputPath,
								outputError: execution.outputError,
							}
						: undefined,
				})}`,
			},
		],
		details: result,
	};
}

export function registerTaskTools(
	pi: ExtensionAPI,
	coordinator: TaskExecutionCoordinator,
): void {
	const taskItem = Type.Object(
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
			notes: Type.Optional(Type.String()),
			blockedBy: Type.Optional(Type.Array(Type.String())),
			agent: Type.Optional(Type.String()),
			task: Type.Optional(Type.String()),
			cwd: Type.Optional(Type.String()),
			agentScope: Type.Optional(
				Type.Union([
					Type.Literal("user"),
					Type.Literal("project"),
					Type.Literal("both"),
				]),
			),
			model: Type.Optional(Type.String()),
			modelSize: Type.Optional(
				Type.Union([
					Type.Literal("small"),
					Type.Literal("medium"),
					Type.Literal("large"),
				]),
			),
		},
		{ additionalProperties: true },
	);
	const parameters = Type.Object(
		{
			action: Type.Union([
				Type.Literal("create"),
				Type.Literal("batch"),
				Type.Literal("update"),
				Type.Literal("remove"),
				Type.Literal("list"),
				Type.Literal("ready"),
				Type.Literal("get"),
				Type.Literal("execute"),
				Type.Literal("stop"),
				Type.Literal("output"),
			]),
			id: Type.Optional(Type.String()),
			summary: Type.Optional(Type.String()),
			notes: Type.Optional(Type.String()),
			state: Type.Optional(Type.String()),
			blockedBy: Type.Optional(Type.Array(Type.String())),
			all: Type.Optional(Type.Boolean()),
			origin: Type.Optional(taskItem.properties.origin),
			agent: Type.Optional(Type.String()),
			task: Type.Optional(Type.String()),
			cwd: Type.Optional(Type.String()),
			agentScope: Type.Optional(taskItem.properties.agentScope),
			model: Type.Optional(Type.String()),
			modelSize: Type.Optional(taskItem.properties.modelSize),
			tasks: Type.Optional(Type.Array(taskItem)),
		},
		{ additionalProperties: true },
	);
	pi.registerTool({
		name: "task",
		label: "Task",
		description:
			"Unified durable task surface. Actions create, batch, update, remove, list, ready, get, execute, stop, and output manage planning and background subagent work in one registry.",
		promptSnippet:
			"Manage durable planning tasks and background subagent execution through one task surface",
		promptGuidelines: [
			"Use task for multi-step work, dependencies, and background execution.",
			"Create dependencies with blockedBy; use ready to find parallelizable work.",
			"Set state to running when direct work starts and completed when it finishes.",
			"For background work, create an executable task and then use execute; inspect it with output and cancel it with stop.",
		],
		parameters,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			const input = asParams(params);
			const action = input.action;
			const workspace = resolveTaskWorkspace(ctx.cwd);
			if (action === "create")
				return toolResult({
					outcome: "persisted",
					record: createTaskFromInput(input, ctx.cwd),
				});
			if (action === "batch") {
				const tasks = Array.isArray(input.tasks) ? input.tasks : [];
				return toolResult({
					outcome: "persisted",
					records: tasks.map((item) =>
						createTaskFromInput(asParams(item), ctx.cwd),
					),
				});
			}
			if (action === "list" || action === "ready") {
				const allRecords = listTasks({ includeTombstones: false });
				const records =
					input.all === true
						? allRecords
						: allRecords.filter(
								(record) => !record.workspace || record.workspace === workspace,
							);
				return toolResult({
					outcome: "persisted",
					records:
						action === "ready" ? partitionReadyTasks(records).ready : records,
				});
			}
			const id = typeof input.id === "string" ? input.id : undefined;
			if (!id)
				return toolResult({
					outcome: "not_found",
					error: `task id is required for ${String(action)}`,
				});
			if (action === "get") {
				const record = getTask(id);
				return toolResult({
					outcome: record ? "persisted" : "not_found",
					record,
				});
			}
			if (action === "remove") {
				try {
					return toolResult({
						outcome: "persisted",
						record: tombstoneTask(id),
					});
				} catch (error) {
					return toolResult({
						outcome: "not_found",
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}
			if (action === "update") {
				if (typeof input.state === "string") {
					const transition = safeTransitionTask(id, input.state as TaskState);
					if (transition.outcome !== "persisted") return toolResult(transition);
				}
				try {
					return toolResult({
						outcome: "persisted",
						record: updateTask(id, {
							summary:
								typeof input.summary === "string" ? input.summary : undefined,
							notes: typeof input.notes === "string" ? input.notes : undefined,
							blockedBy: validatedBlockers(input.blockedBy),
						}),
					});
				} catch (error) {
					return toolResult({
						outcome: "not_found",
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}
			if (action === "execute")
				return toolResult(coordinator.start(id, ctx.cwd));
			if (action === "stop") return toolResult(await coordinator.stop(id));
			if (action === "output") return taskOutputResult(coordinator, id);
			return toolResult({ outcome: "rejected", error: "unknown action" });
		},
	});
}

export default function (pi: ExtensionAPI) {
	const coordinator = new TaskExecutionCoordinator();
	registerTaskTools(pi, coordinator);
	pi.on("session_start", (_event, ctx) => {
		try {
			importLegacyTodos(
				ctx.cwd,
				process.env.PI_LEGACY_TODO_SOURCE_DIR || ctx.cwd,
			);
		} catch (error) {
			ctx.ui.notify(
				`Legacy task migration failed: ${error instanceof Error ? error.message : String(error)}`,
				"warning",
			);
		}
		coordinator.reconcileOrphans();
	});
	pi.on("session_shutdown", async () => coordinator.shutdown());
	pi.registerCommand("tasks", {
		description:
			"Task control plane. Use /tasks help for lifecycle, settings, and recovery commands.",
		handler: async (args, ctx) => {
			const parsed = parseTasksArgs(args);
			const allTasks = listTasks({ includeTombstones: true });
			const scopedTasks = allTasks.filter(
				(task) =>
					!task.workspace || task.workspace === resolveTaskWorkspace(ctx.cwd),
			);
			const all = parsed.all ? allTasks : scopedTasks;
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
			if (parsed.verb === "ready") {
				const ready = partitionReadyTasks(all).ready;
				return ctx.ui.notify(
					ready.length > 0
						? formatTaskList(ready, getTaskRenderMode())
						: "No ready pending tasks.",
					"info",
				);
			}
			if (parsed.verb === "blocked")
				return ctx.ui.notify(formatBlockedView(all), "info");
			if (parsed.verb === "create") {
				const task = createTask({
					origin: "other",
					summary: sanitizeTaskValue(parsed.text || "untitled task"),
					workspace: resolveTaskWorkspace(ctx.cwd),
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
			const target = resolveTaskId(parsed.idArg, allTasks);
			if (!target)
				return ctx.ui.notify(
					`No unique task found for "${parsed.idArg}".`,
					"warning",
				);
			if (parsed.verb === "show")
				return ctx.ui.notify(
					formatTaskDetail(
						getTask(target.id) ?? target,
						tasksByIdSnapshot(allTasks),
					),
					"info",
				);
			if (parsed.verb === "start") {
				const blockedMessage = formatStartBlockedMessage(target, all);
				if (blockedMessage) return ctx.ui.notify(blockedMessage, "warning");
				return notifyOutcome(
					ctx,
					"Started",
					safeTransitionTask(target.id, "running"),
				);
			}
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
