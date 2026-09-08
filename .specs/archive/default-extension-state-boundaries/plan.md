---
created: 2026-09-07
status: completed
completed: 2026-09-07
---

# Repair default Pi cross-extension state and reload reporting

## Goal and scope

- User requirements: Address the demonstrated cross-extension state failure, inspect related default extensions for the same assumption, and verify integration through Pi's real loader rather than shared test imports.
- Required outcome: A watched source change reaches the footer and `/clear`; the indicator accurately reflects whether loaded resources need reloading. Reloaded Damage Control and Codex display behavior must be distinguishable from stale code.
- Non-goals: A profile-wide rewrite, a generic service framework, changes to Damage Control policy or Codex quota semantics, legacy-profile migration, upstream Pi modifications, or live provider calls.
- Authorization: User authorized implementation in a worktree, merge back into the primary checkout, and archival. No push or operator-session reload.

## Context for a fresh session

All repository paths are relative to `C:/Users/mglenn/.dotfiles`. Recheck applicable instructions and preserve concurrent changes before execution. The working tree was clean during planning; `main` includes `2c092a97` (Damage Control approvals).

Required reading:
- Root `AGENTS.md`, `pi/profiles/default/AGENTS.md`, `pi/README.md`.
- `pi/profiles/default/extensions/{profile-reload,operator-footer,clear}.ts`.
- `pi/profiles/default/lib/{profile-reload,reload-monitor}.ts`.
- `pi/profiles/default/tests/profile-reload.test.ts`, existing footer and clear tests, and `pi/profiles/default/scripts/damage-control-smoke.mjs` for the existing loader seam.
- Installed Pi `docs/extensions.md`, especially `pi.events`, session replacement, shutdown, and `ctx.reload()`, plus `examples/extensions/event-bus.ts`. Resolve these beneath the installed package, not this spec directory. Follow relevant SDK/TUI documentation before implementing its APIs.
- Installed Pi `dist/core/extensions/loader.js`, event-bus implementation, and session replacement/resource-loader cache paths.
- `pi/profiles/default/skills/testing/SKILL.md`.

Verified findings:
- `PI_CODING_AGENT_DIR` is `C:\Users\mglenn\.dotfiles\pi\profiles\default`. The earlier profile-mismatch explanation was incorrect; the original environment grep accidentally excluded prefixed variables.
- Pi creates separate Jiti loaders with `moduleCache: false` for extension modules. A two-loader experiment importing `lib/profile-reload.ts` returned `false` for identity equality of the exported `profileReload` instances.
- `extensions/profile-reload.ts` starts one imported singleton; the footer and `/clear` import their own copies. This explains the missing notification path.
- The monitor already includes the active profile's `lib` and `commands` directories. Damage Control library changes are not intentionally excluded.
- Existing reload tests import the extension and singleton in one test module graph, hiding the loader boundary.
- On-disk Codex formatting uses `0%` for an absent individual window; the operator reported the old `unavailable` output. On-disk Damage Control has the updated approval UI. These are stale-code symptoms, not evidence of a provider error. The running instance's memory has not been inspected directly.
- Installed Pi docs say new/resume/fork reload and rebind extensions. Whether this reevaluates changed source or reuses cached factories must be verified before specifying baseline persistence. Do not encode the earlier unverified claim that session switches always keep old code.

### Pi profiles

- Planning: default, `pi/profiles/default/`, verified from the environment.
- Intended implementation and checks: default dependencies and installed Pi version, using isolated temporary profiles for loader/lifecycle tests.
- Legacy and named operator profiles remain unchanged. Do not use real session history, credentials, or real approvals as fixtures.

| Date | Actual profile/path | Work/check | Result |
| --- | --- | --- | --- |
| 2026-09-07 | default / `pi/profiles/default/` | Source/docs and existing-test inspection | Planning only; prior separate-Jiti reproduction established distinct singleton identities. No implementation checks run. |

## Decisions and contracts

- Proposed implementation default: one reload-service owner per active extension runtime, instantiated inside its factory; use `pi.events` for cross-extension communication. Shared modules may export types, event names, and stateless helpers, but not presumed shared mutable state.
- Proposed small protocol: `default:profile-reload:changed` publishes `{ needed: boolean, error?: string }`; `default:profile-reload:request` obtains a current snapshot through a one-shot reply callback. T1 must verify actual bus dispatch/cleanup semantics before finalizing this synchronous local protocol. No IPC, disk state, request ledger, or general-purpose RPC layer.
- Footer subscribes and obtains a snapshot so both startup orders work. It owns only its display copy, not the timer. Preserve narrow-width `[reload]` visibility and `[reload check failed]` reporting.
- `/clear` obtains current owner state before replacement, captures only plain data, and uses the fresh `withSession` context for any reload. Missing owner must not silently mean clean or cause an unbounded wait; report unavailable monitoring and preserve the ordinary new-session action without inventing auto-reload behavior.
- Baseline corresponds to evaluated resource generation, not Git cleanliness. A commit alone cannot clear it. Reset on actual source reload; preserve pending changes across transitions that reuse old factories. T1 determines which installed lifecycle branches fall into each category.
- Timer and event subscriptions have explicit owners and idempotent cleanup. No background resource starts during discovery-only factory loading. Do not let cached factory reuse retain stale mutable closure state across runtime instances.
- Preserve two-second polling, current watch roots/exclusions and error behavior. Do not expand to whole-repository monitoring or transitive dependency discovery.
- Other extensions change only for demonstrated instances of this same cross-loader ownership/lifecycle defect. Independent state, immutable constants, stateless helpers, Pi-owned status transport, and deliberately process-owned scheduler state are not automatically defects.

## Execution guidance

**Before expanding work:** Identify the existing requirement and concrete evidence for each added change. Do not convert a candidate into a required refactor without demonstrating incorrect behavior.

**Scope checkpoints:** After T1 and before final validation, confirm that work repairs state delivery and lifecycle ownership rather than redesigning unrelated features.

**Recovery from drift:** Remove only unnecessary work introduced by this task, preserving pre-existing/concurrent changes; return to the agreed checks without starting another audit.

## Tasks

- [x] **T1 — Establish runtime ownership and lifecycle boundaries**
  - Depends on: none.
  - Inputs/files: Sources and installed Pi paths above; default extension imports and their directly imported stateful libraries.
  - Do: Inspect event-bus sharing/dispatch/unsubscription and factory caching across startup, reload, new, resume and fork. Reproduce the reload mismatch using Pi's production loader with separate extension entrypoints. Make one bounded pass over default extensions for mutable imports consumed across loaders, timer ownership, and stale lifecycle closures. Record a compact findings table in this plan: producer, consumers, state lifetime, evidence, fix/no-change disposition. Inspect direct dependencies only, not all legacy or upstream code.
  - Verify: Demonstrate a watched temporary `lib` edit that changes owner state but fails to reach the current footer/clear path. Record whether each session transition reevaluates changed source or reuses a cached factory. Confirm the bus protocol can return state without relying on load order.
  - Done when: The concrete protocol and baseline transition rules are recorded, the known failure is reproduced, and additional required changes are limited to demonstrated same-class defects.
  - If blocked: Record the exact unavailable loader/API behavior; do not substitute a shared-import mock as integration evidence.
  - Evidence: Completed; see T1 execution evidence.

- [x] **T2 — Replace implicit sharing with explicit owner/consumer integration**
  - Depends on: T1.
  - Files: Existing `extensions/{profile-reload,operator-footer,clear}.ts`, `lib/{profile-reload,reload-monitor}.ts`; a new `lib/profile-reload-events.ts` only if useful for the small stateless contract. Other paths only as supported by T1 findings.
  - Do: Instantiate the service in the owner factory, wire the verified bus contract, deliver initial/update/error snapshots, and remove singleton imports from consumers. Implement T1's baseline generation behavior and cleanup without changing existing feature semantics. Repair any additional demonstrated state-sharing failures with the smallest owning change.
  - Verify: Owner-before-consumer and consumer-before-owner initialization both converge; stopped owners cannot update replacement consumers; `/clear` reads the owner's state and uses only the replacement context after switching.
  - Done when: No required communication depends on shared Jiti module identity, each timer/subscription has one lifecycle owner, and no speculative refactors were added.
  - Evidence: Completed; see T2 execution evidence.

- [x] **T3 — Add loader-boundary and lifecycle regressions**
  - Depends on: T2.
  - Files: Existing `tests/profile-reload.test.ts`, applicable footer/clear tests; proposed new `tests/profile-reload-integration.test.ts` and a minimal production-loader driver only if the existing test process cannot host it safely.
  - Do: Exercise production extension entrypoints through separate Pi loaders. Use temporary profile files and captured UI rendering at the terminal boundary, not a mocked singleton or mocked event bus. Keep real filesystem changes, real state transport, and actual loader caching in the behavior under test; stub provider/network calls and terminal presentation where necessary.
  - Cases: (1) temporary Damage Control-like `lib` edit reaches `[reload]` and `/clear`; (2) startup ordering and late snapshot request; (3) monitor error reaches the footer; (4) reload clears the indicator only with newly evaluated fixture code; (5) new/resume/fork follow T1's observed cache rules without silently accepting stale code; (6) shutdown/rebind leaves no duplicate timers/listeners; (7) absent owner returns promptly rather than silently reporting clean. Preserve existing narrow-width and clean-clear behavior.
  - Do: In the isolated loader fixture, verify a changed imported formatter/approval marker is old before reload and new afterward. Reuse existing Damage Control and Codex behavior tests to verify their current output, without editing operator sources or making real approval/provider requests.
  - Verify: The central delivery regression fails against the old integration and passes with the fix. Tests must not import the producer's singleton to assert consumer behavior.
  - Done when: Tests demonstrate externally observable state delivery and source activation across the actual loader boundary, with deterministic owned cleanup.
  - Evidence: Completed; see T3 execution evidence.

- [x] **T4 — Document, validate, and close**
  - Depends on: T3.
  - Files: `pi/README.md`, root `CHANGELOG.md`, this plan.
  - Do: Describe single ownership, explicit cross-extension communication, actual baseline/reset semantics, and the remaining watch-coverage limits. Record the runtime loader regression and why shared-import tests missed it. Do not modify agent instructions or add a generic framework.
  - Verify from `pi/profiles/default/`: `pnpm run typecheck`; `pnpm test profile-reload scheduler-footer usage-context-tps damage-control/prompt.test.ts` (filters directly after `test`, no `--`). Include the existing clear/footer test filter if its filename is outside those filters, plus only test files for additional demonstrated T1 repairs. Confirm new integration tests were collected, not silently skipped. Run `pnpm run check:runtime` for the existing offline Damage Control loader check.
  - Verify from root: `git diff --check` for this task's changes; inspect final scope and unrelated-change preservation.
  - Done when: Agreed offline checks pass, limitations are documented, and this spec is completed and archived. No live account access or operator-session reload is required for acceptance.
  - Evidence: Completed; see T4 execution evidence.

## Agreed validation and finish

T1's small reproduction and T3/T4's focused checks are the validation scope. Repair demonstrated task-relevant failures and rerun affected checks; do not expand into a repository-wide test audit. Use the installed Pi loader and record its version in results. Unit tests alone do not establish cross-extension correctness. Actual operator terminal appearance is separate from captured rendering; report it unverified unless the operator confirms after explicitly reloading their session.

## Current handoff

- Status: Implementation and agreed checks completed in `.worktrees/default-extension-state`, branch `fix/default-extension-state`; merge requested by user.
- Completed: T1-T4. See execution evidence below.
- Next: Merge the committed worktree result into primary while preserving concurrent work. No push or operator-session reload.
- Open technical decisions: None.

## Execution evidence, 2026-09-07

Actual validation used the default profile's dependencies, Pi 0.85.0, isolated temporary profiles and the installed self-contained bundled resource loader. The worktree's dependency directory is a junction to the existing default dependencies. pnpm's automatic dependency verification tried to reinstall through that junction and refused; checks used `pnpm --config.verify-deps-before-run=false` without modifying shared dependencies. Importing the unbundled production loader failed on absent `pi-server`; the integration test uses the advertised self-contained bundle instead, matching the existing loader-smoke approach.

- T1: Original primary-checkout monitor/footer entrypoints loaded through the production bundle reproduced the bug: a temporary `lib/approval.ts` change followed by 2.2 seconds still rendered no `[reload]`. Installed event-bus dispatch is synchronous and subscription registration returns an unsubscribe function. Loader wrappers track subscriptions. Session replacement constructs new resource loaders; their first load can reuse same-cwd cached factories. Reloading an already-loaded resource loader clears the factory cache. Tests prove both cached and reevaluated paths.
- T2: The owner now instantiates its service inside the factory and retains only its own baseline within the evaluated source generation. Its timer/subscriptions are session-owned. Footer and clear use the small event/snapshot contract. No generic framework or other extension refactor was needed.
- T3: Five production-bundle integration cases pass, including both startup orders, captured narrow footer rendering, clear's fresh replacement context, cached new/resume/fork events, errors, absent owner, imported source markers before/after reevaluation, and timer cleanup. Existing focused tests now use a real event bus rather than a mocked singleton. The suite simulates lifecycle event delivery around real resource loading; it does not drive the interactive session selector.
- T4: Typecheck passed; five focused test files / 36 tests passed; `check:runtime` passed actual Damage Control bootstrap, grammar and native schema checks with network disabled. Source activation and Codex/approval behavior were verified offline. Actual operator terminal appearance remains unverified. Final diff whitespace check and scope review are recorded at merge closeout.

Bounded state-ownership inspection:

| Producer / consumers | Lifetime and disposition |
| --- | --- |
| Reload monitor / footer / clear | Demonstrated separate-singleton failure; repaired with explicit bus transport. |
| Codex and TPS / footer | Extension-owned request/timer state; Pi `setStatus` carries display data. Existing shutdown handlers and focused tests cover replacement. No shared singleton requirement; unchanged. |
| Scheduler / footer | Deliberate process-owned `Symbol.for` state with session rebinding; footer receives Pi status strings. Not the demonstrated defect; unchanged. |
| Bedrock ledger / Codex/context/footer consumers | File-backed accounting and stateless formatting, not shared mutable import identity; unchanged. |
| Model runtime and tool activation helpers / their extension consumers | Factories/stateless functions operating on supplied Pi APIs; unchanged. |
| Browser CDP counter and settings-file counter | Internal identifiers rather than state exchanged between extensions; file writes have owning locks. No same-class failure demonstrated; unchanged. |
| Log analytics staging queue | Owned by the analytics tool's import graph, no second extension consumer relying on shared identity; unchanged. |

No legacy changes, live account calls, runtime policy changes, or operator-session reload were introduced.

## Completion and archive

After implementation and agreed checks, set `status: completed`, record the actual completion date and profile/version results, then move the entire spec directory to `.specs/archive/default-extension-state-boundaries/`. Check the destination first and repair inbound links. Do not overwrite an archive, commit, push, or remove unrelated work.
