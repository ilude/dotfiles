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

export type TaskOrigin = "subagent" | "shell" | "other";
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

export interface CreateTaskBatchInput extends CreateTaskInput {
	key?: string;
	blockedByKeys?: string[];
}

export interface TaskBatchFailureResult {
	outcome: "write_failed";
	operationId: string;
	failedPhase: "write_records" | "reconcile_reverse_edges";
	generated: Array<{ key?: string; id: string }>;
	persistedIds: string[];
	error: string;
}

export interface TaskBatchSuccessResult {
	outcome: "persisted";
	operationId: string;
	records: TaskRecordV1[];
	aliases: Record<string, string>;
}

export type TaskBatchResult = TaskBatchSuccessResult | TaskBatchFailureResult;

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

function normalizeWorkspacePath(workspace: string): string {
	return process.platform === "win32" ? workspace.toLowerCase() : workspace;
}

function findTaskWorkspaceRoot(cwd: string): string {
	let current = path.resolve(cwd);
	while (!fs.existsSync(path.join(current, ".git"))) {
		const parent = path.dirname(current);
		if (parent === current) return path.resolve(cwd);
		current = parent;
	}
	return current;
}

export const resolveTaskWorkspace = (cwd: string): string =>
	normalizeWorkspacePath(findTaskWorkspaceRoot(cwd));

const taskFilePath = (id: string): string => {
	if (!isValidId(id)) throw new TaskRegistryError(`invalid task id: ${id}`);
	return path.join(getTasksDir(), `${id}.json`);
};

const isValidId = (id: string): boolean =>
	typeof id === "string" &&
	/^[A-Za-z0-9_-]+$/.test(id) &&
	id.length > 0 &&
	id.length <= 64;

const normalizedTaskState = (value: unknown): TaskState =>
	typeof value === "string" && ALLOWED_TRANSITIONS.has(value as TaskState)
		? (value as TaskState)
		: "pending";

const stringOr = (value: unknown, fallback: string): string =>
	typeof value === "string" ? value : fallback;

const numberOrZero = (value: unknown): number =>
	typeof value === "number" ? value : 0;

const normalizeTaskRecord = (
	parsed: Record<string, unknown>,
): TaskRecordV1 | null => {
	if (typeof parsed.id !== "string" || !isValidId(parsed.id)) return null;
	const now = new Date().toISOString();
	return sanitizeTaskValue({
		...parsed,
		schemaVersion: 1,
		id: parsed.id,
		origin: isTaskOrigin(parsed.origin) ? parsed.origin : "other",
		state: normalizedTaskState(parsed.state),
		summary: stringOr(parsed.summary, "untitled task"),
		createdAt: stringOr(parsed.createdAt, now),
		updatedAt: stringOr(parsed.updatedAt, now),
		retryCount: numberOrZero(parsed.retryCount),
		blockedBy: normalizeIdList(parsed.blockedBy),
		blocks: normalizeIdList(parsed.blocks),
	}) as TaskRecordV1;
};

function isTaskOrigin(value: unknown): value is TaskOrigin {
	return value === "subagent" || value === "shell" || value === "other";
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

function createTaskRecord(
	input: CreateTaskInput,
	id: string,
	blockedBy: string[],
): TaskRecordV1 {
	const now = new Date().toISOString();
	const initialState: TaskState = input.state ?? "pending";
	const record: TaskRecordV1 = sanitizeTaskValue({
		schemaVersion: 1,
		id,
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
	return record;
}

export function createTask(input: CreateTaskInput): TaskRecordV1 {
	const blockedBy = normalizeIdList(input.blockedBy);
	const record = createTaskRecord(input, crypto.randomUUID(), blockedBy);
	assertNoCycle(record.id, blockedBy);
	writeTaskFile(record);
	maintainReverseEdges(record);
	return record;
}

const TASK_BATCH_MAX_ITEMS = 16;
const TASK_BATCH_KEY_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

function assertUniqueBatchValues(
	values: readonly string[] | undefined,
	label: string,
): string[] {
	const normalized = [...(values ?? [])];
	if (normalized.length > TASK_BATCH_MAX_ITEMS)
		throw new TaskRegistryError(`${label} may contain at most 16 entries`);
	const unique = new Set<string>();
	for (const value of normalized) {
		if (!isValidId(value))
			throw new TaskRegistryError(`invalid ${label}: ${value}`);
		if (unique.has(value))
			throw new TaskRegistryError(`duplicate ${label}: ${value}`);
		unique.add(value);
	}
	return [...normalized];
}

function assertProspectiveBatchIsAcyclic(
	records: readonly TaskRecordV1[],
): void {
	const prospective = new Map(records.map((record) => [record.id, record]));
	const visiting = new Set<string>();
	const visited = new Set<string>();
	const visit = (id: string): void => {
		if (visited.has(id)) return;
		if (visiting.has(id))
			throw new TaskRegistryError("dependency cycle rejected");
		visiting.add(id);
		const record = prospective.get(id) ?? getTask(id);
		for (const blocker of record?.blockedBy ?? []) visit(blocker);
		visiting.delete(id);
		visited.add(id);
	};
	for (const record of records) visit(record.id);
}

function reconcileBatchReverseEdges(
	records: readonly TaskRecordV1[],
	beforeWrite: () => void,
): void {
	const existing = listTasks({ includeTombstones: true });
	const allRecords = new Map(existing.map((record) => [record.id, record]));
	for (const record of records) allRecords.set(record.id, record);
	const affected = new Set(records.map((record) => record.id));
	for (const record of records)
		for (const blocker of record.blockedBy ?? []) affected.add(blocker);
	const reverse = new Map<string, string[]>();
	for (const record of allRecords.values()) {
		for (const blocker of record.blockedBy ?? []) {
			const dependents = reverse.get(blocker) ?? [];
			dependents.push(record.id);
			reverse.set(blocker, dependents);
		}
	}
	for (const id of affected) {
		const record = allRecords.get(id);
		if (!record) continue;
		beforeWrite();
		writeTaskFile({
			...record,
			blocks: sortedTaskIds(reverse.get(id)),
			updatedAt: new Date().toISOString(),
		});
	}
}

const resolveLocalBatchDependencies = (
	localKeys: readonly string[],
	aliases: Readonly<Record<string, string>>,
): string[] => {
	if (localKeys.length > TASK_BATCH_MAX_ITEMS)
		throw new TaskRegistryError("blockedByKeys may contain at most 16 entries");
	if (new Set(localKeys).size !== localKeys.length)
		throw new TaskRegistryError("duplicate blockedByKeys entry");
	return localKeys.map((key) => {
		if (!TASK_BATCH_KEY_PATTERN.test(key) || aliases[key] === undefined)
			throw new TaskRegistryError(`unknown blockedByKeys entry: ${key}`);
		return aliases[key];
	});
};

const assertDurableBatchDependencies = (
	blockerIds: readonly string[],
	workspace: string,
): void => {
	for (const blockerId of blockerIds) {
		const blocker = getTask(blockerId);
		if (!blocker || blocker.deletedAt)
			throw new TaskRegistryError(`task dependency not found: ${blockerId}`);
		if (blocker.workspace && blocker.workspace !== workspace)
			throw new TaskRegistryError(`foreign workspace dependency: ${blockerId}`);
	}
};

const createBatchTaskRecord = (
	input: CreateTaskBatchInput,
	index: number,
	generated: readonly { id: string }[],
	aliases: Readonly<Record<string, string>>,
	workspace: string,
): TaskRecordV1 => {
	const durableBlockers = assertUniqueBatchValues(input.blockedBy, "blockedBy");
	const localBlockers = resolveLocalBatchDependencies(
		input.blockedByKeys ?? [],
		aliases,
	);
	const blockedBy = [...durableBlockers, ...localBlockers];
	if (new Set(blockedBy).size !== blockedBy.length)
		throw new TaskRegistryError("duplicate dependency after resolution");
	const id = generated[index]?.id;
	if (!id) throw new TaskRegistryError("missing generated task id");
	if (blockedBy.includes(id))
		throw new TaskRegistryError("self-dependency rejected");
	assertDurableBatchDependencies(durableBlockers, workspace);
	return createTaskRecord({ ...input, workspace, blocks: [] }, id, blockedBy);
};

/** Creates a fully validated dependency graph without mutating existing records first. */
export function createTaskBatch(
	inputs: readonly CreateTaskBatchInput[],
	workspace: string,
	options: { beforeWrite?: () => void } = {},
): TaskBatchResult {
	if (inputs.length > TASK_BATCH_MAX_ITEMS)
		throw new TaskRegistryError("batch may contain at most 16 tasks");
	const operationId = crypto.randomUUID();
	const generated = inputs.map((input) => ({
		...(input.key !== undefined ? { key: input.key } : {}),
		id: crypto.randomUUID(),
	}));
	if (new Set(generated.map((item) => item.id)).size !== generated.length)
		throw new TaskRegistryError("duplicate generated task id");
	const aliases: Record<string, string> = {};
	for (let index = 0; index < inputs.length; index++) {
		const key = inputs[index]?.key;
		if (key === undefined) continue;
		if (!TASK_BATCH_KEY_PATTERN.test(key))
			throw new TaskRegistryError(`invalid batch key: ${key}`);
		if (aliases[key] !== undefined)
			throw new TaskRegistryError(`duplicate batch key: ${key}`);
		const generatedId = generated[index]?.id;
		if (!generatedId) throw new TaskRegistryError("missing generated task id");
		aliases[key] = generatedId;
	}
	const records = inputs.map((input, index) =>
		createBatchTaskRecord(input, index, generated, aliases, workspace),
	);
	assertProspectiveBatchIsAcyclic(records);
	const persistedIds: string[] = [];
	try {
		for (const record of records) {
			options.beforeWrite?.();
			writeTaskFile(record);
			persistedIds.push(record.id);
		}
	} catch (error) {
		return {
			outcome: "write_failed",
			operationId,
			failedPhase: "write_records",
			generated,
			persistedIds,
			error: error instanceof Error ? error.message : String(error),
		};
	}
	try {
		reconcileBatchReverseEdges(records, () => options.beforeWrite?.());
	} catch (error) {
		return {
			outcome: "write_failed",
			operationId,
			failedPhase: "reconcile_reverse_edges",
			generated,
			persistedIds,
			error: error instanceof Error ? error.message : String(error),
		};
	}
	return {
		outcome: "persisted",
		operationId,
		records: records.map((record) => getTask(record.id) ?? record),
		aliases,
	};
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

const updateSameStateTask = (
	existing: TaskRecordV1,
	target: TaskState,
	opts: TransitionOptions,
): TaskRecordV1 => {
	if (target !== "skipped")
		throw new TaskRegistryError(
			`task ${existing.id} already in state ${target}; use updateTask for in-place changes`,
		);
	if (opts.skipReason === undefined) return existing;
	const updated = sanitizeTaskValue({
		...existing,
		skipReason: opts.skipReason,
		updatedAt: new Date().toISOString(),
	}) as TaskRecordV1;
	writeTaskFile(updated);
	return updated;
};

const applyRunningTransition = (
	next: TaskRecordV1,
	existing: TaskRecordV1,
	now: string,
): void => {
	if (existing.state === "failed") {
		next.retryCount = existing.retryCount + 1;
		delete next.errorReason;
	}
	if (!existing.startedAt) next.startedAt = now;
	delete next.blockReason;
};

const applyBlockedOrFailedTransition = (
	next: TaskRecordV1,
	existing: TaskRecordV1,
	target: TaskState,
	opts: TransitionOptions,
): void => {
	if (target === "blocked")
		next.blockReason = opts.blockReason ?? existing.blockReason;
	if (target === "failed")
		next.errorReason = opts.errorReason ?? existing.errorReason;
};

const applyTerminalTransition = (
	next: TaskRecordV1,
	existing: TaskRecordV1,
	target: TaskState,
	opts: TransitionOptions,
	now: string,
): void => {
	if (target === "failed" || TERMINAL_TASK_STATES.has(target))
		next.endedAt = now;
	if (target === "skipped")
		next.skipReason = opts.skipReason ?? existing.skipReason;
};

const applyTransitionDetails = (
	next: TaskRecordV1,
	existing: TaskRecordV1,
	target: TaskState,
	opts: TransitionOptions,
	now: string,
): void => {
	if (target === "running") applyRunningTransition(next, existing, now);
	applyBlockedOrFailedTransition(next, existing, target, opts);
	applyTerminalTransition(next, existing, target, opts, now);
	if (opts.usage) next.usage = opts.usage;
};

export function transitionTask(
	id: string,
	target: TaskState,
	opts: TransitionOptions = {},
): TaskRecordV1 {
	const existing = getTask(id);
	if (!existing) throw new TaskRegistryError(`task not found: ${id}`);
	if (existing.state === target)
		return updateSameStateTask(existing, target, opts);
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
	applyTransitionDetails(next, existing, target, opts, now);
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

export const getTask = (id: string): TaskRecordV1 | null => {
	if (!isValidId(id)) return null;
	const file = taskFilePath(id);
	if (!fs.existsSync(file)) return null;
	return readTaskFile(file);
};

const matchesTaskStateAndOrigin = (
	record: TaskRecordV1,
	stateFilter: ReadonlySet<TaskState> | null,
	originFilter: ReadonlySet<TaskOrigin> | null,
): boolean => {
	if (stateFilter && !stateFilter.has(record.state)) return false;
	if (originFilter && !originFilter.has(record.origin)) return false;
	return true;
};

const matchesTaskListScope = (
	record: TaskRecordV1,
	opts: ListTasksOptions,
): boolean => {
	if (!opts.includeTombstones && record.deletedAt) return false;
	if (opts.repoSlug && record.repoSlug !== opts.repoSlug) return false;
	if (opts.workspace && record.workspace !== opts.workspace) return false;
	return true;
};

const readListedTask = (
	dir: string,
	entry: string,
	opts: ListTasksOptions,
	stateFilter: ReadonlySet<TaskState> | null,
	originFilter: ReadonlySet<TaskOrigin> | null,
): TaskRecordV1 | null => {
	if (!entry.endsWith(".json")) return null;
	const record = readTaskFile(path.join(dir, entry));
	if (!record) return null;
	if (!matchesTaskStateAndOrigin(record, stateFilter, originFilter))
		return null;
	return matchesTaskListScope(record, opts) ? record : null;
};

export const listTasks = (opts: ListTasksOptions = {}): TaskRecordV1[] => {
	const dir = getTasksDir();
	if (!fs.existsSync(dir)) return [];
	const stateFilter = opts.states ? new Set(opts.states) : null;
	const originFilter = opts.origins ? new Set(opts.origins) : null;
	const out: TaskRecordV1[] = [];
	for (const entry of fs.readdirSync(dir)) {
		const record = readListedTask(dir, entry, opts, stateFilter, originFilter);
		if (record) out.push(record);
	}
	out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	if (opts.limit && opts.limit > 0) return out.slice(0, opts.limit);
	return out;
};

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

export function startTask(id: string): TaskOperationResult {
	const record = getTask(id);
	if (!record) return { outcome: "not_found", error: `task not found: ${id}` };
	const blockers = getUnmetBlockers(
		record,
		tasksByIdSnapshot(listTasks({ includeTombstones: true })),
	);
	if (blockers.length > 0)
		return {
			outcome: "rejected",
			record,
			error: `task is waiting on ${blockers.map((item) => item.id).join(", ")}`,
		};
	return safeTransitionTask(id, "running");
}

export function retryTask(id: string): TaskOperationResult {
	const record = getTask(id);
	if (!record) return { outcome: "not_found", error: `task not found: ${id}` };
	if (record.state !== "failed")
		return {
			outcome: "rejected",
			record,
			error: `Retry only valid for failed tasks (this one is ${record.state})`,
		};
	return startTask(id);
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
