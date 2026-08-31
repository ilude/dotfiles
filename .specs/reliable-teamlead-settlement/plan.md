---
created: 2026-08-31
status: ready
---

# Make Team Lead settlement reliable

## Objective

Team Lead orchestration must report process lifecycle separately from deliverable outcome, expose one consume-once bounded continuation for an eligible partial result, reserve time to settle descendants and reconcile their results, and reject declared read targets outside existing authority before any child starts.

## Completion Evidence

- Evidence: Focused subagent tests pass with `processState` (`running` or `settled`), `processOutcome` (`succeeded`, `failed`, or `cancelled`), and `deliverableOutcome` (`complete`, `partial`, `blocked`, or `failed`) remaining separate; mixed deliverables reduce deterministically; an eligible partial issues one opaque continuation that can be consumed once under current authority; broker cutoff races preserve reconciliation time; and canonical invalid read targets are rejected before run registration, permit acquisition, or spawn.
- Fails when: Settlement is presented as deliverable success, aggregate precedence differs from `failed > blocked > partial > complete` after cancelled processes map to failed deliverables, a continuation is reused or survives cancellation/authority narrowing, an active or queued descendant crosses the admission cutoff, or an invalid declared read target reaches any process-start boundary.

## Boundaries

- In scope: Pi-owned Team Lead request/result contracts, coordinator budget and authenticated tree admission, run-manager continuation identity, pre-spawn read-target validation, background completion state, operator rendering, focused tests, and the stable subagent tooling contract.
- Out of scope: General task scheduling, automatic continuation or retries, indefinite deadline extension, implicit filesystem authority widening, changes to non-Pi clients, legacy `subagent_continue` semantics, and completing the separate Pi 0.84.3/0.84.4 extension audit.
- Preserve: The eight-descendant default ceiling, hard containment, recursive cancellation, root-owned task lifecycle, private session paths, existing read/write authority, selected-skill exceptions, legacy resumed-session compatibility, and unrelated subagent behavior.
- Assumptions: One explicit modern Team Lead continuation is sufficient; declared read targets validate authority but never grant or widen it; filesystem containment reuses the existing canonical real-target and nearest-existing-ancestor rules; and the process-local run manager remains authoritative for atomic continuation issuance and consumption. Execution may parallelize bounded read-only inspection and review, but each task has one mutation owner and no concurrent writers may overlap its listed files.

## Tasks

- [ ] **T1: Establish the outcome and budget contracts with one executable slice**
  - Files: `pi/extensions/subagent/contracts.ts`, `pi/extensions/subagent/run-manager.ts`, `pi/tests/subagent.test.ts`, `pi/tests/subagent-run-manager.test.ts`
  - Change: Add a pure table-driven deliverable reducer with precedence `failed > blocked > partial > complete`; keep process state and process outcome as separate fields; treat a missing or malformed required completion as failed; and define the reserve as `min(120000, max(5000, floor(hardDeadlineMs * 0.2)))`, capped below the hard deadline, with `admissionCutoffAt = hardDeadlineAt - reserve`. Define an eligible partial as cooperative settlement before cancellation or hard containment, nonempty remaining work, validation not failed, a persisted session, and an exact execution fingerprint. Add a run-manager-issued opaque continuation record bound to root session, workspace, task, agent/model/effort, role/depth, skills, authority tools, captured authority, hard expiry, and a consume-once state transition; do not expose its session path.
  - Done when: Exhaustive reducer cases, short/normal deadline calculations, continuation issuance, atomic first consumption, concurrent or second-use rejection, expiry, cancellation, and authority-narrowing rejection pass, and the shared contract typechecks. T2 may begin only when this slice proves the existing contracts and run manager can own the behavior without duplicate lifecycle state or a parallel scheduler; otherwise stop with the falsifying test evidence and leave T2-T3 unchanged for plan revision.
  - Verify: `cd pi && pnpm test subagent.test.ts subagent-run-manager.test.ts && pnpm run typecheck`

- [ ] **T2: Integrate continuation, cutoff, and read-target enforcement**
  - Depends on: T1
  - Files: `pi/extensions/subagent/contracts.ts`, `pi/extensions/subagent/index.ts`, `pi/extensions/subagent/modern-adapter.ts`, `pi/extensions/subagent/run-manager.ts`, `pi/extensions/subagent/tree-runtime.ts`, `pi/extensions/subagent/workspace-policy.ts`, `pi/tests/subagent.test.ts`, `pi/tests/subagent-tree-runtime.test.ts`, `pi/tests/subagent-run-manager.test.ts`, `pi/tests/workspace-policy.test.ts`
  - Change: After T1's feasibility gate passes, route foreground and background composition through the reducer and add a typed deliverable outcome to background completion state. Add an optional `continuationId` to the modern Team Lead request; atomically consume it once, intersect captured authority with the parent's current effective authority, and reject identity mismatch, narrowing that invalidates required authority, cancellation, expiry, concurrent use, or hard-deadline settlement. Continuations receive a new caller-supplied Team Lead budget and never alter legacy continuation. Propagate absolute hard deadline and `admissionCutoffAt` in versioned authenticated tree metadata; atomically reject acquire/dispatch before, at, and after cutoff as applicable, remove queued requests at cutoff, and settle active descendants at cutoff so their bounded results reach the coordinator before its hard deadline. Add optional `requiredReadPaths` to read and coordinator items; resolve relative values from the item's canonical cwd, validate existing targets through real filesystem identity and prospective targets through the nearest existing ancestor with Windows case/reparse handling, and repeat the same check immediately before `SubagentRunManager.begin`, broker permit acquisition, and spawn. The field never grants authority or uses the selected-skill exception.
  - Done when: One continuation composes as a new typed Team Lead result without exposing a session path; cancellation and hard containment remain terminal; cutoff race tests cover requests before, exactly at, queued across, and after cutoff; active descendants settle within the reserve; and invalid direct, symlink/junction, and nonexistent-descendant targets cause no run begin, permit, or spawn.
  - Verify: `cd pi && pnpm test subagent.test.ts subagent-tree-runtime.test.ts subagent-run-manager.test.ts workspace-policy.test.ts subagent-control.test.ts subagent-workflow.test.ts && pnpm run typecheck`

- [ ] **T3: Align operator surfaces and the stable contract**
  - Depends on: T2
  - Files: `pi/extensions/subagent/index.ts`, `pi/extensions/subagent/status.ts`, `pi/extensions/subagent/ui.ts`, `pi/skills/pi-extension/references/contracts/subagents-and-tasks.md`, `pi/tests/subagent.test.ts`, `pi/tests/orchestration-stats.test.ts`, `pi/tests/orchestration-telemetry.test.ts`
  - Change: Show process state, process outcome, and deliverable outcome as separate typed fields in foreground results, background follow-ups, status, artifacts, and telemetry. Add a separate telemetry deliverable-outcome field rather than overloading process outcome. Document consume-once Team Lead continuation, broker-enforced reconciliation reserve, and non-authorizing declared read targets without adding behavioral prompt prose beyond concise callable schema descriptions.
  - Done when: Operator-visible aggregation cannot say complete for partial, blocked, cancelled, malformed, or failed required work; status can render `process=settled` beside the actual process and deliverable outcomes; telemetry preserves both axes; and no provider-visible result exposes a saved session path.
  - Verify: `cd pi && pnpm test subagent.test.ts orchestration-stats.test.ts orchestration-telemetry.test.ts && pnpm run typecheck`

## Validation

- [ ] Run `cd pi && pnpm test subagent.test.ts subagent-tree-runtime.test.ts subagent-run-manager.test.ts workspace-policy.test.ts subagent-control.test.ts subagent-workflow.test.ts orchestration-stats.test.ts orchestration-telemetry.test.ts && pnpm run typecheck`; confirm the mixed background outcome and consume-once continuation fixtures, broker cutoff race fixture, canonical target rejection fixtures, preserved cancellation behavior, telemetry separation, and shared types all pass.

## Retention

Keep incomplete work at `.specs/reliable-teamlead-settlement/plan.md`. After completion, `/do-it` archives this directory to `.specs/archive/reliable-teamlead-settlement/`.

## Execution Status

- State: Ready; implementation has not started.
- Blocker: None.
- Next: T1.
- Resume: `/do-it .specs/reliable-teamlead-settlement/plan.md`
