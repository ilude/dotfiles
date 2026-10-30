/** Versioned, JSON-only state. Runtime handles, usage baselines and reserves live elsewhere. */
export const GOAL_ENTRY_TYPE = "goal-state";
export const GOAL_STATE_VERSION = 1;

/** Only direct user instructions may establish or revise these acceptance terms. */
export interface GoalAuthority {
  readonly goal: string;
  readonly scope: readonly string[];
  readonly exclusions: readonly string[];
  readonly decisions: readonly string[];
}

export interface GoalBudgetConfig {
  readonly bedrockUsd?: number;
  readonly codexPercent?: number;
}

export type GoalOutcome = "running" | "complete" | "question" | "blocker" | "budget" | "interrupted";

/** Evidence and working notes are not acceptance criteria or user decisions. */
export interface GoalOperational {
  readonly findings: readonly string[];
  readonly notes: readonly string[];
}

export interface GoalState {
  readonly version: typeof GOAL_STATE_VERSION;
  readonly runId: string;
  readonly sessionId: string;
  /** Canonical UTC ISO timestamp. */
  readonly startedAt: string;
  readonly authority: GoalAuthority;
  readonly budget: GoalBudgetConfig;
  readonly outcome: GoalOutcome;
  readonly operational: GoalOperational;
}

export interface CreateGoalInput {
  readonly runId: string;
  readonly sessionId: string;
  readonly startedAt: string;
  readonly authority: GoalAuthority;
  readonly budget?: GoalBudgetConfig;
}
