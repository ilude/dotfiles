---
created: 2026-08-25
status: ready
---

# Make structured Pi tool results readable

## Objective

Replace compact one-line JSON in the six identified custom-tool result surfaces with the agreed presentation: dynamic human-readable closeout summaries for `plan_archive` and `workflow_complete`, and two-space pretty-printed JSON for `plan_progress`, `goal_progress`, `task`, and `subagent_control`, without changing result data or tool behavior.

## Completion Evidence

- Evidence: Focused tests show that successful `plan_archive` and `workflow_complete` calls render the exact dynamic templates with current source plan, archive plan, workflow branch, and primary branch values; the other four tools render parse-equivalent JSON with two-space indentation and line breaks; and every affected tool preserves its existing `details`, error behavior, lifecycle effects, bounds, and schemas.
- Fails when: A successful closeout still emits JSON, a literal placeholder appears, a template uses stale or hard-coded values, any identified non-closeout tool emits compact JSON, pretty-printing changes the parsed result or exceeds an existing output budget, or workflow, task, goal, subagent, error, activation, persistence, commit, merge, or cleanup behavior changes.

## Boundaries

- In scope: Successful model-visible closeout text from `plan_archive` and `workflow_complete`; every compact model-visible JSON result from `plan_progress`, `goal_progress`, `task`, and `subagent_control`, including structured rejection and bounded task-batch failure results; focused tests for those surfaces; and the workflow lifecycle contract for the two closeout summaries.
- Out of scope: Slash-command output, tool call rendering components, error meaning or wording beyond JSON whitespace, `details` payloads, JSON schemas, output truncation limits, storage formats, logs, metrics, provider output, unrelated custom tools, and the existing `.specs/pi-command-output-consistency/` plan.
- Preserve: `details` objects as the structured machine contract; all current side effects, validation, lifecycle transitions, activation/deactivation, byte limits, and failure handling; task result bounds; and unrelated primary-worktree changes.
- Assumptions: The agreed closeout templates apply only to successful results. Dynamic values come from each actual closeout result, and `primaryBranch` replaces the illustrative literal `main` when the primary branch has another name.

## Tasks

- [ ] **T1: Render friendly workflow closeout summaries**
  - Files: `pi/extensions/workflow-commands.ts`, `pi/tests/plan-archive.test.ts`, `pi/tests/workflow-dispatch.test.ts`, `pi/skills/pi-extension/references/contracts/workflow-lifecycle.md`
  - Change: Replace successful compact JSON content from `plan_archive` with `Plan archived:\nfrom: <sourcePlan> to: <archivedPlan>\n<branch> committed and merged into <primaryBranch> and cleaned up.` and from `workflow_complete` with `Workflow completed.\n<branch> committed and merged into <primaryBranch> and cleaned up.` Substitute current result values at execution time; never print placeholders. Preserve each existing `details` object and all closeout behavior. Update the owning lifecycle contract with only this accepted presentation rule.
  - Done when: Focused tool executions assert exact output using non-hard-coded fixture values, preserve structured details, and retain existing archive, commit, merge, cleanup, and tool-deactivation assertions.
  - Verify: `cd pi && pnpm test plan-archive.test.ts workflow-dispatch.test.ts`

- [ ] **T2: Pretty-print the remaining structured tool results**
  - Files: `pi/extensions/workflow-commands.ts`, `pi/extensions/goal.ts`, `pi/extensions/tasks.ts`, `pi/extensions/subagent/index.ts`, `pi/tests/workflow-dispatch.test.ts`, `pi/tests/goal.test.ts`, `pi/tests/task-tools.test.ts`, `pi/tests/subagent.test.ts`
  - Change: Use `JSON.stringify(value, null, 2)` for successful and rejected model-visible JSON content owned by `plan_progress`, `goal_progress`, `task`, and `subagent_control`, including task batch success and bounded batch failure results. Do not introduce a shared formatter or custom renderer. Keep parsed values, `details`, existing byte-budget enforcement, schemas, and error paths unchanged.
  - Done when: Each affected tool has a focused assertion for line breaks and two-space indentation plus parse-equivalence to its prior structured value; task rejection and batch-failure output sites are covered; and task batch budget tests still pass without increasing any configured limit.
  - Verify: `cd pi && pnpm test workflow-dispatch.test.ts goal.test.ts task-tools.test.ts subagent.test.ts`

## Validation

- [ ] Both focused test commands pass and directly exercise all six affected tool-result surfaces.
- [ ] `cd pi && pnpm run typecheck` passes, and scoped diff inspection confirms only presentation text, focused assertions, and the closeout contract changed.
- [ ] `git diff --check -- pi/extensions/workflow-commands.ts pi/extensions/goal.ts pi/extensions/tasks.ts pi/extensions/subagent/index.ts pi/tests/plan-archive.test.ts pi/tests/workflow-dispatch.test.ts pi/tests/goal.test.ts pi/tests/task-tools.test.ts pi/tests/subagent.test.ts pi/skills/pi-extension/references/contracts/workflow-lifecycle.md` reports no whitespace errors.

## Retention

Keep incomplete work at `.specs/structured-tool-output-formatting/plan.md`. After completion, `/do-it` archives this directory to `.specs/archive/structured-tool-output-formatting/`.

## Execution Status

- State: Ready; implementation has not started.
- Blocker: None.
- Next: T1.
- Resume: `/do-it .specs/structured-tool-output-formatting/plan.md`
