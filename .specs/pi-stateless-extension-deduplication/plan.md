---
created: 2026-09-09
status: draft
completed: null
---

# Reassess DRY opportunities within the default profile

## Goal and scope

Correct the existing DRY draft to the operator's default-profile workstream. Select refactoring only where inspection establishes a concrete benefit to `pi/profiles/default/` without changing its behavior. This is the same plan at the same path, not a new plan set.

The previous proposal treated matching legacy files as justification for cross-profile extraction. That was an unconfirmed scope expansion. Its implementation tasks are withdrawn; no substitute refactors are required simply to retain a backlog.

Non-goals: legacy changes or tests, legacy-only UTF-8 cleanup, mandatory cross-profile sharing, `pi/shared` infrastructure, profile merger, generated Herdr changes, dependency relocation, new runtime singletons or a general extension framework. Do not absorb correctness fixes or add rollback work.

Authorization: the current request authorizes these plan corrections, not implementation. This remains a draft until the bounded default-scope reassessment yields a justified concrete scope and finite checks. Any later execution requires separate authorization and dedicated worktree setup; push/deployment remain separate.

## Context for a fresh session

All paths are dotfiles-root-relative. Read current root/default `AGENTS.md`, `pi/README.md` and the default planning/testing skills. Read the owning default source/docs for any candidate actually considered; use installed Pi documentation only for relevant API/loader questions. Supply excerpts to workspace-restricted children rather than asking them to read inaccessible installed paths.

Planning profile verified through `PI_CODING_AGENT_DIR`: `pi/profiles/default`. Intended implementation/validation profile, if a scope is selected: default only. No refactor implementation, test or loader acceptance has run.

### Disposition of the former scope

| Former proposed extraction | Corrected disposition |
| --- | --- |
| `extensions/image-tools.ts` shared with legacy | Matching legacy code alone does not establish a default-local refactor benefit. No shared extraction required. |
| `lib/slash-command-echo.ts` shared with legacy | Default already has a helper. Do not create a cross-profile dependency just to remove the second profile's copy. |
| `lib/bedrock/model-policy.ts` shared with legacy | Keep default ownership unless separate default-local evidence justifies a change. No model-policy redesign. |
| Legacy background-terminal/summary UTF-8 primitives | Outside this workstream; removed from tasks and validation. |
| New `pi/shared` layout, injected image dependencies and shared reload root | Supporting machinery for the withdrawn cross-profile proposal; no longer required. |

The earlier default review contains possible local simplifications, but none is selected as an implementation requirement by this correction. Reassessment is limited to those already identified default areas, not a new all-extension audit. Preserve current implementations and other open plans while deciding whether any extraction is worthwhile.

## Decisions and preservation contracts

- Default source ownership, profile paths, tool schemas, safety decisions and runtime lifetimes remain unchanged unless an explicitly accepted refactor requires a documented internal move.
- Prefer default-local pure functions or existing helpers over new infrastructure. Share mechanics only when they have the same contract and change together.
- Shared imported mutable state is not a substitute for Pi's explicit cross-extension communication. Preserve native SDK resource and file-mutation ownership.
- Size, matching legacy text or a named design pattern alone do not justify a change. It is valid to conclude that no implementation is warranted.
- Do not add speculative improvements to compensate for removing the original cross-profile scope. Correctness and subagent UX plans retain their own work.

## Remaining planning task

- [ ] **R1 - Establish justified default-local scope and its actual dependencies**
  - Depends on: none for read-only reassessment; use current source and account for in-flight changes in the owning correctness plans.
  - Inputs: earlier default review findings, corresponding default source/callers and focused existing tests, plus `.specs/extension-review-implementation-order.md` and the owning overlapping plans.
  - Do: record each considered extraction's concrete duplication/responsibility problem, benefit to default, smallest useful change and preservation contract. Reject candidates supported only by legacy duplication. For any recommended implementation, identify exact source/test files and required predecessor code; prepare finite tasks/checks for the accepted scope in this same plan.
  - Verify: each recommendation is supported by current callers and behavior, not assumed savings. Check file/contract overlap rather than imposing whole-subsystem prerequisites.
  - Done when: there is a bounded, reviewable default-only recommendation, or an explicit no-change conclusion. Keep the plan draft if consequential scope remains unresolved; do not proceed automatically into implementation.
  - Evidence: Not started. This revision corrects scope only; it does not claim to have completed the reassessment.

## Execution guidance and dependencies

There is no executable refactor task list yet. Do not create implementation worktrees, move modules, change dependencies or run development checks merely because this draft exists.

No blanket prerequisite remains on command invocation ownership, Bedrock baseline, legacy web-fetch or legacy task evidence. Determine dependencies from the eventual selected source and contracts. If a recommendation touches subagent runtime/error behavior, its implementation worktree must contain the completed owning cleanup/UX changes before work starts. Read-only reassessment itself may occur in parallel with correctness work.

If implementation is later selected, retain the proposed worktree `../.dotfiles-worktrees/pi-stateless-extension-deduplication`, branch `refactor/pi-stateless-extension-deduplication`, merge target dotfiles `main`, unless existing occupancy requires a documented change. Create/resume it only after execution authorization and required predecessor integration. Preserve unrelated work and the task-owned original plan. Remove only unnecessary task-created detours if scope drifts.

## Validation and finish

No legacy test suite, cross-profile loader fixture or shared-source watcher check is required by this revised scope. R1 must name the finite default checks appropriate to the actual accepted changes before implementation is considered ready. Do not retain nonexistent test filters from the withdrawn proposal or run broad checks to discover a new scope.

For the current planning correction, inspect document status, scope and dependency consistency only. No implementation validation is claimed.

## Current handoff

- Status: draft, awaiting bounded default-local reassessment. Implementation not authorized or started.
- Completed: removed legacy/cross-profile requirements, shared-infrastructure assumptions and blanket predecessor rules from the existing draft.
- Next: R1 as a separate planning step; no concrete replacement refactor is approved yet.
- Blockers: a justified implementation scope and corresponding finite checks have not been established. Herdr ownership is not a blocker or dependency.

## Completion and archive

Do not mark this draft completed or archive it merely because its scope was corrected. If implementation is subsequently accepted, record its tasks/checks and worktree prerequisites here first. After authorized work and agreed checks finish, set the actual completion date and move the directory to `.specs/archive/pi-stateless-extension-deduplication/` in the task branch without overwriting an archive; repair links. Commit implementation and archive together, merge into `main` preserving unrelated work, and verify target/archive and absence of an active duplicate. Retain blocked worktrees; remove only clean integrated ones. Push/deployment require separate authorization. If R1 recommends no change, report that disposition for plan closure rather than claiming an implementation was delivered.
