---
created: 2026-09-09
status: retired
completed: null
---

# Bound Herdr state delivery without losing integration ownership

## Retirement disposition

Archived at the operator's request after the default-profile scope review. The demonstrated queue defect belongs to legacy; default already coalesces pending state and its generated reporter remains unchanged. No consolidation was implemented or validated by this retirement; `completed` remains null and unfinished tasks remain unchecked. The following proposal and earlier handoff are historical evidence, not current execution instructions. This disposition supersedes their earlier directions to defer without archiving. Resumption requires a separately requested scope; no ownership decision blocks default work.

## Workstream disposition (historical)

Deferred and removed from the default-profile execution order by operator scope correction. The demonstrated unbounded queue is in legacy; default already coalesces pending state. No default defect was established that requires this consolidation. Keep the generated default reporter and its ownership unchanged.

There is no Herdr ownership question to answer for this workstream. The retained proposal below is historical planning context, not executable requirements or a request to choose a fork. Resume only if legacy work or a concrete default behavior change is separately requested, with its scope revalidated first. Do not delete, archive or mark this unfinished plan complete.

## Earlier goal and scope (inactive)

The earlier proposal aimed to eliminate legacy's unbounded state-send queue and consolidate mechanics while preserving TUI state, blocked prompts, session references, monotonic report sequence, legacy startup metrics and owned shutdown.

Both reporters are marked generated/overwritten by Herdr, and default documentation explicitly requires keeping the generated reporter unmodified. Replacing both with a shared factory would create a maintained fork. That proposal is withdrawn from the default workstream, not a blocked default implementation waiting for approval.

Non-goals: subagent lifecycle/layout/rendering, Herdr service changes, new notification behavior, active-child reload, global event framework, deployment, production integration installation or upstream publishing. No rollback work.

Authorization: plan creation only. No implementation, integration refresh, commits or push authorized. Later execution includes local task commits/merge into dotfiles `main`, not upstream publication or deployment.

## Context for a fresh session

All paths are dotfiles-root-relative. Read root and both profile `AGENTS.md` files, `pi/README.md`, default `docs/herdr.md`, applicable legacy contracts and the testing skill. Installed Herdr docs/template may be read by the orchestrator; do not task workspace-restricted children with unavailable paths.

- Existing sources: `pi/profiles/{default,legacy}/extensions/herdr-agent-state.ts`, both `herdr-ui-prompt-state.ts` files, legacy `lib/session-start-metrics.ts`.
- Default already uses one pending latest state and one in-flight send. Legacy chains every state and session report through `ipcChain` and waits for the chain during shutdown.
- Both send `pane.report_agent` and `pane.report_agent_session`, prefer an absolute POSIX session path then session ID, and allocate report sequence numbers. Transport makes at most two attempts, 500 ms then 1,500 ms.
- Both files say `managed by herdr`, integration version 8. Default `docs/herdr.md` says the reporter is checked in unmodified and refreshed through an explicitly profile-targeted integration install. The repository-owned prompt bridge is deliberately separate.
- Default currently has no explicit shutdown flush; legacy does. Do not describe them as already lifecycle-equivalent or silently add default behavior under an implementation-only claim.
- Source inspection only on 2026-09-09. No installed template comparison, external receiver semantics, socket tests or runtime acceptance performed.

Proposed worktree `../.dotfiles-worktrees/herdr-state-delivery-consolidation`; branch `refactor/herdr-state-delivery-consolidation`; merge target `main`. Preserve all other open plans/concurrent work.

Planning profile: default verified by orchestrator environment. Intended checks: default and legacy. The old generated headers do not establish whether installed Herdr currently emits exactly the checked-in source; T1 verifies that before any regeneration.

## Earlier ownership alternatives (inactive, not a current question)

**D1 was an ownership choice introduced by the earlier cross-profile proposal. It is not required for default work.**

Recommendation: keep default's generated integration upstream-owned; align the legacy reporter with the maintained bounded sender and preserve legacy metrics through a separate repository-owned adapter where the installed integration supports it. This reduces custom code without making both profiles maintain a fork. It may eliminate the justification for a cross-profile shared module entirely.

Alternative requiring explicit approval: own a fork of both reporters and extract `pi/shared/herdr-state-sender.ts`. That changes the existing refresh/overwrite contract and requires clear documentation preventing normal regeneration from silently removing the fork. Do not implement both choices or add synchronization machinery preemptively.

The former T2/T3 descriptions below are retained only as proposal context. They do not authorize changes to default's generated reporter. Any separately requested future work must establish its own relevant ownership scope before these tasks could be reactivated.

## Earlier proposed delivery contracts (inactive)

- Bound state backlog to one in-flight request plus one replaceable latest pending state per sender owner. Do not cancel/replay an already-started send solely because a newer state arrives.
- Verify with the installed receiver contract whether state reports are snapshots or required transition events. If transitions have mandatory effects, do not silently drop them; report the concrete mismatch with the proposed coalescing behavior.
- Session-identity reports are not disposable state snapshots. Preserve required ordering with state, capture identity at enqueue rather than reading a later session's globals, and avoid creating another unbounded session-report queue.
- Keep each profile/extension owner independent. Shared code may be a factory, never presumed shared mutable singleton identity across Pi loaders.
- Preserve TUI-only activation, blocked-count semantics, native prompt bridge, legacy startup metrics, session path/ID rules, source/pane identifiers and monotonic sequences across actual lifecycle boundaries. No headless helper may claim the orchestrator's pane.
- At shutdown stop admitting state from the old owner and finish/retire its finite pending work under the existing bounded transport attempts. Do not invent an idle state while work remains active. Preserve legacy's final drain; any default lifecycle change must be named in the resolved D1 implementation rather than hidden as deduplication.
- No sockets/timers during discovery-only factory loading. Cleanup is idempotent. A network failure must not poison all subsequent sends or leave an unresolved shutdown promise.

## Execution guidance

No implementation or worktree creation is scheduled for this deferred plan. Do not reopen D1 for the default workstream. If work is separately requested in the future, revalidate its scope and replace these inactive execution details before creating a task worktree. Never run `herdr integration install` against the production profiles or relink the live plugin from a disposable worktree. Capture generated output only in a temporary profile if required. Read-only source/schema inspection is allowed before the single final validation phase required for legacy changes. Ask before broadening ownership or receiver semantics. Remove only unnecessary task-created detours; no notification framework or subagent changes.

## Retained tasks (inactive while deferred)

- [ ] **T1 - Resolve source ownership and confirm receiver semantics**
  - Depends on: operator decision D1 and execution authorization.
  - Inputs: both reporters, default setup contract, installed Herdr generated template/receiver docs, legacy metrics wrapper.
  - Do: record the accepted source/refresh ownership, compare the installed template in a disposable location, and establish snapshot/identity ordering. Name the exact resulting source and test files in this plan; preserve the selected ownership contract, not two parallel implementations.
  - Verify: read-only/generated-output inspection establishes where changes survive an update and which reports may be coalesced. If no supported customization seam preserves required metrics, report it before inventing an install-time patcher.
  - Done when: one implementable ownership path and finite queue/identity contract are recorded with no consequential ambiguity.
  - Evidence: Not started; D1 unresolved.

- [ ] **T2 - Implement bounded state sending through the approved owner**
  - Depends on: T1.
  - Files: legacy reporter/adapter and only the default/generated/shared files explicitly selected in T1.
  - Do: remove unbounded state backlog, preserve identity ordering and lifecycle isolation, keep transport limits and legacy metrics. If a shared factory is approved, use Node-only dependencies and `pi/shared` conventions from the stateless plan; no SDK dependency relocation or singleton state.
  - Verify: author deterministic fixtures covering a slow send plus a burst, independent sender instances, blocked/working/idle convergence, session replacement and shutdown; do not run intermediate development checks.
  - Done when: queued state is bounded and late old-session sends cannot claim new-session identity or defeat the final state.
  - Scope checkpoint: no subagent files, pane operations, focus/layout changes, notification side effects or generic framework.
  - Evidence: Not started.

- [ ] **T3 - Complete parity, loader and lifecycle acceptance**
  - Depends on: T2.
  - Files: proposed `pi/profiles/{default,legacy}/tests/herdr-agent-state.test.ts`, existing prompt-bridge tests and affected setup documentation/root changelog.
  - Do: test request envelopes/sequence/identity ordering, timeout/error recovery, final shutdown and no post-shutdown admission with real sender logic and a controllable net boundary. Include one disposable local socket test and independent extension-factory loading. Preserve legacy metrics wrapper and non-TUI exclusion. If shared source is introduced, use the exact reload-root convention established by the stateless plan and prove a shared edit reaches default reload detection.
  - Verify: final checks below. Avoid real panes, production sockets or integration installs. Record that these tests do not prove physical attention/sound behavior.
  - Done when: approved ownership and finite queue contracts pass with no resources left behind, and refresh instructions accurately describe the actual owner.
  - Evidence: Not started.

- [ ] **T4 - Archive and integrate**
  - Depends on: T3.
  - Do: record actual profiles/results, archive and merge locally while preserving unrelated work.
  - Done when: `main` contains the implementation and dated archive with no active copy, or a concrete integration blocker is reported.
  - Evidence: Not started.

## Retained validation proposal (not scheduled)

The following historical checks belong to the withdrawn cross-profile proposal. They are not acceptance requirements for the default workstream and must not be run merely to close this deferred plan. Any future scope must replace them with its own finite relevant checks.

Earlier proposed default checks:

```sh
pnpm test herdr-agent-state.test.ts herdr-ui-prompt-state.test.ts
pnpm run typecheck
```

From legacy:

```sh
pnpm test herdr-agent-state.test.ts herdr-ui-prompt-state.test.ts
pnpm run typecheck
```

Both state-test files are proposed. The loader/socket fixtures belong inside those tests; if shared reload wiring changes, add the existing `profile-reload.test.ts` and `profile-reload-integration.test.ts` default filters. Run one final phase after authoring code/tests, then at most one focused repair batch and affected rerun. No full-suite, live Herdr service or notification acceptance required. Do not pretend generated-source parity is proven by mocking away the generated implementation.

## Current handoff and dependencies

- Status: deferred/out of scope; no code or runtime checks performed.
- Next: none in the default workstream. A separately requested future scope is required before reconsidering implementation.
- Default's generated reporter remains unchanged. No unresolved ownership question blocks any current default plan.
- No dependency on or from the default DRY, subagent cleanup or UX plans. The previous shared-source sequencing recommendation is withdrawn.

## Completion and archive

After required work/checks set actual completion date and move this directory to `.specs/archive/herdr-state-delivery-consolidation/` in the task branch without overwriting an archive. Repair links. Commit implementation, changelog and archive together and merge into `main` preserving unrelated work. Verify target/archive and no active duplicate; recheck only behavior affected by conflicts. Retain blocked worktrees and remove only clean integrated ones. Do not push or publish upstream changes.
