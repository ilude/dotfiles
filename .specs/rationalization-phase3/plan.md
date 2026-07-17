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
3. Agent frontmatter promises nothing the launcher does not enforce.
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
  (`roleType`).
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
- Continuable child sessions get a retention policy; do not grow
  `~/.pi/agent/sessions` unbounded with delegation traffic.
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

Stop and ask before: changing a public tool schema shape, choosing to delete
`isolation` rather than implement it (T3 presents the evidence first), or
enabling auto-dispatch as default-on rather than opt-in.

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
launcher. Child sessions from delegation get a dedicated directory and a
retention policy aligned with the corpus retention approach (phase 2 T12).

Done when: a spawned agent answers a follow-up using context from its first
run (proven by referencing a fact only present there); non-continuable
launches behave exactly as today; retention prunes old delegation sessions
in a dry run.

### T3: Isolation - enforce as option or delete

The decision protocol scopes worktrees to the multi-instance case: several
Pi/Claude instances sharing one repo (the phase 1 execution alongside
concurrent `.specs/` editing on 2026-07-16 is the live example - today that
coordination happens through prose notes in the plan file). Within that
scope, present the evidence and the user's choice (stop-and-ask):

1. Implement `isolation: worktree` as an explicit opt-in only (never a
   default, never automatic dispatch behavior): temporary worktree for the
   child cwd, auto-removed if unchanged, path reported if dirty. Include
   the known gotcha: fresh worktrees lack gitignored files (.env, local
   config, node_modules), so provide a declared copy-in mechanism or the
   child fails confusingly at startup.
2. Or delete the field and its parser support as unenforced metadata, and
   serve the multi-instance case instead with a session-level helper
   (create/enter/clean a named worktree for a second instance), which may
   be the better fit since the use case is instance isolation, not
   subagent isolation.

Apply the same enforce-or-delete test to `memory` frontmatter while in the
file.

Done when: either an opt-in worktree-isolated child demonstrably cannot
dirty the main tree and leftover worktrees are cleaned, or the fields are
gone from parser, docs, and agent files and the chosen multi-instance
mechanism (session-level helper or documented practice) is in place; in
both outcomes no advertised-but-unenforced field remains and nothing
dispatches worktrees automatically.

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
   descriptions; read-only tasks always parallelize. Overlapping writers
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

Ledger of decisions, `make check-pi-extensions`, and a live end-to-end
exercise: one /do-it run over a scratch plan that fans out background tasks,
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

- [ ] T1: background completion notifications - pending
- [ ] T2: continuable subagents - pending
- [ ] T3: isolation enforce-or-delete (stop-and-ask gate) - pending
- [ ] T4: mechanical DAG scheduler - pending
- [ ] T5: schema-validated subagent output - pending
- [ ] T6: close - pending

### State

- **Classification:** not started; gated on phase 2 archive
- **Current blocker:** phase 2 (`.specs/rationalization-phase2/plan.md`) not
  yet started (itself gated on phase 1)
- **Next:** after phase 2 archives, start T1
- **Resume:** `/do-it .specs/rationalization-phase3/plan.md`
