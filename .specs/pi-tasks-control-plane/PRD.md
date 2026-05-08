---
created: 2026-05-07
status: draft
---

# PRD: Pi Tasks Control Plane

## Problem

This repo has an existing Pi task registry and `/tasks` command, but it does not yet provide the full Claude Code-style task coordination experience demonstrated by `tintinweb/pi-tasks`: LLM-callable task tools, persistent task visualization, dependency DAGs, execution coordination, output retrieval, stop controls, storage scopes, and auto-cascade behavior.

We want to borrow product behavior and implementation lessons from `tintinweb/pi-tasks` while implementing the feature natively in this repo's Pi extension architecture.

## References

- Borrowed project: <https://github.com/tintinweb/pi-tasks>
- Upstream README features referenced:
  - 7 LLM-callable tools: `TaskCreate`, `TaskList`, `TaskGet`, `TaskUpdate`, `TaskOutput`, `TaskStop`, `TaskExecute`
  - Persistent widget
  - System-reminder injection
  - Dependency management with `blocks` / `blockedBy`
  - Shared task lists and file locking
  - Background process tracking
  - Subagent integration and auto-cascade
- Relevant upstream open items:
  - <https://github.com/tintinweb/pi-tasks/issues/9> — add basic stats to each task
  - <https://github.com/tintinweb/pi-tasks/issues/8> — widget style types
  - <https://github.com/tintinweb/pi-tasks/pull/18> — `TaskCreateMany`
  - <https://github.com/tintinweb/pi-tasks/pull/15> — surface silent task loss from auto-clear and disk failures
  - <https://github.com/tintinweb/pi-tasks/pull/14> — persist task execution stats
  - <https://github.com/tintinweb/pi-tasks/pull/2> — reduce task management friction across 14 real-session pain points

## Upstream Issue and PR Analysis

This PRD intentionally borrows product behavior from `tintinweb/pi-tasks`, including open issues and PRs that identify gaps in the upstream implementation.

### Issue #9 / PR #14 — Persist task execution stats

Problem:

- Running tasks display useful timing and token information.
- Once a task completes, those stats are no longer available.
- This makes completed work harder to review, debug, compare, or budget.

Required solution here:

- Persist execution start time when a task enters `running` / `in_progress`.
- Persist end time and duration when a task reaches a terminal state.
- Persist token usage when available:
  - input tokens
  - output tokens
  - total tokens
  - cache read/write tokens if available
- Backfill completion stats for direct completions and resumed tasks where possible.
- Display stats consistently in `/tasks list`, `/tasks show <id>`, widget/status output, and task execution summaries.

### Issue #8 — Widget style types

Problem:

- A full widget can become visually noisy.
- Users want a minimal profile showing only 1–2 tasks.
- Users also want a quick way to temporarily hide tasks.

Required solution here:

- Add task display modes:
  - `hidden`: no persistent task widget/status display
  - `compact`: show only highest-priority 1–2 tasks and summarize the rest
  - `full`: show all relevant non-terminal tasks, subject to a reasonable cap
- Add settings support for widget/display mode.
- Ensure `/tasks` remains available even when widget display is hidden.

### PR #18 — `TaskCreateMany`

Problem:

- Creating several tasks upfront requires repeated `TaskCreate` calls.
- This wastes tool round-trips, tokens, and planning time.
- Claude Code has a batch task primitive for this reason.

Required solution here:

- Add `TaskCreateMany`.
- Accept an array of task creation inputs.
- Preserve per-task fields: subject/summary, description, active form, agent type, owner, metadata, and dependency declarations.
- Support intra-batch dependencies.
- Validate empty array rejection, single-item batch, multi-item batch, and mixed `TaskCreate` / `TaskCreateMany` behavior.
- Return a concise summary of all created tasks.

### PR #15 — Surface silent task loss and disk failures

Problem:

- Missing task updates and deleted tasks can look the same to callers.
- Auto-clear can remove task IDs that the LLM still plans to update.
- Corrupt JSON files can be swallowed silently.
- Deleted task directories can cause persistence failures.

Required solution here:

- Distinguish update outcomes: updated, missing, deleted/cleared, and failed to persist.
- Emit user-visible warnings for corrupt task files.
- Preserve in-memory state when a persisted file is corrupt, where safe.
- Recreate missing task directories before write/lock operations.
- When auto-clear removes tasks, record cleared IDs and surface a reminder so the agent stops referencing stale IDs.
- Never report task mutation success if persistence failed.

### PR #2 — Real-session friction reductions

Problem:

Real coding sessions showed repeated friction:

- too many task creation round-trips
- missing way to skip irrelevant tasks
- noisy reminders during active work
- poor budget/progress visibility
- orphaned `in_progress` tasks after resume
- dependency cycles without clear diagnostics

Required solution here:

- Add `TaskCreateMany`.
- Support dependencies during initial task creation.
- Add a `skipped` state that unblocks dependents without implying work was completed.
- Suppress task nudges while tasks are actively running.
- Make nudge interval configurable, including disablement.
- Collapse completed tasks when active task count is high.
- Show timeout/budget information for active tasks when available.
- Detect orphaned running tasks on session resume and notify once.
- Use DFS-based cycle detection with clear error messages.
- Persist task settings.

## Users / Jobs To Be Done

- Primary user: Pi coding-agent operator using this dotfiles repo.
- Job/story: As an operator, I want agents and subagents to coordinate through one durable task control plane so complex work can be planned, delegated, monitored, stopped, retried, and validated without losing state.
- Current workaround: Use the existing minimal `/tasks` registry view plus ad hoc subagent outputs and conversation context.

## Goals

1. Provide Claude-compatible task tools inspired by `tintinweb/pi-tasks`.
2. Integrate with this repo's existing `pi/lib/task-registry.ts` instead of creating a parallel task store.
3. Make subagent work easier to coordinate through dependencies, owners, outputs, stats, and state transitions.
4. Add UX improvements from upstream open issues/PRs, especially stats, batch creation, style controls, skipped tasks, orphan detection, and safe failure surfacing.

## Non-Goals

- Do not vendor-copy `tintinweb/pi-tasks` wholesale.
- Do not replace this repo's existing subagent extension.
- Do not introduce npm/Bun workflows for Pi TypeScript validation.
- Do not persist secrets, credentials, tokens, or sensitive private data in task metadata/output.

## Requirements

### Functional Requirements

- Add LLM-callable task tools:
  - `TaskCreate`
  - `TaskCreateMany`
  - `TaskList`
  - `TaskGet`
  - `TaskUpdate`
  - `TaskOutput`
  - `TaskStop`
  - `TaskExecute`
- Extend the canonical task registry to support task descriptions, owners, active form/spinner text, agent type, dependency edges, execution output, execution stats, metadata, and skipped state.
- Preserve existing task registry compatibility.
- Support dependency DAG execution:
  - blocked tasks do not execute
  - skipped blockers unblock dependents without being marked completed
  - completed prerequisite outputs can be injected into dependent prompts
  - optional auto-cascade executes newly unblocked tasks
- Improve `/tasks` with list, show, create, start, complete, skip, cancel, retry, clear completed, and settings flows.
- Fix existing terminal-task list filtering bug in `pi/extensions/tasks.ts`.
- Add persistent or compact task visualization if supported by Pi UI APIs.
- Surface disk write failures and auto-clear data-loss risks visibly.
- Detect orphaned running tasks on session resume.

### Non-Functional Requirements

- Use pnpm-only Pi validation.
- Keep helper files out of top-level `pi/extensions/` unless they are intended extension entrypoints.
- Keep all task state writes defensive so producer flows do not fail catastrophically.
- Preserve lifecycle invariants through `transitionTask()` or an evolved equivalent.
- Keep implementation simple and test-first.

## Acceptance Criteria

1. [ ] Existing task registry tests still pass after schema extension.
   - Verify: `cd pi/tests && pnpm run test -- task-registry`
   - Pass: existing records load and lifecycle transitions still work.
   - Fail: legacy task records break or state transitions are bypassed.

2. [ ] Claude-compatible task tools are registered and usable.
   - Verify: `cd pi/extensions && pnpm run typecheck`
   - Pass: all tools typecheck and expose documented schemas.
   - Fail: tool registration errors or schema mismatch.

3. [ ] `TaskCreateMany` creates multiple related tasks.
   - Verify: unit test creates a 3-task dependency graph.
   - Pass: all tasks exist and dependency edges are bidirectional.
   - Fail: partial graph corruption or missing reverse edges.

4. [ ] Dependency blocking works.
   - Verify: mocked execution test with task B blocked by task A.
   - Pass: B does not execute until A is completed or skipped.
   - Fail: B runs early.

5. [ ] Subagent execution records outputs and stats.
   - Verify: mocked subagent returns result and token usage.
   - Pass: `/tasks show <id>` displays output summary and usage.
   - Fail: output/stats are lost after registry reload.

6. [ ] Disk write failures are not silent.
   - Verify: mock registry write failure.
   - Pass: user-facing error/warning is emitted and success is not reported unless persistence succeeds.
   - Fail: task appears successful but is not persisted.

7. [ ] Terminal tasks are hidden by default in `/tasks`.
   - Verify: `cd pi/tests && pnpm run test -- tasks`
   - Pass: completed/cancelled tasks only appear with explicit all/show behavior.
   - Fail: current `|| true` behavior remains.

8. [ ] Completed tasks retain execution stats.
   - Verify: complete a mocked subagent task, reload registry, run `/tasks show <id>`.
   - Pass: start time, duration, and token usage remain visible.
   - Fail: stats only appear while running or disappear after reload.

9. [ ] Widget/display style is configurable.
   - Verify: set display mode to `hidden`, `compact`, and `full` in tests.
   - Pass: each mode renders expected output shape.
   - Fail: widget always renders full list.

10. [ ] `TaskCreateMany` supports batch creation with dependencies.
    - Verify: create three tasks in one call where task C depends on A and B.
    - Pass: all tasks are created and dependency edges are bidirectional.
    - Fail: follow-up `TaskUpdate` calls are required to wire dependencies.

11. [ ] Persistence failures and recovery paths are visible.
    - Verify: simulate corrupt task file and deleted task directory.
    - Pass: warning is emitted, directory is recreated, and successful mutation is only reported after persistence succeeds.
    - Fail: task mutation appears successful while data is lost.

12. [ ] Skipped tasks unblock dependents without marking work completed.
    - Verify: task B depends on task A; mark A skipped.
    - Pass: B becomes executable and A displays as skipped.
    - Fail: B remains blocked or A is falsely marked completed.

13. [ ] Orphaned running tasks are detected on resume.
    - Verify: load registry with stale `running` task and simulated new session.
    - Pass: one-time notification identifies orphaned task and offers retry/cancel/mark complete path.
    - Fail: stale task remains running silently.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Vendor `tintinweb/pi-tasks` directly | Fastest feature import | Duplicates registry, dependency risk, less native | Reject |
| Install upstream package as-is | Minimal work | Does not integrate with repo task registry/subagents | Reject |
| Native implementation borrowing behavior | Best integration, testable, maintainable | More work | Choose |
| Minimal `/tasks` only | Simple | Misses requested features and subagent coordination | Reject |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Parallel task models | Confusing state and bugs | Use `pi/lib/task-registry.ts` as sole source of truth |
| Subagent cancellation unsupported | `TaskStop` may be partial | Implement best-effort stop and clear status messaging |
| Widget API limitations | Persistent display may not work | Start with renderable status/list output; gate widget behind capability check |
| Auto-clear data loss | User loses task history | Default conservative clearing and visible warnings |
| Dependency cycles | Execution deadlock | Warn on cycle creation and prevent auto-execution |
| Schema migration | Existing task records may break | Version schema and test old record loading |

## Open Questions

- Should task storage remain under the existing operator state directory only, or also support upstream-style project/session/named scopes?
- Should `TaskUpdate(status: "deleted")` hard-delete records or mark tombstones?
- Should auto-cascade be enabled by default or opt-in?
- Should skipped tasks be terminal forever, or retryable back to pending/running?

## Plan Handoff

- Recommended next command:
  ```bash
  /plan-it .specs/pi-tasks-control-plane/PRD.md
  ```
- Review command:
  ```bash
  /review-it .specs/pi-tasks-control-plane/PRD.md
  ```
- Notes for planner:
  - Implement as an evolution of existing `pi/lib/task-registry.ts`.
  - Do not create a parallel task tracker.
  - Validate with pnpm-only Pi commands.
