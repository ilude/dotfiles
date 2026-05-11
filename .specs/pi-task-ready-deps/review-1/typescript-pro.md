# TypeScript Plan Review: Pi Task Ready Dependency UX

## Finding 1 — High — Readiness helper API is underspecified and steers implementers toward filesystem-coupled helpers

**Severity:** High

**Evidence:**
- T1 suggests helper names such as `getUnmetBlockers(task)` / `isTaskReady(task)`, but a single `TaskRecordV1` does not contain blocker states; it only has `blockedBy?: string[]`.
- Current registry state is filesystem-backed: `getTask(id)` reads one task file and `listTasks()` reads/sorts all task files in `pi/lib/task-registry.ts`.
- The plan simultaneously requires helpers to be “pure” and “do not write task files,” but only verifies file count/content, not that helpers avoid hidden reads or repeated registry calls.
- Renderer and command behavior both need the same readiness classification across an already-loaded task list, so a one-argument helper encourages unstable APIs or duplicated `getTask()` lookups.

**Required fix:**
Specify a concrete pure API that receives dependency context explicitly, e.g. `getUnmetBlockers(task: TaskRecordV1, tasksById: ReadonlyMap<string, TaskRecordV1>): string[]` and `partitionReadyTasks(tasks: readonly TaskRecordV1[]): { ready: TaskRecordV1[]; waiting: ... }`. Require callers to build the map from one `listTasks({ includeTombstones: true })` snapshot and require tests to exercise these exported APIs directly without filesystem reads inside the helper.

## Finding 2 — High — Plan does not require command tests to exercise the registered `/tasks` handler path strongly enough

**Severity:** High

**Evidence:**
- The target behavior is extension command parsing and enforcement: `/tasks ready`, `/tasks blocked`, and `/tasks start <id>`.
- Current implementation registers behavior only inside `pi.registerCommand("tasks", { handler })` in `pi/extensions/tasks.ts`; `parseTasksArgs()` alone is not the behavior under test.
- T3/T4 acceptance says to run `tasks.test.ts` / `task-tools.test.ts`, but does not explicitly require invoking the registered command handler through the extension registration/mocked Pi API. This leaves room for tests that only call parser/helper functions while missing handler integration, notify output, render mode, or target resolution regressions.

**Required fix:**
Add acceptance criteria requiring tests to load the extension, capture the registered `tasks` command handler from a mocked `ExtensionAPI`, and invoke it with exact strings: `"ready"`, `"blocked"`, and `"start <id>"`. Assertions must inspect `ctx.ui.notify` level/message and persisted task state after the handler returns.

## Finding 3 — Medium — Deterministic dependency ID ordering is required but not specified at the data/API boundary

**Severity:** Medium

**Evidence:**
- The plan repeatedly requires “deterministic ID output” and “stable order.”
- Current `normalizeIdList()` de-duplicates while preserving input order, `maintainReverseEdges()` appends via `Set`, and `formatTaskDetail()` prints `blockedBy` / `blocks` in stored order.
- `listTasks()` sorts tasks newest-first by `createdAt`, not by dependency ID. If readiness helpers, renderer, and commands each choose their own ordering, tests can pass locally while command output changes when dependency creation/input order changes.

**Required fix:**
Define one ordering rule in the plan: unmet blocker IDs and blocked dependent IDs must be sorted by full task ID lexicographically before shortening/rendering, or sorted by a documented task ordering. Require both helper return values and renderer/command output to use that rule, with tests creating blockers in non-sorted order.

## Finding 4 — Medium — Validation commands omit `task-security.test.ts` for the final focused contract despite renderer redaction requirements

**Severity:** Medium

**Evidence:**
- T2 acceptance requires `cd pi/tests && pnpm test task-renderer.test.ts task-security.test.ts` and says synthetic secret sentinels must be redacted.
- The Automation Plan focused verify command is `pnpm test task-registry.test.ts tasks.test.ts task-dependencies.test.ts task-renderer.test.ts task-tools.test.ts`, which omits `task-security.test.ts`.
- Final required automated validation later includes `task-security.test.ts`, but the earlier V1/V2 evidence gates can pass without proving the renderer redaction requirement that T2 introduced.

**Required fix:**
Add `task-security.test.ts` to the Automation Plan focused verify command and V1/V2 command lists, or explicitly move redaction validation to one final-only gate and remove it from T2. Prefer including it wherever renderer/detail output is changed.
