import * as fs from "node:fs";
import * as path from "node:path";
import {
	type ExtensionAPI,
	truncateTail,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";
import { isAllowedTransition } from "../lib/operator-state.js";
import { wrapCommandRegistration } from "../lib/slash-command-echo.js";
import {
	type CreateTaskBatchInput,
	clearCompletedTasks,
	createTask,
	createTaskBatch,
	getTask,
	getUnmetBlockers,
	listTasks,
	partitionReadyTasks,
	resolveTaskWorkspace,
	retryTask,
	type SubagentTaskExecution,
	safeTransitionTask,
	startTask,
	type TaskOperationResult,
	type TaskRecordV1,
	type TaskState,
	type TransitionOptions,
	tasksByIdSnapshot,
	tombstoneTask,
	transitionTask,
	type UpdateTaskPatch,
	updateTask,
} from "../lib/task-registry.js";
import {
	formatTaskDetail,
	formatTaskList,
	formatTaskToolResult,
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
import {
	TaskExecutionCoordinator,
	type TaskExecutionResult,
	type TaskMultiResult,
} from "./tasks/execution.js";

export { formatTaskDetail, formatTaskList, groupTasksByUrgency };

const TASK_SUMMARY_MAX_LENGTH = 100;
const TASK_NOTES_MAX_LENGTH = 500;
const TASK_PROMPT_MAX_LENGTH = 2_000;
const TASK_PARENT_OUTPUT_MAX_BYTES = 2_000;
const TASK_PARENT_OUTPUT_MAX_LINES = 100;
const TASK_LIST_MODEL_MAX_ITEMS = 50;
const TASK_LIST_BLOCKER_MAX_ITEMS = 5;
const TASK_BATCH_MAX_ITEMS = 16;
const TASK_MULTI_MAX_ITEMS = 8;
const TASK_MULTI_CONTENT_MAX_BYTES = 4_096;
const TASK_MULTI_ERROR_MAX_CODE_POINTS = 200;
const TASK_BATCH_KEY_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

function validateTaskText(
	label: "summary" | "notes" | "skipReason" | "task",
	value: string,
	maxLength: number,
	oneLine = false,
): string {
	const trimmed = value.trim();
	if (trimmed.length > maxLength)
		throw new Error(`${label} must be at most ${maxLength} characters.`);
	if (oneLine && /[\r\n]/.test(trimmed))
		throw new Error(`${label} must be one line.`);
	return trimmed;
}

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

export class TaskLifecycleService {
	constructor(private readonly coordinator: TaskExecutionCoordinator) {}

	start(id: string): TaskOperationResult {
		const task = getTask(id);
		if (!task) return { outcome: "not_found", error: `task not found: ${id}` };
		const blocked = formatStartBlockedMessage(
			task,
			listTasks({ includeTombstones: true }),
		);
		if (blocked) return { outcome: "rejected", record: task, error: blocked };
		return startTask(id);
	}

	retry(id: string): TaskOperationResult {
		return retryTask(id);
	}

	skip(id: string, skipReason?: string): TaskOperationResult {
		return safeTransitionTask(id, "skipped", { skipReason });
	}

	async cancel(id: string): Promise<TaskOperationResult> {
		const task = getTask(id);
		if (!task) return { outcome: "not_found", error: `task not found: ${id}` };
		if (
			task.state === "completed" ||
			task.state === "cancelled" ||
			task.state === "skipped"
		)
			return {
				outcome: "rejected",
				record: task,
				error: `task is already ${task.state}`,
			};
		if (task.state === "running") {
			const stopped = await this.coordinator.stop(id);
			if (stopped.outcome === "failed_to_stop")
				return {
					outcome: "rejected",
					record: stopped.record ?? task,
					error: stopped.error ?? "active execution failed to stop",
				};
			const current = getTask(id);
			if (current?.state === "cancelled")
				return { outcome: "persisted", record: current };
		}
		return safeTransitionTask(id, "cancelled");
	}

	async transition(
		id: string,
		target: TaskState,
		opts: TransitionOptions = {},
	): Promise<TaskOperationResult> {
		if (target === "running") return this.start(id);
		if (target === "cancelled") return this.cancel(id);
		if (target === "skipped") return this.skip(id, opts.skipReason);
		return safeTransitionTask(id, target, opts);
	}
}

function toolResult(details: unknown, modelVisible: unknown = details) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(modelVisible) }],
		details,
	};
}

function compactTask(record: TaskRecordV1) {
	const blockedBy = record.blockedBy ?? [];
	return {
		id: record.id,
		state: record.state,
		summary: truncateTaskText(record.summary, TASK_SUMMARY_MAX_LENGTH),
		...(blockedBy.length
			? { blockedBy: blockedBy.slice(0, TASK_LIST_BLOCKER_MAX_ITEMS) }
			: {}),
		...(blockedBy.length > TASK_LIST_BLOCKER_MAX_ITEMS
			? { blockedByCount: blockedBy.length }
			: {}),
	};
}

function compactTaskCollection(
	records: TaskRecordV1[],
	includeSummaries = true,
) {
	const visible = records.slice(0, TASK_LIST_MODEL_MAX_ITEMS);
	return {
		outcome: "persisted",
		count: records.length,
		tasks: visible.map((record) =>
			includeSummaries
				? compactTask(record)
				: { id: record.id, state: record.state },
		),
		...(visible.length < records.length ? { truncated: true } : {}),
	};
}

function operationToolResult(
	result: TaskOperationResult | TaskExecutionResult,
	id?: string,
) {
	const resultId = result.record?.id ?? id;
	const error =
		result.error ??
		(result.outcome === "not_found" && resultId
			? `task not found: ${resultId}`
			: undefined);
	return toolResult(result, {
		outcome: result.outcome,
		...(resultId ? { id: resultId } : {}),
		...(result.record?.state ? { state: result.record.state } : {}),
		...(error ? { error } : {}),
	});
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

function originFrom(value: unknown): "subagent" | "shell" | "other" {
	return value === "subagent" || value === "shell" ? value : "other";
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
	const task = validateTaskText("task", input.task, TASK_PROMPT_MAX_LENGTH);
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
		task,
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

function taskInputFrom(
	input: Record<string, unknown>,
	cwd: string,
	batch = false,
): CreateTaskBatchInput {
	const execution = executionFrom(input, cwd);
	const summary = validateTaskText(
		"summary",
		typeof input.summary === "string"
			? input.summary
			: (execution?.task ?? "untitled task"),
		TASK_SUMMARY_MAX_LENGTH,
		true,
	);
	const notes =
		typeof input.notes === "string"
			? validateTaskText("notes", input.notes, TASK_NOTES_MAX_LENGTH)
			: undefined;
	const key = input.key;
	const blockedByKeys = input.blockedByKeys;
	if (
		batch &&
		key !== undefined &&
		(typeof key !== "string" || !TASK_BATCH_KEY_PATTERN.test(key))
	)
		throw new Error("key must match ^[A-Za-z0-9_-]{1,32}$");
	if (batch && blockedByKeys !== undefined && !Array.isArray(blockedByKeys))
		throw new Error("blockedByKeys must be an array");
	if (
		batch &&
		Array.isArray(blockedByKeys) &&
		(blockedByKeys.length > TASK_BATCH_MAX_ITEMS ||
			blockedByKeys.some((item) => typeof item !== "string"))
	)
		throw new Error("blockedByKeys must contain at most 16 strings");
	if (
		batch &&
		input.blockedBy !== undefined &&
		(!Array.isArray(input.blockedBy) ||
			input.blockedBy.length > TASK_BATCH_MAX_ITEMS ||
			input.blockedBy.some((item) => typeof item !== "string"))
	)
		throw new Error("blockedBy must contain at most 16 strings");
	return {
		origin: originFrom(input.origin),
		summary,
		agentName: execution?.agent,
		prompt: execution?.task,
		execution,
		workspace: resolveTaskWorkspace(cwd),
		notes,
		blockedBy: batch
			? (input.blockedBy as string[] | undefined)
			: validatedBlockers(input.blockedBy),
		...(batch && typeof key === "string" ? { key } : {}),
		...(batch && Array.isArray(blockedByKeys)
			? { blockedByKeys: blockedByKeys as string[] }
			: {}),
	};
}

function createTaskFromInput(
	input: Record<string, unknown>,
	cwd: string,
): TaskRecordV1 {
	return createTask(taskInputFrom(input, cwd));
}

function validateMultiIds(value: unknown): string[] {
	if (
		!Array.isArray(value) ||
		value.length < 1 ||
		value.length > TASK_MULTI_MAX_ITEMS
	)
		throw new Error("ids must contain between 1 and 8 entries");
	const ids = value.map((item) => {
		if (typeof item !== "string" || item.length < 1 || item.length > 64)
			throw new Error("ids entries must contain between 1 and 64 characters");
		return item;
	});
	if (new Set(ids).size !== ids.length) throw new Error("duplicate task id");
	return ids;
}

function codePointPrefix(value: string, maxCodePoints: number): string {
	return [...value].slice(0, maxCodePoints).join("");
}

function fitOptionalField(
	envelope: Record<string, unknown>,
	entry: Record<string, unknown>,
	field: "outputPath" | "error",
	value: string,
): void {
	const fits = (candidate: string): boolean => {
		entry[field] = candidate;
		return (
			Buffer.byteLength(JSON.stringify(envelope), "utf8") <=
			TASK_MULTI_CONTENT_MAX_BYTES
		);
	};
	if (fits(value)) return;
	const points = [...value];
	let low = 0;
	let high = points.length;
	let best: string | undefined;
	while (low <= high) {
		const middle = Math.floor((low + high) / 2);
		const candidate = `${points.slice(0, middle).join("")}...`;
		if (fits(candidate)) {
			best = candidate;
			low = middle + 1;
		} else high = middle - 1;
	}
	if (best !== undefined) entry[field] = best;
	else delete entry[field];
}

function multiToolResult(
	outcome: "accepted" | "partial" | "rejected" | "persisted" | "aborted",
	results: TaskMultiResult[],
) {
	const visibleResults: Array<Record<string, unknown>> = results.map(
		(result) => ({
			id: result.id,
			classification: result.classification,
			...(result.state ? { state: result.state } : {}),
		}),
	);
	const envelope: Record<string, unknown> = {
		outcome,
		count: results.length,
		results: visibleResults,
	};
	if (
		Buffer.byteLength(JSON.stringify(envelope), "utf8") >
		TASK_MULTI_CONTENT_MAX_BYTES
	)
		throw new Error("mandatory multi-task result exceeds content budget");
	for (let index = 0; index < results.length; index++) {
		const result = results[index];
		const outputPath =
			result.classification === "terminal"
				? result.record?.execution?.outputPath
				: undefined;
		if (outputPath)
			fitOptionalField(
				envelope,
				visibleResults[index],
				"outputPath",
				outputPath,
			);
	}
	for (let index = 0; index < results.length; index++) {
		const error = results[index].error;
		if (error)
			fitOptionalField(
				envelope,
				visibleResults[index],
				"error",
				codePointPrefix(error, TASK_MULTI_ERROR_MAX_CODE_POINTS),
			);
	}
	const text = JSON.stringify(envelope);
	if (Buffer.byteLength(text, "utf8") > TASK_MULTI_CONTENT_MAX_BYTES)
		throw new Error("multi-task result exceeds content budget");
	return {
		content: [{ type: "text" as const, text }],
		details: { outcome, results },
	};
}

function scopedMultiResult(
	id: string,
	workspace: string,
): TaskMultiResult | undefined {
	const record = getTask(id);
	if (!record) return { id, classification: "missing" };
	if (record.workspace && record.workspace !== workspace)
		return { id, classification: "foreign_workspace" };
	return undefined;
}

function taskOutputResult(coordinator: TaskExecutionCoordinator, id: string) {
	const result = coordinator.output(id);
	const execution = result.record?.execution;
	const output = result.output ?? "(no output available)";
	const parentOutput = truncateTail(output, {
		maxBytes: TASK_PARENT_OUTPUT_MAX_BYTES,
		maxLines: TASK_PARENT_OUTPUT_MAX_LINES,
	});
	const useArtifact = Boolean(
		execution?.outputPath && (result.truncated || parentOutput.truncated),
	);
	const metadata = {
		outcome: result.outcome,
		id: result.record?.id ?? id,
		state: result.record?.state,
		...(result.outcome === "not_found"
			? { error: result.error ?? `task not found: ${id}` }
			: result.error
				? { error: result.error }
				: {}),
		truncated: result.truncated === true || parentOutput.truncated,
		...(useArtifact ? { output: "file-only" } : {}),
		execution: execution
			? {
					status: execution.status,
					outputPath: execution.outputPath,
					outputError: execution.outputError,
				}
			: undefined,
	};
	return {
		content: [
			{
				type: "text" as const,
				text: useArtifact
					? JSON.stringify(metadata)
					: `${parentOutput.content}\n\n${JSON.stringify(metadata)}`,
			},
		],
		details: result,
	};
}

export function registerTaskTools(
	pi: ExtensionAPI,
	coordinator: TaskExecutionCoordinator,
): void {
	const lifecycle = new TaskLifecycleService(coordinator);
	const taskItem = Type.Object(
		{
			origin: Type.Optional(
				Type.Union([
					Type.Literal("subagent"),
					Type.Literal("shell"),
					Type.Literal("other"),
				]),
			),
			summary: Type.Optional(
				Type.String({ maxLength: TASK_SUMMARY_MAX_LENGTH }),
			),
			notes: Type.Optional(Type.String({ maxLength: TASK_NOTES_MAX_LENGTH })),
			key: Type.Optional(Type.String({ pattern: "^[A-Za-z0-9_-]{1,32}$" })),
			blockedBy: Type.Optional(
				Type.Array(Type.String({ minLength: 1, maxLength: 64 }), {
					maxItems: TASK_BATCH_MAX_ITEMS,
				}),
			),
			blockedByKeys: Type.Optional(
				Type.Array(Type.String({ pattern: "^[A-Za-z0-9_-]{1,32}$" }), {
					maxItems: TASK_BATCH_MAX_ITEMS,
				}),
			),
			agent: Type.Optional(Type.String()),
			task: Type.Optional(Type.String({ maxLength: TASK_PROMPT_MAX_LENGTH })),
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
				Type.Literal("execute_many"),
				Type.Literal("await"),
				Type.Literal("stop"),
				Type.Literal("output"),
			]),
			id: Type.Optional(Type.String()),
			ids: Type.Optional(
				Type.Array(Type.String({ minLength: 1, maxLength: 64 }), {
					minItems: 1,
					maxItems: TASK_MULTI_MAX_ITEMS,
				}),
			),
			summary: Type.Optional(
				Type.String({ maxLength: TASK_SUMMARY_MAX_LENGTH }),
			),
			notes: Type.Optional(Type.String({ maxLength: TASK_NOTES_MAX_LENGTH })),
			state: Type.Optional(Type.String()),
			skipReason: Type.Optional(
				Type.String({ maxLength: TASK_NOTES_MAX_LENGTH }),
			),
			blockedBy: Type.Optional(Type.Array(Type.String())),
			all: Type.Optional(Type.Boolean()),
			origin: Type.Optional(taskItem.properties.origin),
			agent: Type.Optional(Type.String()),
			task: Type.Optional(Type.String({ maxLength: TASK_PROMPT_MAX_LENGTH })),
			cwd: Type.Optional(Type.String()),
			agentScope: Type.Optional(taskItem.properties.agentScope),
			model: Type.Optional(Type.String()),
			modelSize: Type.Optional(taskItem.properties.modelSize),
			tasks: Type.Optional(
				Type.Array(taskItem, {
					minItems: 0,
					maxItems: TASK_BATCH_MAX_ITEMS,
				}),
			),
		},
		{ additionalProperties: true },
	);
	pi.registerTool({
		name: "task",
		label: "Task",
		description:
			"Unified durable task surface for dependencies and background work. Task entries are index cards, not handoff documents: summary is a one-line deliverable, notes hold only blockers, dependencies, or acceptance checks, and detailed context belongs in a referenced artifact.",
		promptSnippet:
			"Manage durable planning tasks and background subagent execution through one task surface",
		promptGuidelines: [
			"Durable task records are optional and valid for user-requested lists, main-thread tracking, dependencies, cross-turn work, and background execution; ordinary multi-step work can remain prose.",
			"Task entries are index cards, not handoff documents: keep summary under 100 characters and notes under 500; put detailed context in an artifact and reference its path.",
			"Summary contains only the deliverable; notes contain only blockers, dependencies, or acceptance checks. Never copy conversation summaries, plans, diffs, or investigation narratives into task fields.",
			"Create dependencies with blockedBy; use ready once when selecting runnable work.",
			"For direct durable work, update state only when it changes; do not repeat lifecycle calls.",
			"For background work, create executable tasks, start them once with execute or execute_many, and join same-session work once with await; use output only when needed and stop only to cancel. Do not poll public task actions.",
		],
		parameters,
		renderCall(args, theme) {
			const input = asParams(args);
			const action = input.action;
			const id = typeof input.id === "string" ? input.id : undefined;
			const hint =
				typeof input.summary === "string"
					? input.summary
					: typeof input.task === "string"
						? input.task
						: Array.isArray(input.tasks)
							? `${input.tasks.length} task(s)`
							: undefined;
			return new Text(
				theme.fg("toolTitle", theme.bold("task ")) +
					theme.fg("muted", String(action)) +
					(id ? theme.fg("dim", ` ${shortTaskId(id)}`) : "") +
					(hint ? theme.fg("dim", ` ${truncateTaskText(hint, 60)}`) : ""),
				0,
				0,
			);
		},
		renderResult(result, { expanded }, theme) {
			if (result.details == null) {
				const text = result.content
					.filter((item) => item.type === "text")
					.map((item) => item.text)
					.join("\n");
				if (text) return new Text(theme.fg("warning", text), 0, 0);
			}
			const { text, failed } = formatTaskToolResult(result.details, expanded);
			return new Text(theme.fg(failed ? "warning" : "dim", text), 0, 0);
		},
		execute: async (_toolCallId, params, signal, _onUpdate, ctx) => {
			const input = asParams(params);
			const action = input.action;
			const workspace = resolveTaskWorkspace(ctx.cwd);
			if (action === "create")
				return operationToolResult({
					outcome: "persisted",
					record: createTaskFromInput(input, ctx.cwd),
				});
			if (action === "batch") {
				if (input.tasks !== undefined && !Array.isArray(input.tasks))
					throw new Error("tasks must be an array");
				const tasks = Array.isArray(input.tasks) ? input.tasks : [];
				if (tasks.length > TASK_BATCH_MAX_ITEMS)
					throw new Error("batch may contain at most 16 tasks");
				const batchInputs = tasks.map((item) => {
					if (!item || typeof item !== "object" || Array.isArray(item))
						throw new Error("batch task must be an object");
					return taskInputFrom(asParams(item), ctx.cwd, true);
				});
				const result = createTaskBatch(batchInputs, workspace);
				if (result.outcome === "write_failed") {
					const visible = {
						...result,
						error: codePointPrefix(
							result.error,
							TASK_MULTI_ERROR_MAX_CODE_POINTS,
						),
					};
					const text = JSON.stringify(visible);
					if (Buffer.byteLength(text, "utf8") > TASK_MULTI_CONTENT_MAX_BYTES)
						throw new Error("batch failure result exceeds content budget");
					return {
						content: [{ type: "text" as const, text }],
						details: result,
					};
				}
				const visible = {
					outcome: result.outcome,
					count: result.records.length,
					tasks: result.records.map((record, index) => ({
						...(batchInputs[index]?.key ? { key: batchInputs[index].key } : {}),
						id: record.id,
						state: record.state,
					})),
				};
				const text = JSON.stringify(visible);
				if (Buffer.byteLength(text, "utf8") > TASK_MULTI_CONTENT_MAX_BYTES)
					throw new Error("batch result exceeds content budget");
				return {
					content: [{ type: "text" as const, text }],
					details: {
						outcome: result.outcome,
						records: result.records,
						aliases: result.aliases,
					},
				};
			}
			if (action === "list" || action === "ready") {
				const allRecords = listTasks({ includeTombstones: false });
				const records =
					input.all === true
						? allRecords
						: allRecords.filter(
								(record) => !record.workspace || record.workspace === workspace,
							);
				const selected =
					action === "ready" ? partitionReadyTasks(records).ready : records;
				return toolResult(
					{ outcome: "persisted", records: selected },
					compactTaskCollection(selected),
				);
			}
			if (action === "execute_many" || action === "await") {
				const ids = validateMultiIds(input.ids);
				const fixed = new Map<string, TaskMultiResult>();
				const authorized: string[] = [];
				for (const id of ids) {
					const scoped = scopedMultiResult(id, workspace);
					if (scoped) fixed.set(id, scoped);
					else authorized.push(id);
				}
				const coordinated =
					action === "execute_many"
						? coordinator.startMany(authorized, ctx.cwd)
						: await coordinator.wait(authorized, signal);
				const coordinatedById = new Map(
					coordinated.results.map((result) => [result.id, result]),
				);
				const results = ids.map(
					(id) => fixed.get(id) ?? coordinatedById.get(id),
				);
				if (results.some((result) => result === undefined))
					throw new Error("coordinator omitted a task result");
				const complete = results as TaskMultiResult[];
				if (action === "await")
					return multiToolResult(
						complete.some((result) => result.classification === "aborted")
							? "aborted"
							: "persisted",
						complete,
					);
				const started = complete.filter(
					(result) => result.classification === "started",
				).length;
				return multiToolResult(
					started === complete.length
						? "accepted"
						: started > 0
							? "partial"
							: "rejected",
					complete,
				);
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
					return operationToolResult({
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
				const existing = getTask(id);
				if (!existing)
					return toolResult({
						outcome: "not_found",
						error: `task not found: ${id}`,
					});
				let patch: UpdateTaskPatch;
				let skipReason: string | undefined;
				try {
					patch = {
						summary:
							typeof input.summary === "string"
								? validateTaskText(
										"summary",
										input.summary,
										TASK_SUMMARY_MAX_LENGTH,
										true,
									)
								: undefined,
						notes:
							typeof input.notes === "string"
								? validateTaskText("notes", input.notes, TASK_NOTES_MAX_LENGTH)
								: undefined,
						blockedBy: validatedBlockers(input.blockedBy),
					};
					skipReason =
						typeof input.skipReason === "string"
							? validateTaskText(
									"skipReason",
									input.skipReason,
									TASK_NOTES_MAX_LENGTH,
								)
							: undefined;
				} catch (error) {
					return toolResult({
						outcome: "rejected",
						error: error instanceof Error ? error.message : String(error),
					});
				}
				const target =
					typeof input.state === "string"
						? (input.state as TaskState)
						: undefined;
				if (skipReason !== undefined && target !== "skipped")
					return toolResult({
						outcome: "rejected",
						error: "skipReason requires state skipped",
					});
				if (target) {
					if (
						(target === existing.state && target !== "skipped") ||
						(target !== existing.state &&
							!isAllowedTransition(existing.state, target))
					)
						return toolResult({
							outcome: "rejected",
							error: `invalid transition for ${id}: ${existing.state} -> ${input.state}`,
						});
					if (target === "running") {
						const candidate = {
							...existing,
							blockedBy: patch.blockedBy ?? existing.blockedBy,
						};
						const blocked = formatStartBlockedMessage(
							candidate,
							listTasks({ includeTombstones: true }),
						);
						if (blocked)
							return operationToolResult({
								outcome: "rejected",
								record: existing,
								error: blocked,
							});
					}
				}
				try {
					const record = updateTask(id, patch);
					if (target) {
						const transition = await lifecycle.transition(id, target, {
							skipReason,
						});
						if (transition.outcome !== "persisted")
							return operationToolResult(transition, id);
						return operationToolResult({
							outcome: "persisted",
							record: transition.record,
						});
					}
					return operationToolResult({ outcome: "persisted", record });
				} catch (error) {
					return toolResult({
						outcome: "rejected",
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}
			if (action === "execute")
				return operationToolResult(coordinator.start(id, ctx.cwd), id);
			if (action === "stop")
				return operationToolResult(await lifecycle.cancel(id), id);
			if (action === "output") return taskOutputResult(coordinator, id);
			return toolResult({ outcome: "rejected", error: "unknown action" });
		},
	});
}

export function registerTasksCommand(
	pi: ExtensionAPI,
	coordinator: TaskExecutionCoordinator,
): void {
	const lifecycle = new TaskLifecycleService(coordinator);
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
				return ctx.ui.notify(formatTaskList(all, getTaskRenderMode()), "info");
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
				try {
					const task = createTask({
						origin: "other",
						summary: validateTaskText(
							"summary",
							sanitizeTaskValue(parsed.text || "untitled task"),
							TASK_SUMMARY_MAX_LENGTH,
							true,
						),
						workspace: resolveTaskWorkspace(ctx.cwd),
					});
					return ctx.ui.notify(
						`Created ${shortTaskId(task.id)}: ${truncateTaskText(task.summary, 80)}`,
						"info",
					);
				} catch (error) {
					return ctx.ui.notify(
						error instanceof Error ? error.message : String(error),
						"warning",
					);
				}
			}
			if (parsed.verb === "clear")
				return ctx.ui.notify(
					`Cleared ${clearCompletedTasks(resolveTaskWorkspace(ctx.cwd)).length} completed task(s).`,
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
			if (parsed.verb === "start")
				return notifyOutcome(ctx, "Started", lifecycle.start(target.id));
			if (parsed.verb === "complete")
				return notifyOutcome(
					ctx,
					"Completed",
					await lifecycle.transition(target.id, "completed"),
				);
			if (parsed.verb === "skip")
				return notifyOutcome(
					ctx,
					"Skipped",
					lifecycle.skip(target.id, parsed.text),
				);
			if (parsed.verb === "cancel")
				return notifyOutcome(
					ctx,
					"Cancelled",
					await lifecycle.cancel(target.id),
				);
			if (parsed.verb === "retry") {
				const result = lifecycle.retry(target.id);
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

export default function (pi: ExtensionAPI) {
	wrapCommandRegistration(pi);
	const coordinator = new TaskExecutionCoordinator();
	registerTaskTools(pi, coordinator);
	registerTasksCommand(pi, coordinator);
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
}
