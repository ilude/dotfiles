import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import {
	ALLOWED_TRANSITIONS,
	isAllowedTransition,
	TASK_STATES,
	type TaskState,
	TERMINAL_TASK_STATES,
} from "./operator-state.ts";
import { sanitizeTaskValue } from "./task-security.ts";
import {
	deleteStoredTask,
	openTaskDatabase,
	readStoredTasks,
	withTaskTransaction,
	writeStoredTask,
} from "./task-store.ts";

export type { TaskState } from "./operator-state.ts";
import type { TaskState as CurrentTaskState } from "./operator-state.ts";

export type LegacyTaskState = "pending" | "running" | "blocked" | "cancelled";
/** @deprecated Legacy values are accepted only when normalizing persisted records and create/update input. */
export type TaskStateInput = CurrentTaskState | LegacyTaskState;

export type TaskOrigin = "subagent" | "shell" | "other";
const TASK_SCOPE_MAX_ITEMS = 16;
const TASK_SCOPE_MAX_LENGTH = 256;
const TASK_RESOURCE_MAX_ITEMS = 16;
const TASK_RESOURCE_MAX_LENGTH = 256;

export type TaskPersistenceOutcome =
	| "persisted"
	| "rejected"
	| "conflict"
	| "deferred"
	| "write_failed"
	| "not_found";

export const TASK_OUTCOME_SUMMARY_MAX_LENGTH = 256;
export const TASK_OUTCOME_EVIDENCE_MAX_LENGTH = 2_000;
export const TASK_OUTCOME_VALIDATION_MAX_LENGTH = 512;
export const TASK_OUTCOME_GAPS_MAX_LENGTH = 512;
export const TASK_OUTCOME_MAX_EVIDENCE_ITEMS = 8;
export const TASK_OUTCOME_MAX_VALIDATION_ITEMS = 4;
export const TASK_OUTCOME_MAX_GAPS_ITEMS = 4;

export interface TaskOutcome {
	summary: string;
	evidence: string[];
	validation?: string[];
	gaps?: string[];
	recordedAt?: string;
}

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
	assignedAt?: string;
	endedAt?: string;
	retryCount: number;
	parentId?: string;
	agentName?: string;
	prompt?: string;
	preview?: string;
	repoSlug?: string;
	workspace?: string;
	sessionId?: string;
	/** Current model-facing names. */
	boundary?: string[];
	instructions?: string;
	outcome?: TaskOutcome;
	/** Historical reason fields remain readable during migration. */
	blockReason?: string;
	errorReason?: string;
	skipReason?: string;
	usage?: TaskUsage;
	metadata?: Record<string, unknown>;
	blockedBy?: string[];
	blocks?: string[];
	goalId?: string;
	covers?: string[];
	produces?: string[];
	consumes?: string[];
	priority?: number;
	deletedAt?: string;
}

export interface CreateTaskInput {
	origin: TaskOrigin;
	summary: string;
	state?: TaskStateInput;
	parentId?: string;
	preview?: string;
	repoSlug?: string;
	workspace?: string;
	sessionId?: string;
	boundary?: string[];
	instructions?: string;
	/** @deprecated Compatibility input; normalized to current names. */
	scope?: string[];
	notes?: string;
	metadata?: Record<string, unknown>;
	blockedBy?: string[];
	goalId?: string;
	covers?: string[];
	produces?: string[];
	consumes?: string[];
	priority?: number;
}

export interface CreateTaskBatchInput extends CreateTaskInput {
	key?: string;
	blockedByKeys?: string[];
}

export interface TaskBatchFailureResult {
	outcome: "write_failed";
	operationId: string;
	failedPhase: "write_records";
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
	workspace?: string;
	boundary?: string[];
	instructions?: string;
	/** @deprecated Compatibility input; normalized to current names. */
	scope?: string[];
	notes?: string;
	blockedBy?: string[];
	goalId?: string;
	covers?: string[];
	produces?: string[];
	consumes?: string[];
	priority?: number;
}

export interface TransitionOptions {
	errorReason?: string;
	skipReason?: string;
	usage?: TaskUsage;
	outcome?: TaskOutcome;
}

export interface ListTasksOptions {
	states?: readonly TaskState[];
	origins?: readonly TaskOrigin[];
	repoSlug?: string;
	limit?: number;
	includeTombstones?: boolean;
	workspace?: string;
	sessionId?: string;
}

export interface TaskOperationResult<T = TaskRecordV1> {
	outcome: TaskPersistenceOutcome;
	record?: T;
	readiness?: TaskReadiness;
	error?: string;
}

export interface TaskPruneResult {
	removedIds: string[];
	retiredRemoved: number;
	terminalRemoved: number;
	unownedRemoved: number;
}

export interface TaskPruneOptions {
	removeUnowned?: boolean;
}

export function normalizeTaskBoundary(
	boundary: readonly string[] | undefined,
): string[] | undefined {
	return normalizeTaskScope(boundary);
}

export function normalizeTaskScope(
	scope: readonly string[] | undefined,
): string[] | undefined {
	if (scope === undefined) return undefined;
	if (scope.length > TASK_SCOPE_MAX_ITEMS)
		throw new TaskRegistryError("scope may contain at most 16 entries");
	const normalized = scope.map((entry) => {
		if (typeof entry !== "string")
			throw new TaskRegistryError("scope entries must be strings");
		const value = entry.trim().replaceAll("\\", "/").replace(/^\.\//, "");
		if (!value || value.length > TASK_SCOPE_MAX_LENGTH)
			throw new TaskRegistryError(
				`scope entries must contain between 1 and ${TASK_SCOPE_MAX_LENGTH} characters`,
			);
		return value;
	});
	if (new Set(normalized).size !== normalized.length)
		throw new TaskRegistryError("duplicate scope entry");
	return normalized;
}

export class TaskRegistryError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TaskRegistryError";
	}
}

function normalizeTaskResources(
	resources: readonly string[] | undefined,
	label: "covers" | "produces" | "consumes",
): string[] | undefined {
	if (resources === undefined) return undefined;
	if (resources.length > TASK_RESOURCE_MAX_ITEMS)
		throw new TaskRegistryError(`${label} may contain at most ${TASK_RESOURCE_MAX_ITEMS} entries`);
	const normalized = resources.map((resource) => {
		if (typeof resource !== "string" || resource.length === 0 || resource.length > TASK_RESOURCE_MAX_LENGTH)
			throw new TaskRegistryError(`${label} entries must contain between 1 and ${TASK_RESOURCE_MAX_LENGTH} characters`);
		return resource;
	});
	if (new Set(normalized).size !== normalized.length)
		throw new TaskRegistryError(`duplicate ${label} entry`);
	return normalized.length > 0 ? normalized : undefined;
}

function normalizeTaskPriority(priority: number | undefined): number | undefined {
	if (priority === undefined) return undefined;
	if (typeof priority !== "number" || !Number.isFinite(priority))
		throw new TaskRegistryError("priority must be a finite number");
	return priority;
}

function normalizeTaskMetadataFields(input: {
	goalId?: string;
	covers?: readonly string[];
	produces?: readonly string[];
	consumes?: readonly string[];
	priority?: number;
}): Pick<TaskRecordV1, "goalId" | "covers" | "produces" | "consumes" | "priority"> {
	if (input.goalId !== undefined && (typeof input.goalId !== "string" || input.goalId.length === 0))
		throw new TaskRegistryError("goalId must be a non-empty string");
	const covers = input.covers === undefined ? undefined : normalizeTaskResources(input.covers, "covers");
	if (input.goalId !== undefined && !covers?.length)
		throw new TaskRegistryError("goal-linked task must cover at least one current condition");
	const produces = normalizeTaskResources(input.produces, "produces");
	const consumes = normalizeTaskResources(input.consumes, "consumes");
	const priority = normalizeTaskPriority(input.priority);
	return {
		...(input.goalId !== undefined ? { goalId: input.goalId } : {}),
		...(covers !== undefined ? { covers } : {}),
		...(produces !== undefined ? { produces } : {}),
		...(consumes !== undefined ? { consumes } : {}),
		...(priority !== undefined ? { priority } : {}),
	};
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

const isValidId = (id: string): boolean =>
	typeof id === "string" &&
	/^[A-Za-z0-9_-]+$/.test(id) &&
	id.length > 0 &&
	id.length <= 64;

const LEGACY_STATE_MAP: Readonly<Record<string, TaskState>> = {
	unassigned: "unassigned",
	assigned: "assigned",
	pending: "unassigned",
	running: "assigned",
	blocked: "unassigned",
	completed: "completed",
	failed: "failed",
	cancelled: "skipped",
	skipped: "skipped",
};

export function normalizeTaskState(value: unknown): TaskState {
	return typeof value === "string" && LEGACY_STATE_MAP[value]
		? LEGACY_STATE_MAP[value]
		: "unassigned";
}

function mergeLegacyText(current: unknown, legacy: unknown): string | undefined {
	const currentText = typeof current === "string" ? current : undefined;
	const legacyText = typeof legacy === "string" ? legacy : undefined;
	if (!currentText) return legacyText;
	if (!legacyText || legacyText === currentText) return currentText;
	return `${currentText}\n\n${legacyText}`;
}

function mergeLegacyBoundary(current: unknown, legacy: unknown): string[] | undefined {
	const values = [
		...(Array.isArray(current) ? current : []),
		...(Array.isArray(legacy) ? legacy : []),
	].filter((value): value is string => typeof value === "string");
	return values.length > 0 ? [...new Set(values)] : undefined;
}

const stringOr = (value: unknown, fallback: string): string =>
	typeof value === "string" ? value : fallback;

const numberOrZero = (value: unknown): number =>
	typeof value === "number" ? value : 0;

const normalizeTaskRecord = (
	parsed: Record<string, unknown>,
): TaskRecordV1 | null => {
	if (typeof parsed.id !== "string" || !isValidId(parsed.id)) return null;
	const now = new Date().toISOString();
	const state = normalizeTaskState(parsed.state);
	const instructions = mergeLegacyText(parsed.instructions, parsed.notes);
	const boundary = mergeLegacyBoundary(parsed.boundary, parsed.scope);
	const normalized: Record<string, unknown> = {
		...parsed,
		schemaVersion: 1,
		id: parsed.id,
		origin: isTaskOrigin(parsed.origin) ? parsed.origin : "other",
		state,
		summary: stringOr(parsed.summary, "untitled task"),
		createdAt: stringOr(parsed.createdAt, now),
		updatedAt: stringOr(parsed.updatedAt, now),
		retryCount: numberOrZero(parsed.retryCount),
		blockedBy: normalizeIdList(parsed.blockedBy),
		blocks: normalizeIdList(parsed.blocks),
		...(instructions !== undefined ? { instructions } : {}),
		...(boundary !== undefined ? { boundary } : {}),
		...(normalizePersistedOutcome(parsed.outcome) ? { outcome: normalizePersistedOutcome(parsed.outcome) } : {}),
	};
	if (state === "unassigned" && parsed.state === "blocked" && typeof parsed.blockReason === "string")
		normalized.instructions = mergeLegacyText(normalized.instructions, parsed.blockReason);
	if (state === "skipped" && parsed.state === "cancelled" && normalized.skipReason === undefined && typeof parsed.blockReason === "string")
		normalized.skipReason = parsed.blockReason;
	delete normalized.notes;
	delete normalized.scope;
	if (Array.isArray(normalized.produces) && normalized.produces.length === 0)
		delete normalized.produces;
	if (Array.isArray(normalized.consumes) && normalized.consumes.length === 0)
		delete normalized.consumes;
	return sanitizeTaskValue(normalized) as TaskRecordV1;
};

function isTaskOrigin(value: unknown): value is TaskOrigin {
	return value === "subagent" || value === "shell" || value === "other";
}

function normalizeIdList(value: unknown): string[] {
	return Array.isArray(value)
		? [...new Set(value.filter((id): id is string => isValidId(id)))]
		: [];
}

function writeTaskFile(record: TaskRecordV1, db = openTaskDatabase()): void {
	writeStoredTask(sanitizeTaskValue(record) as TaskRecordV1, db);
}

const TASK_DEPENDENCY_MAX_ITEMS = 16;

interface TaskDependencyCandidate {
	id: string;
	blockedBy?: unknown;
	workspace?: string;
	deletedAt?: string;
}

function normalizedDependencyIds(value: unknown, label = "blockedBy"): string[] {
	if (value === undefined) return [];
	if (!Array.isArray(value))
		throw new TaskRegistryError(`${label} must be an array`);
	if (value.length > TASK_DEPENDENCY_MAX_ITEMS)
		throw new TaskRegistryError(`${label} may contain at most 16 entries`);
	const normalized: string[] = [];
	const unique = new Set<string>();
	for (const dependency of value) {
		if (typeof dependency !== "string" || !isValidId(dependency))
			throw new TaskRegistryError(`invalid ${label}: ${String(dependency)}`);
		if (unique.has(dependency))
			throw new TaskRegistryError(`duplicate ${label}: ${dependency}`);
		unique.add(dependency);
		normalized.push(dependency);
	}
	return normalized;
}

function workspaceAllowsDependency(
	workspace: string | undefined,
	blocker: TaskDependencyCandidate,
): boolean {
	// Schema-version-1 records without workspace predate workspace scoping.
	if (blocker.workspace === undefined) return true;
	return blocker.workspace === workspace;
}

function assertDependencyGraphIsAcyclic(
	candidateIds: readonly string[],
	nodes: ReadonlyMap<string, TaskDependencyCandidate>,
): void {
	const visiting = new Set<string>();
	const visited = new Set<string>();
	const visit = (id: string): void => {
		if (visited.has(id)) return;
		if (visiting.has(id))
			throw new TaskRegistryError("dependency cycle rejected");
		visiting.add(id);
		for (const blocker of normalizedDependencyIds(nodes.get(id)?.blockedBy))
			visit(blocker);
		visiting.delete(id);
		visited.add(id);
	};
	for (const id of candidateIds) visit(id);
}

function validateTaskDependencies(
	candidates: readonly TaskDependencyCandidate[],
	existingRecords: readonly TaskRecordV1[] = listTasks({
		includeTombstones: true,
	}),
): ReadonlyMap<string, string[]> {
	const normalized = new Map<string, string[]>();
	const nodes = new Map<string, TaskDependencyCandidate>(
		existingRecords.map((record) => [record.id, record]),
	);
	for (const candidate of candidates) {
		if (!isValidId(candidate.id))
			throw new TaskRegistryError(`invalid task id: ${candidate.id}`);
		const blockedBy = normalizedDependencyIds(candidate.blockedBy);
		normalized.set(candidate.id, blockedBy);
		nodes.set(candidate.id, { ...candidate, blockedBy });
	}
	for (const candidate of candidates) {
		const blockedBy = normalized.get(candidate.id) ?? [];
		for (const blockerId of blockedBy) {
			const blocker = nodes.get(blockerId);
			if (!blocker || blocker.deletedAt)
				throw new TaskRegistryError(`task dependency not found: ${blockerId}`);
			if (!workspaceAllowsDependency(candidate.workspace, blocker))
				throw new TaskRegistryError(
					`foreign workspace dependency: ${blockerId}`,
				);
		}
	}
	assertDependencyGraphIsAcyclic(
		candidates.map((candidate) => candidate.id),
		nodes,
	);
	return normalized;
}

function createTaskRecord(
	input: CreateTaskInput,
	id: string,
	blockedBy: string[],
): TaskRecordV1 {
	const now = new Date().toISOString();
	const initialState: TaskState = normalizeTaskState(input.state);
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
		preview: input.preview,
		repoSlug: input.repoSlug,
		workspace: input.workspace,
		sessionId: input.sessionId,
		boundary: normalizeTaskScope(input.boundary ?? input.scope),
		instructions: mergeLegacyText(input.instructions, input.notes),
		metadata: input.metadata,
		blockedBy,
		...normalizeTaskMetadataFields(input),
	});
	if (initialState === "assigned") record.assignedAt = now;
	return record;
}

export function createTask(input: CreateTaskInput): TaskRecordV1 {
	const id = crypto.randomUUID();
	const db = openTaskDatabase();
	let record!: TaskRecordV1;
	withTaskTransaction(db, () => {
		const dependencies = validateTaskDependencies([
			{ id, blockedBy: input.blockedBy, workspace: input.workspace },
		]);
		record = createTaskRecord(input, id, dependencies.get(id) ?? []);
		writeTaskFile(record, db);
	});
	return getTask(record.id) ?? record;
}

const TASK_BATCH_MAX_ITEMS = 16;
const TASK_BATCH_KEY_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

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

const createBatchTaskRecord = (
	input: CreateTaskBatchInput,
	index: number,
	generated: readonly { id: string }[],
	aliases: Readonly<Record<string, string>>,
	workspace: string,
): TaskRecordV1 => {
	const durableBlockers = normalizedDependencyIds(input.blockedBy);
	const localBlockers = resolveLocalBatchDependencies(
		input.blockedByKeys ?? [],
		aliases,
	);
	const blockedBy = normalizedDependencyIds(
		[...durableBlockers, ...localBlockers],
		"dependency after resolution",
	);
	const id = generated[index]?.id;
	if (!id) throw new TaskRegistryError("missing generated task id");
	return createTaskRecord({ ...input, workspace }, id, blockedBy);
};

/** Creates a fully validated dependency graph without mutating existing records first. */
export function createTaskBatch(
	inputs: readonly CreateTaskBatchInput[],
	workspace: string,
	options: { beforeWrite?: () => void } = {},
): TaskBatchResult {
	if (inputs.length === 0)
		throw new TaskRegistryError("batch must contain at least one task");
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
	const persistedIds: string[] = [];
	try {
		const db = openTaskDatabase();
		withTaskTransaction(db, () => {
			const dependencies = validateTaskDependencies(records);
			for (const record of records) {
				record.blockedBy = dependencies.get(record.id) ?? [];
				options.beforeWrite?.();
				writeTaskFile(record, db);
			}
		});
		persistedIds.push(...records.map((record) => record.id));
	} catch (error) {
		if (error instanceof TaskRegistryError) throw error;
		return {
			outcome: "write_failed",
			operationId,
			failedPhase: "write_records",
			generated,
			persistedIds: [],
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
	const db = openTaskDatabase();
	let updated!: TaskRecordV1;
	withTaskTransaction(db, () => {
		const existing = getTask(id);
		if (!existing) throw new TaskRegistryError(`task not found: ${id}`);
		let nextBlockedBy = existing.blockedBy ?? [];
		if (patch.blockedBy !== undefined || patch.workspace !== undefined) {
			const dependencies = validateTaskDependencies([{
				id,
				blockedBy: patch.blockedBy ?? nextBlockedBy,
				workspace: patch.workspace ?? existing.workspace,
			}]);
			nextBlockedBy = dependencies.get(id) ?? [];
		}
		updated = sanitizeTaskValue({
			...existing,
			...(patch.summary !== undefined ? { summary: patch.summary } : {}),
			...(patch.preview !== undefined ? { preview: patch.preview } : {}),
			...(patch.usage !== undefined ? { usage: patch.usage } : {}),
			...(patch.metadata !== undefined ? { metadata: patch.metadata } : {}),
			...(patch.workspace !== undefined ? { workspace: patch.workspace } : {}),
			...(patch.boundary !== undefined || patch.scope !== undefined ? { boundary: normalizeTaskScope(patch.boundary ?? patch.scope) } : {}),
			...(patch.instructions !== undefined || patch.notes !== undefined ? { instructions: mergeLegacyText(patch.instructions, patch.notes) } : {}),
			...(patch.blockedBy !== undefined ? { blockedBy: nextBlockedBy } : {}),
			...(patch.covers !== undefined ? { covers: patch.covers } : {}),
			updatedAt: new Date().toISOString(),
			...normalizeTaskMetadataFields({
				goalId: patch.goalId !== undefined ? patch.goalId : existing.goalId,
				covers: patch.covers !== undefined ? patch.covers : existing.covers,
				produces: patch.produces !== undefined ? patch.produces : existing.produces,
				consumes: patch.consumes !== undefined ? patch.consumes : existing.consumes,
				priority: patch.priority !== undefined ? patch.priority : existing.priority,
			}),
		}) as TaskRecordV1;
		if (patch.produces?.length === 0) delete updated.produces;
		if (patch.consumes?.length === 0) delete updated.consumes;
		writeTaskFile(updated, db);
	});
	return getTask(updated.id) ?? updated;
}

const updateSameStateTask = (
	existing: TaskRecordV1,
	target: TaskState,
	opts: TransitionOptions,
	db: Parameters<typeof writeTaskFile>[1],
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
	writeTaskFile(updated, db);
	return updated;
};

const applyAssignedTransition = (
	next: TaskRecordV1,
	existing: TaskRecordV1,
	now: string,
): void => {
	if (existing.state === "failed") {
		next.retryCount = existing.retryCount + 1;
		delete next.errorReason;
		delete next.endedAt;
		delete next.outcome;
	}
	if (!existing.assignedAt) next.assignedAt = now;
};

const applyFailedTransition = (
	next: TaskRecordV1,
	existing: TaskRecordV1,
	opts: TransitionOptions,
): void => {
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
	if (target === "completed" && !opts.outcome)
		throw new TaskRegistryError("completed tasks require bounded outcome evidence");
	if (TERMINAL_TASK_STATES.has(target) && opts.outcome)
		next.outcome = normalizeTaskOutcome(opts.outcome, now);
	if (target === "skipped")
		next.skipReason = opts.skipReason ?? existing.skipReason;
};

function normalizeTaskOutcome(outcome: TaskOutcome, recordedAt?: string): TaskOutcome {
	const evidence = Array.isArray(outcome.evidence) ? outcome.evidence : [outcome.evidence as unknown as string];
	const normalized: TaskOutcome = {
		summary: outcome.summary.trim(),
		evidence: evidence.map((item) => item.trim()),
		...(recordedAt ? { recordedAt } : outcome.recordedAt ? { recordedAt: outcome.recordedAt } : {}),
	};
	if (!normalized.summary)
		throw new TaskRegistryError("completed tasks require outcome.summary");
	if (!normalized.evidence.length || normalized.evidence.some((item) => !item))
		throw new TaskRegistryError("completed tasks require outcome.evidence");
	if (normalized.summary.length > TASK_OUTCOME_SUMMARY_MAX_LENGTH)
		throw new TaskRegistryError(`outcome.summary must be at most ${TASK_OUTCOME_SUMMARY_MAX_LENGTH} characters`);
	if (normalized.evidence.length > TASK_OUTCOME_MAX_EVIDENCE_ITEMS || normalized.evidence.some((item) => item.length > TASK_OUTCOME_EVIDENCE_MAX_LENGTH))
		throw new TaskRegistryError("outcome.evidence exceeds its bounds");
	for (const [field, maxItems, maxLength] of [["validation", TASK_OUTCOME_MAX_VALIDATION_ITEMS, TASK_OUTCOME_VALIDATION_MAX_LENGTH], ["gaps", TASK_OUTCOME_MAX_GAPS_ITEMS, TASK_OUTCOME_GAPS_MAX_LENGTH]] as const) {
		const value = outcome[field] === undefined ? undefined : Array.isArray(outcome[field]) ? outcome[field] : [outcome[field] as unknown as string];
		if (value === undefined) continue;
		if (value.length > maxItems || value.some((item) => !item || item.length > maxLength))
			throw new TaskRegistryError(`outcome.${field} exceeds its bounds`);
		normalized[field] = value.map((item) => item.trim());
	}
	return normalized;
}

function normalizePersistedOutcome(value: unknown): TaskOutcome | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const input = value as Record<string, unknown>;
	const text = (field: string, max: number): string | undefined => {
		const raw = input[field];
		return typeof raw === "string" ? raw.trim().slice(0, max) || undefined : undefined;
	};
	const items = (field: string, maxItems: number, maxLength: number): string[] | undefined => {
		const raw = input[field];
		const values = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
		const result = values.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, maxLength)).filter(Boolean).slice(0, maxItems);
		return result.length ? result : undefined;
	};
	const summary = text("summary", TASK_OUTCOME_SUMMARY_MAX_LENGTH);
	const evidence = items("evidence", TASK_OUTCOME_MAX_EVIDENCE_ITEMS, TASK_OUTCOME_EVIDENCE_MAX_LENGTH);
	if (!summary && !evidence) return undefined;
	return {
		summary: summary ?? "",
		evidence: evidence ?? [],
		...(items("validation", TASK_OUTCOME_MAX_VALIDATION_ITEMS, TASK_OUTCOME_VALIDATION_MAX_LENGTH) ? { validation: items("validation", TASK_OUTCOME_MAX_VALIDATION_ITEMS, TASK_OUTCOME_VALIDATION_MAX_LENGTH) } : {}),
		...(items("gaps", TASK_OUTCOME_MAX_GAPS_ITEMS, TASK_OUTCOME_GAPS_MAX_LENGTH) ? { gaps: items("gaps", TASK_OUTCOME_MAX_GAPS_ITEMS, TASK_OUTCOME_GAPS_MAX_LENGTH) } : {}),
		...(typeof input.recordedAt === "string" ? { recordedAt: input.recordedAt } : {}),
	};
}

const applyTransitionDetails = (
	next: TaskRecordV1,
	existing: TaskRecordV1,
	target: TaskState,
	opts: TransitionOptions,
	now: string,
): void => {
	if (target === "assigned") applyAssignedTransition(next, existing, now);
	if (target === "failed") applyFailedTransition(next, existing, opts);
	applyTerminalTransition(next, existing, target, opts, now);
	if (opts.usage) next.usage = opts.usage;
};

function assertCurrentTransitionTarget(target: TaskStateInput): asserts target is TaskState {
	if (!TASK_STATES.includes(target as TaskState))
		throw new TaskRegistryError(`unsupported current task state: ${String(target)}`);
}

function transitionTaskInTransaction(
	db: Parameters<typeof writeTaskFile>[1],
	id: string,
	target: TaskStateInput,
	opts: TransitionOptions,
): TaskRecordV1 {
	assertCurrentTransitionTarget(target);
	const normalizedTarget = target;
	const existing = getTask(id);
	if (!existing) throw new TaskRegistryError(`task not found: ${id}`);
	if (existing.state === normalizedTarget) return updateSameStateTask(existing, normalizedTarget, opts, db);
	if (!isAllowedTransition(existing.state, normalizedTarget)) {
		const allowed = [...(ALLOWED_TRANSITIONS.get(existing.state) ?? [])].join(", ") || "(none)";
		throw new TaskRegistryError(`invalid transition for ${id}: ${existing.state} -> ${normalizedTarget} (allowed: ${allowed})`);
	}
	const now = new Date().toISOString();
	const next = sanitizeTaskValue({ ...existing, state: normalizedTarget, updatedAt: now }) as TaskRecordV1;
	applyTransitionDetails(next, existing, normalizedTarget, opts, now);
	writeTaskFile(next, db);
	return next;
}

export function transitionTask(
	id: string,
	target: TaskStateInput,
	opts: TransitionOptions = {},
): TaskRecordV1 {
	const db = openTaskDatabase();
	return withTaskTransaction(db, () => transitionTaskInTransaction(db, id, target, opts));
}

export function updateAndTransitionTask(
	id: string,
	patch: UpdateTaskPatch,
	target: TaskStateInput,
	opts: TransitionOptions = {},
): TaskRecordV1 {
	const db = openTaskDatabase();
	return withTaskTransaction(db, () => {
		const existing = getTask(id);
		if (!existing) throw new TaskRegistryError(`task not found: ${id}`);
		const updated = sanitizeTaskValue({
			...existing,
			...(patch.summary !== undefined ? { summary: patch.summary } : {}),
			...(patch.preview !== undefined ? { preview: patch.preview } : {}),
			...(patch.usage !== undefined ? { usage: patch.usage } : {}),
			...(patch.metadata !== undefined ? { metadata: patch.metadata } : {}),
			...(patch.workspace !== undefined ? { workspace: patch.workspace } : {}),
			...(patch.boundary !== undefined || patch.scope !== undefined ? { boundary: normalizeTaskScope(patch.boundary ?? patch.scope) } : {}),
			...(patch.instructions !== undefined || patch.notes !== undefined ? { instructions: mergeLegacyText(patch.instructions, patch.notes) } : {}),
			...(patch.blockedBy !== undefined ? { blockedBy: patch.blockedBy } : {}),
			...(patch.covers !== undefined ? { covers: patch.covers } : {}),
			updatedAt: new Date().toISOString(),
			...normalizeTaskMetadataFields({
				goalId: patch.goalId !== undefined ? patch.goalId : existing.goalId,
				covers: patch.covers !== undefined ? patch.covers : existing.covers,
				produces: patch.produces !== undefined ? patch.produces : existing.produces,
				consumes: patch.consumes !== undefined ? patch.consumes : existing.consumes,
				priority: patch.priority !== undefined ? patch.priority : existing.priority,
			}),
		}) as TaskRecordV1;
		if (patch.produces?.length === 0) delete updated.produces;
		if (patch.consumes?.length === 0) delete updated.consumes;
		if (patch.blockedBy !== undefined || patch.workspace !== undefined) {
			const dependencies = validateTaskDependencies([{
				id,
				blockedBy: updated.blockedBy,
				workspace: updated.workspace,
			}]);
			updated.blockedBy = dependencies.get(id) ?? [];
		}
			assertCurrentTransitionTarget(target);
		if (target === "assigned") {
			const readiness = getTaskReadiness(updated, tasksByIdSnapshot(listTasks({ includeTombstones: true })));
			if (!readiness.ready)
				throw new TaskRegistryError(`task is waiting on ${readiness.unmetBlockers.map((item) => item.id).join(", ")}`);
		}
		writeTaskFile(updated, db);
		return transitionTaskInTransaction(db, id, target, opts);
	});
}

export function safeTransitionTask(
	id: string,
	target: TaskStateInput,
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

function readAllTaskRecords(): TaskRecordV1[] {
	return readStoredTasks()
		.map((record) => normalizeTaskRecord(record))
		.filter((record): record is TaskRecordV1 => record !== null);
}

function deriveReverseBlocks(records: readonly TaskRecordV1[]): TaskRecordV1[] {
	const reverse = new Map<string, string[]>();
	for (const record of records) {
		for (const blockerId of record.blockedBy ?? []) {
			const dependents = reverse.get(blockerId) ?? [];
			dependents.push(record.id);
			reverse.set(blockerId, dependents);
		}
	}
	return records.map((record) => ({
		...record,
		blocks: sortedTaskIds(reverse.get(record.id)),
	}));
}

export const getTask = (id: string): TaskRecordV1 | null => {
	if (!isValidId(id)) return null;
	return deriveReverseBlocks(readAllTaskRecords()).find(
		(record) => record.id === id,
	) ?? null;
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
	if (opts.sessionId && record.sessionId !== opts.sessionId) return false;
	return true;
};

export const listTasks = (opts: ListTasksOptions = {}): TaskRecordV1[] => {
	const stateFilter = opts.states ? new Set(opts.states) : null;
	const originFilter = opts.origins ? new Set(opts.origins) : null;
	const out = deriveReverseBlocks(readAllTaskRecords()).filter(
		(record) =>
			matchesTaskStateAndOrigin(record, stateFilter, originFilter) &&
			matchesTaskListScope(record, opts),
	);
	out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	if (opts.limit && opts.limit > 0) return out.slice(0, opts.limit);
	return out;
};

function isRetiredTaskRecord(record: TaskRecordV1): boolean {
	return (
		record.prompt !== undefined ||
		record.agentName !== undefined ||
		record.execution !== undefined ||
		typeof record.metadata?.legacyTodoId === "string"
	);
}

function protectedTaskIds(
	records: readonly TaskRecordV1[],
	removeUnowned: boolean,
): Set<string> {
	const byId = tasksByIdSnapshot(records);
	const protectedIds = new Set<string>();
	const pending = records
		.filter(
			(record) =>
				!record.deletedAt &&
				!isRetiredTaskRecord(record) &&
				!TERMINAL_TASK_STATES.has(record.state) &&
				(!removeUnowned || Boolean(record.sessionId)),
		)
		.flatMap((record) => record.blockedBy ?? []);
	while (pending.length > 0) {
		const id = pending.pop();
		if (!id || protectedIds.has(id)) continue;
		protectedIds.add(id);
		pending.push(...(byId.get(id)?.blockedBy ?? []));
	}
	return protectedIds;
}

export function pruneTaskRegistry(
	options: TaskPruneOptions = {},
): TaskPruneResult {
	const records = listTasks({ includeTombstones: true });
	const protectedIds = protectedTaskIds(
		records,
		options.removeUnowned === true,
	);
	const removable = records.filter(
		(record) =>
			!protectedIds.has(record.id) &&
			(isRetiredTaskRecord(record) ||
				TERMINAL_TASK_STATES.has(record.state) ||
				(options.removeUnowned === true && !record.sessionId)),
	);
	const removedIds = new Set(removable.map((record) => record.id));
	withTaskTransaction(openTaskDatabase(), () => {
		for (const id of removedIds) deleteStoredTask(id);
	});
	return {
		removedIds: [...removedIds],
		retiredRemoved: removable.filter(isRetiredTaskRecord).length,
		terminalRemoved: removable.filter(
			(record) =>
				!isRetiredTaskRecord(record) &&
				TERMINAL_TASK_STATES.has(record.state),
		).length,
		unownedRemoved: removable.filter(
			(record) =>
				!isRetiredTaskRecord(record) &&
				!TERMINAL_TASK_STATES.has(record.state) &&
				!record.sessionId,
		).length,
	};
}

export function tombstoneTask(id: string, reason = "deleted"): TaskRecordV1 {
	const db = openTaskDatabase();
	let tombstone!: TaskRecordV1;
	withTaskTransaction(db, () => {
		const existing = getTask(id);
		if (!existing) throw new TaskRegistryError(`task not found: ${id}`);
		const now = new Date().toISOString();
		const state = TERMINAL_TASK_STATES.has(existing.state) ? existing.state : "skipped";
		tombstone = sanitizeTaskValue({
			...existing,
			state,
			deletedAt: now,
			endedAt: existing.endedAt ?? now,
			updatedAt: now,
			metadata: { ...(existing.metadata ?? {}), tombstoneReason: reason },
		}) as TaskRecordV1;
		writeTaskFile(tombstone, db);
	});
	return tombstone;
}

export type BlockerStatus =
	| "missing"
	| "tombstoned"
	| TaskState;

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
	return task.state === "unassigned" && getTaskReadiness(task, tasksById).ready;
}

export function startTask(id: string): TaskOperationResult {
	const db = openTaskDatabase();
	try {
		return withTaskTransaction(db, () => {
			const record = getTask(id);
			if (!record) return { outcome: "not_found", error: `task not found: ${id}` };
			const readiness = getTaskReadiness(record, tasksByIdSnapshot(listTasks({ includeTombstones: true })));
			if (!readiness.ready)
				return {
					outcome: "rejected",
					record,
					readiness,
					error: `task is waiting on ${readiness.unmetBlockers.map((item) => item.id).join(", ")}`,
				};
			return { outcome: "persisted", record: transitionTaskInTransaction(db, id, "assigned", {}), readiness };
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { outcome: message.includes("not found") ? "not_found" : "rejected", error: message };
	}
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

function sharesResource(left: readonly string[] | undefined, right: readonly string[] | undefined): boolean {
	if (!left || !right) return false;
	const rightResources = new Set(right);
	return left.some((resource) => rightResources.has(resource));
}

function incompleteDirectDependents(
	task: TaskRecordV1,
	tasks: readonly TaskRecordV1[],
): number {
	return tasks.filter(
		(candidate) =>
			candidate.blockedBy?.includes(task.id) === true &&
			!UNBLOCKING_STATES.has(candidate.state),
	).length;
}

export function compareReadyTasks(
	left: TaskRecordV1,
	right: TaskRecordV1,
	allTasks: readonly TaskRecordV1[] = [left, right],
): number {
	const priority = (right.priority ?? 0) - (left.priority ?? 0);
	if (priority !== 0) return priority;
	if (sharesResource(left.produces, right.consumes)) return -1;
	if (sharesResource(right.produces, left.consumes)) return 1;
	const dependents =
		incompleteDirectDependents(right, allTasks) -
		incompleteDirectDependents(left, allTasks);
	if (dependents !== 0) return dependents;
	const created = right.createdAt.localeCompare(left.createdAt);
	return created !== 0 ? created : left.id.localeCompare(right.id);
}

export function partitionReadyTasks(tasks: readonly TaskRecordV1[]): {
	ready: TaskRecordV1[];
	waiting: TaskRecordV1[];
	blocked: TaskRecordV1[];
} {
	const byId = tasksByIdSnapshot(tasks);
	const ready = tasks.filter((task) => isTaskReady(task, byId));
	ready.sort((left, right) => compareReadyTasks(left, right, tasks));
	return {
		ready,
		waiting: tasks.filter(
			(task) =>
				task.state === "unassigned" && getUnmetBlockers(task, byId).length > 0,
		),
		blocked: [],
	};
}

export function clearCompletedTasks(
	workspace?: string,
	sessionId?: string,
): TaskRecordV1[] {
	return listTasks({ includeTombstones: true })
		.filter(
			(task) =>
				task.state === "completed" &&
				!task.deletedAt &&
				(!workspace || task.workspace === workspace) &&
				(!sessionId || task.sessionId === sessionId),
		)
		.map((task) => tombstoneTask(task.id, "clear completed"));
}
