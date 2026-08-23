---
created: 2026-08-20
revised: 2026-08-20
completed: 2026-08-20
status: completed
---

# Plan: Redesign Pi Subagent Orchestration as One Consistent System

## Context

The current uncommitted Pi changes contain useful scheduler, task, delivery, routing, and UI pieces, but the pieces do not form one state model. Three independent reviews found conflicting lifecycle authorities, teamlead/leaf capacity deadlocks, stale lease recovery without a production caller, aggregate rather than per-result completion delivery, duplicate follow-on inboxes, premature durable-task completion, incomplete cancellation controls, stale footer projection, ambiguous agent terminology, and explicit parent routing overridden by advisory UI.

This revision reconciles earlier drift: the execution authority is the Dispatcher, the scheduling model is suspension-based fork-join (not capacity reservation), the task-layer verb is assignment, and previously named-but-undefined mechanisms now have schemas and a persistence substrate.

Incremental repair is stopped. No implementation begins until this plan is accepted.

## Objective

The root conversational agent is the orchestrator. It owns program decomposition, durable task topology, teamlead assignment, result validation, follow-on decisions, integration, and the final response.

Each independently verifiable work package may have one delegated `teamlead` agent. A teamlead coordinates bounded leaves and never becomes the program-level orchestrator.

The completed system must prevent teamlead/leaf capacity deadlocks, expose deterministic operator control, deliver each result independently, preserve durable work and follow-on phases without duplicate state stores, survive compaction without reconstructed orchestration state, work through Fable and Anthropic root modes, and present live authoritative status.

## Ubiquitous Language

| Term | Meaning |
| --- | --- |
| `root orchestrator` / `root` | The primary conversational agent process |
| `assignment` / `assign` | Task-layer only: the root claims a ready package task and hands it to a teamlead; attempt identity is an `assignmentAttemptId` |
| `teamlead` | The delegated agent owning one work package (renamed from the delegated `orchestrator` agent) |
| `dispatcher` | The execution authority owning admission, capacity slots, scope leases, the ready queue, cancellation propagation, and settlement (replaces "scheduler" and "tree broker") |
| `dispatch` | Execution-layer only: the dispatcher starting an admitted run from its ready queue; never used for task-layer assignment |
| `coordinator` | Runtime tree role held by a teamlead run |
| `leaf` | Bounded worker run |
| `join` | Durable record collecting leaf results for a suspended teamlead |
| `continuation` | A new teamlead step resumed from a satisfied join |
| `schedule` tool | Timed operator prompts only; unrelated to the dispatcher |

Historical telemetry and memory records are not rewritten. The obsolete delegated agent name `orchestrator` returns a migration error naming `teamlead`.

## Authority Model

Each state domain has exactly one authority:

| Domain | Authority | Other components |
| --- | --- | --- |
| Program/package lifecycle, assignment | Durable task registry | Runtime reads and transitions through a typed adapter |
| Process execution, admission, capacity, leases, cancellation, settlement | Dispatcher | Run manager and UI are projections |
| Process transcript and observable activity | Run manager | Never schedules or settles trees |
| Completion delivery and acknowledgement | Result store keyed by result ID | UI and root consume retained records |
| Model and effort selection | Parent invocation precedence plus safety gates | Telemetry records classification silently |
| Operator presentation | Projection derived from authorities | No independent cached lifecycle truth |
| Orchestration inbox | Merged projection of durable tasks, unprocessed envelopes, and retained results | No third persistence model |
| Compaction recovery | Durable task and result identities plus dispatcher snapshot | Compaction prose is a bounded handoff, not lifecycle truth |

## Core Invariants

1. The root orchestrator remains responsible for the full program.
2. One teamlead owns at most one independently verifiable package.
3. A teamlead never occupies an execution slot while waiting for its leaves: it forks, persists a join, and suspends.
4. A process is not terminal until descendants are settled and leases are released.
5. Durable task state cannot report completion while required child or blocking follow-on work remains incomplete.
6. Every result has a stable result ID and is delivered independently of sibling completion.
7. Delivery and acknowledgement are separate transitions.
8. Cancellation, failure, rejection, and successful completion remain distinct outcomes.
9. Explicit parent model and effort selections are authoritative and render no advisory warning. Max effort still requires operator approval.
10. Footer and dashboard state recompute on authoritative events; a later dispatch is never required to repair stale counts.
11. Active or queued work always has visible ownership, reason, and operator controls.
12. The model-facing tool surface stays small; envelopes, reducers, outbox, and joins remain invisible to prompts.

## Persistence Substrate

All durable orchestration state is process-local JSON under the operator state directory. Guarantees are process-local, not database-grade.

- One Pi process per workspace is the supported concurrency model. A second process detecting an existing live owner refuses orchestration mutations.
- All durable writes flow through one in-process serialization point (a single writer queue in the tasks extension). Compare-and-swap means: read revision, validate expected revision inside the writer queue, write temp file, atomic rename.
- A "transaction" is one serialized write of one JSON document set. Task transition, envelope disposition, and emitted outbox events are written together in that single serialized operation.
- The outbox is a JSON array of event records in the same document set. The relay is an in-process loop delivering events to the run manager, UI, and root follow-up queue, idempotent by event ID. Crash after write, before relay, is recovered by re-relaying undelivered events at startup.
- Consumers deduplicate by envelope/result/event ID. Transport is at-least-once; durable effect is idempotent.

## Design Patterns and TypeScript Implementation Rules

Use patterns to enforce boundaries and invariants, not class ceremony.

| Pattern | Use | TypeScript form |
| --- | --- | --- |
| State | Task, run, join, delivery, acknowledgement lifecycles | Readonly discriminated unions plus exhaustive transition reducers |
| Strategy | Queue priority, routing precedence, retry policy, provider capability | Small typed interfaces or injected pure functions |
| Observer | Dispatcher/task/result events feeding projections and root continuation | Typed event records, explicit subscribe/unsubscribe, idempotent handlers |
| Command | Assign, append follow-on, cancel, force terminate, acknowledge, retry | Validated command unions carrying command ID, target ID, actor, expected revision |
| Adapter | Task registry, dispatcher, result store, process host, provider boundary | Narrow interfaces translating records without duplicating state |
| Composite | Program/package task DAG and process trees | Immutable records and traversal functions |
| Facade | Root-callable orchestration status/control surface | One typed facade delegating to the authorities |

Rules:

- Branded ID types at authority boundaries (task, run, tree, orchestration, attempt, envelope, result, event IDs); plain strings acceptable inside one module.
- Validate external and persisted input at the boundary before converting to internal types.
- Pure transition functions returning new records; exhaustive `never` checks.
- Inject clocks, PID liveness, process termination, persistence, and delivery for deterministic tests.
- `AbortController.abort(reason)`; preserve reason through cancellation outcomes; abort listeners registered `{ once: true }`; `try/finally` for permit, lease, listener, and temp-file cleanup.
- Never collapse cancellation, rejection, validation failure, execution failure, and cleanup failure into one generic error.
- Public records serializable and versioned; never persist class instances, closures, signals, or process handles.
- No Singleton authorities; no Memento-style snapshots of mutable state into compaction prose.
- Tests assert observable transitions, idempotency, authority agreement, and cleanup; never that a class or pattern name exists.

## Graph Model and Rules

Three graph types; never conflated.

### Durable task dependency DAG

Edges run prerequisite to dependent.

1. Stable durable task IDs; reject missing targets, self-edges, duplicates, and cycles before persistence (incremental check per appended edge; full topological validation on load/migration; cycle path returned in diagnostics).
2. Follow-on additions validate against the complete current graph and expected topology revision; failed checks change nothing.
3. Readiness is derived from predecessor state; no persisted duplicate readiness fields.
4. A required predecessor satisfies an edge only when both `completed` and `accepted`. Failed, rejected, cancelled, or skipped predecessors do not satisfy mutation dependencies without explicit root policy.
5. Root ownership is not a dependency edge; the program root never blocks its children.
6. Blocking follow-on children count toward aggregate completion until successfully terminal or explicitly disposed.
7. Ready nodes assign in deterministic topological order; priority is a separate explicit policy.
8. Attempt identity is separate from node identity; retries never create duplicate nodes.
9. After terminal failure, compute affected descendants so the root can block, cancel, skip, or retry them deterministically.

### Runtime process tree

Each admitted run has exactly one process parent. Process parentage controls authority, cancellation propagation, and settlement; it does not imply task readiness. Each assignment attempt occupies one tree location.

### Resource wait diagnostics

With suspension (below), a teamlead holds no slot while waiting, which removes the hold-and-wait deadlock class structurally. Remaining contention is leases and external resources:

- Multiple scopes acquire in one normalized lexical order.
- Cancellation and cleanup never queue behind admission.
- Impossible requests are rejected before queueing.
- The dispatcher exposes wait diagnostics (who holds, who waits) and flags starvation by queue age (default 300000 ms, `orchestration.starvationAgeMs`).

## Dispatcher and Capacity Model

The dispatcher schedules from a single ready queue using suspension-based fork-join. There are no per-team capacity reservations.

### Teamlead lifecycle

```text
assigned -> step running -> forks leaves -> join persisted -> suspended (no slot)
leaves execute from ready queue -> results accumulate on join
join satisfied -> continuation enqueued -> step running -> completes or forks next phase
```

A suspended teamlead consumes no process slot, no provider permit, and holds no write lease. It exists only as durable task, join, and artifact records. A teamlead step runs only while reasoning, decomposing, or integrating.

### Join record

```ts
type Join = {
  readonly id: JoinId;
  readonly packageTaskId: TaskId;
  readonly assignmentAttemptId: AttemptId;
  readonly childRunIds: readonly RunId[];
  readonly policy: "all" | "all-successful" | "first-success";
  readonly state: "waiting" | "ready" | "running" | "completed" | "cancelled" | "failed";
  readonly receivedResultIds: readonly ResultId[];
  readonly resumeContext: { readonly promptRef: ArtifactRef; readonly resultSummaryMaxBytes: number };
  readonly topologyRevision: number;
};
```

Resume context is bounded (default 16384 bytes per result summary, `orchestration.resultSummaryMaxBytes`); full outputs stay in artifacts. Resume cost is a fresh model invocation; join contracts require bounded summaries so resumes stay cheap.

### Ready queue priority

1. Cancellation and cleanup operations
2. Ready leaves
3. Ready continuations
4. New teamlead first steps

Concurrent run ceiling: default 8 (`orchestration.maxConcurrentRuns`). Because waiting parents hold no slots, saturation delays work but cannot deadlock it: every running node can finish without waiting on another slot.

### Deadlock and starvation diagnostics

Prevention is structural. Detection remains as a diagnostic: if every active slot is occupied and no queued node can ever become runnable, emit a visible `dispatcher_fault` event with the wait evidence. Starvation is reported separately by queue age.

## Process Lifecycle

1. Dispatcher admits and registers the run.
2. PID registration deadline: 30000 ms (`orchestration.pidRegistrationDeadlineMs`).
3. Liveness: observable-activity checks with a 60000 ms timeout (`orchestration.livenessTimeoutMs`).
4. On completion: dispatcher settles or cancels descendants, releases leases, confirms tree settlement.
5. Only after dispatcher confirmation does the run manager mark the run terminal and publish its result.
6. Cleanup failure is a distinct terminal state (`failed-to-clean`) and stays operator-visible.
7. Orphan reconciliation runs on a dispatcher-owned schedule (default every 30000 ms, `orchestration.orphanReconcileIntervalMs`) covering queued nodes past deadline, dead registered PIDs, and parent disappearance. Slow startup is distinguished from death by the registration deadline.

## Cancellation and Termination

Root-callable and TUI controls with exact selectors (no ambiguous prefixes):

- graceful cancel: run, tree, orchestration group, or durable task;
- force terminate: run, tree, or group, only by explicit force action;
- inspect cancellation progress; acknowledge terminal results.

States: `cancelling`, `force-terminating`, `cancelled`, `failed-to-stop`. Graceful cancellation stops admission, cancels queued descendants, signals active ones, waits bounded drain (default 30000 ms, `orchestration.drainTimeoutMs`), releases leases, then settles. Operator-requested termination reports `cancelled` with reason and cleanup evidence, not generic failure. Task cancellation and process cancellation remain separate operations; the root decides how process outcomes transition durable tasks.

## Result Delivery

Each terminal run creates a retained record: result ID; run/tree/orchestration/task/attempt IDs; outcome; bounded summary or artifact ref; delivery state; acknowledgement state; timestamps.

Results deliver as each run settles; siblings never gate delivery. The root receives an immediate continuation per teamlead result, validates it, transitions the durable task, and assigns newly ready work. Delivery retries are idempotent by result ID. Completed and failed alerts remain visible until explicitly acknowledged; `ack all visible` is supported. Unrelated interactive input does not acknowledge failures.

## Package Mailboxes and Unified Orchestration Inbox

A **task** is a durable obligation. A **mailbox envelope** is an addressed command or event causing one atomic package transition. The **package mailbox** is the ordered internal view of unprocessed envelopes for one package. The **orchestration inbox** is the root/operator projection across packages.

Envelopes are immutable and versioned: envelope ID, schema version, package task ID, per-package sequence, kind (command, result, lifecycle, notification), causation/correlation IDs, source IDs, expected topology revision where required, timestamps, attempt, disposition. Order is total only within one package.

Processing one envelope atomically: claim by envelope ID and expected revision; load task and topology; validate authority and transition legality; apply one reducer transition; persist new state, disposition, and outbox events together; relay idempotently. Crash before commit leaves the envelope claimable; crash after commit redelivers idempotent events.

Joins consume result envelopes; arrival order never changes the outcome. Child failure, cancellation, and cleanup failure are distinct result kinds; package or root policy decides retry, sibling cancellation, partial acceptance, or failure. A child cannot mutate or cancel its parent.

Follow-on work: the root appends a durable child task plus mailbox notification in one topology-revision transaction. The receiving teamlead's active assignment stays immutable; its reducer observes the revision before settlement. If already settled, the root starts a continuation against the same package identity.

The inbox merges assignable tasks, results awaiting validation or acknowledgement, and mailbox failures needing repair. Every item carries its durable IDs; actions route to the owning authority; no inbox action mutates an independent lifecycle. The inbox rebuilds from durable state after session replacement or compaction.

Safety: mailboxes bounded (default 256 envelopes per package, `orchestration.mailboxBound`) with visible backpressure and no silent drops; single logical writer per revision via CAS; envelope transitions constrained; poison envelopes get bounded retries (default 2, `orchestration.poisonRetries`) then explicit failed disposition; cross-package synchronous waits are forbidden - dependencies belong in the DAG; a mailbox processor holds no slot or lease while waiting. Unknown schema versions fail loudly; quarantine machinery is deferred until a second writer exists.

## Model-Facing Tool Surface

Agents see a small verb set; internal machinery stays invisible:

| Tool | Operations |
| --- | --- |
| `task` | create, batch, update, list, ready, get (assignment claims recorded here) |
| `subagent` | run teamlead or leaf (single or parallel), with taskId linkage |
| `subagent_status` | liveness, activity, capacity, queue, lease evidence |
| `subagent_control` (new) | cancel, force_terminate, acknowledge, inbox query - exact selectors |

Acceptance: the exposed schema set grows by at most this one control tool. Envelopes, reducers, joins, outbox, and dispatcher internals never appear in tool schemas or prompts.

## Compaction and Resume Contract

The compaction handoff records only authoritative references and current evidence: root and package task IDs; topology revision; active assignment attempt IDs; run/tree/orchestration IDs; blocking follow-on task IDs; unprocessed and unacknowledged result IDs; validation evidence, blocker, and next root action; linked plan path.

On continuation the root: loads the root task and revision; rebuilds the inbox from durable state; queries dispatcher status for referenced attempts; reconciles retained results before assigning new work; resumes the first unmet check; never creates replacement tasks or duplicate attempts.

Subagents continue during root compaction; retained results replay once through the same acknowledgement state. Tests cover compaction before assignment, during active leaves, between teamlead completion and root validation, and with queued blocking follow-ons.

## Fable and Anthropic Compatibility

Fable and supported Anthropic root modes use the same durable tasks, dispatcher status, inbox, delivery, acknowledgement, cancellation, compaction, and footer projections as Codex roots.

The subscription boundary remains explicit: a Bedrock Fable/Opus root is the root orchestrator; it may run direct bounded Codex leaves and deterministic workflows; it does not delegate program ownership to a teamlead where the control plane forbids coordinators; direct leaves still link to package tasks and assignment attempts; root control tools (status, inbox, acknowledge, cancel, force terminate) remain available in TUI, RPC, JSON, and print modes.

Provider capability is a per-boundary record `{ teamleadsAllowed: boolean, controlTools: string[] }` decided by tested detection for `amazon-bedrock` and `bedrock-mantle`; a fuller matrix is deferred until a third transport needs it. Stale Terra guidance is removed. Transport payload sanitization and error improvement stay independent of orchestration lifecycle.

### Planning authorship rule

The operator-selected root model owns plan authorship. For Fable, Opus, or any deliberately selected root producing plan, goal, or architecture artifacts: the root itself performs synthesis, tradeoff decisions, and writing; delegated leaves are limited to investigation (inspection, evidence, reviews, validation); routing plan drafting or content decisions to a delegated model is not permitted; the subscription boundary keeps the root's direct write access to `.specs/**` plan artifacts so the root literally writes its own plans; the boundary rejects plan-authorship delegation while allowing investigation leaves, covered by a direct test.

## Operator UI and Status

`/subagents` defaults to current session and normalized workspace, with explicit filters: `--session`, `--workspace`, `--orchestration <id>`, `--task <id>`, state filters, and `--all`. Runs carry immutable `parentSessionId` and `workspaceId`.

Dashboard shows: full copyable run/tree/orchestration/task/parent/session/workspace IDs; role, depth, and parent-child tree; active, queued, suspended-join, cancelling, and terminal states; complete lease scopes and owners; live capacity and queue position; unacknowledged results; cancellation and force-termination controls.

The footer uses the same projection, recomputed on terminal, cancellation, task-state, and acknowledgement events. Program hierarchy is collapsed: a root program and its active package are one line of truth, not duplicate counts.

## Routing Precedence

1. Explicit per-child model and effort
2. Explicit invocation-level model and effort
3. Explicit size/policy resolution
4. Agent frontmatter
5. Role default
6. Dynamic fallback

Explicit selections execute without advisory warnings or confirmation; provider availability and max-effort approval remain independent gates. Mismatch classification is telemetry only.

## Work Plan and Reload Checkpoints

Execution proceeds in waves. Each wave ends with validation, an operator-visible drain of old-generation runs, and a `/reload` so the remaining waves are built on the new runtime. Until checkpoint 1, run at most three concurrent teams manually.

### Wave 0

- [x] **T0: Freeze, persist evidence, and classify the current diff**
  - Persist the three architecture review reports from this session into `.specs/subagent-orchestration-redesign/reviews/` (root-authored).
  - Classify every orchestration hunk in the working tree as keep, revise, or remove against those reports; preserve unrelated changes untouched.
  - Remove the duplicate runtime inbox, stale readiness metadata, root-as-blocker edges, and tests asserting invalid states before adding behavior.
  - Done when: every changed hunk has a recorded disposition; baseline focused tests and typecheck results are recorded.

### Wave 1 - kernel (then RELOAD CHECKPOINT 1)

- [x] **T1: Canonical durable tasks, assignment, and CAS settlement**
  - Package identity, phase, required flag, acceptance, `assignmentAttemptId`, topology revision; DAG validation with cycle-path diagnostics; derived readiness; constrained transitions; CAS root settlement; the persistence substrate as specified.
  - Done when: accepted, rejected, failed, cancelled, retried, raced, and blocking-follow-on cases each produce one valid durable state.
- [x] **T2: Dispatcher with suspension-based fork-join**
  - Single ready queue with the stated priority order; join records; teamlead fork-suspend-resume lifecycle; bounded resume context; deterministic lease ordering; dispatcher fault and starvation diagnostics.
  - Done when: capacity-1 and eight-team saturation tests complete without deadlock; a suspended teamlead holds no slot or lease; join policies resume correctly; direct race tests pass.
- [x] **T3: Authoritative settlement and orphan recovery**
  - Settlement order: dispatcher cleanup first, run-manager terminal projection second; PID registration and liveness deadlines; automatic orphan reconciliation; `failed-to-clean` state.
  - Done when: normal, abort, crash, stale-PID, pre-registration timeout, and release-failure tests leave no orphan lease or reservation.
- [x] **T5: Per-result retained delivery**
  - Result-ID-keyed retention and delivery; immediate per-run delivery; idempotent retries; root continuation carrying task identity; acknowledgement as a separate transition.
  - Done when: one slow sibling delays nothing; replays never duplicate; acknowledgement survives session replacement.

### Wave 2 - control and program flow (then RELOAD CHECKPOINT 2)

- [x] **T4: Operator control and termination**
  - `subagent_control` tool; graceful drain and explicit force termination for run/tree/group/task; cancellation progress; non-TUI availability; operator termination reports `cancelled` with evidence.
  - Done when: TUI and non-TUI paths cancel exactly the intended boundary, reject ambiguous selectors, preserve siblings, and report cleanup.
- [x] **T6: Assignment flow, mailboxes, follow-ons, and compaction**
  - Assignment claims from ready DAG nodes; package mailbox processing with outbox relay; durable follow-on append with revision checks; teamlead result outcomes as explicit task transitions; compaction handoff and idempotent resume.
  - Done when: preparation precedes mutation readiness correctly; dependencies unlock only on accepted completion; follow-on races are safe; compaction resume creates no duplicate attempts; no runtime-only lifecycle graph remains.

### Wave 3 - surface and migration

- [x] **T7: UI, footer, routing, terminology, and Fable compatibility**
  - Filters, full IDs, tree/capacity/lease display, event-driven footer, explicit-parent routing precedence without advisory noise, `teamlead` rename with migration error, subscription boundary updates including the planning authorship rule and root write access to `.specs/**`, provider capability records.
  - May start early where files are disjoint from Waves 1-2.
  - Done when: operator workflows need no hidden IDs; parsed runtime tests prove terminology, routing, and boundary behavior; Fable/Anthropic roots pass shared lifecycle scenarios their capability record allows.
- [x] **T8: Close this redesign phase and move the corrected cutover forward**
  - The attempted universal cutover showed that the plan incorrectly made durable orchestration mandatory for ordinary subagent use.
  - Standalone kernel work and useful surface changes are retained as inputs; the unvalidated live cutover is removed.
  - The replacement plan owns lightweight direct delegation, optional durable coordination, authority consolidation, migration, and its canary matrix.

## Validation

Per-wave focused suites, then at the end:

```text
cd pi && pnpm run typecheck
cd pi && pnpm test subagent-tree-runtime.test.ts subagent-run-manager.test.ts subagent.test.ts subagent-workflow.test.ts tasks.test.ts operator-status.test.ts active-turn-compaction.test.ts fable.test.ts
cd pi && pnpm test
git diff --check
```

Canary: start three background teamleads under an 8-run ceiling; each forks at least one leaf and suspends; verify suspended teams hold no slots; complete one team while siblings continue and confirm immediate delivery plus root follow-up; append one blocking follow-on to an active team; gracefully cancel one orchestration; force-stop one deliberately unresponsive test process; confirm tasks, leases, footer, dashboard, and acknowledgements converge.

## Configuration Defaults

| Key | Default |
| --- | --- |
| `orchestration.maxConcurrentRuns` | 8 |
| `orchestration.mailboxBound` | 256 per package |
| `orchestration.poisonRetries` | 2 |
| `orchestration.pidRegistrationDeadlineMs` | 30000 |
| `orchestration.livenessTimeoutMs` | 60000 |
| `orchestration.orphanReconcileIntervalMs` | 30000 |
| `orchestration.drainTimeoutMs` | 30000 |
| `orchestration.starvationAgeMs` | 300000 |
| `orchestration.resultSummaryMaxBytes` | 16384 |

## Current Status

- State: completed as an implementation and discovery phase
- Implementation: T0 through T7 produced tested kernel and surface work; T8 identified and removed the incorrect universal durable-orchestration cutover
- Superseding cutover: `.specs/optional-subagent-tasking/plan.md`

## Execution Status

- State: complete
- Completion classification: completed
- Date: 2026-08-20
- Last completed task: T8 phase closeout and corrected-scope handoff
- Implemented: tested orchestration kernel components, terminology and routing updates, provider boundaries, operator filters, and the corrected optional-orchestration direction
- Validation: 7 focused test files and 192 tests passed; `cd pi && pnpm run typecheck` passed; `git diff --check` passed
- Manual validation: not required for this phase closeout
- Deployment validation: not required
- Remaining cutover: owned by `.specs/optional-subagent-tasking/plan.md`
