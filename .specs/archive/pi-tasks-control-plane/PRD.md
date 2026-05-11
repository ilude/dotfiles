---
created: 2026-05-07
status: superseded
completed: 2026-05-11
review: .specs/pi-tasks-control-plane/review-1/synthesis.md
---

# PRD: Pi Tasks Control Plane

> Superseded on 2026-05-11 by `.specs/pi-control-plane-consolidation/plan.md`, which rolls the remaining task control-plane MVP work together with the related Pi agent team and `/branch` cleanup.

## Problem

This repo has an existing Pi task registry and `/tasks` command, but it does not yet provide a reliable native task control plane for coordinating agent/subagent work through durable task state, explicit dependencies, clear operator visibility, and safe persistence.

The goal is not blind upstream parity. `tintinweb/pi-tasks` is the reference implementation and product inspiration, but this repo should implement a phased native design around its existing `pi/lib/task-registry.ts`, existing subagent extension, and pnpm-only Pi validation workflow.

## References

- Borrowed project: <https://github.com/tintinweb/pi-tasks>
- Upstream README features referenced:
  - task tools: `TaskCreate`, `TaskList`, `TaskGet`, `TaskUpdate`, `TaskOutput`, `TaskStop`, `TaskExecute`
  - persistent widget and task display
  - system-reminder injection
  - dependency management with `blocks` / `blockedBy`
  - shared task lists and file locking
  - background process tracking
  - subagent integration and auto-cascade
- Relevant upstream open items:
  - <https://github.com/tintinweb/pi-tasks/issues/9> — add basic stats to each task
  - <https://github.com/tintinweb/pi-tasks/issues/8> — widget style types
  - <https://github.com/tintinweb/pi-tasks/pull/18> — `TaskCreateMany`
  - <https://github.com/tintinweb/pi-tasks/pull/15> — surface silent task loss from auto-clear and disk failures
  - <https://github.com/tintinweb/pi-tasks/pull/14> — persist task execution stats
  - <https://github.com/tintinweb/pi-tasks/pull/2> — reduce task management friction across 14 real-session pain points

## Upstream Issue and PR Analysis

### Issue #9 / PR #14 — Persist task execution stats

Problem: running tasks display timing/token information, but completed tasks lose those stats.

Required solution here:

- Persist execution start time when a task enters `running`.
- Persist end time and duration when a task reaches a terminal state.
- Persist token usage when available: input, output, total, cache read, and cache write tokens.
- Backfill completion stats for direct completions and resumed tasks where possible.
- Display stats consistently in `/tasks list`, `/tasks show <id>`, pure renderer/status output, and execution summaries.

### Issue #8 — Widget style types

Problem: the full widget can become visually noisy and users want minimal/hidden modes.

Required solution here:

- MVP: implement pure text/status rendering modes: `hidden`, `compact`, and `full`.
- Later phase: add persistent widget adapter only if the Pi UI API supports it cleanly.
- `/tasks` must remain available even when display mode is `hidden`.

### PR #18 — `TaskCreateMany`

Problem: creating several tasks via repeated `TaskCreate` calls wastes tool round-trips and tokens.

Required solution here:

- Add `TaskCreateMany` in the MVP.
- Accept an array of task creation inputs.
- Preserve per-task fields: `subject`, `description`, `activeForm`, `agentType`, `owner`, `metadata`, `blocks`, and `blockedBy`.
- Support intra-batch dependencies by temporary client keys or explicit dependency references defined in the tool schema.
- Reject empty arrays.
- Return a concise summary of all created tasks.

### PR #15 — Surface silent task loss and disk failures

Problem: missing/deleted tasks, auto-clear, corrupt files, and deleted task directories can confuse the agent or silently lose state.

Required solution here:

- Distinguish mutation outcomes: `updated`, `not_found`, `deleted`, `cleared`, and `persist_failed`.
- Emit user-visible warnings for corrupt task files and failed writes.
- Preserve or quarantine corrupt files according to a defined policy.
- Recreate missing task directories before write/lock operations.
- Never report task mutation success if persistence failed.

### PR #2 — Real-session friction reductions

Borrow selectively, not wholesale:

- MVP: `TaskCreateMany`, initial dependency wiring, `skipped` state, low-noise display defaults, explicit cycle detection.
- Phase 2: execution orchestration, `TaskExecute`, `TaskStop`, auto-cascade, output injection, budget/timeout display.
- Phase 3: persistent widget adapter, richer settings UI, advanced reminders.

## Users / Jobs To Be Done

- Primary user: Pi coding-agent operator using this dotfiles repo.
- Job 1: As an operator, I want one durable view of agent/subagent work so I can see pending, running, blocked, completed, failed, cancelled, and skipped work without scanning conversation history.
- Job 2: As an agent, I need explicit task tools and dependency state so I can plan multi-step work, avoid running blocked tasks, and record results safely.
- Job 3: As a future subagent executor, I need safe execution metadata and output retention contracts before automated cascading or prompt injection is enabled.

## Goals

1. Provide a native MVP task control plane using this repo's existing `pi/lib/task-registry.ts` as the single source of truth.
2. Provide Claude-inspired task tools for creating, listing, reading, and updating tasks, including batch creation.
3. Add explicit dependency, lifecycle, display, persistence, and security contracts that are ready for `/plan-it`.
4. Defer risky execution orchestration until the registry/tool/control-plane foundation is stable and tested.

## Non-Goals

- Do not vendor-copy `tintinweb/pi-tasks` wholesale.
- Do not install or depend on upstream `@tintinweb/pi-tasks` for runtime behavior.
- Do not replace this repo's existing subagent extension.
- Do not implement `TaskExecute`, `TaskStop`, auto-cascade, or dependent prompt injection in the MVP.
- Do not make persistent widget support mandatory in the MVP.
- Do not introduce npm/Bun workflows for Pi TypeScript validation.
- Do not persist secrets, credentials, tokens, sensitive private data, or unredacted proprietary data in task metadata/output.

## MVP Scope

MVP includes:

- Registry/schema evolution for native task control-plane fields.
- Deterministic lifecycle transitions, including `skipped`.
- Dependency graph storage and validation.
- LLM-callable tools:
  - `TaskCreate`
  - `TaskCreateMany`
  - `TaskList`
  - `TaskGet`
  - `TaskUpdate`
- `/tasks` improvements:
  - list
  - show
  - create
  - start
  - complete
  - skip
  - cancel
  - retry
  - clear completed
  - settings/help
- Pure renderer/status display modes:
  - `hidden`
  - `compact`
  - `full`
- Safe persistence diagnostics and corrupt-file handling.
- Concrete tests and validation commands.

## Deferred Scope

Phase 2 — execution orchestration:

- `TaskExecute`
- `TaskStop`
- `TaskOutput`
- auto-cascade
- dependent prompt output injection
- budget/timeout display
- orphaned subagent/process recovery

Phase 3 — advanced UX:

- persistent widget adapter if Pi UI API supports it
- advanced nudge/reminder controls
- richer interactive settings menu
- shared named task scopes beyond the existing operator state directory

## Product Decisions

These choices are decided for MVP so `/plan-it` does not need to invent product behavior:

- Storage scope: MVP uses the existing operator-state task directory only. Project/session/named task scopes are deferred.
- Delete behavior: MVP uses tombstones for task deletion/clear operations when a task has dependencies, output, or recent agent-visible IDs; hard delete is allowed only for dependency-free tasks with no retained output.
- Auto-cascade default: deferred and off by definition in MVP.
- `skipped` state: terminal for dependency unblocking, visible in terminal-task filtering, and retryable only via explicit `/tasks retry <id>` or `TaskUpdate` transition back to `pending`.
- Stop behavior: deferred. MVP must not expose `TaskStop` as implemented; future stop semantics must distinguish `stop_requested`, `stopped`, `failed_to_stop`, and `orphaned`.
- Widget behavior: pure renderer is mandatory; persistent widget integration is optional and deferred.

## Data Model Decisions

The plan should evolve the canonical registry rather than create a second tracker.

### Schema/versioning

- Accept legacy `TaskRecordV1` JSON fixtures.
- Write a clearly defined new schema, either:
  - backward-compatible `TaskRecordV1` with optional fields, or
  - explicit `TaskRecordV2` plus migration.
- `/plan-it` must choose one strategy and include fixture tests.
- Unknown fields from existing records must be preserved unless intentionally migrated with a documented reason.
- Corrupt JSON must be distinguished from legacy-but-valid records and surfaced as a warning.

### Lifecycle

Required states for MVP:

- `pending`
- `running`
- `blocked`
- `completed`
- `failed`
- `cancelled`
- `skipped`

Required transition rules:

- `pending -> running | blocked | completed | cancelled | skipped | failed`
- `running -> blocked | completed | failed | cancelled | skipped`
- `blocked -> pending | running | failed | cancelled | skipped`
- `failed -> pending | running | cancelled | skipped`
- `skipped -> pending` only through explicit retry/reopen
- `completed | cancelled -> no mutation except metadata/tombstone annotations unless explicitly reopened by a future non-MVP feature`

### Dependencies

- Store canonical dependency edges with duplicate prevention.
- Maintain bidirectional consistency for `blocks` and `blockedBy` views.
- Reject self-dependencies.
- Reject cycles at creation/update time using deterministic cycle detection.
- Reject or atomically roll back partial bidirectional edge writes.
- If a referenced task is tombstoned, dependents keep a stable tombstone reference and display a clear warning.
- A task is executable only when all non-terminal blockers are resolved. `completed` and `skipped` unblock; `cancelled`, `failed`, and deleted-without-tombstone do not unblock silently.

### Persistence and mutation outcomes

Registry/tool mutations must use typed outcomes:

- `ok`
- `not_found`
- `validation_error`
- `deleted`
- `cleared`
- `persist_failed`
- `conflict`

Batch operations must define all-or-nothing behavior. If atomicity cannot be guaranteed across task files, the implementation must use rollback/repair records and tests must prove no silent graph corruption.

## Tool Contract

MVP tools should expose explicit schemas and stable result shapes.

### `TaskCreate`

Required input:

- `subject: string`
- `description: string`

Optional input:

- `activeForm?: string`
- `agentType?: string`
- `owner?: string`
- `metadata?: Record<string, unknown>`
- `blocks?: string[]`
- `blockedBy?: string[]`
- `status?: pending | blocked | running | completed | failed | cancelled | skipped`

Output:

- created task ID
- status
- warnings
- dependency validation result

### `TaskCreateMany`

Input:

- `tasks: TaskCreateInput[]`
- optional batch-local dependency aliases if needed for intra-batch references

Rules:

- reject empty arrays
- reject duplicate aliases
- reject invalid/cyclic dependencies
- preserve all per-task fields
- return all created IDs and warnings

### `TaskList`

Input:

- optional filters: status, owner, origin, includeTerminal, limit

Output:

- ordered task rows with ID, status, subject, owner, dependency summary, and stats when available

### `TaskGet`

Input:

- `taskId: string`

Output:

- full task detail, dependency edges, stats, warnings, tombstone state if applicable

### `TaskUpdate`

Input:

- `taskId: string`
- optional patch fields: subject, description, activeForm, owner, metadata merge/delete, status transition, add/remove blocks, add/remove blockedBy

Output:

- typed mutation outcome
- updated task when successful
- warnings/errors when validation or persistence fails

### Deferred tool contracts

`TaskOutput`, `TaskStop`, and `TaskExecute` are deferred to Phase 2. The MVP may reserve names in documentation but must not register working tools until semantics and safety tests exist.

## Security and Data Safety

- Persisted task output and metadata must be treated as untrusted data.
- MVP must not inject prior task output into prompts automatically.
- Any future output injection must quote/sanitize prior output as data, not instructions.
- Auto-cascade must be opt-in and require explicit user/operator approval before running dependent tasks that include prior output.
- Persisted output retention must be bounded by size and configurable retention rules.
- Secret-pattern scanning/redaction must run before saving task metadata/output and before rendering tool output.
- Redaction tests must cover representative secrets/tokens in prompts, metadata, and mocked subagent output.
- Failed redaction or persistence must return a non-success outcome.

## UX Contract

Default MVP behavior:

- Default display mode: `compact`.
- Compact mode: show at most two highest-priority non-terminal tasks plus a summary count.
- Full mode: show all non-terminal tasks up to a documented cap; terminal tasks require explicit `--all` or direct lookup.
- Hidden mode: suppress persistent/status display only; `/tasks` and tools still work.
- Priority ordering: `blocked`, `failed`, `running`, `pending`, `skipped`, `completed`, `cancelled` unless the implementation justifies a different order in the plan.
- Nudge/reminder behavior: no MVP automatic nudges except safety warnings from failed persistence/corrupt storage.
- Warning display: warnings must appear in tool results and `/tasks` output until acknowledged or resolved.
- Destructive flows: clear/delete operations require explicit command names and should prefer tombstones when the task may still be referenced.
- `/tasks help` must document command grammar and settings.

Resume/orphan behavior is deferred for subagent execution. MVP may detect stale `running` registry records and display them, but must not claim process/subagent recovery.

## Implementation Boundaries

- Only top-level `pi/extensions/*.ts` files intended as extension entrypoints may export extension factories.
- Recommended MVP entrypoint: `pi/extensions/task-tools.ts` for task tool registration, plus the existing `pi/extensions/tasks.ts` for slash command behavior.
- Shared helpers should live under `pi/lib/`, for example:
  - `pi/lib/task-dependencies.ts`
  - `pi/lib/task-renderer.ts`
  - `pi/lib/task-settings.ts`
  - evolved `pi/lib/task-registry.ts`
- Tests should live under `pi/tests/`.
- Pi TypeScript validation remains pnpm-only.

## Acceptance Criteria

1. [ ] Legacy task records load after schema evolution.
   - Verify: `cd pi/tests && pnpm run test -- task-registry.test.ts -t "loads legacy task records"`
   - Pass: v1 fixture records load with defaults and are not silently dropped.
   - Fail: legacy records return null or lose required fields without a warning/migration.

2. [ ] New lifecycle state `skipped` follows explicit transition rules.
   - Verify: `cd pi/tests && pnpm run test -- task-registry.test.ts -t "skipped transitions"`
   - Pass: valid transitions pass and invalid transitions throw/return typed validation errors.
   - Fail: skipped behaves like completed/cancelled by accident or cannot be retried to pending.

3. [ ] Dependency graph invariants are enforced.
   - Verify: `cd pi/tests && pnpm run test -- task-dependencies.test.ts`
   - Pass: self-edges, duplicate edges, cycles, dangling references, and partial-write rollback cases are covered.
   - Fail: dependency graph can become one-sided, cyclic, or silently corrupted.

4. [ ] `TaskCreateMany` creates batch tasks with dependencies.
   - Verify: `cd pi/tests && pnpm run test -- task-tools.test.ts -t "TaskCreateMany"`
   - Pass: empty arrays reject; single and multi-item batches work; intra-batch dependencies become bidirectional; invalid batch rolls back or records repair state.
   - Fail: follow-up `TaskUpdate` calls are required to wire dependencies or partial graphs remain.

5. [ ] Tool schemas and runtime registration are verifiable.
   - Verify: `cd pi/tests && pnpm run test -- task-tools.test.ts -t "registers task tools"`
   - Pass: mocked `ExtensionAPI` captures exact MVP tool names and input schema essentials for `TaskCreate`, `TaskCreateMany`, `TaskList`, `TaskGet`, and `TaskUpdate`.
   - Fail: typecheck passes but tools are missing, misnamed, or schema-incomplete.

6. [ ] `/tasks` terminal filtering bug is fixed.
   - Verify: `cd pi/tests && pnpm run test -- tasks.test.ts -t "hides terminal tasks by default"`
   - Pass: completed/cancelled/skipped tasks only appear with explicit all/show behavior, as defined by UX contract.
   - Fail: current `|| true` behavior remains.

7. [ ] Pure renderer supports display modes.
   - Verify: `cd pi/tests && pnpm run test -- task-renderer.test.ts`
   - Pass: `hidden`, `compact`, and `full` render expected strings for zero, one, many, blocked, running, failed, and terminal tasks.
   - Fail: rendering depends on persistent widget APIs or ignores settings.

8. [ ] Persistence failures are not silent.
   - Verify: `cd pi/tests && pnpm run test -- task-registry.test.ts -t "persistence failure"`
   - Pass: failed writes return `persist_failed`, do not report success, preserve/roll back in-memory state consistently, and expose warnings.
   - Fail: tests only check warning text while durable state is inconsistent.

9. [ ] Corrupt files and missing task directories have deterministic recovery.
   - Verify: `cd pi/tests && pnpm run test -- task-registry.test.ts -t "corrupt file recovery"`
   - Pass: corrupt files are warned/quarantined or preserved as specified; missing dirs are recreated before successful writes.
   - Fail: corrupt files are swallowed silently or writes fail with unhandled `ENOENT`.

10. [ ] Security redaction prevents persisted secrets.
    - Verify: `cd pi/tests && pnpm run test -- task-security.test.ts`
    - Pass: representative tokens/secrets in prompt, metadata, and output are redacted or rejected before persistence/rendering.
    - Fail: raw secrets appear in persisted JSON, tool results, or renderer output.

11. [ ] Completed tasks retain execution stats when stats are available.
    - Verify: `cd pi/tests && pnpm run test -- task-registry.test.ts -t "execution stats persist"`
    - Pass: start time, end time, duration, and token usage survive reload.
    - Fail: stats only appear while running or disappear after reload.

12. [ ] Final Pi validation passes.
    - Verify:
      ```bash
      cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck
      cd ../tests && pnpm install --frozen-lockfile && pnpm run test
      ```
    - Pass: typecheck and tests pass with zero unexpected warnings.
    - Fail: either command fails or uses npm/Bun.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Vendor `tintinweb/pi-tasks` directly | Fastest feature import | Duplicates registry, dependency risk, less native | Reject |
| Install upstream package as-is | Minimal work | Does not integrate with repo task registry/subagents | Reject |
| Native MVP first, phased parity later | Best integration, safer, testable | More upfront design | Choose |
| Implement full upstream parity at once | Complete feature set | Too risky and over-scoped | Reject |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Parallel task models | Confusing state and bugs | Use `pi/lib/task-registry.ts` as sole source of truth |
| Prompt/data leakage | Secrets or malicious output persisted/reused | Redaction, output retention limits, no MVP output injection |
| Schema migration breakage | Existing task records disappear | Fixture tests for legacy records and corrupt files |
| Dependency graph corruption | Incorrect blocked/runnable state | Atomic/rollback rules and graph invariant tests |
| UI overreach | Widget work stalls MVP | Pure renderer in MVP; widget adapter deferred |
| Execution orchestration risk | Stop/cascade semantics unsafe | Defer execution tools to Phase 2 |

## Open Questions

These questions are intentionally deferred out of the MVP and should not block `/plan-it` for MVP:

- Should Phase 2 support project/session/named task scopes beyond the existing operator-state directory?
- Should Phase 2 auto-cascade ever run without explicit operator approval?
- What exact subagent cancellation API should future `TaskStop` use?
- What persistent widget API is stable enough for Phase 3?

## Plan Handoff

- Recommended next command:
  ```bash
  /plan-it .specs/pi-tasks-control-plane/PRD.md
  ```
- Review artifact:
  ```bash
  .specs/pi-tasks-control-plane/review-1/synthesis.md
  ```
- Notes for planner:
  - Plan only the MVP unless the user explicitly asks for Phase 2/3 work.
  - Do not create a parallel task tracker.
  - Do not register deferred execution tools until their semantics are planned and tested.
  - Validate with pnpm-only Pi commands.
