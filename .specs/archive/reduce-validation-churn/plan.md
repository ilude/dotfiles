---
created: 2026-09-04
completed: 2026-09-04
status: complete
---

# Reduce validation churn in Pi workflows

## Objective

Pi guidance names the observed repeated-call churn shapes and treats the task as the validation unit, and the quality gate reports findings at settlement without triggering a repair turn or delegated repair.

## Completion Evidence

- Evidence: `pi/AGENTS.md`, `pi/skills/workflow/do-it.md`, and `pi/skills/workflow/plan-it.md` each contain the assigned rule text; `pi/extensions/quality-gates.ts` has no code path that calls `sendMessage` with `triggerTurn: true` or spawns a delegated repair model, and the `quality-gates.test.ts` suite passes with repair-path tests replaced by a report-only assertion.
- Fails when: any grep for `triggerTurn: true`, `runDelegatedRepair`, `REPAIR_INSTRUCTION`, or `getPiInvocation` in `pi/extensions/quality-gates.ts` matches, `pi/quality-gates.json` still contains `repair`, `pnpm test quality-gates.test.ts` fails, or any of the three guidance files lacks its assigned rule or lost an existing stop condition.

## Boundaries

- In scope: `pi/AGENTS.md`, `pi/skills/workflow/do-it.md`, `pi/skills/workflow/plan-it.md`, `pi/extensions/quality-gates.ts`, `pi/lib/quality-gates/policy.ts`, `pi/quality-gates.json`, `pi/tests/quality-gates.test.ts`, `pi/skills/pi-extension/references/contracts/quality-gates.md`, `CHANGELOG.md`.
- Out of scope: root `AGENTS.md`, the `planning` skill, `pi/extensions/damage-control.ts` (the repeated-loop success limit is an open operator decision and is not changed here), `workflow-friction-review`, `tool-failure-triage`, and the uncommitted `/do-it` continuation changes and Herdr commit-progress changes already present in the primary working tree.
- Preserve: quality-gate collection at settlement, validator selection, deterministic autofix via configured `fix` commands, duplicate-evidence skipping, advisory vs blocking classification, the `quality-autofix=off` opt-out, and the damage-control repeated-loop guard.
- Assumptions: the primary working tree carries unrelated modifications to `pi/extensions/workflow-commands.ts` and `CHANGELOG.md`; `/do-it` must materialize this spec into its worktree and must not alter those primary changes.

## Tasks

- [x] **T1: Name churn shapes and the validation unit in Pi guidance**
  - Files: `pi/AGENTS.md`, `pi/skills/workflow/do-it.md`, `pi/skills/workflow/plan-it.md`
  - Change: One rule, expressed once per file. In `pi/AGENTS.md` Engineering, add one bullet: a passing check stays valid until an input it covers changes; do not rerun an unchanged passing check, poll status that completion delivers, or re-issue a call whose prior result already answered the question; classify warnings and advisory findings from passing runs before repairing and repair only what blocks the requested outcome or an applicable gate. In `do-it.md` Validation, amend the `On failure` paragraph by adding that the task, not the edit, is the validation unit, related edits are batched before checking, and a repair that leaves the failure signature unchanged ends with a report; keep every existing stop condition (unavailable access, destructive action, user judgment, scope expansion) verbatim. In `plan-it.md`, change the shared-TypeScript sentence to one early typecheck then defer until the slice settles, extend step 5 to flag validation steps without a stated trigger as churn risks, and update the Plan Contract template placeholders so `Verify:` reads `<deterministic check that falsifies Done when; run once when the task's edits are complete>` and the `Validation` checkbox reads `<Direct completion-evidence check, when it runs (after which task settles), and expected result. Each confirmatory check appears once.>`.
  - Done when: the diff for the three files consists only of the described hunks and no existing rule text is removed.
  - Verify: deterministic inspection of `git diff -- pi/AGENTS.md pi/skills/workflow/do-it.md pi/skills/workflow/plan-it.md` against the Change text hunk by hunk, confirming every removed line is reproduced in an added line. On mismatch, report the file and hunk and stop; do not retry.

- [x] **T2: Make the quality gate report-only at settlement**
  - Files: `pi/extensions/quality-gates.ts`, `pi/lib/quality-gates/policy.ts`, `pi/quality-gates.json`, `pi/tests/quality-gates.test.ts`, `pi/skills/pi-extension/references/contracts/quality-gates.md`, `CHANGELOG.md`
  - Change: Remove the model-repair path entirely: `REPAIR_INSTRUCTION`, `buildRepairPrompt`, `runDelegatedRepair`, `requeueForRevalidation`, `REPAIR_CHILD_TIMEOUT_MS`, `RepairChildRunner`, `runRepairChildProcess`, `getPiInvocation`, `failureSignature`, the `repairable` flag, `activeProvider`, the `spawn` import if unused afterward, `repairAttempts`, `lastFailureSignature`, the `repair` runtime option, the `quality_gate_repair` metric, and every repair test. Remove the `repair` field from `pi/quality-gates.json` and make `parseQualityGatesPolicy` reject a policy that still contains `repair`. After validators run, blocking failures go through `reportFailures` with `triggerTurn: false`; advisory findings and deterministic autofix notices are unchanged. Tests: one assertion that a blocking failure at settlement produces a report and no `triggerTurn: true` call; one parser test that a policy without `repair` parses and the same policy with `repair` throws. Update the contract `Model repair` bullet to report-only wording and add a `CHANGELOG.md` entry.
  - Done when: no reachable code in the quality-gate implementation sends a turn-triggering message or spawns a repair model, the policy rejects `repair`, and the focused suite passes.
  - Verify: deterministic `rg -n -i "repair|triggerTurn: true|getPiInvocation|quality_gate_repair" pi/extensions/quality-gates.ts pi/lib/quality-gates/policy.ts pi/quality-gates.json` returns only the parser rejection of `repair` and its error text, and `cd pi && pnpm test quality-gates.test.ts` passes. On failure, classify before editing; if a second repair leaves the failure unchanged, stop and report.

## Validation

- [x] `cd pi && pnpm test quality-gates.test.ts` passes after T2.
  - Expected: all tests pass; no test references a repair turn.
- [x] `cd pi && pnpm run typecheck` passes once after T2 settles.
  - Expected: no errors; this is the single confirmatory typecheck for the slice.

## Retention

Keep incomplete work at `.specs/reduce-validation-churn/plan.md`. After completion, `/do-it` archives this directory to `.specs/archive/reduce-validation-churn/`.

## Execution Status

- State: Complete; all tasks and validation passed.
- Blocker: None.
- Next: Archive and close out the completed plan.
- Current frontier: Complete; remaining live attempts: N/A.
- Resume: `/do-it .specs/reduce-validation-churn/plan.md`
