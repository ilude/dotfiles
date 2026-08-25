---
created: 2026-08-25
status: ready
---

# Reduce workflow ceremony while preserving real controls

## Objective

Integrate the audited task-boundary change and simplify plan and subagent workflow restrictions so valid low-risk work avoids unsupported ceremony while lifecycle persistence, deterministic plan validation, coordinator no-mutation authority, workspace containment, and unambiguous task correlation remain enforced.

## Completion Evidence

- Evidence: Focused task, plan-lifecycle, workflow-dispatch, subagent contract, adapter, and tree-runtime tests prove the removed restrictions no longer reject representative valid calls and the named preserved controls still reject representative invalid calls.
- Fails when: A representative removed restriction still rejects valid input, or a named preserved lifecycle, authority, containment, ownership, or correlation invariant becomes bypassable.

## Boundaries

- In scope: Integrating commit `69712f294e35b94705200aa0cf46a29180c2715b`; task boundary normalization; plan review metadata and readiness gates; subagent task-link validation, coordinator marker semantics, dead overlap policy, and legacy `taskId` normalization; owning tests and contracts.
- Out of scope: Replacing the active `/plan-it` lifecycle; weakening canonical plan-file validation; granting Team Leads direct mutation tools; weakening governed workspace/tool-target containment; changing task lifecycle ownership; provider routing; unrelated subagent continuation failures.
- Preserve: Persisted `started`, `draft`, `blocked`, and `ready` lifecycle states; unresolved supported-finding blocks; final necessity review ordering for standard mode; quick-mode semantics; task count/type/length/empty/duplicate checks; correlation-only task links; per-item modern `taskId`; single-item read/write affinity constraints; existing safety and trust controls.
- Assumptions: The isolated task-boundary commit remains available at `.tmp/task-77afdbc4`; `/do-it` may cherry-pick or reproduce it in its owned implementation worktree after checking current `main`.

## Tasks

- [ ] **T1: Integrate task boundary metadata simplification**
  - Files: `pi/extensions/tasks.ts`, `pi/lib/task-registry.ts`, `pi/tests/task-registry.test.ts`, `pi/skills/pi-extension/references/contracts/subagents-and-tasks.md`
  - Change: Integrate the audited worktree change so bounded absolute and parent-relative task boundary strings survive slash normalization while type, count, length, empty-entry, and duplicate validation remain unchanged; reconcile it with current `main` rather than merging the existing worktree directly.
  - Done when: Representative absolute, parent-relative, relative, and symbolic boundary entries persist deterministically, while malformed, empty, oversized, excessive, and duplicate entries remain rejected.
  - Verify: `cd pi && pnpm test task-registry.test.ts task-tools.test.ts tasks.test.ts && pnpm run typecheck`

- [ ] **T2: Make plan review ceremony proportional**
  - Files: `pi/lib/workflow-commands/plan-lifecycle.ts`, `pi/extensions/workflow-commands.ts`, `pi/tests/plan-lifecycle.test.ts`, `pi/tests/workflow-dispatch.test.ts`, `pi/skills/workflow/plan-it.md`, `pi/skills/pi-extension/references/contracts/workflow-lifecycle.md`
  - Change: Make `strategy` and `concern` optional telemetry rather than transition prerequisites or exact-text independence gates; allow zero to four subject-matter reviews according to actual plan risk instead of requiring two universally; retain unresolved-supported finding blocks and one final standard-mode necessity review record, without claiming delegated freshness; keep quick mode review-free and preserve active lifecycle persistence and deterministic ready validation.
  - Done when: Focused tests prove omitted review prose and a low-risk standard plan without subject-matter reviews can progress through one final necessity check to ready, material plans can still record and resolve bounded reviews, unresolved supported findings cannot reach ready, quick mode remains review-free, and lifecycle restoration and tool deactivation remain intact.
  - Verify: `cd pi && pnpm test plan-lifecycle.test.ts workflow-dispatch.test.ts`

- [ ] **T3: Consolidate subagent orchestration semantics**
  - Depends on: T1
  - Files: `pi/extensions/subagent/contracts.ts`, `pi/extensions/subagent/index.ts`, `pi/extensions/subagent/legacy-adapter.ts`, `pi/extensions/subagent/scope-policy.ts`, `pi/tests/subagent-t1.test.ts`, `pi/tests/subagent.test.ts`, `pi/tests/subagent-tree-runtime.test.ts`, `pi/skills/orchestration/SKILL.md`, `pi/skills/pi-extension/references/contracts/subagents-and-tasks.md`
  - Change: Route modern and legacy task links through one workspace, root-session, deletion, and assigned-state validator; treat coordinator scope/boundary markers as advisory while preserving no-direct-mutation authority and `enforcedBoundary`; remove or retire production-dead overlap-rejection code and conflicting disjoint-scope policy without weakening containment; normalize legacy top-level `taskId` once into per-item correlation while preserving modern per-item IDs and single-item read/write affinity rules.
  - Done when: Tests prove foreign-workspace, wrong-session, deleted, and non-assigned links fail before spawn; valid per-item Team Lead correlation succeeds without task mutation; advisory coordinator markers do not grant mutation authority; overlapping advisory markers are not rejected; legacy single-item correlation normalizes once; ambiguous multi-item correlation and invalid affinity remain rejected.
  - Verify: `cd pi && pnpm test subagent-t1.test.ts subagent-tree-runtime.test.ts subagent.test.ts`

## Validation

- [ ] Run `cd pi && pnpm test task-registry.test.ts task-tools.test.ts tasks.test.ts plan-lifecycle.test.ts workflow-dispatch.test.ts subagent-t1.test.ts subagent-tree-runtime.test.ts subagent.test.ts`; all focused tests pass, with unrelated pre-existing failures reported rather than disguised.
- [ ] Run `cd pi && pnpm run typecheck`; shared TypeScript contracts compile before implementation expands and at final validation.
- [ ] Run targeted Biome checks for changed files and `git diff --check`; changed files pass and no whitespace errors remain.
- [ ] Inspect the final diff and focused tests to confirm no Team Lead mutation authority, governed containment, canonical plan validation, task lifecycle mutation, provider routing, or unrelated continuation behavior changed.

## Retention

Keep incomplete work at `.specs/reduce-workflow-ceremony/plan.md`. After completion, `/do-it` archives this directory to `.specs/archive/reduce-workflow-ceremony/`.

## Execution Status

- State: Ready; implementation has not started.
- Blocker: None.
- Next: T1 and T2 may begin independently; T3 begins after T1 updates the shared task/subagent contract.
- Resume: `/do-it .specs/reduce-workflow-ceremony/plan.md`
