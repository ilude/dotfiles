---
created: 2026-08-23
status: completed
completed: 2026-08-23
---

# Plan: Align Pi Goals, Tasks, and Subagent Instructions

## Objective

Refactor Pi's goal, task, and subagent surfaces around one domain model: goals preserve user intent and observable conditions; tasks outline the required work and dependencies; agents receive bounded Instructions; tasks are assigned and completed but never run; task identity does not grant authority or represent process state.

## Completion Conditions

- **G1 - Task lifecycle:** Newly created tasks are `unassigned`; supported states are `unassigned`, `assigned`, `completed`, `failed`, and `skipped`; failed tasks may return to `assigned`; no model-facing task state implies process activity.
- **G2 - Durable intent:** Task Instructions and boundaries survive compaction and contain enough context to state an observable completion condition without inventing work.
- **G3 - Goal coverage:** Every current goal condition has a stable ID and is covered by at least one goal-linked task; every goal-linked task covers at least one current goal condition.
- **G4 - Layered proof:** Tasks record their own evidence, Team Leads validate composition of their subagents' work, and `goal_complete` records evidence and judgment for every current goal condition.
- **G5 - Assignment semantics:** `taskId` only identifies a durable task. Passing it does not assign the task, change task state, select a task implicitly, grant authority, or require matching workspace, session, or process state.
- **G6 - Bound-before-work:** Orchestrators, Team Leads, and subagents state an observable completion condition before work. An unbounded task is returned one level with the intended reading, material alternative, and one required decision.
- **G7 - Boundaries:** Model-facing schemas distinguish declared boundaries from the enforced filesystem boundary. Advisory paths do not grant access.
- **G8 - Compact context:** Stable cross-tool rules appear once in global instructions; invocation rules live with tools; parameter meaning lives in schemas; changing task and goal state is injected as late runtime context.
- **G9 - Compatibility:** Existing persisted tasks and historical resumed subagent calls remain readable through deterministic migrations or hidden aliases, while current model-facing schemas expose only the new language.
- **G10 - Workflow compatibility:** Existing `/plan-it`, `/review-it`, and `/do-it` behavior remains operational after task, tool, and parameter renames. This plan does not redesign their lifecycle, authority, artifacts, review behavior, validation behavior, or archival rules.

## Domain Model

### Goal

A goal is the user's requested intent plus observable conditions proving it was met.

```ts
type GoalCondition = {
  id: string;          // stable, human-readable, never renumbered
  description: string; // observable state, not a procedure
};
```

Condition IDs use `G1`, `G2`, and so on within a goal. Corrections update or supersede a condition without renumbering unaffected conditions.

### Task

A task is outlined work needed to satisfy one or more goal conditions. Tasks do not execute.

```ts
type TaskState =
  | "unassigned"
  | "assigned"
  | "completed"
  | "failed"
  | "skipped";

type Task = {
  id: string;
  summary: string;
  instructions?: string;
  boundary?: string[];
  blockedBy?: string[];
  goalId?: string;
  covers?: string[];
  state: TaskState;
  skipReason?: string;
  priority?: number;
};
```

A standalone task without `goalId` does not require `covers`. Goal-linked tasks require at least one current condition ID.

### Assignment

- One agent is responsible for a task at a time.
- The orchestrator is responsible when working directly.
- A task may be delegated or reassigned to a child without an intermediate state.
- A subagent may receive many tasks over time; no reverse task-to-agent or agent-to-task index is added.
- Assignment responsibility remains in orchestration context. The task database stores only `assigned`.
- Passing `taskId` to a subagent only identifies the task.

### Instructions

Instructions contain only what is needed to prevent misunderstanding:

- required work;
- observable completion condition;
- constraints;
- acceptance criteria;
- prior findings that affect the work;
- out-of-scope items.

### Bound-Before-Work Rule

Before starting an assigned task, state its completion condition as an observable state. If that requires inventing a decision or discovering a fact that could change the correct work, return the task as unbounded. Return the reading you would have used, the material alternative, and one decision needed. Escalate one level at a time. Resolve internal implementation decisions locally; return decisions that change what done means. Write resolved bounds into the goal conditions or Task Instructions before reassigning the task.

### Composition

- Every task traces to at least one goal condition.
- Every goal condition is covered by at least one task.
- A task is complete only after demonstrating its own criteria.
- A Team Lead validates that its subagents' completed work composes into its assigned slice.
- The orchestrator validates that Team Lead and direct-subagent slices compose into the goal.
- Integration failure permits bounded rework under existing conditions, not new scope.
- Repeated integration failure is escalated because it indicates faulty decomposition.
- `goal_complete` records the top-level judgment against goal conditions.

## Model-Facing Naming

| Existing name | New model-facing name |
| --- | --- |
| task state `pending` | `unassigned` |
| task state `running` | `assigned` |
| task `notes` | `instructions` |
| task `scope` | `boundary` |
| subagent item `task` | `instructions` |
| subagent item `workPaths` | `boundaryPaths` |
| Team Lead `workBoundary` | `boundary` |
| request `workspaceRoot` | `enforcedBoundary` |
| `subagent_coordinate` | `subagent_teamlead` |
| `runId` | `processId` |
| selector type `run` | `process` |
| coordinator | Team Lead |
| leaf or worker | subagent |

Internal implementation names may remain when renaming them provides no model-facing benefit. Hidden compatibility aliases may accept old callable names and fields for resumed sessions but must not appear in ordinary discovery or current schemas.

## Lifecycle and Transition Rules

Allowed current transitions:

```text
unassigned -> assigned
assigned   -> unassigned  # returned before work because unbounded
assigned   -> completed
assigned   -> failed
assigned   -> skipped
failed     -> assigned    # bounded retry or rework
failed     -> skipped
unassigned -> skipped
```

Reassignment keeps the task `assigned`. Temporary waits keep the task `assigned`. There is no `blocked` or `cancelled` state.

Readiness is derived:

> A task is ready when it is `unassigned` and every `blockedBy` task is `completed` or `skipped` under the existing dependency policy.

Ready means eligible for consideration, not proven bounded. The bound-before-work check occurs before assignment.

## Persisted-State Migration

Normalize legacy task records on read and write only current values:

| Legacy state | Current state |
| --- | --- |
| `pending` | `unassigned` |
| `running` | `assigned` |
| `blocked` | `unassigned` |
| `completed` | `completed` |
| `failed` | `failed` |
| `cancelled` | `skipped` |
| `skipped` | `skipped` |

Preserve legacy blocker, cancellation, and acceptance information in migrated Instructions or existing reason fields when present. Do not invent a historical reason when none exists. Existing timestamps remain readable; new assignment timestamps use model-facing assignment language even if an internal legacy column remains.

Legacy field aliases:

- read `notes` as `instructions`;
- read `scope` as `boundary`;
- current writes use only `instructions` and `boundary`;
- existing serialized records are not rewritten solely to rename fields unless the registry already performs a safe write.

## Execution Plan

### T1 - Introduce the current task domain and migration

**Files**

- `pi/lib/operator-state.ts`
- `pi/lib/task-registry.ts`
- `pi/lib/task-renderer.ts`
- `pi/lib/task-store.ts` and task-store CLI surfaces as required
- focused task registry, renderer, dependency, and store tests

**Changes**

1. Replace model-facing task states with the five-state model.
2. Add deterministic normalization for legacy states and field names.
3. Implement the allowed transitions and `failed -> assigned` retry.
4. Derive readiness from `unassigned` plus completed dependencies.
5. Remove task lifecycle behavior for `blocked` and `cancelled` while preserving legacy reads.
6. Keep process state entirely outside the task registry.

**Done when**

- New tasks are `unassigned`.
- Every allowed transition succeeds and unsupported transitions fail explicitly.
- Legacy records normalize without data loss or manual repair.
- Readiness does not treat assigned, failed, completed, or skipped tasks as ready.

**Verify**

```bash
cd pi && pnpm test task-registry.test.ts task-renderer.test.ts task-dependencies.test.ts task-store.test.ts
```

### T2 - Refactor the task tool and reminders

**Depends on:** T1

**Files**

- `pi/extensions/tasks.ts`
- task tool tests
- active-task reminder tests

**Changes**

1. Expose `instructions`, `boundary`, and `covers` in current schemas.
2. Accept legacy `notes` and `scope` only through compatibility preparation when required.
3. Keep one action-based `task` tool: `create`, `batch`, `update`, `remove`, `list`, `ready`, and `get`.
4. Do not add execution, process, assignment-owner, or reverse-index actions.
5. Change command and model-facing language from start/running to assign/assigned.
6. Keep active task reminders bounded and authoritative after compaction.
7. A user correction updates goal conditions or task Instructions before incompatible work continues.

**Done when**

- The current schema advertises only current names and states.
- Task reminders preserve Instructions, goal coverage, dependencies, and boundaries.
- No task tool output implies that a task runs or owns a process.

**Verify**

```bash
cd pi && pnpm test task-tools.test.ts tasks.test.ts active-turn-compaction.test.ts
```

### T3 - Add stable goal conditions and task coverage

**Depends on:** T1, T2

**Files**

- `pi/extensions/goal.ts`
- `pi/lib/goal-state.ts`
- goal and goal-state tests
- plan materialization code that creates goal-linked tasks

**Changes**

1. Persist stable `GoalCondition` records in active goal state.
2. Require observable conditions before goal work begins; return an unbounded goal when a required condition cannot be stated without invention.
3. Materialize goal-linked tasks with non-empty `covers` values.
4. Validate before implementation that every current goal condition has task coverage and every goal-linked task references current conditions.
5. Preserve IDs across correction; update or supersede conditions explicitly without renumbering unaffected IDs.
6. Keep task requirements, dependencies, and outcomes authoritative in the task registry.
7. Keep goal-specific attempt, recovery, validation, artifact, and wait evidence in goal state.
8. Keep `goal_progress` contextual to the owning goal workflow rather than general discovery.

**Done when**

- Missing or unknown condition IDs reject before modifying work.
- Partial task creation can resume idempotently without changing condition identity.
- Existing goals without structured conditions receive a bounded compatibility path and do not silently invent conditions.

**Verify**

```bash
cd pi && pnpm test goal-state.test.ts goal.test.ts task-tools.test.ts
```

### T4 - Make `goal_complete` validate observable conditions

**Depends on:** T3

**Files**

- `pi/extensions/goal.ts`
- goal completion tests

**Changes**

1. Extend `goal_complete` with per-condition judgments containing condition ID, evidence, and pass/fail state.
2. Reject completion when a current condition is missing evidence, fails, or is not covered by a task.
3. Preserve concise summary, known gaps, and next steps without treating procedures as goal conditions.
4. Record the orchestrator's top-level integration judgment; task-level proof alone is insufficient.

**Done when**

- `goal_complete` cannot close a goal with missing condition evidence.
- A complete evidence set for all current conditions closes the goal.
- Goal completion does not add requirements or repair unrelated findings.

**Verify**

```bash
cd pi && pnpm test goal.test.ts goal-state.test.ts
```

### T5 - Correct task identity and subagent assignment behavior

**Depends on:** T1

**Files**

- `pi/extensions/subagent/contracts.ts`
- `pi/extensions/subagent/index.ts`
- `pi/extensions/subagent/modern-adapter.ts`
- subagent tests

**Changes**

1. Validate an explicit `taskId` only by retrieving an existing, non-deleted task.
2. Remove task workspace, session, and state eligibility checks.
3. Remove implicit task selection when `taskId` is omitted.
4. Do not mutate task state when `taskId` is passed.
5. Validate task identity once in the modern preparation path; do not reinterpret `cwd` as task ownership.
6. Preserve root ownership of durable task transitions.
7. Support many assigned tasks per subagent over time through ordinary task references; add no reverse index.

**Done when**

- Explicit task references work across task workspace and session metadata.
- Omitting `taskId` never adds one.
- Nested `cwd` does not affect task identity.
- A task reference does not change task state or enforced access.

**Verify**

```bash
cd pi && pnpm test subagent.test.ts subagent-t1.test.ts task-tools.test.ts
```

### T6 - Rename current subagent tools and parameters

**Depends on:** T5

**Files**

- subagent schemas, adapters, visibility, search, Fable restrictions, agents, docs, and focused tests

**Changes**

1. Expose `subagent_teamlead` instead of `subagent_coordinate`.
2. Expose `instructions`, `boundaryPaths`, `boundary`, and `enforcedBoundary`.
3. Expose `processId` and selector type `process` in status/control schemas.
4. Keep legacy callable and field aliases hidden for resumed sessions only.
5. Use Team Lead and subagent in model-facing prose; retain internal coordinator/leaf names only where implementation-specific.
6. Describe `enforcedBoundary` accurately as enforcement over governed file and recognized recursive-search tools, not a general sandbox.
7. Generate the `agent` parameter for `subagent_read`, `subagent_write`, and `subagent_teamlead` from the current trust-aware agent catalog. Role terms such as worker, subagent, and Team Lead must not be accepted or advertised as agent profile names unless registered in that catalog.

**Done when**

- Ordinary discovery and schemas contain only current names.
- Legacy aliases remain executable only through compatibility paths.
- Tool authority is unchanged by naming changes.
- Every current subagent tool enumerates the valid catalog names in its agent schema after startup, trust, cwd, and reload catalog refreshes. Unknown names fail with the available valid choices.
- A focused test near `pi/tests/subagent.test.ts:454` proves all three current tool schemas contain catalog enums, developer or fixture agents are present, worker is absent, catalog refresh updates all three schemas, and runtime rejection lists valid choices.

**Verify**

```bash
cd pi && pnpm test subagent.test.ts subagent-t1.test.ts tool-visibility.test.ts tool-search.test.ts fable.test.ts
```

### T7 - Add the bound-before-work and composition instructions

**Depends on:** T2, T3, T6

**Files**

- `pi/AGENTS.md`
- current agent profiles under `pi/agents/`
- owning task/subagent contract
- task reminder and goal runtime context where necessary

**Changes**

1. Add one stable compact domain block to global Pi instructions.
2. Ensure orchestrators, Team Leads, and subagents perform the bound-before-work check before substantive work.
3. Require the three-part unbounded return: expected reading, material alternative, one decision.
4. Require one-level escalation and write resolved bounds into durable goal conditions or Task Instructions.
5. Require each level to validate composition below it.
6. Do not duplicate the full rule in every tool or agent profile; profiles may state only their role-specific composition duty.

**Done when**

- Every role receives the rule exactly once through normal instruction layering.
- No active prompt uses removed task, role, or process terminology.
- Runtime task context remains bounded and appears after stable instructions.

**Verify**

- Inspect the effective root, Team Lead, and subagent instruction layers.
- Use focused behavioral fixtures only where an executable parser or state transition exists; do not assert exact prose.

### T8 - Compact tool descriptions and prompt guidance

**Depends on:** T2, T4, T6, T7

**Files**

- task, subagent, goal, background-terminal, and tool-search registration surfaces
- tool contracts and README

**Changes**

1. Keep each tool description to one purpose statement.
2. Keep each `promptGuidelines` block to invocation rules and critical anti-patterns.
3. Put parameter meaning and authority effects in parameter schemas.
4. Remove field limits and implementation details duplicated elsewhere.
5. Remove historical chain, fanout, workflow, coordinator, leaf, worker, running-task, and task-workspace language from current prompts.
6. Keep polling prohibitions local to status/background tools plus one stable global rule.
7. Clarify that `/ps` is operator-facing and is not a model tool.
8. Keep contextual tools inactive outside their owning workflows.

**Done when**

- Current model-facing prompts contain no contradictory domain terms.
- Mandatory behavior is enforced in code rather than only requested in prose where deterministic enforcement is possible.
- The stable global prefix is smaller and dynamic goal/task state remains late context.

**Verify**

```bash
rg -n "running task|running root task|start a task|coordinator|leaf worker|task workspace|subagent_chain|subagent_fanout|subagent_workflow" pi/AGENTS.md pi/extensions pi/agents pi/skills/pi-extension/references/contracts pi/README.md
```

Review matches and retain only implementation-internal or historical compatibility occurrences.

### T9 - Preserve existing workflow-command compatibility

**Depends on:** T2, T4, T6, T8

**Files**

- `pi/extensions/workflow-commands.ts`
- `pi/skills/workflow/plan-it.md`
- `pi/skills/workflow/review-it.md`
- `pi/skills/workflow/do-it.md`
- workflow-command and plan-lifecycle tests
- directly affected README sections

**Changes**

1. Update only direct consumers of renamed task states, task fields, subagent tools, parameters, and process identifiers.
2. Preserve current `/plan-it`, `/review-it`, and `/do-it` command registration and behavior.
3. Preserve current plan artifacts, review behavior, execution authority, validation sequence, and archival behavior.
4. Keep existing plans readable through the task and subagent compatibility paths.
5. Do not import requirements, open questions, or proposed lifecycle changes from `.specs/pi-workflow-contract-lifecycle/PRD.md`.
6. Report any incompatibility that cannot be resolved without changing workflow semantics rather than choosing a lifecycle design inside this plan.

**Done when**

- Existing focused workflow tests pass with the renamed task and subagent interfaces.
- Current plan, review, and execution commands remain available and retain their existing authority.
- No workflow prompt instructs models to use removed current task states or model-facing tool names.
- No new workflow artifact, review pass, validation phase, repair protocol, or archival gate is introduced.

**Verify**

```bash
cd pi && pnpm test workflow-commands.test.ts plan-state.test.ts plan-archive.test.ts
```

### T10 - Integration and migration validation

**Depends on:** T1 through T9

**Changes**

Exercise the complete workflow:

1. Create a goal with stable observable conditions.
2. Create a dependency graph whose tasks cover all conditions.
3. Confirm new tasks begin unassigned and readiness is derived correctly.
4. Assign a task to the orchestrator and complete it directly.
5. Assign a task to a Team Lead that delegates bounded Instructions to subagents.
6. Assign several tasks to the same subagent over separate calls without a reverse index.
7. Return an unbounded task, resolve one decision, update Instructions, and reassign it.
8. Fail a task, perform one bounded retry, and escalate repeated integration failure.
9. Reject a task reference that does not exist while accepting an existing task regardless of workspace, session, or task state metadata.
10. Confirm enforced boundaries reject governed file and recursive-search access outside the selected boundary.
11. Confirm task evidence alone cannot close a goal without top-level condition evidence.
12. Load legacy persisted task states and historical subagent aliases successfully.

**Verify**

```bash
cd pi && pnpm run typecheck
cd pi && pnpm test
uv run --no-sync --project pi/analytics pytest pi/analytics/tests/test_pi_log_query.py
git diff --check
```

## Execution Checklist

- [x] **T1: Introduce the current task domain and migration**
- [x] **T2: Refactor the task tool and reminders**
- [x] **T3: Add stable goal conditions and task coverage**
- [x] **T4: Make `goal_complete` validate observable conditions**
- [x] **T5: Correct task identity and subagent assignment behavior**
- [x] **T6: Rename current subagent tools and parameters**
- [x] **T7: Add the bound-before-work and composition instructions**
- [x] **T8: Compact tool descriptions and prompt guidance**
- [x] **T9: Preserve existing workflow-command compatibility**
- [x] **T10: Integration and migration validation**
- [x] **V1: Completion Conditions G1-G10 validated**
- [x] **V2: Full Pi, analytics, and diff validation passed**
- [x] **F1: Plan status and execution metadata completed**

## Execution Order

```text
T1
├── T2
│   └── T3
│       └── T4
└── T5
    └── T6

T2 + T3 + T6 -> T7 -> T8
T2 + T4 + T6 + T8 -> T9
T1 through T9 -> T10
```

T2 and T5 may proceed in parallel after T1 because they own different immediate contracts. T3 follows the task schema. T6 follows task-reference behavior. Prompt changes occur after executable semantics so instructions describe current behavior rather than planned behavior. T9 is a compatibility sweep only; it must not redesign workflow lifecycle semantics.

## Scope Boundaries

### In scope

- Goal conditions and task coverage.
- Task lifecycle and persisted compatibility.
- Task Instructions and boundaries.
- Subagent task-reference behavior.
- Current model-facing role, tool, parameter, process, and boundary names.
- Bound-before-work and layered composition rules.
- Compact prompt placement and cache stability.
- Focused and full Pi validation.

### Out of scope

- A reverse task-to-agent or agent-to-task assignment database.
- Treating tasks as processes.
- Automatic task completion from subagent process completion.
- New blocked or cancelled task states.
- New background-terminal inspection tools.
- Reintroducing `/improve`, Coms LAN, chain, fanout, or typed subagent workflow tools.
- Internal renames that do not affect model behavior or remove meaningful confusion.
- Refactoring unrelated agent routing, provider support, telemetry, or UI.
- Redesigning `/plan-it`, `/review-it`, `/do-it`, or `/validate-it`.
- Removing or merging existing workflow commands.
- Adopting requirements or unresolved decisions from `.specs/pi-workflow-contract-lifecycle/PRD.md`.

## Risks and Controls

| Risk | Control |
| --- | --- |
| Legacy tasks become unreadable | Normalize old states and field names at the registry boundary; test every mapping. |
| Current and compatibility schemas both reach models | Advertise only current names; isolate aliases in hidden adapters. |
| Goal coverage adds ceremony to standalone tasks | Require `covers` only when `goalId` is present. |
| Observable conditions become test procedures | Schema and prompts define conditions as endpoint states; `goal_complete` evidence is separate. |
| Prompt compaction removes necessary safety | Preserve cross-tool invariants globally and enforce deterministic rules in code. |
| Dynamic task state harms cache reuse | Inject task and goal state after stable instructions; keep descriptions deterministic. |
| Renaming overstates filesystem isolation | Describe enforcement as applying to governed tools and recognized recursive searches only. |
| Rework turns into churn | Permit bounded rework under existing conditions and escalate repeated integration failure. |
| Shared working tree contains unrelated changes | Inspect before each task, preserve unrelated diffs, and never reset shared files wholesale. |

## Validation

- [x] Focused task, goal, subagent, prompt, and workflow contract tests passed.
- [x] `cd pi && pnpm run typecheck` passed.
- [x] Full Pi suite passed: 1590 tests passed and 2 skipped.
- [x] Analytics suite passed: 25 tests passed.
- [x] `git diff --check` passed.

- Tests prove state transitions, schema normalization, coverage validation, boundary enforcement, task identity, and goal completion behavior.
- Do not use exact prompt-sentence assertions as the primary proof of instruction quality.
- Start with the focused test named in each task.
- Run the full Pi suite only after focused contracts pass.
- Treat unrelated full-suite failures as separate findings unless they prevent the changed workflow from being validated.
- Inspect model-facing schema snapshots or effective tool catalogs to verify removed names are not exposed.

## Resume Instructions

After compaction:

1. Read this plan completely.
2. Inspect `git status --short` and the latest commit before editing.
3. Create or reconcile durable implementation tasks for T1 through T10.
4. Start with T1 and its focused tests.
5. Do not edit prompts before the executable state and schema behavior they describe has landed.
6. Preserve unrelated shared-worktree changes.

## Execution Status

- State: complete
- Completed tasks: T1, T2, T3, T4, T5, T6, T7, T8, T9, T10
- Active task: none
- Blocker: none
- Validation: `pnpm run typecheck`; full Pi suite (1590 passed, 2 skipped); analytics (25 passed); `git diff --check`.
- Next: archive the completed plan.
