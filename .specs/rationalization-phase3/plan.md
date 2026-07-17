---
created: 2026-07-16
status: draft
completed:
---

# Plan: Orchestration capability parity - phase 3

Continues `.specs/rationalization-phase2/` after it archives. Phases 1-2
removed prescription; phase 3 adds the four orchestration capabilities whose
absence forces the model to compensate with reasoning: background completion
notifications, continuable subagents, enforced (or deleted) isolation, and
mechanical wave dispatch.

## Do not start

Do not begin until phase 2 is archived (or the user explicitly overrides).
Phase 2's T5 rewrites the agent roster and `pi/lib/skill-review.ts`; this
plan changes the launcher those depend on.

## Goal

1. A background task's completion reaches the parent session as an event;
   fan-out never requires a blocking join or polling.
2. A subagent can be continued with its context intact, and delegated work
   leaves an auditable session trail.
3. Agent frontmatter promises nothing the launcher does not enforce, and a
   cross-client lease registry warns when multiple Pi or Claude instances occupy
   the same Git worktree.
4. Ready tasks dispatch mechanically when their blockers complete; workflow
   skills stop narrating wave scheduling.
5. Subagent results can carry schema-validated structured output across the
   process boundary.

## Why

Verified 2026-07-16 against the current source:

- `pi/extensions/subagent/index.ts:702` spawns every child with
  `--no-session`: child context is unrecoverable, follow-ups require cold
  restarts that re-derive context, and delegated work leaves no transcript
  (the friction research was blind to subagent sessions for this reason).
- The `task` tool's only same-session join is a blocking `await`; its own
  guidelines forbid polling. There is no push path from a completed
  background task to the parent model.
- `pi/extensions/subagent/agents.ts:14`: "Isolation and memory remain
  advisory metadata" - `isolation: worktree` parses and is advertised but
  never enforced, the same unenforced-frontmatter class phase 1 T4 deleted
  (`roleType`). The actual need is detecting multiple Pi or Claude instances
  modifying one worktree, not placing intra-instance subagents in worktrees.
- The 2026-07-15 DAG-runner MVP (archived) delivered graph-aware batch,
  bounded fan-out, event-driven await, and cycle rejection - but explicitly
  excluded auto-dispatch: the model still pumps waves manually, dispatch
  order among ready tasks is arbitrary, and no write-conflict awareness
  exists between dependency-independent tasks.
- The Claude Code harness provides all four capabilities (background
  completion notifications, SendMessage continuation, enforced worktree
  isolation, dependency-aware task dispatch); their absence in Pi is a
  capability gap, not a design decision.
- `pi/lib/typed-agent.ts` (defineAgent) provides schema-validated one-shot
  stages in-process; the subagent process boundary has no equivalent
  contract.

## Evidence base

- `pi/extensions/subagent/index.ts`, `agents.ts`, `pi/extensions/tasks.ts`,
  `pi/extensions/tasks/execution.ts` - current launcher, task registry, and
  execution coordinator.
- `pi/skills/typed-agent-workflows/SKILL.md` and `roadmap.md` - the typed
  agent contract and its evidence-gated deferred capabilities.
- `.specs/rationalization-phase2/research/friction-*.md` - cold-start and
  churn costs of non-continuable delegation.
- `.specs/archive/pi-task-dag-runner/plan.md` (completed 2026-07-15) - the
  DAG foundation T4 builds on, including its recorded MVP exclusions;
  sibling archives `pi-task-ready-deps/` and `pi-tasks-control-plane/` for
  the registry's dependency and lifecycle history.

## Boundaries

- Preserve the public `subagent` and `task` tool schemas; new capability is
  additive (new optional parameters or actions), never a changed shape.
- Fail-open and additive: a notification, continuation, isolation, or
  dispatch failure degrades to today's behavior, never to lost work.
- Keep `typed-agent` minimal: no workflow DSL primitives (`agent()`,
  `parallel()`, `pipeline()` remain deferred behind the roadmap's evidence
  triggers). This plan does not touch `pi/lib/typed-agent.ts` except where
  T5 reuses its validation helpers.
- Session data is never deleted (user decision 2026-07-16: transcripts are
  refinement/training data). Continuable child sessions get
  compress-on-age, not deletion; scanners must read compressed files.
  Ephemeral occupancy leases are runtime coordination state, not session data;
  expired leases may be removed after identity and heartbeat checks.
- No security/permission semantic changes; child processes keep the same
  damage-control posture as today.
- Commit each validated slice with a conventional message and CHANGELOG
  entry. Do not push.

## Decision protocol

Already decided - do not relitigate:

- Model/effort are dispatch parameters, not agent identity (phase 2).
- Polling public task actions stays forbidden; the notification path is the
  replacement, not an exception.
- Typed-agent stays DSL-free.
- Worktrees are for multiple independent instances (Pi and/or Claude)
  sharing one repo, not for intra-instance subagent parallelism (user
  decision 2026-07-16). Within one instance, write conflicts are handled by
  scheduling and decomposition; worktree use stays an explicit option,
  never an automatic dispatch behavior. This deliberately trades peak write
  throughput for a single coherent working tree and zero merge ceremony,
  diverging from the field's per-subagent default (research item 9).
- T3 decision (user decision 2026-07-17): delete the unenforced `isolation`
  and `memory` agent metadata. Replace subagent isolation with a gitignored,
  per-worktree lease registry shared by Pi and Claude. A second active
  instance warns that further modifying work belongs in a separate Git
  worktree; V1 does not create worktrees automatically or block mutations.

Stop and ask before: changing a public tool schema shape, turning T3's warning
into automatic worktree creation or mutation blocking, or enabling
auto-dispatch as default-on rather than opt-in.

Session continuity: same protocol as phases 1-2 - work in checklist order,
update Execution status and commit after each slice, resume from recorded
state, never re-do a `[x]` task.

## Tasks

### T1: Background completion notifications

When a background task execution completes (or fails/cancels), the
coordinator in `pi/extensions/tasks/execution.ts` injects a compact custom
message into the parent session: task id, agent, status, duration, and the
first line of output or the artifact path - hard cap 500 bytes per
notification (index-card discipline). Verify the message-injection API Pi
exposes to extensions first (custom_message entries exist in session files;
find the sanctioned write path). Delivery semantics, decided: a
notification never interrupts an in-flight model turn and never triggers an
autonomous turn by itself - it is appended to the transcript and seen on
the next turn, whatever causes that turn. The T4 drain does not depend on
the model reacting mid-drain; code dispatches, and the model acts at
quiescence or starvation. No schema change to the task tool.

Done when: a live fan-out of two background tasks completes with both
notifications visible in the parent transcript without an `await`; a failed
task notifies with its failure; notification failure leaves task state
consistent (output still retrievable).

### T2: Continuable subagents

First verify the resume mechanism: confirm the `pi` CLI can resume a
specific session file in headless print mode (a `--resume`/`--session`-style
flag pointing at a session path). If no such mechanism exists, record this
task as blocked on an upstream Pi capability and stop - do not emulate
resumption by replaying transcript text into a fresh session. Then add
opt-in continuation: a launch parameter (or agent frontmatter default)
that drops `--no-session` and records the child session path in the result
details and task record; add a follow-up action (`subagent` continue mode or
task action) that resumes that session with a new message via the same
launcher. Child sessions from delegation get a dedicated directory and
compress-on-age (never deletion - session data is refinement data by user
decision; any scanner touching these files must handle the compressed
form).

Done when: a spawned agent answers a follow-up using context from its first
run (proven by referencing a fact only present there); non-continuable
launches behave exactly as today; compress-on-age verified in a dry run
with a compressed session still readable by the friction scanner.

### T3: Cross-client worktree occupancy leases

Delete `isolation` and `memory` from the agent parser, documentation, and agent
files. They are unenforced metadata and do not model the actual concurrency
boundary.

Implement one deterministic lease helper used by Pi and Claude. Each Git
worktree owns a gitignored `.agent-instances/` directory with one bounded JSON
record per active session. A record contains client, session id, worktree root,
branch, start time, last heartbeat, and process identity where reliable.
Registration is atomic and idempotent. After registering, each client rescans
so two simultaneous starts cannot both silently assume sole occupancy.

Pi registers on `session_start`, refreshes while active, removes its lease on
`session_shutdown`, and shows occupancy in session context and operator status.
Claude uses its lifecycle hooks and status line for the same register,
heartbeat, warning, and best-effort release behavior. Both clients use the same
stale test. A lease may be removed only when its heartbeat has expired and its
recorded process identity is absent or no longer matches; malformed records are
reported, not silently treated as inactive.

When another active lease exists in the same worktree, display a compact warning
that further modifying work should move to a separate Git worktree. V1 is
advisory: it neither creates a worktree nor blocks tools. Different worktree
roots do not warn about one another. Lease files remain runtime state and never
enter commits.

Done when: parser, docs, and agent files contain no `isolation` or `memory`
contract; simultaneous Pi/Pi and Pi/Claude fixtures detect both occupants; live
Pi and Claude sessions in one worktree show the warning; sessions in separate
worktrees do not; clean shutdown and simulated crash expiry are verified; and
`git status --short` remains unchanged by lease activity.

### T4: Mechanical DAG scheduler

Foundation verified 2026-07-16: the archived
`.specs/archive/pi-task-dag-runner/` plan (completed 2026-07-15) already
provides graph-aware `batch` with `blockedByKeys`, bounded `execute_many`
(max 8 IDs), one-shot event-driven `await`, cycle rejection at creation
(`pi/lib/task-registry.ts:317`), and mixed manual/executable DAGs. Its MVP
exclusions are exactly this task's scope: the model still pumps waves by
hand, and no write-conflict awareness exists.

Build the scheduler as an opt-in drain action over the existing registry:

1. **Auto-dispatch on unblock:** when a task completes, immediately start
   newly-ready executable tasks, up to a `maxConcurrent` limit (default in
   the 3-5 range the multi-agent literature converged on). Drain continues
   until quiescence - including tasks created mid-drain by running workers -
   a stop is issued, or nothing ready remains.
2. **Write-conflict handling by serialization:** optional `scope`
   (paths/globs) on task records. The dispatcher never runs two tasks with
   overlapping write scopes concurrently; scope-less writer tasks conflict
   with everything except read-only tasks. A task is read-only when its
   agent's launcher-enforced tool set contains no mutating tools - derived
   mechanically from the enforced tools, never from agent names or
   descriptions; read-only tasks always parallelize. This absorbs the open
   item in `.specs/archive/pi-orchestration-follow-ups/note.md` (tools
   declaring read/execute/mutate capability metadata instead of a manual
   blocklist; archived 2026-07-17 with this absorption noted); mark the
   item complete in the archived note when this lands. Overlapping writers
   queue - they are never automatically dispatched into worktrees (decision
   protocol: worktrees serve multi-instance isolation, not intra-instance
   parallelism). This mechanically enforces
   parallel-reads/single-threaded-writes (research item 7) instead of
   trusting plan prose to sequence writers. The decomposition-side rule -
   do not assign same-file work to parallel tasks in the first place -
   lands in `plan-it.md` as one line.
3. **Critical-path-first ordering:** among simultaneously-ready tasks,
   dispatch the one with the longest downstream dependency chain first - a
   cheap DAG heuristic that shrinks total wall time.
4. **Failure and starvation semantics:** a failed task blocks only its
   dependents; independent branches continue. When unfinished tasks remain
   but nothing is ready (all blocked on failures), the drain ends with an
   explicit starvation report naming the blocking failures - never a silent
   stall.
5. **Plan handoff:** /do-it materializes a plan's task breakdown as one
   graph-aware `batch` call (keys as dependency references), starts the
   drain, and reacts to T1 notifications. Remove the wave-scheduling
   narration from `pi/skills/workflow/do-it.md` in favor of that one
   instruction.

Done when: a fixture DAG (diamond dependency, an independent branch, two
dependency-independent tasks with overlapping write scopes, and one task
created mid-drain) drains in correct order with measured parallelism -
overlapping writers serialized, readers parallel, deliberate failure
blocking only dependents, starvation reported explicitly; /do-it's wave
prose is reduced to the handoff instruction.

### T5: Schema-validated subagent output

Optional `outputSchema` parameter on the `subagent` tool: the child receives
an appended instruction to emit JSON matching the schema; the parent
validates (reusing typed-agent's validation helpers), performs at most one
bounded correction round-trip (via T2 continuation when available, else
fail), and returns the parsed object in result details. Chain mode forwards
validated objects instead of raw text when the schema is present, and
prefers artifact references over re-summarized prose for bulky payloads -
the game-of-telephone finding (research item 6): fidelity survives as a
file reference, not as repeated summarization through the coordinator.

Done when: a valid child response yields a parsed object; an invalid one
triggers exactly one correction then a typed failure; absent `outputSchema`,
behavior is byte-identical to today.

### T6: Close

Record material decisions in the closeout, run `make check-pi-extensions`, and
complete a live end-to-end exercise: one /do-it run over a scratch plan that
fans out background tasks,
receives notifications, continues one agent with a follow-up, and drains a
dependency wave mechanically.

Done when: the end-to-end run passes and each capability's evidence is
recorded.

## Dependency graph

```text
T1 -> T4 (dispatch reacts via notifications)
T2 -> T5 (correction round-trip uses continuation)
T3 independent
All -> T6
```

## Out of scope

- Workflow DSL primitives (typed-agent roadmap owns those, evidence-gated).
- Cron/scheduled wakeups and remote execution.
- Claude/OpenCode surfaces.
- Changing default delegation guidance (work directly by default stands).

## Execution status

Same maintenance rules as phases 1-2. Statuses: `pending` |
`in-progress: <next step>` | `blocked: <reason>` | `done: <commit>`.

### Task checklist

- [x] T1: background completion notifications - done: `1fc8ac8`
  - [x] message-injection API verified: `pi.sendMessage` with `deliverAs: "nextTurn"`
  - [x] completion/failure notifications implemented and capped
  - [x] extension-level two-task fan-out validated without await
- [x] T2: continuable subagents - done: `489e93a`
  - [x] headless resume mechanism verified: `pi --session <path> -p <message>`
  - [x] opt-in continuation and follow-up action implemented
  - [x] compress-on-age in place (no deletion); context-carryover proof passed
- [x] T3: cross-client worktree occupancy leases - done: `1828e9b`
  - [x] user decision received: delete advisory metadata; add lease warning
  - [x] `isolation` and `memory` removed from parser, docs, and agent files
  - [x] shared atomic lease lifecycle implemented for Pi and Claude
  - [x] same-worktree warning and separate-worktree non-warning validated
  - [x] clean shutdown, stale recovery, and clean Git status validated
- [x] T4: mechanical DAG scheduler - done: `274a829`
  - [x] auto-dispatch on unblock with maxConcurrent
  - [x] write-scope serialization; read-only derived from enforced tools
  - [x] critical-path-first ordering
  - [x] failure/starvation semantics with explicit report
  - [x] /do-it handoff wired; wave narration removed
  - [x] fixture DAG validation passed
- [ ] T5: schema-validated subagent output - pending
  - [ ] outputSchema validation with one bounded correction
  - [ ] chain forwards validated objects / artifact references
  - [ ] absent-schema behavior byte-identical
- [ ] T6: close - pending
  - [ ] material decisions recorded in the closeout
  - [ ] `make check-pi-extensions` passed
  - [ ] live end-to-end /do-it exercise passed (all capabilities)

### State

- **Classification:** in progress; T1-T4 complete
- **Current blocker:** none
- **Next:** T5, add schema-validated subagent output with one continuation correction
- **Resume:** `/do-it .specs/rationalization-phase3/plan.md`
