/**
 * Operator state -- shared storage paths and constants for the operator layer.
 *
 * Owned by .specs/pi-operator-layer-mvp/plan.md (T1). Other modules in pi/lib/
 * (task-registry, permission-registry) build on this; no other plan should
 * define a parallel state directory or registry.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { getAgentDir } from "./extension-utils.ts";

/** Current task lifecycle. Order is significant for urgency-ordered listings. */
export const TASK_STATES = [
	"unassigned",
	"assigned",
	"completed",
	"failed",
	"skipped",
] as const;

export type TaskState = (typeof TASK_STATES)[number];

export const TERMINAL_TASK_STATES: ReadonlySet<TaskState> = new Set([
	"completed",
	"skipped",
]);

/** Explicitly supported task transitions. Tasks do not represent processes. */
export const ALLOWED_TRANSITIONS: ReadonlyMap<
	TaskState,
	ReadonlySet<TaskState>
> = new Map([
	["unassigned", new Set<TaskState>(["assigned", "skipped"])],
	[
		"assigned",
		new Set<TaskState>(["unassigned", "completed", "failed", "skipped"]),
	],
	["completed", new Set<TaskState>()],
	["failed", new Set<TaskState>(["assigned", "skipped"])],
	["skipped", new Set<TaskState>()],
]);

/**
 * Operator state root: ~/.pi/agent/operator.
 *
 * Honors PI_OPERATOR_DIR for tests and explicit overrides. Falls back to the
 * agent-dir convention used by expertise and transcript modules.
 */
export function getOperatorStateDir(): string {
	const override = process.env.PI_OPERATOR_DIR;
	if (override && override.length > 0) return override;
	return path.join(getAgentDir(), "operator");
}

export function getTasksDir(): string {
	return path.join(getOperatorStateDir(), "tasks");
}

export function getPermissionsDir(): string {
	return path.join(getOperatorStateDir(), "permissions");
}

export function getDecisionsLogPath(): string {
	return path.join(getPermissionsDir(), "decisions.jsonl");
}

/**
 * Idempotent mkdir. Safe to call from concurrent extensions on the same path.
 */
export function ensureDirectory(dirPath: string): void {
	fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * True iff `target` is a permitted transition from `source`. Same-state
 * "transitions" return false; updateTask is the path for in-place changes.
 */
export function isAllowedTransition(
	source: TaskState,
	target: TaskState,
): boolean {
	const allowed = ALLOWED_TRANSITIONS.get(source);
	return allowed ? allowed.has(target) : false;
}
