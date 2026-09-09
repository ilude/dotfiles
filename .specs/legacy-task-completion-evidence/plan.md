---
created: 2026-09-09
status: deferred
completed: null
---

# Preserve evidence in legacy task completion commands

## Workstream disposition

Deferred by the operator's default-profile scope correction. This is a legacy-only defect and is neither active default work nor a prerequisite for default refactoring. Retain the proposal and evidence without deleting, completing or archiving the plan. The tasks/checks below are inactive until legacy work is separately requested and the plan is revalidated. The current request authorizes only plan corrections.

## Goal and scope

User-authorized planning to fix `/tasks complete <id> <evidence>` losing the supplied evidence. Preserve the existing root-owned outcome requirements and task lifecycle/storage behavior.

Non-goals: task scheduling, new evidence formats, semantic verification of operator assertions, subagent lifecycle, task-domain refactoring, default-profile changes, or the separate legacy web-fetch repair. No rollback work.

Authorization: planning only. Separate execution authorization includes task commits and merge into dotfiles `main`; no push/deployment.

## Context for a fresh session

All paths are dotfiles-root-relative. Read current root/default planning instructions and `pi/profiles/legacy/AGENTS.md`, the legacy tooling-contract index and `skills/pi-extension/references/contracts/subagents-and-tasks.md`, plus the testing skill.

- Sources under `pi/profiles/legacy`: `extensions/tasks.ts`, `lib/{task-registry,task-security,task-store}.ts`; follow the existing `TaskLifecycleService` definition rather than introducing another service.
- Existing checks: `tests/tasks.test.ts`, `tests/task-registry.test.ts`, `tests/task-tools.test.ts`.
- Proposed worktree: `../.dotfiles-worktrees/legacy-task-completion-evidence`; branch `fix/legacy-task-completion-evidence`; merge target `main`.
- Verified 2026-09-09: `parseTasksArgs()` returns only the verb and ID for completion. The registered handler uses `parsed.text` to construct `outcome.evidence`. `task-registry.ts` rejects new completed transitions without bounded evidence. Existing task tests use a temporary SQLite store through `PI_OPERATOR_DIR`.
- This is source evidence, not an executed command reproduction. No operator task records or tests were touched during planning. Preserve the pre-existing untracked plans and all concurrent changes.

### Profiles

Planning profile verified default via `PI_CODING_AGENT_DIR`; execution/validation uses legacy source and dependency setup. Default behavior stays unchanged. No implementation validation has run.

## Decisions and contracts

- Parse the evidence after the ID as one text value, trimming only outer whitespace and preserving internal text/newlines. Do not invent quoting, JSON, or multiple-evidence syntax.
- Continue routing completion through the current `TaskLifecycleService` and registry validation. Reuse its bounded evidence validation and existing sanitization; do not duplicate validators or weaken missing-evidence rejection.
- Empty/whitespace-only evidence must not complete a task. Oversized evidence remains rejected, not silently truncated into a successful assertion.
- Preserve ID resolution, session/workspace ownership, allowed transitions, root authority, persisted outcome shape/timestamp, retry clearing, and historical terminal-record readability.
- Update command help/usage only where it inaccurately omits required evidence. No instruction or task-policy redesign.

## Execution guidance

Create the dedicated worktree/branch only after authorization. Carry this plan and preserve concurrent work. Keep the parser-to-persistence path in one correction; no new lifecycle framework. Read-only inspection precedes implementation. Follow legacy's one final development-validation phase after implementation and test authoring. One focused repair batch and affected rerun are allowed after a failure; report remaining blockers rather than continuing indefinitely. If scope drifts, remove only task-created detours and return to the stated evidence contract.

## Tasks

- [ ] **T1 - Carry completion evidence into the existing lifecycle**
  - Depends on: execution authorization/worktree setup.
  - Files: legacy `extensions/tasks.ts`; existing help text/owning contract only where inaccurate.
  - Do: preserve the evidence suffix in `parseTasksArgs()` and route it through the existing completion handler. Inspect actual sanitization ownership and reuse it if the slash path currently misses a required existing step; do not add a new policy.
  - Verify: author T2's parser and registered-command regressions before final validation.
  - Done when: a valid command supplies its evidence to the registry and invalid evidence cannot change the task's state.
  - Evidence: Not started.

- [ ] **T2 - Test completion at the storage boundary**
  - Depends on: T1.
  - Files: legacy `tests/tasks.test.ts`; other named task tests only if needed for the shared contract.
  - Do: in a temporary task store, create and assign a current-workspace task, call the registered `/tasks` handler, and read the persisted outcome. Cover normal evidence, internal whitespace/newlines, missing/blank evidence, existing length bound, and an invalid transition. Compare the resulting shape to the supported tool completion path without duplicating its implementation.
  - Verify: completion evidence is actually persisted and reloaded, rejected transitions leave state unchanged, and no process is launched. Keep UI mock boundaries but real parser/lifecycle/store behavior.
  - Done when: the original evidence loss is caught by an observable command-level regression, not only parser return assertions.
  - Scope checkpoint: no scheduling, tool schema expansion, or task-state migration.
  - Evidence: Not started.

- [ ] **T3 - Document, validate and integrate**
  - Depends on: T2.
  - Files: root `CHANGELOG.md`, affected owning help/contract and this plan.
  - Do: run final checks, record actual legacy results and limits, archive and integrate locally.
  - Done when: checks pass and target contains the fix/archive, or integration is explicitly blocked with the worktree retained.
  - Evidence: Not started.

## Agreed validation and finish

From task worktree `pi/profiles/legacy`:

```sh
pnpm test tasks.test.ts task-registry.test.ts task-tools.test.ts
pnpm run typecheck
```

Use existing linked dependencies and disposable task storage. Do not run a full suite or modify live task data. Classify failures before repair; preserve unrelated failures. Follow the final-phase/one-repair-batch cadence above, with passing checks retained unless their covered inputs change.

## Current handoff and dependencies

- Status: deferred and outside the default-profile workstream; no implementation authorized or started.
- Next: none in the default workstream. Resume only after a separate request for legacy work and current-source revalidation.
- No dependency on or from default DRY work. The earlier recommendation to merge this before cross-profile extraction is withdrawn with that extraction scope. No operator decision is needed for the default workstream.

## Completion and archive

Set actual completion date after agreed work/checks. Move this directory to `.specs/archive/legacy-task-completion-evidence/` in the task worktree without overwriting existing content; repair links. Commit implementation, changelog and archived plan together and merge into `main` without disturbing unrelated work. Reconcile only the task-owned active original. Verify target/archive and no active duplicate; rerun only checks affected by merge resolution. Retain blocked worktrees; remove only clean integrated ones. No push.
