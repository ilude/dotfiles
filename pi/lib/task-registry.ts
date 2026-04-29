/**
 * Task registry -- canonical durable task store for the operator layer.
 *
 * Owned by .specs/pi-operator-layer-mvp/plan.md (T1). This is the single
 * source of truth for TaskRecordV1; other plans (notably platform-alignment
 * Phase 4 T11/T12) consume this registry and must NOT define a parallel
 * task-tracker. See "Related Plans" in operator-layer-mvp plan.md.
 *
 * Storage: one JSON file per task at <operator-state-dir>/tasks/<id>.json.
 * Reads enumerate the directory; this stays cheap until the registry grows
 * past a few thousand records, at which point a manifest index can be added
 * without changing the public API.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import {
	ALLOWED_TRANSITIONS,
	ensureDirectory,
	getTasksDir,
	type TaskState,
	isAllowedTransition,
} from "./operator-state.ts";

export type { TaskState } from "./operator-state.ts";

/**
 * Origin classifier. Distinguishes durable producer types so /tasks can
 * filter trivial inline work out of the urgency-grouped view.
 */
export type TaskOrigin = "subagent" | "team" | "shell" | "other";

/**
 * Token usage snapshot at task end. All counters are optional because not
 * every producer reports them.
 */
export interface TaskUsage {
	inputTokens?: number;
	outputTokens?: number;
	totalTokens?: number;
	cacheCreationInputTokens?: number;
	cacheReadInputTokens?: number;
}

/**
 * TaskRecordV1 -- canonical task schema. The schemaVersion field is reserved
 * for future migrations; consumers should treat unknown fields as opaque and
 * preserve them on round-trip writes.
 */
export interface TaskRecordV1 {
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
	blockReason?: string;
	errorReason?: string;
	usage?: TaskUsage;
	metadata?: Record<string, unknown>;
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
	metadata?: Record<string, unknown>;
}

export interface UpdateTaskPatch {
	summary?: string;
	preview?: string;
	usage?: TaskUsage;
	metadata?: Record<string, unknown>;
	agentName?: string;
}

export interface TransitionOptions {
	blockReason?: string;
	errorReason?: string;
	usage?: TaskUsage;
}

export interface ListTasksOptions {
	states?: readonly TaskState[];
	origins?: readonly TaskOrigin[];
	repoSlug?: string;
	limit?: number;
}

export class TaskRegistryError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TaskRegistryError";
	}
}

// ---------------------------------------------------------------------------
// File IO
// ---------------------------------------------------------------------------

function taskFilePath(id: string): string {
	if (!isValidId(id)) throw new TaskRegistryError(`invalid task id: ${id}`);
	return path.join(getTasksDir(), `${id}.json`);
}

function isValidId(id: string): boolean {
	return typeof id === "string" && /^[A-Za-z0-9_-]+$/.test(id) && id.length > 0 && id.length <= 64;
}

function readTaskFile(file: string): TaskRecordV1 | null {
	try {
		const raw = fs.readFileSync(file, "utf-8");
		const parsed = JSON.parse(raw) as TaskRecordV1;
		if (parsed && parsed.schemaVersion === 1 && typeof parsed.id === "string") return parsed;
		return null;
	} catch {
		return null;
	}
}

function writeTaskFile(record: TaskRecordV1): void {
	ensureDirectory(getTasksDir());
	const target = taskFilePath(record.id);
	const tmp = `${target}.${process.pid}.tmp`;
	fs.writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
	fs.renameSync(tmp, target);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create and persist a new task record. The returned record reflects exactly
 * what was written to disk (after default-fill).
 */
export function createTask(input: CreateTaskInput): TaskRecordV1 {
	const now = new Date().toISOString();
	const initialState: TaskState = input.state ?? "pending";
	const record: TaskRecordV1 = {
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
		metadata: input.metadata,
	};
	if (initialState === "running") record.startedAt = now;
	writeTaskFile(record);
	return record;
}

/**
 * Patch fields on an existing record without changing state. Use
 * transitionTask for state changes so the lifecycle invariants hold.
 */
export function updateTask(id: string, patch: UpdateTaskPatch): TaskRecordV1 {
	const existing = getTask(id);
	if (!existing) throw new TaskRegistryError(`task not found: ${id}`);
	const updated: TaskRecordV1 = {
		...existing,
		...(patch.summary !== undefined ? { summary: patch.summary } : {}),
		...(patch.preview !== undefined ? { preview: patch.preview } : {}),
		...(patch.usage !== undefined ? { usage: patch.usage } : {}),
		...(patch.metadata !== undefined ? { metadata: patch.metadata } : {}),
		...(patch.agentName !== undefined ? { agentName: patch.agentName } : {}),
		updatedAt: new Date().toISOString(),
	};
	writeTaskFile(updated);
	return updated;
}

/**
 * Move a task to `target`. Throws TaskRegistryError if the transition is not
 * permitted. Failed -> running increments retryCount and clears errorReason
 * so a retried run does not appear pre-failed.
 */
export function transitionTask(
	id: string,
	target: TaskState,
	opts: TransitionOptions = {},
): TaskRecordV1 {
	const existing = getTask(id);
	if (!existing) throw new TaskRegistryError(`task not found: ${id}`);
	if (existing.state === target) {
		throw new TaskRegistryError(
			`task ${id} already in state ${target}; use updateTask for in-place changes`,
		);
	}
	if (!isAllowedTransition(existing.state, target)) {
		const allowed = [...(ALLOWED_TRANSITIONS.get(existing.state) ?? [])].join(", ") || "(none)";
		throw new TaskRegistryError(
			`invalid transition for ${id}: ${existing.state} -> ${target} (allowed: ${allowed})`,
		);
	}

	const now = new Date().toISOString();
	const next: TaskRecordV1 = { ...existing, state: target, updatedAt: now };

	if (target === "running") {
		if (existing.state === "failed") {
			next.retryCount = existing.retryCount + 1;
			delete next.errorReason;
		}
		if (!existing.startedAt) next.startedAt = now;
		delete next.blockReason;
	}
	if (target === "blocked") {
		next.blockReason = opts.blockReason ?? existing.blockReason;
	}
	if (target === "failed") {
		next.errorReason = opts.errorReason ?? existing.errorReason;
		next.endedAt = now;
	}
	if (target === "completed" || target === "cancelled") {
		next.endedAt = now;
	}
	if (opts.usage) next.usage = opts.usage;

	writeTaskFile(next);
	return next;
}

export function getTask(id: string): TaskRecordV1 | null {
	if (!isValidId(id)) return null;
	const file = taskFilePath(id);
	if (!fs.existsSync(file)) return null;
	return readTaskFile(file);
}

/**
 * Enumerate tasks, newest-first by createdAt. Filters are AND-combined.
 */
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
		if (stateFilter && !stateFilter.has(record.state)) continue;
		if (originFilter && !originFilter.has(record.origin)) continue;
		if (opts.repoSlug && record.repoSlug !== opts.repoSlug) continue;
		out.push(record);
	}
	out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	if (opts.limit && opts.limit > 0) return out.slice(0, opts.limit);
	return out;
}
