---
created: 2026-08-15
status: complete
completed: 2026-08-15
---

# Plan: Lean Hierarchical Subagent Orchestration

## Context

The current uncommitted draft added a flat two-worker policy, blanket nested-delegation rejection, a low turn ceiling, and a delegation-wave watchdog. A temporary hotfix raised the shared turn ceiling to 64 and the wave threshold to 32 so active work could continue. The final design must replace, not preserve, the delegation-wave control.

The required topology is:

```text
root
  -> coordinator
       -> bounded leaf workers
       -> targeted retry and verification
       -> bounded reduction
  -> root validation and task closure
```

An adversarial reviewer and an architecture proponent agreed that the hierarchy, cross-process scheduling, typed workflow, capability preflight, mutation scopes, cancellation, and task boundary are necessary. They also agreed that the earlier 42-path plan overreached through eight runtime abstractions, role-specific low turn limits, task-registry involvement, broad fan-out and UI refactors, expanded statistics, and repeated validation.

## Objective

Pi supports root -> coordinator -> leaf execution and a bounded typed map/retry/verify/reduce workflow without premature delegation blocking, while preserving existing subagent APIs, root-owned durable tasks, process-tree cleanup, safe disjoint modification, bounded parent context, and process-local session recovery.

## Boundaries

- In scope: role and depth enforcement, one cross-process tree scheduler, shared-checkout scope leases, typed workflows, capability preflight, bounded file inputs, targeted retries, bounded reduction, recursive cancellation, minimal tree telemetry/UI, coordinator guidance, contracts, and focused regression coverage.
- Out of scope: arbitrary workflow code, cross-process workflow persistence, durable leaf tasks, task schema or registry changes, dashboard redesign, expanded orchestration statistics, persistent shard records, full fan-out refactoring, and unrelated skills or clients.
- Preserve: single, parallel, chain, continuation, background, read-only fan-out assignment semantics, project-agent trust, structured-output correction, dynamic model routing, task workspace validation, and Windows/POSIX process-tree termination.
- Safety: concurrent modifying leaves must use scope-aware file tools only. Strip shell and PowerShell tools from modifying leaves while their scope lease is active; run command-based validation after modifying leaves settle. Reject overlapping scopes before dispatch and block direct mutations outside the assigned scope.
- Working tree: retain the temporary 64-turn hotfix until the final runtime supersedes it. Replace superseded draft hunks in place without discarding unrelated changes.
- Execution tracking: root may create one durable task per top-level plan task when work must survive compaction. Never create a durable task per leaf or retry.

## Requirements Contract

- R1: Root may invoke a coordinator or leaf. A coordinator may invoke leaves only. A leaf and every depth-two child must be unable to invoke delegation or workflow tools.
- R2: One root-owned cross-process scheduler must queue descendants, enforce eight active descendants by default and a hard configurable ceiling no greater than 16, register descendant processes, and reject invalid role or depth before spawn.
- R3: All roles must initially share the existing 64-turn emergency ceiling, including structured-output correction. Read-only workflow leaves retain an eight-minute wall limit; modifying leaves have no wall-clock hard timeout.
- R4: The session watchdog must not count or block delegation waves or same-agent spawn repetition. Repeated command-error detection and the independent repeated identical tool-result guard remain active. Per-item failure recovery belongs to the unattended goal lifecycle; workflow attempts and concurrency belong to the workflow and tree runtimes.
- R5: A deferred `subagent_workflow` tool must accept a closed typed map/retry/verify/reduce specification, reject more than 256 unique items, use two attempts by default with a hard maximum of three, and reduce results in groups no larger than eight.
- R6: Every workflow item must declare the capabilities it requires. The runtime must compare those requirements with the selected agent's effective tools before dispatch; capability rejection must name missing tools and consume no attempt.
- R7: File-analysis items must use a bounded extract or path/range reference when deterministic partitioning is available. The runtime must not place raw large-file content into a leaf prompt or parent result.
- R8: Leaf results must use a bounded envelope with `found`, `not_found`, `inconclusive`, or `error` status, compact evidence, changed files, validation, and unresolved gaps. Retry only failed, inconclusive, schema-invalid, or verifier-contradicted items, and reject materially identical retries.
- R9: Root must create, start, validate, and close durable coordinator-unit tasks. Coordinator invocation may carry the existing `taskId`; leaves and retries remain transient. Subagent and workflow tools must never create or transition task records.
- R10: Concurrent modifying items must declare normalized disjoint repository-relative scopes. Scope admission and direct-mutation checks must use canonical filesystem containment, reject symlink or junction escapes, and settle each lease exactly once.
- R11: Cancelling a coordinator or workflow must cancel queued and active descendants. A child may cancel only itself and its descendants, and one blocked or failed child must not cancel unrelated siblings. Workflow state and completed results may survive `/reload`, `/new`, `/resume`, and `/fork` in the same process, and must be discarded when Pi exits.
- R12: Existing telemetry and `/subagents` must gain only the metadata needed to correlate and cancel a tree: tree ID, parent run ID, depth, role, workflow phase, task key, attempt, retry origin, and coordinator task ID. Existing telemetry remains readable and no prompt, output, raw scope path, or tool argument may be recorded.
- R13: General policy remains concise in `pi/AGENTS.md`; callable behavior belongs in the tools, coordinator behavior belongs in the orchestration agent and skill, and stable task/runtime semantics belong in the extension contract.

## Tasks

- [x] **T1: Replace flat limits with role-aware tree scheduling and scope safety**
  - Files: `pi/extensions/subagent/index.ts`, `pi/extensions/subagent/run-manager.ts`, `pi/extensions/subagent/tree-runtime.ts` (new), `pi/extensions/subagent/scope-policy.ts` (new), `pi/extensions/session-budget.ts`, `pi/lib/session-budget.ts`, `pi/settings.json`, `pi/tests/subagent.test.ts`, `pi/tests/subagent-run-manager.test.ts`, `pi/tests/subagent-tree-runtime.test.ts` (new), `pi/tests/session-budget.test.ts`, and `pi/tests/session-budget-extension.test.ts`.
  - Parallel execution:
    - Worker A (`typescript-pro`) owns only `tree-runtime.ts`, `run-manager.ts`, `subagent-tree-runtime.test.ts`, and `subagent-run-manager.test.ts`: implement authenticated root broker/client behavior, queued permits, tree metadata, descendant registration, process-local retention, and recursive cancellation.
    - Worker B (`typescript-pro`) owns only session-budget source, settings, and session-budget tests: remove delegation-wave and same-agent spawn sensors, settings, status, telemetry, and blocks while preserving command-error detection and the separate repeated identical tool-result guard.
    - Parent owns `index.ts`, `scope-policy.ts`, and `subagent.test.ts`: integrate role/depth propagation, tool visibility, shared 64-turn accounting, leaf model defaults, modifying-tool filtering, atomic scope admission, and direct mutation enforcement. Parent inspects both worker diffs before integration.
  - Change: replace blanket child rejection and process-local active-run rejection with role-aware queued tree admission; remove the wave watchdog rather than raising it again; keep the temporary 64-turn behavior as the initial common runtime ceiling; and restrict concurrent modifiers to scope-aware file tools.
  - Done when: root -> coordinator -> leaf and root -> leaf succeed; leaf delegation and nested coordinators fail before spawn; two coordinator processes share one active-descendant ceiling; excess descendants queue; three or more productive invocations are not blocked by epoch count; capability correction cannot reset turns; overlapping scopes fail atomically; out-of-scope direct mutations fail; and cancelling a coordinator settles every descendant.
  - Verify: `cd pi && pnpm test subagent-tree-runtime.test.ts subagent-run-manager.test.ts subagent.test.ts session-budget.test.ts session-budget-extension.test.ts`

- [x] **T2: Add the bounded workflow and minimal tree observability**
  - Depends on: T1
  - Files: `pi/extensions/subagent/workflow-runtime.ts` (new), `pi/extensions/subagent/index.ts`, `pi/extensions/subagent/ui.ts`, `pi/lib/orchestration-telemetry.ts`, `pi/tests/subagent-workflow.test.ts` (new), `pi/tests/subagent.test.ts`, and `pi/tests/orchestration-telemetry.test.ts`.
  - Parallel execution:
    - Worker A (`typescript-pro`) owns only `workflow-runtime.ts` and `subagent-workflow.test.ts`: implement the closed schema, in-process workflow state, capability preflight, bounded extract/range helper, map queue, targeted non-identical retries, optional verification, bounded result envelopes, and grouped reduction.
    - Worker B (`typescript-pro`) owns only telemetry, UI, and telemetry tests: add optional tree metadata, backward-compatible readers, indented hierarchy display, and tree cancellation without redesigning `/subagents` or expanding `/orchestration-stats`.
    - Parent owns `index.ts` and integration cases in `subagent.test.ts`: register the deferred tool, connect it to the tree runtime and existing artifact/correction paths, preserve existing fan-out assignment semantics, and keep coordinator `taskId` correlation lifecycle-neutral.
  - Change: introduce one reusable typed workflow module rather than a workflow framework. Represent bounded large-file work through ordinary workflow items and temporary private artifacts. Let existing fan-out use the same permit primitive only where necessary; do not change its schema, assignment, or experiment telemetry.
  - Done when: more items than active slots queue and complete; a selected agent missing required file or execution tools fails before dispatch without consuming an attempt; a corrected compatible item can run; a synthetic large-file case is deterministically partitioned using a small test threshold; only failed or inconclusive items retry; identical retries fail; verification can contradict and target one item; reduction keeps raw leaf output out of coordinator/root context; process-local resume reuses settled results; task records remain root-owned; and telemetry version 1 remains readable.
  - Verify: `cd pi && pnpm test subagent-workflow.test.ts subagent.test.ts orchestration-telemetry.test.ts`

- [x] **T3: Publish the minimal contract and validate the complete workflow**
  - Depends on: T2
  - Files: `pi/AGENTS.md`, `pi/README.md`, `pi/agents/orchestrator.md`, `pi/skills/orchestration/SKILL.md` (new), `pi/skills/pi-extension/references/contracts/subagents-and-tasks.md`, `pi/skills/pi-extension/references/contracts/tool-discovery.md`, `pi/docs/orchestration-telemetry.md`, and `pi/docs/session-budget.md`.
  - Delegated execution:
    - One `builder` owns only the listed prose and skill files: remove stale two-worker, low-turn, no-nesting, and wave-watchdog wording; document the role topology, bounded workflow, task ownership, scope restrictions, process-local retention, and deferred tool discovery. Do not change runtime files.
    - After integration, one `validator` performs read-only acceptance review against R1-R13 and runs the focused changed-contract tests. Parent independently runs the final repository gate and live smoke.
  - Change: create the missing orchestration skill, align the orchestrator, keep global instructions brief, and document only shipped behavior. Do not update `overengineering-churn-monitor`, `typed-agent-workflows`, task internals, or orchestration statistics.
  - Done when: the orchestrator resolves its skill; no tracked instruction contradicts runtime role, task, budget, retry, scope, or cancellation behavior; the callable workflow is discoverable; and the exact prior failure sequence is covered by tests without a real 59 MB fixture.
  - Verify: direct inspection of the revised Markdown files plus `cd pi && pnpm test subagent-tree-runtime.test.ts subagent-workflow.test.ts subagent.test.ts session-budget.test.ts session-budget-extension.test.ts orchestration-telemetry.test.ts`

## Validation

- [x] Focused implementation checks from T1 and T2 pass before dependent work proceeds.
  - T1 result: 5 files, 110 tests passed.
  - T2 result: 3 files, 85 tests passed.
  - Expected: failures identify one owning runtime boundary without requiring the complete suite.
- [x] Final deterministic gate: `cd pi && pnpm test && pnpm run typecheck && pnpm exec biome check extensions/subagent extensions/session-budget.ts lib/session-budget.ts lib/orchestration-telemetry.ts tests/subagent.test.ts tests/subagent-run-manager.test.ts tests/subagent-tree-runtime.test.ts tests/subagent-workflow.test.ts tests/session-budget.test.ts tests/session-budget-extension.test.ts tests/orchestration-telemetry.test.ts`
  - Result: focused goal, loop, safety, and orchestration checks passed (17 files, 296 tests); typecheck and focused Biome passed; and the final complete Pi suite passed with 117 files, 1497 tests passed, and 1 skipped.
  - Expected: complete Pi tests, TypeScript compilation, and formatting/lint pass once after integration.
- [x] Isolated startup smoke: `node pi/scripts/run-isolated-pi-smoke.mjs`
  - Result: passed.
  - Expected: the supported isolated Pi entrypoint starts without a provider call.
- [x] Live hierarchy smoke: `node pi/scripts/run-isolated-pi-smoke.mjs orchestration-telemetry --live`
  - Result: passed after isolating inherited subagent identity and replacing the retired leaf name. The smoke now requires correlated depth-one coordinator and depth-two leaf telemetry in the same tree; direct metric inspection confirmed both roles.
  - Expected: one root -> coordinator -> leaf workflow completes; the report resolves its tree and parent interaction; run once after deterministic gates unless changed evidence requires a retry.
- [x] Repository hygiene: `git diff --check`
  - Result: passed; changed tracked prose also passed the ASCII scan.
  - Expected: no whitespace errors or unintended files; direct content inspection confirms ASCII punctuation in changed tracked prose.

## Goal-driven execution reconciliation

The later goal-driven unattended execution contract owns cross-invocation outcome recovery, no-UI approval deferral, goal-to-loop correlation, resume reconciliation, and verified `goal_complete`. Those additions compose this plan's tree scheduler and typed workflow; they do not expand `subagent_workflow` beyond its bounded per-invocation retry contract or make child trees durable across Pi process exit.

## Retention

Archived at `.specs/archive/hierarchical-subagent-orchestration/plan.md` after completion.

## Execution Status

- State: complete
- Blocker: none
- Next: none
- Resume: none
