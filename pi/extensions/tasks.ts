import { onSessionStart } from "../lib/session-start-metrics.js";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { type Static, Type } from "typebox";
import {
	getOperatorStateDir,
	isAllowedTransition,
	TASK_STATES,
	TERMINAL_TASK_STATES,
} from "../lib/operator-state.js";
import {
	type CreateTaskBatchInput,
	clearCompletedTasks,
	createTask,
	createTaskBatch,
	getTask,
	getTaskReadiness,
	getUnmetBlockers,
	TASK_OUTCOME_EVIDENCE_MAX_LENGTH,
	TASK_OUTCOME_GAPS_MAX_LENGTH,
	TASK_OUTCOME_SUMMARY_MAX_LENGTH,
	TASK_OUTCOME_VALIDATION_MAX_LENGTH,
	TASK_OUTCOME_MAX_EVIDENCE_ITEMS,
	TASK_OUTCOME_MAX_VALIDATION_ITEMS,
	TASK_OUTCOME_MAX_GAPS_ITEMS,
	listTasks,
	normalizeTaskScope,
	partitionReadyTasks,
	pruneTaskRegistry,
	resolveTaskWorkspace,
	retryTask,
	safeTransitionTask,
	startTask,
	type TaskOperationResult,
	type TaskOutcome,
	type TaskReadiness,
	type TaskRecordV1,
	type TaskState,
	type TransitionOptions,
	tasksByIdSnapshot,
	tombstoneTask,
	transitionTask,
	type UpdateTaskPatch,
	updateAndTransitionTask,
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
import { isTaskStoreUnavailable } from "../lib/task-store.js";
import { appendRuntimeContext } from "../lib/runtime-context.js";
import {
	getTaskRenderMode,
	isTaskRenderMode,
	setTaskRenderMode,
} from "../lib/task-settings.js";
export { formatTaskDetail, formatTaskList, groupTasksByUrgency };

const TASK_SUMMARY_MAX_LENGTH = 100;
const TASK_INSTRUCTIONS_MAX_LENGTH = 500;
const TASK_LIST_MODEL_MAX_ITEMS = 50;
const TASK_LIST_BLOCKER_MAX_ITEMS = 5;
const TASK_BATCH_MAX_ITEMS = 16;
const TASK_BATCH_RESULT_MAX_BYTES = 4_096;
const TASK_BATCH_ERROR_MAX_CODE_POINTS = 200;
const TASK_SCOPE_MAX_ITEMS = 16;
const TASK_SCOPE_MAX_LENGTH = 256;
const TASK_REMINDER_MAX_ITEMS = 8;
const TASK_BATCH_KEY_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

function validateTaskText(
	label: "summary" | "instructions" | "skipReason",
	value: string,
	maxLength: number,
	oneLine = false,
): string {
	const trimmed = value.trim();
	if (label === "summary" && trimmed.length === 0)
		throw new Error("summary is required.");
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
		| "assign"
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
	if ((head === "assign" || head === "start") && parts[1]) return { verb: "assign", idArg: parts[1] };
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
	return "Usage: /tasks|/tasks list [--all]|ready|blocked|show <id>|create <summary>|assign <id>|complete <id> <evidence>|skip <id> [reason]|retry <id>|clear completed|settings mode compact|full|hidden. Examples: /tasks ready (what can I consider next?), /tasks blocked (which Dependencies are unmet?). Retry/reopen does not execute work.";
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
									? " Recovery: use task update to replace blockedBy without the stale dependency."
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
	readiness: TaskReadiness,
): string | null {
	if (readiness.ready) return null;
	const blocker = readiness.unmetBlockers[0];
	if (!blocker) return null;
	const summary = blocker.task?.summary
		? ` ${truncateTaskText(blocker.task.summary, 80)}`
		: "";
	const recovery =
		blocker.status === "missing" || blocker.status === "tombstoned"
			? " Recovery: use task update to replace blockedBy without the stale dependency."
			: "";
	return `Cannot assign ${shortTaskId(task.id)}: waiting on ${shortTaskId(blocker.id)} (${blocker.status})${summary}. Next: /tasks show ${shortTaskId(blocker.id)} or /tasks blocked.${recovery}`;
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

function withReadinessDiagnostic(
	result: TaskOperationResult,
): TaskOperationResult {
	if (!result.record || !result.readiness) return result;
	const error = formatStartBlockedMessage(result.record, result.readiness);
	return error ? { ...result, error } : result;
}

export class TaskLifecycleService {
	start(id: string): TaskOperationResult {
		return withReadinessDiagnostic(startTask(id));
	}

	retry(id: string): TaskOperationResult {
		return withReadinessDiagnostic(retryTask(id));
	}

	skip(id: string, skipReason?: string): TaskOperationResult {
		return safeTransitionTask(id, "skipped", { skipReason });
	}

	async cancel(id: string): Promise<TaskOperationResult> {
		const task = getTask(id);
		if (task?.state === "completed")
			return {
				outcome: "rejected",
				record: task,
				error: "task is already completed",
			};
		return this.skip(id);
	}

	async transition(
		id: string,
		target: TaskState | "running" | "cancelled",
		opts: TransitionOptions = {},
	): Promise<TaskOperationResult> {
		if (target === "running") return this.start(id); // hidden compatibility alias
		if (target === "cancelled") return this.cancel(id); // hidden compatibility alias
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

function operationToolResult(result: TaskOperationResult, id?: string) {
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
		...(result.readiness
			? {
					readiness: {
						ready: result.readiness.ready,
						unmetBlockers: result.readiness.unmetBlockers.map((blocker) => ({
							id: blocker.id,
							status: blocker.status,
						})),
					},
				}
			: {}),
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

function legacyTodoImportMarker(workspace: string): string {
	const key = crypto.createHash("sha256").update(workspace).digest("hex");
	return path.join(getOperatorStateDir(), "legacy-todo-imports", `${key}.json`);
}

function markLegacyTodosImported(workspace: string, source: string): void {
	const marker = legacyTodoImportMarker(workspace);
	fs.mkdirSync(path.dirname(marker), { recursive: true });
	const tmp = `${marker}.${process.pid}.${crypto.randomUUID()}.tmp`;
	fs.writeFileSync(
		tmp,
		`${JSON.stringify({ schemaVersion: 1, workspace, source, importedAt: new Date().toISOString() }, null, 2)}\n`,
		"utf-8",
	);
	fs.renameSync(tmp, marker);
}

export function importLegacyTodos(
	cwd: string,
	sourceDir = cwd,
	sessionId?: string,
): TaskRecordV1[] {
	const filePath = path.join(sourceDir, ".pi", "todo.json");
	if (!fs.existsSync(filePath)) return [];
	const workspace = resolveTaskWorkspace(cwd);
	if (fs.existsSync(legacyTodoImportMarker(workspace))) return [];
	const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as {
		items?: unknown[];
	};
	const items = Array.isArray(parsed.items)
		? parsed.items.filter(isLegacyTodoItem)
		: [];
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
			sessionId,
			state: item.status === "done" ? "completed" : item.status === "in_progress" ? "assigned" : "unassigned",
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
		// Legacy completed records intentionally have no fabricated outcome evidence.
	}
	const result = imported.map((record) => getTask(record.id) ?? record);
	markLegacyTodosImported(workspace, filePath);
	return result;
}

function validatedBoundary(value: unknown): string[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) throw new Error("boundary must be an array");
	return normalizeTaskScope(value as string[]);
}

function validatedCovers(value: unknown): string[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
		throw new Error("covers must be an array of strings");
	return [...new Set(value as string[])];
}

function validatedBlockers(value: unknown): string[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
		throw new Error("blockedBy must be an array of strings");
	return value as string[];
}

function validatedResources(value: unknown, label: "produces" | "consumes"): string[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
		throw new Error(`${label} must be an array of strings`);
	return value as string[];
}

function validatedOutcome(value: unknown): TaskOutcome | undefined {
	if (value === undefined) return undefined;
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("outcome must be an object");
	const input = value as Record<string, unknown>;
	const requiredText = (field: "summary"): string => {
		if (typeof input[field] !== "string" || !(input[field] as string).trim()) throw new Error(`outcome.${field} is required`);
		const result = (input[field] as string).trim();
		if (result.length > TASK_OUTCOME_SUMMARY_MAX_LENGTH) throw new Error(`outcome.${field} exceeds its bound`);
		return result;
	};
	const array = (field: "evidence" | "validation" | "gaps", maxItems: number, maxLength: number, required: boolean): string[] | undefined => {
		if (input[field] === undefined) {
			if (required) throw new Error(`outcome.${field} is required`);
			return undefined;
		}
		if (!Array.isArray(input[field])) throw new Error(`outcome.${field} must be an array`);
		const values = input[field] as unknown[];
		if (required && values.length === 0) throw new Error(`outcome.${field} is required`);
		if (values.length > maxItems || values.some((item) => typeof item !== "string" || !(item as string).trim() || (item as string).trim().length > maxLength)) throw new Error(`outcome.${field} exceeds its bound`);
		return values.map((item) => (item as string).trim());
	};
	return {
		summary: requiredText("summary"),
		evidence: array("evidence", TASK_OUTCOME_MAX_EVIDENCE_ITEMS, TASK_OUTCOME_EVIDENCE_MAX_LENGTH, true)!,
		...(array("validation", TASK_OUTCOME_MAX_VALIDATION_ITEMS, TASK_OUTCOME_VALIDATION_MAX_LENGTH, false) ? { validation: array("validation", TASK_OUTCOME_MAX_VALIDATION_ITEMS, TASK_OUTCOME_VALIDATION_MAX_LENGTH, false) } : {}),
		...(array("gaps", TASK_OUTCOME_MAX_GAPS_ITEMS, TASK_OUTCOME_GAPS_MAX_LENGTH, false) ? { gaps: array("gaps", TASK_OUTCOME_MAX_GAPS_ITEMS, TASK_OUTCOME_GAPS_MAX_LENGTH, false) } : {}),
	};
}

function validatedPriority(value: unknown): number | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "number" || !Number.isFinite(value))
		throw new Error("priority must be a finite number");
	return value;
}

function prepareCurrentTaskArguments(input: Record<string, unknown>): Record<string, unknown> {
	const prepared = { ...input };
	if (prepared.instructions === undefined && typeof prepared.notes === "string")
		prepared.instructions = prepared.notes;
	if (prepared.boundary === undefined && Array.isArray(prepared.scope))
		prepared.boundary = prepared.scope;
	delete prepared.notes;
	delete prepared.scope;
	if (prepared.state === "pending") prepared.state = "unassigned";
	if (prepared.state === "running") prepared.state = "assigned";
	if (prepared.state === "blocked") prepared.state = "unassigned";
	if (prepared.state === "cancelled") prepared.state = "skipped";
	return prepared;
}

function taskInputFrom(
	input: Record<string, unknown>,
	cwd: string,
	sessionId: string | undefined,
	batch = false,
): CreateTaskBatchInput {
	input = prepareCurrentTaskArguments(input);
	if (typeof input.summary !== "string")
		throw new Error("summary is required.");
	const summary = validateTaskText(
		"summary",
		input.summary,
		TASK_SUMMARY_MAX_LENGTH,
		true,
	);
	const instructions =
		typeof input.instructions === "string"
			? validateTaskText("instructions", input.instructions, TASK_INSTRUCTIONS_MAX_LENGTH)
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
		origin: "other",
		summary,
		workspace: resolveTaskWorkspace(cwd),
		sessionId,
		boundary: validatedBoundary(input.boundary),
		instructions,
		covers: validatedCovers(input.covers),
		blockedBy: batch
			? (input.blockedBy as string[] | undefined)
			: validatedBlockers(input.blockedBy),
		goalId: typeof input.goalId === "string" ? input.goalId : undefined,
		produces: validatedResources(input.produces, "produces"),
		consumes: validatedResources(input.consumes, "consumes"),
		priority: validatedPriority(input.priority),
		...(batch && typeof key === "string" ? { key } : {}),
		...(batch && Array.isArray(blockedByKeys)
			? { blockedByKeys: blockedByKeys as string[] }
			: {}),
	};
}

function createTaskFromInput(
	input: Record<string, unknown>,
	cwd: string,
	sessionId: string | undefined,
): TaskRecordV1 {
	return createTask(taskInputFrom(input, cwd, sessionId));
}

function currentTaskSessionId(ctx: {
	sessionManager?: { getSessionId?: () => string };
}): string | undefined {
	return ctx.sessionManager?.getSessionId?.();
}

function currentExplicitActiveRootTaskId(): string | undefined {
	const taskId = process.env.PI_SUBAGENT_COORDINATOR_TASK_ID?.trim();
	return taskId || undefined;
}

function isActiveRootTask(
	record: TaskRecordV1,
	workspace: string,
): boolean {
	return (
		record.workspace === workspace &&
		!record.deletedAt &&
		!record.parentId &&
		!TERMINAL_TASK_STATES.has(record.state)
	);
}

function activeRootTaskContext(record: TaskRecordV1): string[] {
	return [
		`- ${record.id}: ${record.summary} (${record.state})`,
		...(record.boundary?.length
			? [`  Boundary: ${record.boundary.join(", ")}`]
			: []),
		...(record.blockedBy?.length
			? [`  Dependencies: ${record.blockedBy.join(", ")}`]
			: []),
		...(record.instructions
			? [`  Instructions and acceptance checks: ${record.instructions}`]
			: []),
		...(record.covers?.length
			? [`  Goal coverage: ${record.covers.join(", ")}`]
			: []),
	];
}

export function activeRootTaskReminder(
	cwd: string,
	sessionId: string | undefined,
	activeRootTaskId?: string,
): string | undefined {
	if (!sessionId && !activeRootTaskId) return undefined;
	const workspace = resolveTaskWorkspace(cwd);
	const selected = new Map<string, TaskRecordV1>();

	// An explicit ID is authoritative for lookup, including when its owner is a
	// different session in the same workspace. Scoped discovery remains the
	// default and supplements an explicit task when both are available.
	try {
		if (activeRootTaskId) {
			const explicit = getTask(activeRootTaskId.trim());
			if (explicit && isActiveRootTask(explicit, workspace))
				selected.set(explicit.id, explicit);
		}
		if (sessionId) {
			for (const record of listTasks({
				workspace,
				sessionId,
				states: ["assigned"],
			}).filter((record) => !record.parentId))
				selected.set(record.id, record);
		}
	} catch (error) {
		if (isTaskStoreUnavailable(error)) return undefined;
		throw error;
	}
	const roots = [...selected.values()];
	if (roots.length === 0) return undefined;
	const listed = roots.slice(0, TASK_REMINDER_MAX_ITEMS);
	return [
		`Active durable root task${roots.length === 1 ? "" : "s"} in this workspace (assigned work, not process activity):`,
		...listed.flatMap(activeRootTaskContext),
		...(roots.length > listed.length
			? [`- ${roots.length - listed.length} more; inspect the task list before selecting work.`]
			: []),
		"Durable task context supplements the current conversational frontier; it does not replace the active request.",
		"Treat the relevant task's deliverable, Instructions, goal coverage, dependencies, boundary, and acceptance checks as authoritative. Validation is limited to the task Instructions. If multiple tasks could own the request, do not choose silently.",
	].join("\n");
}

function isCurrentTask(
	record: TaskRecordV1,
	workspace: string,
	sessionId: string | undefined,
): boolean {
	return record.workspace === workspace && record.sessionId === sessionId;
}

function isTaskInWorkspace(record: TaskRecordV1, workspace: string): boolean {
	return record.workspace === workspace;
}

function isDelegatedTaskProcess(): boolean {
	const role =
		process.env.PI_SUBAGENT_TREE_ROLE ?? process.env.PI_SUBAGENT_ROLE;
	return role === "coordinator" || role === "leaf";
}

function codePointPrefix(value: string, maxCodePoints: number): string {
	return [...value].slice(0, maxCodePoints).join("");
}

const RETIRED_EXECUTION_ACTIONS = new Set([
	"execute",
	"execute_many",
	"drain",
	"await",
	"stop",
	"output",
]);
const RETIRED_EXECUTION_FIELDS = [
	"agent",
	"task",
	"cwd",
	"agentScope",
	"model",
	"modelSize",
	"maxConcurrent",
] as const;

function retiredExecutionField(input: Record<string, unknown>): string | undefined {
	for (const field of RETIRED_EXECUTION_FIELDS)
		if (input[field] !== undefined) return field;
	if (Array.isArray(input.tasks))
		for (const item of input.tasks)
			if (item && typeof item === "object" && !Array.isArray(item)) {
				const field = retiredExecutionField(item as Record<string, unknown>);
				if (field) return `tasks[].${field}`;
			}
	return undefined;
}

type RetiredTaskDiagnostic =
	| { kind: "action"; value: string }
	| { kind: "field"; value: string };

function retiredDiagnosticMarker(diagnostic: RetiredTaskDiagnostic): string {
	return `retired_${diagnostic.kind}_${diagnostic.value.replaceAll(/[^A-Za-z0-9_-]/g, "_")}`;
}

const RETIRED_DIAGNOSTICS = [
	...[...RETIRED_EXECUTION_ACTIONS].map(
		(value): RetiredTaskDiagnostic => ({ kind: "action", value }),
	),
	...RETIRED_EXECUTION_FIELDS.flatMap((value) => [
		{ kind: "field" as const, value },
		{ kind: "field" as const, value: `tasks[].${value}` },
	]),
];
const RETIRED_DIAGNOSTICS_BY_MARKER = new Map(
	RETIRED_DIAGNOSTICS.map(
		(diagnostic) =>
			[retiredDiagnosticMarker(diagnostic), diagnostic] as const,
	),
);

function retiredTaskDiagnostic(
	input: Record<string, unknown>,
): RetiredTaskDiagnostic | undefined {
	const action = input.action;
	if (typeof action === "string" && RETIRED_EXECUTION_ACTIONS.has(action))
		return { kind: "action", value: action };
	const field = retiredExecutionField(input);
	if (field) return { kind: "field", value: field };
	return typeof input.id === "string"
		? RETIRED_DIAGNOSTICS_BY_MARKER.get(input.id)
		: undefined;
}

function prepareTaskArguments(args: unknown): unknown {
	const diagnostic = retiredTaskDiagnostic(asParams(args));
	return diagnostic
		? { action: "get", id: retiredDiagnosticMarker(diagnostic) }
		: args;
}

export function registerTaskTools(pi: ExtensionAPI): void {
	const summary = Type.String({
		minLength: 1,
		maxLength: TASK_SUMMARY_MAX_LENGTH,
		description: "The durable deliverable, not a procedure or conversation summary.",
	});
	const instructions = Type.String({
		maxLength: TASK_INSTRUCTIONS_MAX_LENGTH,
		description: "Required work, observable completion evidence, constraints, and out-of-scope items.",
	});
	const id = Type.String({
		minLength: 1,
		maxLength: 64,
		pattern: "^[A-Za-z0-9_-]+$",
	});
	const boundary = Type.Array(
		Type.String({ minLength: 1, maxLength: TASK_SCOPE_MAX_LENGTH, description: "Governed path or boundary marker." }),
		{
			maxItems: TASK_SCOPE_MAX_ITEMS,
			uniqueItems: true,
		},
	);
	const blockedBy = Type.Array(id, {
		maxItems: TASK_BATCH_MAX_ITEMS,
		uniqueItems: true,
		description: "Explicit hard prerequisite task IDs. This is the only field that creates Dependencies.",
	});
	const goalId = Type.String({ minLength: 1, maxLength: 256, description: "Optional Goal association. It does not change readiness or lifecycle transitions." });
	const covers = Type.Array(Type.String({ minLength: 1, maxLength: 64 }), { maxItems: 16, uniqueItems: true, description: "Current goal condition IDs covered by this task." });
	const produces = Type.Array(Type.String({ minLength: 1, maxLength: 256 }), { maxItems: 16, uniqueItems: true, description: "Optional case-sensitive resources produced by this Task. Used only to order ready Tasks." });
	const consumes = Type.Array(Type.String({ minLength: 1, maxLength: 256 }), { maxItems: 16, uniqueItems: true, description: "Optional case-sensitive resources consumed by this Task. Used only to order ready Tasks." });
	const priority = Type.Number({ description: "Optional ready-order priority. Higher values sort first; absence equals zero and never changes readiness." });
	const outcome = Type.Object({
		summary: Type.String({ minLength: 1, maxLength: TASK_OUTCOME_SUMMARY_MAX_LENGTH }),
		evidence: Type.Array(Type.String({ minLength: 1, maxLength: TASK_OUTCOME_EVIDENCE_MAX_LENGTH }), { minItems: 1, maxItems: TASK_OUTCOME_MAX_EVIDENCE_ITEMS }),
		validation: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: TASK_OUTCOME_VALIDATION_MAX_LENGTH }), { maxItems: TASK_OUTCOME_MAX_VALIDATION_ITEMS })),
		gaps: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: TASK_OUTCOME_GAPS_MAX_LENGTH }), { maxItems: TASK_OUTCOME_MAX_GAPS_ITEMS })),
	}, { additionalProperties: false, description: "Bounded root-owned terminal outcome. Validation is limited to Task Instructions." });
	const taskItem = Type.Object(
		{
			summary,
			instructions: Type.Optional(instructions),
			boundary: Type.Optional(boundary),
			covers: Type.Optional(covers),
			key: Type.Optional(Type.String({ pattern: "^[A-Za-z0-9_-]{1,32}$" })),
			blockedBy: Type.Optional(blockedBy),
			goalId: Type.Optional(goalId),
			produces: Type.Optional(produces),
			consumes: Type.Optional(consumes),
			priority: Type.Optional(priority),
			blockedByKeys: Type.Optional(
				Type.Array(Type.String({ pattern: "^[A-Za-z0-9_-]{1,32}$" }), {
					maxItems: TASK_BATCH_MAX_ITEMS,
					uniqueItems: true,
				}),
			),
		},
		{ additionalProperties: false },
	);
	const all = Type.Boolean({
		description:
			"Include terminal tasks and tasks from other sessions or workspaces when listing.",
	});
	const parameters = Type.Union([
		Type.Object(
			{
				action: StringEnum(["create"] as const),
				summary,
				instructions: Type.Optional(instructions),
				boundary: Type.Optional(boundary),
				covers: Type.Optional(covers),
				blockedBy: Type.Optional(blockedBy),
				goalId: Type.Optional(goalId),
				produces: Type.Optional(produces),
				consumes: Type.Optional(consumes),
				priority: Type.Optional(priority),
			},
			{ additionalProperties: false },
		),
		Type.Object(
			{
				action: StringEnum(["batch"] as const),
				tasks: Type.Array(taskItem, {
					minItems: 1,
					maxItems: TASK_BATCH_MAX_ITEMS,
				}),
			},
			{ additionalProperties: false },
		),
		Type.Object(
			{
				action: StringEnum(["update"] as const),
				id,
				summary: Type.Optional(summary),
				instructions: Type.Optional(instructions),
				boundary: Type.Optional(boundary),
				covers: Type.Optional(covers),
				state: Type.Optional(StringEnum(TASK_STATES)),
				outcome: Type.Optional(outcome),
				skipReason: Type.Optional(instructions),
				blockedBy: Type.Optional(blockedBy),
				goalId: Type.Optional(goalId),
				produces: Type.Optional(produces),
				consumes: Type.Optional(consumes),
				priority: Type.Optional(priority),
			},
			{ additionalProperties: false },
		),
		Type.Object(
			{ action: StringEnum(["remove"] as const), id },
			{ additionalProperties: false },
		),
		Type.Object(
			{
				action: StringEnum(["list"] as const),
				all: Type.Optional(all),
			},
			{ additionalProperties: false },
		),
		Type.Object(
			{
				action: StringEnum(["ready"] as const),
				all: Type.Optional(all),
			},
			{ additionalProperties: false },
		),
		Type.Object(
			{ action: StringEnum(["get"] as const), id },
			{ additionalProperties: false },
		),
	]);
	pi.registerTool({
		name: "task",
		label: "Task",
		description: "Record durable tasks and their dependencies; task records never execute work.",
		promptSnippet: "Record durable tasks and dependencies",
		promptGuidelines: [
			"Use task for work that must survive context compaction or represent an independently verifiable deliverable; ordinary short work can remain prose.",
			"After compaction or resume, inspect the assigned task and keep its Instructions, coverage, dependencies, boundary, and acceptance checks supplemental to the current request.",
			"When a user correction changes the outcome, update Instructions before continuing and omit work no longer required.",
			"Use blockedBy for hard prerequisites. Use ready to select eligible unassigned work, then assign it and record its bounded terminal outcome explicitly; validation is limited to Task Instructions.",
			"Task records describe work and outcomes only. They do not execute, wait for, stop, schedule, or capture output from processes.",
		],
		parameters,
		prepareArguments(args): Static<typeof parameters> {
			return prepareTaskArguments(args) as Static<typeof parameters>;
		},
		renderCall(args, theme) {
			const input = asParams(args);
			const action = input.action;
			const id = typeof input.id === "string" ? input.id : undefined;
			const hint =
				typeof input.summary === "string"
					? input.summary
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
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			if (isDelegatedTaskProcess())
				return toolResult({
					outcome: "rejected",
					error: "Only the conversational root may create or transition durable tasks.",
				});
			const input = prepareCurrentTaskArguments(asParams(params));
			const action = input.action;
			const retiredDiagnostic = retiredTaskDiagnostic(input);
			if (retiredDiagnostic?.kind === "action")
				return toolResult({
					outcome: "rejected",
					error:
						`task action ${retiredDiagnostic.value} is retired. Assign ready work, perform the work through the appropriate tool, then update the task terminal state.`,
				});
			if (retiredDiagnostic?.kind === "field")
				return toolResult({
					outcome: "rejected",
					error:
						`task field ${retiredDiagnostic.value} is retired. Store Instructions and task state in task; perform work separately through the appropriate tool.`,
				});
			const workspace = resolveTaskWorkspace(ctx.cwd);
			const sessionId = currentTaskSessionId(ctx);
			if (action === "create")
				return operationToolResult({
					outcome: "persisted",
					record: createTaskFromInput(input, ctx.cwd, sessionId),
				});
			if (action === "batch") {
				if (input.tasks !== undefined && !Array.isArray(input.tasks))
					throw new Error("tasks must be an array");
				const tasks = Array.isArray(input.tasks) ? input.tasks : [];
				if (tasks.length === 0)
					throw new Error("batch must contain at least one task");
				if (tasks.length > TASK_BATCH_MAX_ITEMS)
					throw new Error("batch may contain at most 16 tasks");
				const batchInputs = tasks.map((item) => {
					if (!item || typeof item !== "object" || Array.isArray(item))
						throw new Error("batch task must be an object");
					return taskInputFrom(asParams(item), ctx.cwd, sessionId, true);
				});
				const result = createTaskBatch(batchInputs, workspace);
				if (result.outcome === "write_failed") {
					const visible = {
						...result,
						error: codePointPrefix(
							result.error,
							TASK_BATCH_ERROR_MAX_CODE_POINTS,
						),
					};
					const text = JSON.stringify(visible);
					if (Buffer.byteLength(text, "utf8") > TASK_BATCH_RESULT_MAX_BYTES)
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
				if (Buffer.byteLength(text, "utf8") > TASK_BATCH_RESULT_MAX_BYTES)
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
				const scopedRecords = allRecords.filter((record) =>
					input.all === true
						? isTaskInWorkspace(record, workspace)
						: isCurrentTask(record, workspace, sessionId),
				);
				const selected =
					action === "ready"
						? partitionReadyTasks(scopedRecords).ready
						: input.all === true
							? scopedRecords
							: scopedRecords.filter(
									(record) => !TERMINAL_TASK_STATES.has(record.state),
								);
				return toolResult(
					{ outcome: "persisted", records: selected },
					compactTaskCollection(selected),
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
				const visible =
					record && isTaskInWorkspace(record, workspace)
						? record
						: undefined;
				return toolResult({
					outcome: visible ? "persisted" : "not_found",
					record: visible,
				});
			}
			if (action === "remove") {
				try {
					const existing = getTask(id);
					if (!existing || !isTaskInWorkspace(existing, workspace))
						throw new Error(`task not found in current workspace: ${id}`);
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
				if (!existing || !isTaskInWorkspace(existing, workspace))
					return toolResult({
						outcome: "not_found",
						error: `task not found in current workspace: ${id}`,
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
						instructions:
							typeof input.instructions === "string"
								? validateTaskText("instructions", input.instructions, TASK_INSTRUCTIONS_MAX_LENGTH)
								: undefined,
						boundary: validatedBoundary(input.boundary),
						covers: validatedCovers(input.covers),
						blockedBy: validatedBlockers(input.blockedBy),
						goalId: typeof input.goalId === "string" ? input.goalId : undefined,
						produces: validatedResources(input.produces, "produces"),
						consumes: validatedResources(input.consumes, "consumes"),
						priority: validatedPriority(input.priority),
					};
					skipReason =
						typeof input.skipReason === "string"
							? validateTaskText(
									"skipReason",
									input.skipReason,
									TASK_INSTRUCTIONS_MAX_LENGTH,
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
					if (target === "assigned") {
						const candidate = {
							...existing,
							blockedBy: patch.blockedBy ?? existing.blockedBy,
						};
						const readiness = getTaskReadiness(
							candidate,
							tasksByIdSnapshot(listTasks({ includeTombstones: true })),
						);
						const blocked = formatStartBlockedMessage(candidate, readiness);
						if (blocked)
							return operationToolResult({
								outcome: "rejected",
								record: existing,
								readiness,
								error: blocked,
							});
					}
				}
				try {
					if (target) {
						const record = updateAndTransitionTask(id, patch, target, {
							skipReason,
							outcome: validatedOutcome(input.outcome),
						});
						const readiness = target === "assigned" ? { ready: true, unmetBlockers: [] } : undefined;
						return operationToolResult({ outcome: "persisted", record, ...(readiness ? { readiness } : {}) }, id);
					}
					const record = updateTask(id, patch);
					return operationToolResult({ outcome: "persisted", record });
				} catch (error) {
					return toolResult({
						outcome: "rejected",
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}
			return toolResult({ outcome: "rejected", error: "unknown action" });
		},
	});
}

export function registerTasksCommand(pi: ExtensionAPI): void {
	const lifecycle = new TaskLifecycleService();
	pi.registerCommand("tasks", {
		description:
			"Task control plane. Use /tasks help for lifecycle, settings, and recovery commands.",
		handler: async (args, ctx) => {
			const parsed = parseTasksArgs(args);
			const allTasks = listTasks({ includeTombstones: true });
			const workspace = resolveTaskWorkspace(ctx.cwd);
			const sessionId = currentTaskSessionId(ctx);
			const scopedTasks = allTasks.filter((task) =>
				isCurrentTask(task, workspace, sessionId),
			);
			const selectedTasks = parsed.all ? allTasks : scopedTasks;
			const listedTasks = parsed.all
				? selectedTasks
				: selectedTasks.filter(
						(task) =>
							!task.deletedAt && !TERMINAL_TASK_STATES.has(task.state),
					);
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
					formatTaskList(
						listedTasks,
						parsed.all ? "full" : getTaskRenderMode(),
					),
					"info",
				);
			if (parsed.verb === "ready") {
				const ready = partitionReadyTasks(selectedTasks).ready;
				return ctx.ui.notify(
					ready.length > 0
						? formatTaskList(ready, getTaskRenderMode())
						: "No ready unassigned tasks.",
					"info",
				);
			}
			if (parsed.verb === "blocked")
				return ctx.ui.notify(formatBlockedView(selectedTasks), "info");
			if (parsed.verb === "create") {
				try {
					const task = createTask({
						origin: "other",
						summary: validateTaskText(
							"summary",
							sanitizeTaskValue(parsed.text ?? ""),
							TASK_SUMMARY_MAX_LENGTH,
							true,
						),
						workspace,
						sessionId,
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
					`Cleared ${clearCompletedTasks(workspace, sessionId).length} completed task(s).`,
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
			if (parsed.verb === "assign")
				return notifyOutcome(ctx, "Assigned", lifecycle.start(target.id));
			if (parsed.verb === "complete")
				return notifyOutcome(
					ctx,
					"Completed",
					await lifecycle.transition(target.id, "completed", {
						outcome: parsed.text
							? { summary: target.summary, evidence: [parsed.text] }
							: undefined,
					}),
				);
			if (parsed.verb === "skip")
				return notifyOutcome(
					ctx,
					"Skipped",
					lifecycle.skip(target.id, parsed.text),
				);
			if (parsed.verb === "cancel")
				return notifyOutcome(ctx, "Skipped", await lifecycle.cancel(target.id));
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

function isExpectedTaskStoreTransition(error: unknown): boolean {
	return isTaskStoreUnavailable(error);
}

export default function (pi: ExtensionAPI) {
	registerTaskTools(pi);
	registerTasksCommand(pi);
	pi.on("before_agent_start", (event, ctx) => {
		const reminder = activeRootTaskReminder(
			ctx.cwd,
			currentTaskSessionId(ctx),
			currentExplicitActiveRootTaskId(),
		);
		if (!reminder) return undefined;
		return {
			systemPrompt: appendRuntimeContext(event.systemPrompt, "tasks", reminder),
		};
	});
	onSessionStart(pi, import.meta.url, (_event, ctx) => {
		const sessionId = currentTaskSessionId(ctx);
		try {
			importLegacyTodos(
				ctx.cwd,
				process.env.PI_LEGACY_TODO_SOURCE_DIR || ctx.cwd,
				sessionId,
			);
		} catch (error) {
			if (!isExpectedTaskStoreTransition(error))
				ctx.ui.notify(
					`Legacy task migration failed: ${error instanceof Error ? error.message : String(error)}`,
					"warning",
				);
		}
		try {
			pruneTaskRegistry({ removeUnowned: sessionId !== undefined });
		} catch (error) {
			if (!isExpectedTaskStoreTransition(error))
				ctx.ui.notify(
					`Task cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
					"warning",
				);
		}
	});
}
