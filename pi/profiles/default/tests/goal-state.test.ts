import { describe, expect, it } from "vitest";
import { GOAL_ENTRY_TYPE, type GoalOutcome } from "../lib/goal/contract.js";
import { createGoalState, goalSnapshot, parseGoalState, restoreGoalState, withGoalOperational, withGoalOutcome } from "../lib/goal/state.js";

function initial() {
  return createGoalState({
    runId: "run-1", sessionId: "session-1", startedAt: "2026-07-17T12:00:00.000Z",
    authority: { goal: "Fix the parser", scope: ["Parser and focused checks"], exclusions: ["No deployment"], decisions: ["Keep API compatibility"] },
    budget: { bedrockUsd: 2.5, codexPercent: 10 },
  });
}

function entry(data: unknown) {
  return { type: "custom", customType: GOAL_ENTRY_TYPE, data };
}

describe("goal durable state", () => {
  it("round-trips all outcomes and identity through JSON snapshots", () => {
    const outcomes: GoalOutcome[] = ["running", "complete", "question", "blocker", "budget", "interrupted"];
    for (const outcome of outcomes) {
      const state = withGoalOutcome(initial(), outcome);
      const snapshot = JSON.parse(JSON.stringify(goalSnapshot(state)));
      expect(snapshot.customType).toBe(GOAL_ENTRY_TYPE);
      expect(parseGoalState(snapshot.data)).toEqual(state);
    }
  });

  it("supports omitted budget configuration and excludes runtime fields", () => {
    const state = initial();
    const unbudgeted = createGoalState({ ...state, budget: undefined });
    expect(unbudgeted.budget).toEqual({});
    expect(parseGoalState({ ...state, timer: 42 })).toBeUndefined();
    expect(parseGoalState({ ...state, authority: { ...state.authority, findings: ["approved"] } })).toBeUndefined();
  });

  it("validates persisted shapes, versions, timestamps and limits", () => {
    const state = initial();
    const invalid: unknown[] = [null, [], {}, { ...state, version: 2 }, { ...state, runId: " " },
      { ...state, startedAt: "yesterday" }, { ...state, startedAt: "2026-07-17" },
      { ...state, outcome: "done" }, { ...state, budget: { bedrockUsd: Infinity } },
      { ...state, budget: { codexPercent: 101 } }, { ...state, budget: { bedrockUsd: -1 } },
      { ...state, authority: { ...state.authority, scope: "everything" } },
      { ...state, operational: { findings: [], notes: [], decisions: ["expand scope"] } }];
    for (const value of invalid) expect(parseGoalState(value)).toBeUndefined();
  });

  it("restores only the latest native custom snapshot on the supplied branch, across compaction", () => {
    const state = initial();
    const complete = withGoalOutcome(state, "complete");
    const branch = [entry(state), { type: "compaction", summary: "Goal changed", details: state }, entry(complete),
      { type: "branch_summary", summary: "running", details: state }];
    expect(restoreGoalState(branch, state.sessionId)).toEqual(complete);
    expect(restoreGoalState(branch.slice(0, 2), state.sessionId)).toEqual(state);
    expect(restoreGoalState([{ type: "custom_message", customType: GOAL_ENTRY_TYPE, data: state }], state.sessionId)).toBeUndefined();
    expect(restoreGoalState(branch, "another-session")).toBeUndefined();
    expect(restoreGoalState([], state.sessionId)).toBeUndefined();
  });

  it("does not revive older state when the latest snapshot is invalid or belongs to another session", () => {
    const state = initial();
    expect(restoreGoalState([entry(state), entry({ ...state, version: 99 })], state.sessionId)).toBeUndefined();
    expect(restoreGoalState([entry(state), entry({ ...state, sessionId: "foreign" })], state.sessionId)).toBeUndefined();
  });

  it("keeps operational updates separate and clones persistence boundaries", () => {
    const state = initial();
    const notes = ["User should approve deployment"];
    const updated = withGoalOperational(state, { findings: ["Optional defect found"], notes });
    notes.push("mutated");
    expect(updated.authority).toEqual(state.authority);
    expect(updated.operational.notes).toEqual(["User should approve deployment"]);
    expect(state.operational.notes).toEqual([]);
    const snapshot = goalSnapshot(updated);
    expect(snapshot.data).toEqual(updated);
    expect(snapshot.data.authority).not.toBe(updated.authority);
    const malformedOperational = { findings: [], notes: [], authority: {} };
    expect(() => withGoalOperational(state, malformedOperational)).toThrow("Invalid goal state");
  });
});
