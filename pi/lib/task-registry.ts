import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import {
	ALLOWED_TRANSITIONS,
	ensureDirectory,
	getTasksDir,
	isAllowedTransition,
	type TaskState,
	TERMINAL_TASK_STATES,
} from "./operator-state.ts";
import { sanitizeTaskValue } from "./task-security.ts";

export type { TaskState } from "./operator-state.ts";

export type TaskOrigin = "subagent" | "team" | "shell" | "other";
export type TaskPersistenceOutcome =
	| "persisted"
	| "rejected"
	| "conflict"
	| "deferred"
	| "write_failed"
	| "not_found";

export interface TaskUsage {
	inputTokens?: number;
	outputTokens?: number;
	/** @deprecated Retained for schemaVersion-1 compatibility. */
	totalTokens?: number;
	cacheCreationInputTokens?: number;
	cacheReadInputTokens?: number;
	processedTokens?: number;
	contextPeakTokens?: number;
	turns?: number;
	costUsd?: number | null;
	costSource?: "pi-usage" | "unavailable";
}

export interface NormalizedTaskUsage
	extends Required<Omit<TaskUsage, "costUsd" | "costSource">> {
	costUsd: number | null;
	costSource: "pi-usage" | "unavailable";
}

function nonnegativeNumber(value: number | undefined): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? value
		: 0;
}

/** Normalizes worker usage for task-registry persistence. */
export function normalizeTaskUsage(usage: TaskUsage): NormalizedTaskUsage {
	const inputTokens = nonnegativeNumber(usage.inputTokens);
	const outputTokens = nonnegativeNumber(usage.outputTokens);
	const cacheCreationInputTokens = nonnegativeNumber(
		usage.cacheCreationInputTokens,
	);
	const cacheReadInputTokens = nonnegativeNumber(usage.cacheReadInputTokens);
	const contextPeakTokens = nonnegativeNumber(usage.contextPeakTokens);
	const costUsd =
		typeof usage.costUsd === "number" &&
		Number.isFinite(usage.costUsd) &&
		usage.costUsd >= 0
			? usage.costUsd
			: null;
	return {
		inputTokens,
		outputTokens,
		// Retained for schemaVersion-1 consumers; use processedTokens for analytics.
		totalTokens:
			nonnegativeNumber(usage.totalTokens) || inputTokens + outputTokens,
		cacheCreationInputTokens,
		cacheReadInputTokens,
		processedTokens:
			inputTokens +
			outputTokens +
			cacheCreationInputTokens +
			cacheReadInputTokens,
		contextPeakTokens,
		turns: nonnegativeNumber(usage.turns),
		costUsd,
		costSource: costUsd === null ? "unavailable" : "pi-usage",
	};
}

export type TaskExecutionStatus =
	| "pending"
	| "running"
	| "stop_requested"
	| "stopped"
	| "completed"
	| "failed"
	| "failed_to_stop"
	| "orphaned";

export interface SubagentTaskExecution {
	kind: "subagent";
	agent: string;
	task: string;
	cwd?: string;
	agentScope?: "user" | "project" | "both";
	model?: string;
	modelSize?: "small" | "medium" | "large";
	status: TaskExecutionStatus;
	ownerPid?: number;
	runId?: string;
	orchestrationId?: string;
	interactionId?: string;
	startedAt?: string;
	outputPath?: string;
	outputError?: string;
}

export interface TaskRecordV1 {
	[key: string]: unknown;
	schemaVersion: 1;
	id: string;
	origin: TaskOrigin;
	state: TaskState;
	summary: string;
	createdAt: string;
	updatedAt: string;
	startedAt?: string;
	endedAt?: string;
	retryCount: number;
	parentId?: string;
	agentName?: string;
	prompt?: string;
	preview?: string;
	repoSlug?: string;
	workspace?: string;
	notes?: string;
	blockReason?: string;
	errorReason?: string;
	skipReason?: string;
	usage?: TaskUsage;
	metadata?: Record<string, unknown>;
	execution?: SubagentTaskExecution;
	blockedBy?: string[];
	blocks?: string[];
	deletedAt?: string;
}

export interface CreateTaskInput {
	origin: TaskOrigin;
	summary: string;
	state?: TaskState;
	parentId?: string;
	agentName?: string;
	prompt?: string;
	preview?: string;
	repoSlug?: string;
	workspace?: string;
	notes?: string;
	metadata?: Record<string, unknown>;
	execution?: SubagentTaskExecution;
	blockedBy?: string[];
	blocks?: string[];
}

export interface UpdateTaskPatch {
	summary?: string;
	preview?: string;
	usage?: TaskUsage;
	metadata?: Record<string, unknown>;
	execution?: SubagentTaskExecution;
	agentName?: string;
	workspace?: string;
	notes?: string;
	blockedBy?: string[];
	blocks?: string[];
}

export interface TransitionOptions {
	blockReason?: string;
	errorReason?: string;
	skipReason?: string;
	usage?: TaskUsage;
}

export interface ListTasksOptions {
	states?: readonly TaskState[];
	origins?: readonly TaskOrigin[];
	repoSlug?: string;
	limit?: number;
	includeTombstones?: boolean;
	workspace?: string;
}

export interface TaskOperationResult<T = TaskRecordV1> {
	outcome: TaskPersistenceOutcome;
	record?: T;
	error?: string;
}

export class TaskRegistryError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TaskRegistryError";
	}
}

export function resolveTaskWorkspace(cwd: string): string {
	let current = path.resolve(cwd);
	while (true) {
		if (fs.existsSync(path.join(current, ".git"))) {
			return process.platform === "win32" ? current.toLowerCase() : current;
		}
		const parent = path.dirname(current);
		if (parent === current) break;
		current = parent;
	}
	const resolved = path.resolve(cwd);
	return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function taskFilePath(id: string): string {
	if (!isValidId(id)) throw new TaskRegistryError(`invalid task id: ${id}`);
	return path.join(getTasksDir(), `${id}.json`);
}

function isValidId(id: string): boolean {
	return (
		typeof id === "string" &&
		/^[A-Za-z0-9_-]+$/.test(id) &&
		id.length > 0 &&
		id.length <= 64
	);
}

function normalizeTaskRecord(
	parsed: Record<string, unknown>,
): TaskRecordV1 | null {
	if (typeof parsed.id !== "string" || !isValidId(parsed.id)) return null;
	const now = new Date().toISOString();
	const state =
		typeof parsed.state === "string" &&
		ALLOWED_TRANSITIONS.has(parsed.state as TaskState)
			? (parsed.state as TaskState)
			: "pending";
	return sanitizeTaskValue({
		...parsed,
		schemaVersion: 1,
		id: parsed.id,
		origin: isTaskOrigin(parsed.origin) ? parsed.origin : "other",
		state,
		summary:
			typeof parsed.summary === "string" ? parsed.summary : "untitled task",
		createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : now,
		updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : now,
		retryCount: typeof parsed.retryCount === "number" ? parsed.retryCount : 0,
		blockedBy: normalizeIdList(parsed.blockedBy),
		blocks: normalizeIdList(parsed.blocks),
	}) as TaskRecordV1;
}

function isTaskOrigin(value: unknown): value is TaskOrigin {
	return (
		value === "subagent" ||
		value === "team" ||
		value === "shell" ||
		value === "other"
	);
}

function normalizeIdList(value: unknown): string[] {
	return Array.isArray(value)
		? [...new Set(value.filter((id): id is string => isValidId(id)))]
		: [];
}

function readTaskFile(file: string): TaskRecordV1 | null {
	try {
		const raw = fs.readFileSync(file, "utf-8");
		const parsed = JSON.parse(raw) as unknown;
		return parsed && typeof parsed === "object"
			? normalizeTaskRecord(parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

function writeTaskFile(record: TaskRecordV1): void {
	ensureDirectory(getTasksDir());
	const sanitized = sanitizeTaskValue(record);
	const target = taskFilePath(sanitized.id);
	const tmp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
	fs.writeFileSync(tmp, `${JSON.stringify(sanitized, null, 2)}\n`, "utf-8");
	fs.renameSync(tmp, target);
}

function assertNoCycle(id: string, blockedBy: string[]): void {
	const pending = [...blockedBy];
	const visited = new Set<string>();
	while (pending.length > 0) {
		const blocker = pending.pop();
		if (!blocker || visited.has(blocker)) continue;
		if (blocker === id)
			throw new TaskRegistryError("dependency cycle rejected");
		visited.add(blocker);
		pending.push(...(getTask(blocker)?.blockedBy ?? []));
	}
}

function maintainReverseEdges(
	record: TaskRecordV1,
	previousBlockedBy: readonly string[] = [],
): void {
	const nextBlockedBy = new Set(record.blockedBy ?? []);
	for (const blockerId of previousBlockedBy) {
		if (nextBlockedBy.has(blockerId)) continue;
		const blocker = getTask(blockerId);
		if (!blocker) continue;
		writeTaskFile({
			...blocker,
			blocks: (blocker.blocks ?? []).filter((id) => id !== record.id),
			updatedAt: new Date().toISOString(),
		});
	}
	for (const blockerId of nextBlockedBy) {
		const blocker = getTask(blockerId);
		if (!blocker) continue;
		const blocks = new Set(blocker.blocks ?? []);
		blocks.add(record.id);
		writeTaskFile({
			...blocker,
			blocks: [...blocks],
			updatedAt: new Date().toISOString(),
		});
	}
}

export function createTask(input: CreateTaskInput): TaskRecordV1 {
	const now = new Date().toISOString();
	const initialState: TaskState = input.state ?? "pending";
	const blockedBy = normalizeIdList(input.blockedBy);
	const record: TaskRecordV1 = sanitizeTaskValue({
		schemaVersion: 1,
		id: crypto.randomUUID(),
		origin: input.origin,
		state: initialState,
		summary: input.summary,
		createdAt: now,
		updatedAt: now,
		retryCount: 0,
		parentId: input.parentId,
		agentName: input.agentName,
		prompt: input.prompt,
		preview: input.preview,
		repoSlug: input.repoSlug,
		workspace: input.workspace,
		notes: input.notes,
		metadata: input.metadata,
		execution: input.execution,
		blockedBy,
		blocks: normalizeIdList(input.blocks),
	});
	if (initialState === "running") record.startedAt = now;
	assertNoCycle(record.id, blockedBy);
	writeTaskFile(record);
	maintainReverseEdges(record);
	return record;
}

export function updateTask(id: string, patch: UpdateTaskPatch): TaskRecordV1 {
	const existing = getTask(id);
	if (!existing) throw new TaskRegistryError(`task not found: ${id}`);
	const nextBlockedBy =
		patch.blockedBy !== undefined
			? normalizeIdList(patch.blockedBy)
			: existing.blockedBy;
	assertNoCycle(id, nextBlockedBy ?? []);
	const updated: TaskRecordV1 = sanitizeTaskValue({
		...existing,
		...(patch.summary !== undefined ? { summary: patch.summary } : {}),
		...(patch.preview !== undefined ? { preview: patch.preview } : {}),
		...(patch.usage !== undefined ? { usage: patch.usage } : {}),
		...(patch.metadata !== undefined ? { metadata: patch.metadata } : {}),
		...(patch.execution !== undefined ? { execution: patch.execution } : {}),
		...(patch.agentName !== undefined ? { agentName: patch.agentName } : {}),
		...(patch.workspace !== undefined ? { workspace: patch.workspace } : {}),
		...(patch.notes !== undefined ? { notes: patch.notes } : {}),
		...(patch.blockedBy !== undefined ? { blockedBy: nextBlockedBy } : {}),
		...(patch.blocks !== undefined
			? { blocks: normalizeIdList(patch.blocks) }
			: {}),
		updatedAt: new Date().toISOString(),
	});
	writeTaskFile(updated);
	maintainReverseEdges(updated, existing.blockedBy);
	return updated;
}

export function transitionTask(
	id: string,
	target: TaskState,
	opts: TransitionOptions = {},
): TaskRecordV1 {
	const existing = getTask(id);
	if (!existing) throw new TaskRegistryError(`task not found: ${id}`);
	if (existing.state === target) {
		if (target === "skipped") return existing;
		throw new TaskRegistryError(
			`task ${id} already in state ${target}; use updateTask for in-place changes`,
		);
	}
	if (!isAllowedTransition(existing.state, target)) {
		const allowed =
			[...(ALLOWED_TRANSITIONS.get(existing.state) ?? [])].join(", ") ||
			"(none)";
		throw new TaskRegistryError(
			`invalid transition for ${id}: ${existing.state} -> ${target} (allowed: ${allowed})`,
		);
	}
	const now = new Date().toISOString();
	const next: TaskRecordV1 = sanitizeTaskValue({
		...existing,
		state: target,
		updatedAt: now,
	});
	if (target === "running") {
		if (existing.state === "failed") {
			next.retryCount = existing.retryCount + 1;
			delete next.errorReason;
		}
		if (!existing.startedAt) next.startedAt = now;
		delete next.blockReason;
	}
	if (target === "blocked")
		next.blockReason = opts.blockReason ?? existing.blockReason;
	if (target === "failed") {
		next.errorReason = opts.errorReason ?? existing.errorReason;
		next.endedAt = now;
	}
	if (target === "completed" || target === "cancelled" || target === "skipped")
		next.endedAt = now;
	if (target === "skipped")
		next.skipReason = opts.skipReason ?? existing.skipReason;
	if (opts.usage) next.usage = opts.usage;
	writeTaskFile(next);
	return next;
}

export function safeTransitionTask(
	id: string,
	target: TaskState,
	opts: TransitionOptions = {},
): TaskOperationResult {
	try {
		return { outcome: "persisted", record: transitionTask(id, target, opts) };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			outcome: message.includes("not found") ? "not_found" : "rejected",
			error: message,
		};
	}
}

export function getTask(id: string): TaskRecordV1 | null {
	if (!isValidId(id)) return null;
	const file = taskFilePath(id);
	if (!fs.existsSync(file)) return null;
	return readTaskFile(file);
}

export function listTasks(opts: ListTasksOptions = {}): TaskRecordV1[] {
	const dir = getTasksDir();
	if (!fs.existsSync(dir)) return [];
	const stateFilter = opts.states ? new Set(opts.states) : null;
	const originFilter = opts.origins ? new Set(opts.origins) : null;
	const out: TaskRecordV1[] = [];
	for (const entry of fs.readdirSync(dir)) {
		if (!entry.endsWith(".json")) continue;
		const record = readTaskFile(path.join(dir, entry));
		if (!record) continue;
		if (!opts.includeTombstones && record.deletedAt) continue;
		if (stateFilter && !stateFilter.has(record.state)) continue;
		if (originFilter && !originFilter.has(record.origin)) continue;
		if (opts.repoSlug && record.repoSlug !== opts.repoSlug) continue;
		if (opts.workspace && record.workspace !== opts.workspace) continue;
		out.push(record);
	}
	out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	if (opts.limit && opts.limit > 0) return out.slice(0, opts.limit);
	return out;
}

export function tombstoneTask(id: string, reason = "deleted"): TaskRecordV1 {
	const existing = getTask(id);
	if (!existing) throw new TaskRegistryError(`task not found: ${id}`);
	const now = new Date().toISOString();
	const state = TERMINAL_TASK_STATES.has(existing.state)
		? existing.state
		: "cancelled";
	const tombstone = sanitizeTaskValue({
		...existing,
		state,
		deletedAt: now,
		endedAt: existing.endedAt ?? now,
		updatedAt: now,
		metadata: { ...(existing.metadata ?? {}), tombstoneReason: reason },
	});
	writeTaskFile(tombstone);
	return tombstone;
}

export type BlockerStatus =
	| "missing"
	| "tombstoned"
	| "pending"
	| "running"
	| "blocked"
	| "failed"
	| "cancelled";

export interface UnmetBlocker {
	id: string;
	status: BlockerStatus;
	task?: TaskRecordV1;
}

export interface TaskReadiness {
	ready: boolean;
	unmetBlockers: UnmetBlocker[];
}

const UNBLOCKING_STATES = new Set<TaskState>(["completed", "skipped"]);

export function tasksByIdSnapshot(
	tasks: readonly TaskRecordV1[],
): ReadonlyMap<string, TaskRecordV1> {
	return new Map(tasks.map((task) => [task.id, task]));
}

export function sortedTaskIds(ids: readonly string[] | undefined): string[] {
	return [...(ids ?? [])].sort((a, b) => a.localeCompare(b));
}

export function getUnmetBlockers(
	task: TaskRecordV1,
	tasksById: ReadonlyMap<string, TaskRecordV1>,
): UnmetBlocker[] {
	const unmet: UnmetBlocker[] = [];
	for (const id of sortedTaskIds(task.blockedBy)) {
		const blocker = tasksById.get(id);
		if (!blocker) {
			unmet.push({ id, status: "missing" });
			continue;
		}
		if (blocker.deletedAt) {
			unmet.push({ id, status: "tombstoned", task: blocker });
			continue;
		}
		if (!UNBLOCKING_STATES.has(blocker.state))
			unmet.push({ id, status: blocker.state as BlockerStatus, task: blocker });
	}
	return unmet;
}

export function getTaskReadiness(
	task: TaskRecordV1,
	tasksById: ReadonlyMap<string, TaskRecordV1>,
): TaskReadiness {
	const unmetBlockers = getUnmetBlockers(task, tasksById);
	return { ready: unmetBlockers.length === 0, unmetBlockers };
}

export function isTaskReady(
	task: TaskRecordV1,
	tasksById: ReadonlyMap<string, TaskRecordV1>,
): boolean {
	return task.state === "pending" && getTaskReadiness(task, tasksById).ready;
}

export function partitionReadyTasks(tasks: readonly TaskRecordV1[]): {
	ready: TaskRecordV1[];
	waiting: TaskRecordV1[];
	blocked: TaskRecordV1[];
} {
	const byId = tasksByIdSnapshot(tasks);
	return {
		ready: tasks.filter((task) => isTaskReady(task, byId)),
		waiting: tasks.filter(
			(task) =>
				task.state === "pending" && getUnmetBlockers(task, byId).length > 0,
		),
		blocked: tasks.filter((task) => task.state === "blocked"),
	};
}

export function clearCompletedTasks(workspace?: string): TaskRecordV1[] {
	return listTasks({ includeTombstones: true })
		.filter(
			(task) =>
				task.state === "completed" &&
				!task.deletedAt &&
				(!workspace || !task.workspace || task.workspace === workspace),
		)
		.map((task) => tombstoneTask(task.id, "clear completed"));
}
