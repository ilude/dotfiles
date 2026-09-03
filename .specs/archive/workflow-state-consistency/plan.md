---
created: 2026-09-03
status: complete
completed: 2026-09-03
---

# Make workflow completion states consistent and recoverable

## Objective

Repair the three admitted workflow-state defects so `/do-it` records one dispatch, required linked tasks have identical completion semantics in foreground and unattended goals, and an unattended goal can recover after verified Git merge and cleanup precede durable goal completion.

## Completion Evidence

- Evidence: Focused tests show that direct and resumed `/do-it` execution each emit exactly one privacy-bounded dispatch episode, both goal modes reject a required linked task unless it is `completed` with bounded outcome evidence, and interruption from the merge boundary through final goal persistence resumes from authoritative ownership or a goal-owned merge receipt without replaying the merge or falsely completing against unverified Git state.
- Fails when: A successfully dispatched `/do-it` execution emits zero or duplicate records, a rejected setup emits a workflow episode, foreground completion still accepts a required `skipped` task, or post-merge interruption can lose recovery routing, replay closeout, touch unowned resources, or mark an unmerged, wrong-branch, wrong-lineage, dirty, or incorrectly archived repository complete.

## Boundaries

- In scope: `/do-it` dispatch emission in `pi/extensions/workflow-commands.ts`; required-task completion checks in `pi/extensions/goal.ts`; a bounded unattended-goal merge receipt, intent-aware goal discovery and reconciliation, and directly affected tests and contracts under `pi/`.
- Out of scope: Validation-freshness receipts or gates, a general execution journal, historical changed-path telemetry, retry controllers, Herdr implementation work, foreground-goal closeout redesign beyond shared required-task semantics, and unrelated correlation fields.
- Preserve: Immediate slash-command acknowledgement, clear and `--no-clear` behavior, canonical and raw `/do-it` routing, existing worktree merge and cleanup safety checks, recovery worktrees on closeout failure, completed-goal immutability, task-registry authority, telemetry privacy, and all unrelated working-tree changes.
- Assumptions: The implementation runs in a `/do-it`-owned worktree; the goal job remains the durable authority for unattended completion; Git and workflow ownership remain authoritative for merge and cleanup state.

## Tasks

- [x] **T1: Restore one `/do-it` dispatch record**
  - Files: `pi/extensions/workflow-commands.ts`, `pi/tests/workflow-dispatch.test.ts`
  - Change: Emit `noteWorkflowSubmission()` and `startWorkflowEpisode()` exactly once immediately before the hidden workflow prompt, after successful preflight, ownership setup, and tool activation on the shared post-clear path. Reconstruct normalized parsed options for the content-bearing friction submission, but pass only non-sensitive flags and canonical artifact identity to metadata telemetry; omit raw-work request text. Do not emit before a clear transfers execution or on invalid-plan and setup-failure paths.
  - Done when: Direct `--no-clear` and resumed continuation tests each observe one `do-it` episode and one friction submission, canonical plans retain artifact correlation, raw request text does not enter metadata telemetry, and pre-clear, invalid-plan, and setup-failure paths emit neither record while routing remains unchanged.
  - Verify: `cd pi && pnpm test workflow-dispatch.test.ts`

- [x] **T2: Align required-task completion semantics**
  - Files: `pi/extensions/goal.ts`, `pi/tests/goal.test.ts`
  - Change: Make foreground plan-backed completion apply the existing unattended rule: every required linked durable root task must be `completed` and contain bounded outcome evidence. Do not add waiver state or change optional-task behavior.
  - Done when: A focused foreground plan-backed test rejects a required `skipped` task with a bounded blocker, accepts the same graph after completion evidence is recorded, an optional skipped task remains non-blocking, and an unattended required-skipped regression test proves parity.
  - Verify: `cd pi && pnpm test goal.test.ts`

- [x] **T3: Close the post-merge goal acknowledgement gap**
  - Files: `pi/lib/goal-state.ts`, `pi/lib/workflow-worktree.ts`, `pi/extensions/goal.ts`, `pi/tests/workflow-worktree.test.ts`, `pi/tests/goal.test.ts`, `pi/skills/pi-extension/references/contracts/goal-and-loop.md`
  - Change: Keep workflow ownership authoritative through merge and cleanup, and add one immutable goal-owned merge receipt created by a narrow `closeWorkflowWorktree()` callback after the merged stage is durably recorded but before cleanup begins. The receipt must bind the normalized primary Git directory, primary branch, initial baseline, verified merged commit, archived plan path and blob identity, and bounded completion-report inputs needed after process loss. Persist it through one `updateLoopJob()` transition; callback failure must stop before cleanup. Run `cd pi && pnpm run typecheck` after changing the shared TypeScript contract. Make goal discovery and resume consult the receipt before dereferencing the removed workflow path: when ownership remains, resume its existing merged-stage cleanup; when ownership is gone, verify the current repository descends from the baseline, the recorded merge is an ancestor of the current branch, that commit contains the recorded archive blob, the source plan is absent, and the primary worktree is clean, then atomically persist the completed goal and consume the receipt. A later clean primary commit is allowed when the recorded merge remains an ancestor. Do not add a per-Git-operation or generic workflow journal.
  - Done when: Failure-injection tests prove an already-performed merge at persisted `committed` state is detected rather than replayed, merge-receipt persistence occurs before cleanup, receipt-persistence failure preserves ownership and the worktree, branch-cleanup failure remains recoverable from merged ownership, and final goal-update failure after cleanup leaves a discoverable receipt that resumes exactly once. Reconciliation must reject a missing expected merge, changed repository lineage, wrong primary branch, dirty primary worktree, missing or changed archived-plan blob, or surviving source plan without touching unowned resources.
  - Verify: `cd pi && pnpm test workflow-worktree.test.ts goal.test.ts`

## Execution Strategy

- Parallel work: T1; leaf package: dispatch handler and focused test. It may run independently of the serialized T2/T3 goal-state package; T2 and T3 must not run in parallel because they share `pi/extensions/goal.ts` and `pi/tests/goal.test.ts`.
- Smaller-model work: T1; leaf package: dispatch handler and focused test; advisory dynamic sizing; excludes authority-sensitive, integration-owning, and acceptance-gating work.

## Validation

- [x] Focused workflow and goal checks: `cd pi && pnpm test workflow-dispatch.test.ts workflow-telemetry.test.ts goal.test.ts workflow-worktree.test.ts`
- [x] Shared TypeScript contract check: `cd pi && pnpm run typecheck`
- [x] Repository diff integrity: `git diff --check`
- [x] Final diff review confirms only the in-scope workflow, goal, worktree, tests, owning contract, required changelog, and completed spec changed.

## Retention

Keep incomplete work at `.specs/workflow-state-consistency/plan.md`. After completion, `/do-it` archives this directory to `.specs/archive/workflow-state-consistency/`.

## Execution Status

- State: Complete.
- Blocker: None.
- Next: Archive and close out the owned workflow.
