---
created: 2026-08-11
status: draft
completed:
---

# Plan: Preserve Durable Work Through Compaction and Delegation

## Context

Pi leaves durable task activation to model judgment, so long work can reach compaction without a usable task frontier. The smallest coherent change is to strengthen the existing compaction handoff and expose the task ID path already present inside subagent execution. A new workflow identity, registry schema, session custom record, telemetry lifecycle, or attempt store is not required to test whether those existing mechanisms solve the problem.

## Objective

Automatic active-turn compaction must preserve enough structured state to resume unfinished work and materialize missing durable tasks, while tracked subagent work may carry an existing running task ID without transferring task lifecycle authority to the subagent extension.

## Boundaries

- In scope: active-turn compaction instructions and continuation behavior; optional task linkage for direct single, background, and parallel subagent calls; focused tests and owning documentation.
- Out of scope: work IDs, current-work registry scoping, automatic root-task creation, task schema changes, session-budget changes, new telemetry events, attempt or artifact stores, automatic dispatch or completion, typed edges, staleness policy, and workflow scheduling.
- Preserve: unlinked subagents remain transient; the parent owns `ready -> running -> execute -> validate -> terminal`; compaction failure and cancellation behavior remains unchanged; existing task JSON is neither migrated nor rewritten by these changes.
- Assumption: the compaction summary is the durable handoff artifact, and post-compaction resumption quality is ultimately model compliance; tests verify the deterministic scaffolding, not model obedience. Evidence of continued missed activation comes from querying local session logs with the existing pi-log-analytics workflow before any workflow-instance layer is considered.
- Existing work: leave all unrelated working-tree changes untouched. In overlapping files, preserve the current uncommitted task-list cleanup and retention changes in `pi/README.md` and the task/subagent tooling contract; do not reset or overwrite that diff.

## Tasks

- [ ] **T1: Make automatic compaction preserve and reactivate unfinished work**
  - Files: `pi/extensions/active-turn-compaction.ts`, `pi/tests/active-turn-compaction.test.ts`
  - Change: pass bounded `customInstructions` to the existing `ctx.compact()` call requiring the summary to retain the active objective, constraints, decisions, changed files, validation results, blockers, existing task IDs and states, remaining task frontier, and exact next action. Update the hidden continuation so it first inspects current durable tasks and, when multi-step work remains but no usable task records exist, creates or batches the minimal remaining frontier before further edits or delegation. Do not add registry writes, session entries, identifiers, or another compaction lifecycle.
  - Done when: the automatic compaction call passes non-empty custom instructions naming the handoff fields; the continuation message instructs task inspection and frontier creation before resuming; successful, failed, cancelled, and generation-stale compaction paths retain their existing control flow and notifications. Whether the model obeys these instructions is a documented limitation, not an acceptance criterion.
  - Tests: assert structural presence only, for example that `ctx.compact` receives non-empty instructions and the continuation references task inspection; do not pin full instruction sentences, per the repository rule against storing prompt wording in assertions.
  - Verify: `cd pi && pnpm test active-turn-compaction.test.ts`

- [ ] **T2: Expose the existing subagent task linkage with narrow validation**
  - Files: `pi/extensions/subagent/index.ts`, `pi/tests/subagent.test.ts`, `pi/skills/pi-extension/references/contracts/subagents-and-tasks.md`, `pi/README.md`
  - Change: add optional `taskId` to a single subagent request and to each parallel item with a terse schema description, validate before spawning that the referenced record exists, is not deleted, is `running`, and belongs to the workspace resolved from the effective run directory (`resolveTaskWorkspace(params.cwd ?? ctx.cwd)`, per item for parallel runs), then pass it through the existing `existingTaskId`, run-manager, result, and telemetry fields. Keep the field absent for untracked work. Align tool guidance and documentation so multi-step background or parallel work is recorded with `task` before delegation, while disposable one-off delegation may remain transient. Do not add new UI, persistence, attempt, artifact, or lifecycle behavior.
  - Done when: linked foreground, background, and parallel runs retain their task IDs in existing result/run projections; invalid, deleted, foreign-workspace, and non-running IDs fail before worker launch; child success, failure, or cancellation does not change task state; calls without `taskId` behave exactly as before; the serialized subagent parameter schema grows only by the `taskId` fields.
  - Verify: `cd pi && pnpm test subagent.test.ts task-tools.test.ts`

## Validation

- [ ] Focused workflow check: `cd pi && pnpm test active-turn-compaction.test.ts subagent.test.ts task-tools.test.ts`
  - Expected: tests directly demonstrate that compaction receives handoff instructions, the continuation directs task inspection, valid task linkage flows through run projections, preflight rejection fires, task state is unchanged by child outcomes, and unlinked delegation is unchanged.
- [ ] Complete Pi gate: `cd pi && pnpm run typecheck && pnpm exec biome check extensions/active-turn-compaction.ts extensions/subagent/index.ts tests/active-turn-compaction.test.ts tests/subagent.test.ts && pnpm test`
  - Expected: TypeScript, focused Biome checks, and the complete Vitest suite pass without a task-registry schema change or new workflow lifecycle.
- [ ] Repository check: `git diff --check`
  - Expected: no whitespace errors; inspection confirms the implementation is limited to the two runtime extensions, focused tests, owning documentation, and the pre-existing task cleanup diff.

## Retention

Keep the plan at this path after completion. Archive or move it only when the user asks.

## Execution Status

- State: planned, not started
- Blocker: none
- Next: T1
- Resume: `/do-it .specs/pi-durable-work-activation/plan.md`
