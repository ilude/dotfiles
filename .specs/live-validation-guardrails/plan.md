---
created: 2026-09-04
status: ready
---

# Live-validation guardrails for Pi workflows

## Objective

Plans whose tasks require live external systems (Herdr, background processes, model-driven children) cannot reach `ready` with model-dependent fixtures, multi-claim live pilots, unread external contracts, or missing attempt caps, and cannot be executed with unbounded retries or lost stop conditions across compaction, because the plan validator, the reviewer rubric, the compaction handoff, the Herdr skill, and the test helpers enforce or record the limits that were repeatedly violated during `.specs/herdr-visible-subagents`.

## Completion Evidence

- Evidence: A canonical plan containing a `Verify: live ...` task without `Max attempts`, `Session`, and `Terminal outcomes` fails `plan_progress ready`; a plan whose ledger shows attempts at or above the cap causes `/do-it` to refuse that task and ask the operator; a plan spanning multiple repositories without per-repository ownership and closeout fails `ready`; the `/plan-it` reviewer roles carry a verification-design rubric and the adversary or specialist review of a scratch plan containing a two-claim model-dependent live task returns a supported finding naming the task; the compaction handoff lists attempt counts, hard stop conditions, and pending operator decisions; `pi/skills/herdr/references/automation.md` documents the five learned Herdr contract facts; `pi/tests/helpers/live-herdr.ts` exists and both Herdr live tests use it under one `PI_LIVE` gate.
- Fails when: Any of those checks is absent, a deterministic-only plan is rejected by the new validation, review modes or their default change, or an existing archived or in-progress plan without live tagging stops parsing.

## Boundaries

- In scope: `pi/lib/plan-state.ts`, `pi/lib/workflow-commands/plan-lifecycle.ts`, `pi/skills/workflow/plan-it.md`, `pi/skills/workflow/do-it.md`, `pi/extensions/workflow-commands.ts` (live-task gate and reviewer prompt text only), `pi/extensions/active-turn-compaction.ts`, `pi/skills/herdr/SKILL.md` and a new `pi/skills/herdr/references/automation.md`, `pi/tests/helpers/live-herdr.ts`, the two existing Herdr live tests, focused Vitest files for the parser, validator, and compaction template, and the owning contracts `workflow-lifecycle.md`, `session-lifecycle.md`, and `subagents-and-tasks.md` where behavior changes.
- Out of scope: Changing `/plan-it` modes, review counts, or the standard default; Herdr product code under `pi/extensions/subagent/`; damage-control rules; `pi/AGENTS.md` (failure classification already exists at lines 26-28); closeout-tool error semantics and state gating (`plan_archive` and `workflow_complete` already return `isError` on failed preconditions and are already activated per `/do-it` mode); a `subagent_read` external-evidence option (convention only: copy evidence into `.tmp/evidence/` before delegating); automatic cancellation of children on user correction (prose in `do-it.md` only); goal or `/goal --unattended` semantics; friction telemetry gaps; editing any archived plan.
- Preserve: Existing plans without live tagging parse and execute unchanged; `Verify:` presence checks, the 1-16 task bound, the review-role lifecycle and its four-record limit, `/do-it` continuation and closeout, the compaction token budget and existing bullets, `HERDR_ENV=1` gate, the existing three `pi/tests/helpers/` files, and every currently passing test.
- Assumptions: The `validator` agent profile declares `bash`; if a read leaf still cannot execute commands, record it as a follow-up rather than widening read authority here.

## Tasks

- [ ] **T1: Record the learned limits where models read them**
  - Files: `pi/extensions/active-turn-compaction.ts`, its focused test, `pi/skills/herdr/SKILL.md`, `pi/skills/herdr/references/automation.md` (new), `pi/tests/helpers/live-herdr.ts` (new), `pi/tests/herdr-surface.live.test.ts`, `pi/tests/herdr-write.live.test.ts`, `pi/skills/pi-extension/references/contracts/session-lifecycle.md`
  - Change: Add three bullets to the compaction handoff template: per-task live attempt counts and caps, hard stop conditions, and pending operator decisions distinct from pending questions. Add `references/automation.md` to the Herdr skill recording: `pane move` returns `result.move_result` with `changed` and `reason` (`same_tab`, `zoomed_tab`) and existing-tab moves require `--split`; `agent wait` and `agent prompt --wait` are cancelled by any pane move in that workspace; a Pi launched by `pane run` inherits the caller's environment, so the created pane's `HERDR_PANE_ID` and `HERDR_TAB_ID` must be set explicitly; automation must use `herdr --session <name>` with a pinned `HERDR_SOCKET_PATH`, and `--no-focus` alone does not protect the interactive session; how to dump the installed API schema. Add one gate line to `SKILL.md`: stop when validation work targets the default interactive socket. Create `live-herdr.ts` exporting `createLiveAgentDirectory`, `withIsolatedWorkspace` (create `--no-focus`, close in `finally`), env pinning, and cleanup that calls `closeTaskDatabase(directory)` before `fs.rm`; gate live tests with `PI_LIVE=<task>` and migrate the two existing live tests to it, removing `PI_HERDR_T3_LIVE`, `_T5_`, `_T6_`, `_T8_`.
  - Done when: The compaction template test asserts the three new bullets; both live test files import the helper, declare no per-file env gate, and still report skipped when `PI_LIVE` is unset; `automation.md` contains the five facts and the gate line is in `SKILL.md`; `session-lifecycle.md` names the new handoff fields.
  - Verify: `cd pi && pnpm test active-turn-compaction.test.ts herdr-surface.live.test.ts herdr-write.live.test.ts && pnpm run typecheck`

- [ ] **T2: Enforce live verification metadata, attempt caps, and repository ownership in the plan lifecycle**
  - Files: `pi/lib/plan-state.ts`, `pi/lib/workflow-commands/plan-lifecycle.ts`, `pi/extensions/workflow-commands.ts`, `pi/tests/plan-state.test.ts` (or the existing parser test file), the existing plan-lifecycle test file, `pi/skills/pi-extension/references/contracts/workflow-lifecycle.md`
  - Depends on: T1
  - Change: Parse an optional leading tag on `Verify:` of `deterministic` or `live`; untagged remains valid and means deterministic. A `live` task must also carry `Max attempts: <n>`, `Session: <isolated target>`, and `Terminal outcomes: supported | rejected | blocked`, and its `Verify` must name exactly one observable behavior plus cleanup (validator rejects `Verify` text containing more than one `then`/`and then` clause or the words `voluntarily`/`chooses`). Require a `## Live attempt ledger` table when any task is `live`, with columns `Task | Attempt | Preconditions | Result | Cleanup | Disposition`. At `/do-it` task selection, count ledger rows for the task; if rows are at or above `Max attempts`, refuse to start it and surface an operator decision naming the task, count, and cap; a ledger row whose Disposition begins `Operator authorized` raises the effective cap by one; treat `rejected` as a completing outcome for a `live` task. Reject at `ready` any plan whose `Files:` entries resolve into more than one repository (a `modules/<name>/` submodule or a path outside the workspace root) unless `## Boundaries` carries a `Repositories:` bullet naming each repository with its owner branch and closeout.
  - Done when: Validator tests cover accept untagged, accept complete `live`, reject `live` missing each field, reject multi-behavior `Verify`, require ledger when live, reject undeclared multi-repository files, accept declared ones; do-it gate tests cover under-cap start, at-cap refusal, and operator-authorized row; all archived plans under `.specs/archive/` still parse; `workflow-lifecycle.md` records the tag, fields, ledger, cap rule, `rejected` semantics, and the repository declaration.
  - Verify: `cd pi && pnpm test plan-state.test.ts plan-lifecycle.test.ts workflow-commands.test.ts && pnpm run typecheck`

- [ ] **T3: Give reviewers a verification-design rubric and teach /do-it the stop rules**
  - Files: `pi/skills/workflow/plan-it.md`, `pi/skills/workflow/do-it.md`, `pi/extensions/workflow-commands.ts` (reviewer prompt strings only), the existing plan-lifecycle or workflow-commands prompt test if one asserts reviewer prompt content
  - Depends on: T2
  - Change: In `plan-it.md` and the reviewer prompt strings, add a verification-design rubric that every subject-matter reviewer (adversary, specialist, proponent) must apply per task and report as a supported finding with the task key and a proposed rewrite when any item fails: (1) `Verify` directly falsifies `Done when`, not "tests pass"; (2) the check is tagged deterministic or live, and a live check names one behavior, cleanup, `Max attempts`, `Session`, and `Terminal outcomes`; (3) success does not depend on a child model choosing an action; (4) the task does not bundle more than one independently verifiable claim; (5) every external-system contract the task relies on (API response shape, CLI flag, wait or cancellation semantics) is cited from maintained documentation or an installed schema, or is moved to a research question that blocks the task; (6) each named test or check moves toward Completion Evidence rather than restating implementation; (7) the task states what ends it on failure without a retry. Keep the subtractive role's existing checks and add: flag multi-claim tasks and live checks lacking caps as churn risk. Extend the Plan Contract example with an optional `live` task showing the three fields and the ledger table, add a `Current frontier` guidance line under Execution Status (next task, its verify command, remaining attempts), and a rule to move research questions to `.specs/<slug>/research.md` when they exceed ten. In `do-it.md`, state: the root executes normal tasks directly and delegates only independently parallel work or work needing context isolation; a `rejected` terminal outcome completes a live evaluation task; after any live attempt record the ledger row and stop; a material fixture change does not reset the count; a user correction requires updating the active task bound first and disregarding children working from the superseded bound; copy external evidence into `.tmp/evidence/<task>/` before delegating analysis; the root runs live commands itself and leaves never do.
  - Done when: Both prompt files and the reviewer prompt strings contain the rubric with ASCII punctuation; a scratch plan containing one task that bundles an allowed edit and a forbidden-action escape as a single live pilot, reviewed with the adversary prompt, yields a supported finding citing rubric items 3 and 4 (record the transcript excerpt in Execution Status); the plan-it example validates as `ready` when pasted into a scratch plan; no prompt text duplicates rules enforced by T2 code beyond a one-line pointer; review modes and defaults are unchanged.
  - Verify: `cd pi && pnpm test plan-lifecycle.test.ts workflow-commands.test.ts && git diff --check`

## Execution Strategy

- Parallel work: None; T1 -> T2 -> T3 is sequential because T2 validates what T3 documents and T1 owns the shared helper the tests use.
- Smaller-model work: T1 helper extraction and live-test migration, T1 `automation.md` authoring from the facts listed in the task, and the `do-it.md` edits in T3 are bounded leaf packages; T2 parser and validator changes and the T3 reviewer rubric wording remain root-owned because they gate acceptance for every future plan.

## Validation

- [ ] `cd pi && pnpm test plan-state.test.ts plan-lifecycle.test.ts workflow-commands.test.ts active-turn-compaction.test.ts herdr-surface.live.test.ts herdr-write.live.test.ts` passes with live tests skipped.
- [ ] `cd pi && pnpm run typecheck` passes.
- [ ] A scratch plan with `Verify: live` and no `Max attempts` is rejected by readiness validation; the same plan with all three fields and a ledger is accepted; an untagged existing plan is accepted; a scratch plan touching `modules/onclave/` without a `Repositories:` bullet is rejected.
- [ ] The adversary review of the two-claim model-dependent scratch task returns a supported finding naming the task and rubric items 3 and 4.
- [ ] `git diff --check` passes and no file contains non-ASCII punctuation.

## Retention

Keep incomplete work at `.specs/live-validation-guardrails/plan.md`. After completion, `/do-it` archives this directory to `.specs/archive/live-validation-guardrails/`.

## Execution Status

- State: Ready; implementation has not started.
- Blocker: None.
- Next: T1.
- Resume: `/do-it .specs/live-validation-guardrails/plan.md`
