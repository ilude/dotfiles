# Pi Workflow Operator Layer — Implementation Checklist

## Purpose

Translate `mvp-spec.md` into a practical build plan for this repo’s Pi setup.

This checklist is optimized for:
- incremental implementation
- low-risk sequencing
- clear acceptance checkpoints
- minimal rewrites of existing extensions

## Guiding Strategy

Prefer **thin shared state + small integrations** over a large new framework.

The best MVP shape for this repo is:
1. introduce shared durable state modules for tasks and permissions
2. integrate existing extensions with those modules
3. add operator-facing commands and status-bar output after the data exists

---

# Likely Files to Touch

## Existing files likely to change
- `pi/extensions/subagent/index.ts`
- `pi/extensions/agent-team.ts`
- `pi/extensions/prompt-router.ts`
- `pi/extensions/damage-control.ts`
- `pi/extensions/ask-user.ts` *(only if needed for permission provenance integration)*
- `pi/README.md`

## Likely new files
- `pi/lib/operator-state.ts` *(shared helpers or paths/constants)*
- `pi/lib/task-registry.ts`
- `pi/lib/permission-registry.ts`
- `pi/extensions/operator-status.ts` *(status bar + /doctor)*
- `pi/extensions/tasks.ts` *or extend existing `pi/extensions/todo.ts` only if reuse is clean*
- `pi/extensions/permissions.ts`
- `pi/tests/*` for new registry/state behavior if test harness exists for these extensions

## Important caution
Avoid forcing unrelated behavior into existing extensions if the shared state becomes awkward. A small new extension is preferable to coupling everything into `prompt-router.ts` or `damage-control.ts`.

---

# Phase 0 — Design Lock and Repo Preparation

## Goal
Establish the MVP boundaries in code planning terms before implementation begins.

## Checklist
- [ ] Confirm `mvp-spec.md` is the implementation source of truth
- [ ] Confirm Feature 1 status bar remains minimal by default
- [ ] Confirm Feature 2 uses a first-class task registry
- [ ] Confirm Feature 3 keeps explicit safe replay only
- [ ] Decide whether to create one operator extension or separate extensions for status/tasks/permissions

## Recommendation
Use **separate extensions + shared libs**:
- `operator-status.ts`
- `tasks.ts`
- `permissions.ts`

That keeps responsibilities clear.

## Exit criteria
- file ownership plan agreed
- no unresolved scope creep before coding begins

---

# Phase 1 — Shared Durable State Foundations

## Goal
Create the shared registries needed by the rest of the MVP.

## 1A. Task registry

### Deliverable
A durable task registry that stores `TaskRecordV1` objects and supports state transitions.

### Checklist
- [ ] Create `pi/lib/task-registry.ts`
- [ ] Define `TaskRecordV1` TypeScript interface matching `user-stories.md`
- [ ] Define allowed task states:
  - `pending`
  - `running`
  - `blocked`
  - `completed`
  - `failed`
  - `cancelled`
- [ ] Implement durable storage format
- [ ] Implement helpers:
  - [ ] `createTask(...)`
  - [ ] `updateTask(...)`
  - [ ] `getTask(id)`
  - [ ] `listTasks(...)`
  - [ ] `transitionTask(...)`
- [ ] Enforce conditional required fields where practical
- [ ] Preserve timestamps and retry count cleanly
- [ ] Support short previews and metadata fields

### Storage recommendation
Use a repo-local or user-local JSONL/JSON file under Pi state, not transcript parsing.

Recommended direction:
- user-local durable state under `~/.pi/agent/` for simplicity
- optionally key by cwd/project identifier if task listings should remain project-scoped

### Design note
Prefer append-safe or atomic-write behavior. Simplicity is fine for MVP, but avoid corrupting task state on interruption.

## 1B. Permission registry

### Deliverable
A durable registry for recent allow/deny decisions and active session-level approvals.

### Checklist
- [ ] Create `pi/lib/permission-registry.ts`
- [ ] Define permission decision record shape with at least:
  - [ ] action/tool summary
  - [ ] outcome
  - [ ] provenance
  - [ ] timestamp
  - [ ] replay payload reference if safe replay is supported
- [ ] Implement helpers:
  - [ ] `recordDecision(...)`
  - [ ] `listRecentDecisions(...)`
  - [ ] `listSessionApprovals(...)`
  - [ ] `resetSessionApprovals(...)`
  - [ ] `getReplayableDecision(...)`
- [ ] Separate session-scoped approvals from historical decisions

### Provenance categories
- `rule`
- `manual_once`
- `session`
- `unknown`

## Phase 1 acceptance checkpoint
- [ ] Task and permission registries exist and can be read/written independently of UI
- [ ] Registry data survives beyond the immediate transcript turn
- [ ] State shapes match MVP spec closely enough to build UI on top

---

# Phase 2 — Register Real Work and Decisions

## Goal
Feed the registries from the existing Pi workflow surfaces.

## 2A. Task producers

### `pi/extensions/subagent/index.ts`
This is the highest-value first integration.

### Checklist
- [ ] Register tasks for in-scope subagent runs
- [ ] Create task on single/parallel/chain start
- [ ] Transition to `running` once execution begins
- [ ] Transition to terminal or blocked states when appropriate
- [ ] Store summary, previews, timestamps, usage, and retry/cancel capability metadata
- [ ] Ensure parallel subagent child results can map back to a registry task cleanly

### `pi/extensions/agent-team.ts`

### Checklist
- [ ] Register `/team` delegated work as tasks when it creates durable multi-agent work
- [ ] Do not register simple inline dispatches unless they outlive the immediate turn

### Other long-running producers

### Checklist
- [ ] Identify any existing extension-managed long-running work in this repo
- [ ] Register them only if they fall inside the v1 task boundary
- [ ] Explicitly avoid registering ordinary one-shot inline activity

## 2B. Permission producers

### `pi/extensions/damage-control.ts`
This is the most obvious first integration point.

### Checklist
- [ ] Record deny decisions
- [ ] Record allow decisions when handled by rules
- [ ] Record ask/confirm outcomes when available
- [ ] Preserve action summary and provenance
- [ ] Preserve replayable payload only when safe and practical

### Optional integration points
If existing approvals are split across multiple surfaces, also evaluate:
- `pi/extensions/ask-user.ts`
- any extension-specific confirmation flows

### Important caution
Do not widen permissions behavior in this phase. Only record decisions and approvals.

## Phase 2 acceptance checkpoint
- [ ] Starting real subagent/team work creates task records
- [ ] Denied/allowed permission decisions appear in the permission registry
- [ ] No obvious spam from one-shot inline work

---

# Phase 3 — Status Bar MVP

## Goal
Add the minimal ambient operator surface.

## Deliverable
A status-bar extension that reads shared state and prints a quiet healthy line.

## File recommendation
- [ ] Create `pi/extensions/operator-status.ts`

## Checklist
- [ ] Determine how Pi exposes status bar / footer updates in this repo’s extension runtime
- [ ] Reuse current router state if accessible, otherwise compute from known session state
- [ ] Show healthy default fields only:
  - [ ] compact repo/path
  - [ ] branch
  - [ ] active model/provider
  - [ ] router/effort if meaningful
  - [ ] active Pi version number
- [ ] Add conditional suffix only when needed:
  - [ ] `task`
  - [ ] `elevated`
  - [ ] `! <reason>`
- [ ] Do **not** show task counts, permission labels, or explicit `OK` in healthy state
- [ ] Keep one-line layout stable

## Pi version implementation note
Likely sources to evaluate:
- package metadata available from runtime
- installed CLI package version
- build/runtime API if exposed by Pi

Pick the most reliable cheap source.

## Health token sources for MVP
- router asset missing/degraded
- extension load failure if observable
- task registry unavailable
- permission registry unavailable
- validator/damage-control-related warning state if observable without extra noise

## Phase 3 acceptance checkpoint
- [ ] Healthy bar is compact and quiet
- [ ] Pi version is visible
- [ ] abnormal states surface only as concise suffixes

---

# Phase 4 — `/tasks` MVP Surface

## Goal
Expose the first-class task registry to users.

## File recommendation
- [ ] Create `pi/extensions/tasks.ts`

## Checklist
- [ ] Register `/tasks` command
- [ ] Implement compact grouped default view ordered by urgency:
  1. blocked
  2. failed
  3. running
  4. pending
  5. completed
  6. cancelled
- [ ] Show per-row minimum fields:
  - [ ] title
  - [ ] state
  - [ ] origin kind/source
  - [ ] short summary or preview
  - [ ] age/runtime if available
- [ ] Implement detail drill-down view
- [ ] Show detail fields:
  - [ ] id
  - [ ] title
  - [ ] origin
  - [ ] state
  - [ ] timestamps
  - [ ] summary
  - [ ] output preview
  - [ ] error/block reason
  - [ ] usage/cost/runtime if available
  - [ ] cancel/retry availability
- [ ] Wire cancel action for cancellable tasks
- [ ] Wire retry action for retryable tasks

## Retry implementation rule
- [ ] retry increments `retry_count`
- [ ] retry creates an inspectable transition
- [ ] retry returns task to `pending` before `running`
- [ ] prior failure context remains inspectable

## Cancel implementation rule
- [ ] cancel moves task to `cancelled`
- [ ] cancellation does not erase task history or output preview

## Phase 4 acceptance checkpoint
- [ ] `/tasks` makes long-running work inspectable without transcript hunting
- [ ] cancel/retry works on at least the most important in-scope producers
- [ ] completed tasks remain inspectable later

---

# Phase 5 — `/permissions` MVP Surface

## Goal
Expose permission state and safe replay without weakening guardrails.

## File recommendation
- [ ] Create `pi/extensions/permissions.ts`

## Checklist
- [ ] Register `/permissions` command
- [ ] Show summary sections:
  - [ ] current effective mode/state summary
  - [ ] session approvals currently active
  - [ ] recent allow decisions
  - [ ] recent deny decisions
- [ ] Distinguish static/rule-based vs session approvals
- [ ] Show per-decision minimum fields:
  - [ ] action/tool summary
  - [ ] outcome
  - [ ] provenance
  - [ ] timestamp/recency
- [ ] Implement reset/revoke of session-scoped approvals
- [ ] Implement denied-action inspect flow
- [ ] Implement retry only when safe replay is possible

## Retry safety checklist
- [ ] stored denied action payload is still available
- [ ] replay uses explicit user action
- [ ] replay goes back through normal approval/tool path
- [ ] replay is logged as a new visible action/decision
- [ ] clear explanation exists when replay is unavailable

## Phase 5 acceptance checkpoint
- [ ] `/permissions` explains current effective approval state clearly
- [ ] recent decisions are visible and useful
- [ ] session approvals can be reset/revoked
- [ ] supported denied actions can be retried safely

---

# Phase 6 — `/doctor` MVP

## Goal
Provide the main troubleshooting/reporting surface.

## File recommendation
- [ ] Implement in `pi/extensions/operator-status.ts` or create separate `pi/extensions/doctor.ts`

## Recommendation
Keep `/doctor` with the status extension unless the file becomes crowded.

## Checklist
- [ ] Register `/doctor`
- [ ] Register `/doctor --verbose`
- [ ] Register `/doctor --json`
- [ ] Implement severity model:
  - [ ] `healthy`
  - [ ] `warning`
  - [ ] `error`
- [ ] Required checks:
  - [ ] Pi version/runtime availability
  - [ ] active model resolution / registry availability where practical
  - [ ] repo/cwd sanity
  - [ ] extension loading state for this setup
  - [ ] prompt router prerequisites
  - [ ] task registry storage availability
  - [ ] permission registry storage availability
- [ ] Default output groups findings by severity
- [ ] default output includes actionable remediation
- [ ] verbose output includes paths/component/error detail
- [ ] json output emits machine-readable objects with required fields

## Output design rule
Make `/doctor` useful for real issue reports, but do not turn it into an auto-fixer in MVP.

## Phase 6 acceptance checkpoint
- [ ] `/doctor` gives a clear next action for warnings/errors
- [ ] `/doctor --json` can be consumed programmatically later
- [ ] `/doctor --verbose` is detailed enough for bug reports

---

# Recommended Dependency Order

## Hard dependencies
- [ ] Phase 1 before everything else
- [ ] Phase 2 before `/tasks` and `/permissions`
- [ ] Phase 3 can begin once enough shared state exists to power conditional tokens
- [ ] Phase 6 can ship partial checks before every surface is complete, but should at least know whether registries exist

## Suggested order of coding
1. `pi/lib/task-registry.ts`
2. `pi/lib/permission-registry.ts`
3. subagent integration
4. damage-control integration
5. status bar minimal version
6. `/tasks`
7. `/permissions`
8. `/doctor`
9. verbose/json polish

---

# Testing / Trial Checklist

## Manual trial script

### Status bar
- [ ] Start Pi in a clean repo
- [ ] Verify healthy bar shows repo/model/version only
- [ ] Trigger a warning condition and verify concise suffix appears
- [ ] Confirm healthy bar does not show noisy counters

### Tasks
- [ ] Run a parallel subagent workflow
- [ ] Confirm task records are created
- [ ] Open `/tasks` and confirm grouped order is correct
- [ ] Retry a failed task if possible
- [ ] Cancel a running task if possible
- [ ] Confirm completed tasks remain inspectable later

### Permissions
- [ ] Trigger a blocked action via damage-control
- [ ] Confirm deny decision appears in `/permissions`
- [ ] Confirm provenance is shown or explicitly unknown
- [ ] Retry the denied action if safe replay is supported
- [ ] Reset session approvals and confirm state changes

### Doctor
- [ ] Run `/doctor` in healthy setup
- [ ] Intentionally break a prerequisite and confirm warning/error output is actionable
- [ ] Run `/doctor --verbose`
- [ ] Run `/doctor --json`

---

# Deferrals (Do Not Creep Into MVP)

- [ ] package marketplace UX
- [ ] broad plugin/package management surfaces
- [ ] distributed task scheduler
- [ ] separate `queued` or `retrying` states
- [ ] batch task operations
- [ ] full automatic repair in `/doctor`
- [ ] policy-heavy permission framework

---

# Exit Condition for MVP Trial

The MVP is ready for user trial when:
- [ ] status bar is minimal, stable, and includes Pi version
- [ ] first-class task registry is real and used by important long-running producers
- [ ] `/tasks` is good enough to inspect/cancel/retry real work
- [ ] `/permissions` makes approval state understandable
- [ ] `/doctor` is useful enough to debug the setup without opening implementation files first
