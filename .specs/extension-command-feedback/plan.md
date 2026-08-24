---
created: 2026-08-24
status: ready
completed:
---

# Plan: Immediate Extension Command Feedback

## Objective

Ensure Pi extension commands provide immediate visible acknowledgement before potentially noticeable work, using command-appropriate feedback rather than adding indiscriminate chat noise, and make `/plan-it` treat Git state only as execution context rather than a planning blocker.

## Completion Evidence

- Evidence: Every `registerCommand()` under `pi/extensions/` is classified, every command that can perform noticeable repository, Git, filesystem, subprocess, network, model, session-settling, or report work shows visible feedback before that work begins, focused tests prove the ordering for changed command families, and `/plan-it` reaches readiness without treating current or anticipated Git state as a blocker.
- Fails when: An audited command can still appear inert before noticeable work, an immediate dashboard/dialog/loader command receives redundant feedback, transient status survives completion or failure, command output and lifecycle behavior changes beyond the intended acknowledgement, or `/plan-it` blocks on dirty, staged, untracked, branch, worktree, transfer, commit, or future merge concerns.

## Boundaries

- In scope: Pi extension command handlers under `pi/extensions/`, focused command tests under `pi/tests/`, the existing rule in `pi/skills/pi-extension/SKILL.md`, and the `/plan-it` workflow instructions and owning lifecycle contract needed to make Git concerns non-blocking during planning.
- Out of scope: Built-in Pi commands, custom tools, shortcuts, command performance optimization, unrelated UI redesign, and changing command results or side effects.
- Preserve: Existing arguments, command output beyond the intended acknowledgement, dialogs, dashboards, lifecycle transitions, errors, cancellation, non-TUI behavior, and unrelated primary-worktree changes.
- Assumptions: Immediate visible acknowledgement may be a slash echo, status, loader, notification, or dialog. A command is already compliant when it synchronously opens meaningful UI before its first potentially slow operation. Current Git state, including the accepted unstaged `pi/skills/pi-extension/SKILL.md` rule, is execution context for `/do-it`; `/plan-it` records preservation and reconciliation requirements without resolving or escalating them.

## Tasks

- [ ] **T1: Audit and classify extension command feedback**
  - Files: `pi/extensions/**/*.ts`; existing focused tests in `pi/tests/`; `.specs/extension-command-feedback/command-audit.md`
  - Change: Enumerate every `registerCommand()` handler and record its command name, source location, first potentially slow operation, first visible feedback, and classification as already compliant, needs immediate feedback, or not applicable in `command-audit.md`. For each command needing change, identify the least noisy existing feedback pattern. Treat invoked helpers as part of the handler path so synchronous dashboard, dialog, or loader setup counts when it occurs before their first await.
  - Done when: Every registered extension command has one evidence-backed durable classification, and the mutation list contains only commands that can otherwise appear inert.
  - Verify: `rg -n "registerCommand\(" pi/extensions --glob "*.ts"` matches the audited command inventory, with no unclassified occurrence.

- [ ] **T2: Implement and verify immediate feedback**
  - Depends on: T1
  - Files: Only the `pi/extensions/**/*.ts` handlers classified as needing change; their focused `pi/tests/**/*.test.ts` files; `pi/skills/pi-extension/SKILL.md`; `pi/skills/workflow/plan-it.md`; `pi/skills/pi-extension/references/contracts/workflow-lifecycle.md`
  - Change: Show command-appropriate acknowledgement before the first potentially slow operation. Reuse an existing slash-echo helper for chat-dispatch workflows where practical; otherwise use status, loader, notification, or dialog and clear transient status in `finally`. Preserve and incorporate the accepted current `pi-extension` skill-rule change during `/do-it` execution without making its present Git state a planning prerequisite. Update `/plan-it` instructions and the lifecycle contract so Git state and anticipated transfer, commit, or merge concerns are recorded as `/do-it` execution context and never trigger `plan_progress blocked`. Add ordering tests that hold the slow dependency unresolved and assert feedback is already visible, plus non-TUI or unavailable-UI coverage where a new feedback mechanism depends on UI; avoid prose-presence tests.
  - Done when: Every T1 command marked for change acknowledges immediately without duplicate output, feedback cleanup works on success and error where applicable, non-TUI behavior remains valid, the skill rule is preserved in the resulting implementation, commands already compliant remain unchanged, and `/plan-it` readiness is independent of Git state.
  - Verify: Run each changed command family's focused Vitest file, then `cd pi && pnpm run typecheck`, and `git diff --check` for all changed files.

## Validation

- [ ] Inventory check: compare all `registerCommand()` occurrences under `pi/extensions/` with T1 classifications.
  - Expected: No command is omitted or classified solely from the outer handler when an invoked helper controls first feedback.
- [ ] `/plan-it` Git-independence check: exercise planning with dirty tracked, staged, and untracked primary state and with anticipated `/do-it` transfer or merge concerns.
  - Expected: Planning records relevant execution constraints and reaches `ready`; no Git concern produces `plan_progress blocked`.
- [ ] Ordering regression tests for each changed feedback mechanism.
  - Expected: Feedback is observable while the mocked slow operation remains pending, normal completion/error behavior is preserved, and UI-dependent acknowledgement does not break applicable non-TUI or unavailable-UI execution.
- [ ] Focused Pi tests and typecheck.
  - Expected: Changed command tests pass and `pnpm run typecheck` exits successfully.
- [ ] Diff hygiene: `git diff --check`.
  - Expected: No whitespace errors; unrelated primary changes remain intact.

## Retention

Keep incomplete work at `.specs/extension-command-feedback/plan.md`. `/do-it` must materialize this spec in its owned implementation worktree, archive the completed directory to `.specs/archive/extension-command-feedback/`, commit the workflow branch, merge it with `--no-ff` into the primary branch, verify merged HEAD, then remove only the owned worktree and branch. If this spec is ignored, keep it untracked and return the completed archive to the primary local ignored archive after a successful merge; never force-add it. Preserve the implementation worktree and recoverable plan on any dirty, unmerged, conflict, failed-merge, or cleanup failure.

## Execution Status

- State: planned, not started
- Blocker: none
- Next: T1
- Resume: `/do-it .specs/extension-command-feedback/plan.md`
