import {
  GOAL_ENTRY_TYPE,
  GOAL_STATE_VERSION,
  type CreateGoalInput,
  type GoalOperational,
  type GoalOutcome,
  type GoalState,
} from "./contract.js";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function keys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function texts(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(text);
}

function outcome(value: unknown): value is GoalOutcome {
  return value === "running" || value === "complete" || value === "question" ||
    value === "blocker" || value === "budget" || value === "interrupted";
}

function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Validate and explicitly project persisted data. Returned objects do not alias the input. */
export function parseGoalState(value: unknown): GoalState | undefined {
  if (!record(value) || !keys(value, ["version", "runId", "sessionId", "startedAt", "authority", "budget", "outcome", "operational"])) return undefined;
  if (value.version !== GOAL_STATE_VERSION || !text(value.runId) || !text(value.sessionId) || !text(value.startedAt) || !outcome(value.outcome)) return undefined;
  const date = new Date(value.startedAt);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value.startedAt) return undefined;

  const authority = value.authority;
  if (!record(authority) || !keys(authority, ["goal", "scope", "exclusions", "decisions"]) ||
      !text(authority.goal) || !texts(authority.scope) || !texts(authority.exclusions) || !texts(authority.decisions)) return undefined;
  const budget = value.budget;
  if (!record(budget) || !keys(budget, ["bedrockUsd", "codexPercent"])) return undefined;
  if (budget.bedrockUsd !== undefined && !positive(budget.bedrockUsd)) return undefined;
  if (budget.codexPercent !== undefined && (!positive(budget.codexPercent) || budget.codexPercent > 100)) return undefined;
  const operational = value.operational;
  if (!record(operational) || !keys(operational, ["findings", "notes"]) || !texts(operational.findings) || !texts(operational.notes)) return undefined;

  return {
    version: GOAL_STATE_VERSION,
    runId: value.runId,
    sessionId: value.sessionId,
    startedAt: value.startedAt,
    authority: {
      goal: authority.goal,
      scope: [...authority.scope],
      exclusions: [...authority.exclusions],
      decisions: [...authority.decisions],
    },
    budget: {
      ...(budget.bedrockUsd === undefined ? {} : { bedrockUsd: budget.bedrockUsd }),
      ...(budget.codexPercent === undefined ? {} : { codexPercent: budget.codexPercent }),
    },
    outcome: value.outcome,
    operational: { findings: [...operational.findings], notes: [...operational.notes] },
  };
}

function validated(value: unknown): GoalState {
  const state = parseGoalState(value);
  if (!state) throw new Error("Invalid goal state");
  return state;
}

export function createGoalState(input: CreateGoalInput): GoalState {
  return validated({
    version: GOAL_STATE_VERSION,
    runId: input.runId,
    sessionId: input.sessionId,
    startedAt: input.startedAt,
    authority: input.authority,
    budget: input.budget ?? {},
    outcome: "running",
    operational: { findings: [], notes: [] },
  });
}

/** Pass customType and data to pi.appendEntry(); Pi supplies entry IDs and timestamps. */
export function goalSnapshot(state: GoalState): { customType: typeof GOAL_ENTRY_TYPE; data: GoalState } {
  return { customType: GOAL_ENTRY_TYPE, data: validated(state) };
}

/**
 * Supply ctx.sessionManager.getBranch(), root to leaf, not getEntries() or projected
 * model context. Custom entries survive compaction without trusting its summary.
 * A malformed or foreign-session latest snapshot invalidates restoration; never
 * fall back to an older running snapshot and accidentally resume finished work.
 */
export function restoreGoalState(branch: readonly unknown[], sessionId: string): GoalState | undefined {
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i];
    if (!record(entry) || entry.type !== "custom" || entry.customType !== GOAL_ENTRY_TYPE) continue;
    const state = parseGoalState(entry.data);
    return state?.sessionId === sessionId ? state : undefined;
  }
  return undefined;
}

/** Operational updates cannot write authority, identity, budget or outcome. */
export function withGoalOperational(state: GoalState, operational: GoalOperational): GoalState {
  return validated({ ...state, operational });
}

export function withGoalOutcome(state: GoalState, next: GoalOutcome): GoalState {
  return validated({ ...state, outcome: next });
}
