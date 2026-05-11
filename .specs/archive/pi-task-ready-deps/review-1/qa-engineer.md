# QA Engineer Review: Dependency Behavior Verification Realism

## Findings

### 1. High — Registered slash-command surface is not explicitly verified
**Evidence:** T3 focuses on `pi/extensions/tasks.ts` and `tasks.test.ts` / `task-tools.test.ts`, but the acceptance criteria only assert parser/help/output behavior. The plan does not require proving that `/tasks ready` and `/tasks blocked` are registered through the same command registry/runtime path used by Pi, so tests could pass by calling internal handlers while the visible slash commands remain unavailable.

**Required fix:** Add an acceptance criterion and test that enumerates or invokes the registered Pi command surface for `/tasks ready` and `/tasks blocked`, not only direct handler/parser tests. Evidence should prove the commands are reachable via the runtime command registration path.

### 2. High — Non-mutation checks are too narrow for start rejection
**Evidence:** T4 says start rejection is non-mutating and should leave state as `pending` or `blocked`, but the pass criteria only mention state. A false-positive implementation could update timestamps, append history/events, rewrite dependency edges, or emit notifications while still leaving the state unchanged.

**Required fix:** Require before/after assertions for the full persisted task record and relevant task directory contents when `/tasks start <waiting-id>` is rejected. The test should fail on changed timestamps, history, reverse edges, file count, or notification side effects unless explicitly documented as intended.

### 3. Medium — Tombstoned/deleted blocker behavior is mentioned but not concretely testable
**Evidence:** T1 says tombstoned blockers are unmet, but the listed tests cover “missing blocker” and active/terminal states, not an actual tombstone/deleted-task representation. If the registry distinguishes tombstones from missing records, acceptance criteria can pass while tombstoned blockers are incorrectly treated as complete or silently omitted from UX.

**Required fix:** Add a concrete tombstone/deleted-task fixture or registry operation to `task-dependencies.test.ts` and command output tests. Assert tombstoned blockers remain unmet and are rendered/actionable distinctly enough from normal completed blockers.

### 4. Medium — Renderer determinism criteria do not cover command-level ordering across ready/blocked views
**Evidence:** T2 requires deterministic renderer IDs, but T3 only requires inclusion/exclusion for `/tasks ready` and `/tasks blocked`. The runtime UX could be nondeterministic if command handlers filter tasks then pass unsorted arrays or maps to the renderer, while renderer unit tests still pass with pre-sorted inputs.

**Required fix:** Add command-level tests with deliberately unsorted creation/order data and multiple blockers/dependents. Assert exact stable output order for `/tasks ready`, `/tasks blocked`, and blocked-context IDs.

### 5. Medium — State policy edge cases are under-specified for explicitly `blocked` tasks
**Evidence:** Objective says derive pending tasks as ready/waiting, while T3 says `/tasks blocked` includes explicitly `blocked` state and pending tasks waiting on blockers. The plan does not specify whether an explicitly `blocked` task with all dependencies now completed should appear in ready, blocked, both, or require manual state transition. Tests could pass for pending-only readiness while UX remains confusing for blocked-state tasks.

**Required fix:** Define and test the policy for explicit `blocked` tasks whose blockers become satisfied, plus explicit `blocked` tasks with no `blockedBy`. Apply the same policy consistently to helpers, renderer labels, `/tasks ready`, `/tasks blocked`, and `/tasks start`.
