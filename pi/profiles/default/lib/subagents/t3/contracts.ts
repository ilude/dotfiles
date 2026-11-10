import type { CloseoutManifest } from "../../plan-integration/contracts.ts";
import type { GoalAdmission } from "../../goal/runtime.ts";
import type { RoleResolutionSnapshot, SubagentBackend } from "../authority.ts";

/** Pi-owned metadata contracts. No T3 product types or lifecycle storage. No credentials. */
export const T3_ROLE_CONTRACT_VERSION = 1;
export const T3_ROLE_SNAPSHOT_ENTRY = "t3-role-snapshot";
export const T3_ROLE_RECEIPT_ENTRY = "t3-role-receipt";
export const T3_ROLE_OUTCOME_ENTRY = "t3-role-outcome";
export interface T3RoleCommissioner {
  readonly threadId: string;
  readonly runId: string;
  readonly piSessionId: string;
  readonly piSessionFile: string;
  readonly profile: string;
  readonly cwd: string;
  readonly parentLaunchId?: string;
}
export interface RoleGoalScope {
  readonly runId: string;
  readonly ownerSessionId: string;
  readonly ownerSessionFile: string;
}
export interface T3RoleHandoff {
  readonly version: 1;
  readonly launchId: string;
  readonly snapshot: RoleResolutionSnapshot;
  readonly commissioner: T3RoleCommissioner;
  readonly assignment: string;
  /** Public T3 title carrying the profile-generated launch correlation marker. */
  readonly taskTitle?: string;
  readonly workspace: { readonly isolation: "shared" | "worktree"; readonly commissioningCwd: string };
  readonly goal?: RoleGoalScope;
  /** Validated separately by the closeout owner, never inferred from task prose. */
  readonly closeout?: CloseoutManifest;
}
/** Actual metadata service observations, not values supplied by the model. */
export interface T3ThreadIdentity {
  readonly threadId: string;
  readonly parentThreadId?: string;
  readonly taskId?: string;
  readonly runId?: string;
  readonly cwd: string;
}
/** Immutable authority binding. A retained thread can acquire new task/run/Pi session IDs. */
export interface T3RoleThreadBinding {
  readonly version: 1;
  readonly launchId: string;
  readonly threadId: string;
  readonly parentThreadId: string;
  readonly profile: string;
  readonly cwd: string;
  readonly snapshot: RoleResolutionSnapshot;
  readonly commissioner: T3RoleCommissioner;
  readonly taskTitle?: string;
  readonly goal?: RoleGoalScope;
  readonly closeout?: CloseoutManifest;
}
/** Pi receipt records ownership and current assignment identity, never canonical execution status. */
export interface T3RoleOwnershipReceipt {
  readonly version: 1;
  readonly launchId: string;
  readonly ownerThreadId: string;
  readonly ownerPiSessionId: string;
  readonly childThreadId: string;
  readonly taskId: string;
  readonly runId?: string;
  readonly childLink?: string;
  readonly childPiSessionId?: string;
  readonly childPiSessionFile?: string;
  readonly operation: "launch" | "follow-up";
}
export type RoleOutcome = "completed" | "partial" | "blocked" | "failed" | "cancelled";
export interface T3RoleOutcomeReport {
  readonly version: 1;
  readonly launchId: string;
  readonly threadId: string;
  readonly runId: string;
  /** A blocking launch may not have returned its task ID to the parent yet. */
  readonly taskId?: string;
  readonly roleOutcome: RoleOutcome;
  readonly summary: string;
}
/** T3 status remains verbatim and separate from the substantive role result. */
export interface T3RoleResult {
  readonly launchId: string;
  readonly threadId: string;
  readonly taskId: string;
  readonly runId?: string;
  readonly childLink?: string;
  readonly piSessionId?: string;
  readonly t3Status: string;
  readonly roleOutcome?: RoleOutcome;
  readonly result?: string;
  readonly hasPendingQuestion?: boolean;
  readonly childWorkContinues?: boolean;
}

/** Runtime policy callbacks are intentionally distinct from serializable RoleGoalScope. */
export interface SubagentGoalBinding {
  runId: string;
  capture: () => boolean;
  admit: () => Promise<GoalAdmission>;
  enroll: (session: string) => void;
  close?: (session: string) => void;
  accounting: (event: unknown) => Promise<void>;
}
/** The existing goal controller needs no process manager or T3 lifecycle implementation. */
export interface SubagentGoalOperations {
  bindGoal(origin: string, binding: SubagentGoalBinding): void;
  unbindGoal(origin: string, binding: SubagentGoalBinding): void;
  stopGoal(origin: string, runId: string): Promise<void>;
  goalActive(origin: string, runId: string): boolean | Promise<boolean>;
  assertGoalControl(id: string, origin: string, action: string): void | Promise<void>;
}
export interface SelectedSubagentBackend {
  readonly kind: SubagentBackend;
  readonly goals: SubagentGoalOperations;
}
