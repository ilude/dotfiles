---
created: 2026-09-09
status: completed
completed: 2026-09-09
---

# Parsed Damage Control bypass eligibility

## Goal and scope

Correct default-profile `/dc off` eligibility so only documented local ask-tier operations bypass approval. Preserve ordinary recoverable work, contextual judgment, hard blocks, and `/dc on` behavior.

Non-goals: policy-family redesign, new ownership ledgers, per-tool cancellation redesign, script-trust redesign, legacy changes, Onclave, Bedrock, or general deduplication. Do not add rollback work.

Authorization: planning only. Execution requires separate authorization. Authorized execution includes local task commits and merge into `main`; push and deployment remain separate.

## Context for a fresh session

All code paths are relative to the dotfiles repository. Read current `AGENTS.md` and `pi/profiles/default/AGENTS.md` first.

- Proposed worktree: `../.dotfiles-worktrees/default-damage-control-bypass`.
- Proposed branch: `fix/default-damage-control-bypass`; merge target: dotfiles `main`.
- Required reading: `pi/profiles/default/docs/damage-control-setup.md`, `docs/damage-control-port.md` under that profile, `lib/damage-control/{enforcement,analysis,engine,types,paths}.ts`, and `tests/damage-control/fixtures/fake-pi.ts`.
- Related decisions: `pi/profiles/default/skills/agent-process/references/instruction-feedback.md`, AIF-015 (harm/recoverability), AIF-022 (scope).
- Starting evidence: `enforcement.ts` computes `localBypass` from command-prefix/keyword regexes after `decide()`, skipping a `user` decision without checking analyzed effects. Confirmed blocks return before bypass.
- On 2026-09-09, actual gate, production policy, and real parser accepted inert `rm -rf "$UNRESOLVED_REVIEW_TARGET"` with bypass on after an injected failed review. Bypass off required approval. Root deletion remained blocked. No submitted command or provider call executed.
- The checkout was clean before plan creation. Recheck before execution and preserve concurrent work.

### Profiles and evidence

- Planning profile: verified `default`, `pi/profiles/default`, through `PI_CODING_AGENT_DIR`.
- Intended implementation/validation: default profile only. Legacy remains unchanged.
- Actual planning checks: offline gate reproduction described above; no implementation tests or live Luna acceptance claimed.

## Decisions and contracts

| Decision | Authority | Required behavior |
| --- | --- | --- |
| D1 | Existing operator-facing contract | Only eligible local ask-tier rm, Git, Docker, and contained environment-file operations may bypass. |
| D2 | Existing contract | Confirmed blocks, consequential remote/cloud/live operations, Docker volumes, exfiltration, dynamic targets, and protected paths do not bypass. |
| D3 | Operator design purpose | Judge consequences and recoverability, not suspicious syntax alone. Do not convert every uncertainty into a new hard block. |
| D4 | User scope confirmation | Fix this decision boundary only; other review findings remain separate. |

Proposed mechanism: a pure profile-local `lib/damage-control/bypass.ts` function taking the normalized request, complete analysis, final decision, and resolved path facts. It returns eligibility plus a bounded explanation for tests/diagnostics, not a second independent risk verdict. It must have no model calls, filesystem mutations, or environment scans. Reuse existing canonical target facts; if a documented eligibility fact is absent, retain the existing approval path rather than inventing evidence.

Evaluate the entire invocation, including nested or accompanying operations. A local prefix cannot confer eligibility on another effect. Keep hard-block precedence. Do not treat review failure or earlier successful execution as proof of a safe local target. Preserve existing generation, unchanged-input, cancellation, sequence, watchdog, and one-use approval checks.

## Execution guidance

Create the dedicated worktree/branch at execution start; carry this plan into it without discarding its original or concurrent changes. Work and validate there. Reconcile current source with the evidence rather than reverting newer valid work.

Before expanding scope, name the required behavior and demonstrated reason. If an assumption fails, use a simpler in-scope mechanism; ask before changing policy or acceptance. Remove only task-created detours, preserving their required functionality and all pre-existing work. No new audit or mandatory live-model phase.

## Tasks

- [x] **T1 - Replace regex eligibility at the decision boundary**
  - Depends on: none.
  - Inputs: `enforcement.ts`, `analysis.ts`, `types.ts`, `paths.ts`, current setup contract.
  - Do: add the proposed pure bypass helper, expose only missing parsed facts necessary for D1/D2, and call it from enforcement. Delete the independent regex eligibility path. Keep existing review routing and approval semantics outside this substitution.
  - Verify: trace each D1/D2 case through the new predicate; author regression cases for T2, without executing submitted operations.
  - Done when: no command-prefix-only path can suppress a user decision and all eligibility inputs have identified provenance.
  - Evidence: Added pure `bypassEligibility` over parsed analysis, canonical path facts, final review disposition, and parser-owned Git facts; enforcement no longer uses command-prefix eligibility.

- [x] **T2 - Prove policy boundaries and update owning documentation**
  - Depends on: T1.
  - Files: proposed `tests/damage-control/bypass.test.ts`; existing `tests/damage-control/enforcement.test.ts`, setup documentation; root `CHANGELOG.md`.
  - Do: cover a documented eligible local ask; unresolved deletion after failed review; a mixed local/remote invocation; protected/out-of-repository target; Git remote override; Docker volume operation; hard-block precedence; bypass off. Use production parser/engine for gate regressions, substituting only model response and UI. Record the operator-visible correction without rewriting unrelated policy.
  - Verify: final commands below. No actual deletion, remote mutation, or credential access is needed.
  - Done when: eligible work retains bypass, excluded cases retain approval/block, and denial/cancellation cannot become approval.
  - Scope checkpoint: stop if work is becoming a general policy rewrite or provenance ledger.
  - Evidence: Added unit and production-gate regressions for eligible local cleanup, failed review with unresolved target, mixed remote effects, Git endpoint override, Docker volume operation, protected/outside targets, hard-block precedence, and bypass off; updated setup documentation and changelog.

- [x] **T3 - Validate and integrate the bounded correction**
  - Depends on: T2.
  - Do: run the agreed checks once, repair only demonstrated relevant failures, and rerun affected checks. Record actual profile/results. Archive and integrate using the finish instructions below.
  - Verify: required checks pass and `main` contains the implementation plus dated archive, without an active copy.
  - Done when: correction is integrated locally; report push/deployment as unperformed, not required.
  - Evidence: On 2026-09-09 under the default profile, `pnpm test tests/damage-control` passed 19 files and 198 tests (1 skipped), `pnpm run typecheck` passed, and `pnpm run check:runtime` passed. Task commit `c15f6584` was merged into recorded target `main` by merge commit `ad03f24e`; target verification confirmed the implementation and archive are present and the active plan is absent.

## Agreed validation and finish

From the task worktree's `pi/profiles/default`:

```sh
pnpm test tests/damage-control
pnpm run typecheck
pnpm run check:runtime
```

These are offline checks, not a guarantee of every Luna judgment. Classify unrelated baseline failures and preserve them rather than expanding the plan. Stop when the agreed checks pass.

## Current handoff

- Status: completed and integrated locally on 2026-09-09.
- Completed work: T1-T3 implementation, offline validation, archival, task commit, and merge to recorded `main`.
- Verification limit: no live Luna run was required; offline production-parser and gate regressions supplied model responses without executing submitted operations.
- Open operator decisions: none.

## Completion and archive

At completion set `status: completed` and the actual completion date. Move this directory to `.specs/archive/default-damage-control-bypass/` in the task worktree, checking that the destination does not already exist and repairing inbound links. Commit implementation, changelog, and archived plan together, then merge into recorded `main` without disturbing unrelated changes. If integration is blocked, retain the worktree and report that separately. Verify target/archive presence and absence of the active plan; rerun only checks affected by conflict resolution. Remove the worktree only after integration with no uncommitted or unmerged work. Do not push.
