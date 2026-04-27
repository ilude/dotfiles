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

/**
 * Six-state task lifecycle. Order is significant for urgency-ordered listing
 * surfaces (blocked > failed > running > pending > completed > cancelled).
 */
export const TASK_STATES = [
	"pending",
	"running",
	"blocked",
	"completed",
	"failed",
	"cancelled",
] as const;

export type TaskState = (typeof TASK_STATES)[number];

export const TERMINAL_TASK_STATES: ReadonlySet<TaskState> = new Set(["completed", "cancelled"]);

/**
 * Allowed state transitions. Source state -> set of valid target states.
 *
 * - pending -> running (started), cancelled (never ran), failed (failed validation)
 * - running -> blocked (waiting), completed, failed, cancelled
 * - blocked -> running (resumed), failed, cancelled
 * - failed -> running (retry only; preserves retryCount + prior errorReason)
 * - completed and cancelled are terminal.
 */
export const ALLOWED_TRANSITIONS: ReadonlyMap<TaskState, ReadonlySet<TaskState>> = new Map([
	["pending", new Set<TaskState>(["running", "cancelled", "failed"])],
	["running", new Set<TaskState>(["blocked", "completed", "failed", "cancelled"])],
	["blocked", new Set<TaskState>(["running", "failed", "cancelled"])],
	["failed", new Set<TaskState>(["running"])],
	["completed", new Set<TaskState>()],
	["cancelled", new Set<TaskState>()],
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

export function getSessionApprovalsPath(): string {
	return path.join(getPermissionsDir(), "session-approvals.json");
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
export function isAllowedTransition(source: TaskState, target: TaskState): boolean {
	const allowed = ALLOWED_TRANSITIONS.get(source);
	return allowed ? allowed.has(target) : false;
}
