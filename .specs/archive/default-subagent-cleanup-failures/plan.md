---
created: 2026-09-09
status: completed
completed: 2026-09-09
---

# Preserve ownership through ordinary subagent cleanup failures

## Goal and scope

Make ordinary cancellation, finish, failed/completed-assignment cleanup, `/clear`, and parent shutdown handle termination failures honestly. Attempt cleanup of independent resources without abandoning a still-live owned child or falsely reporting complete teardown.

Here, cleanup means closing a child's process, pane and communication resources, not repository housekeeping. The evidence is an offline injected termination failure. No currently running orphaned child has been established, and this plan does not authorize searching for or terminating live orphaned processes.

**Settled operator decision: the operator will never run `/reload` while a subagent is active. Active-child reload teardown, migration, recovery, and tests are excluded. Do not ask this question again or reinterpret ambiguous documentation as authorization for that work.**

Non-goals: lifecycle framework, durable process registry, restart recovery, automatic cleanup retry daemon, layout/focus redesign, delegation changes, or other review findings. Preserve successful cleanup, retained conversations, direct intervention and origin-scoped outcomes. No rollback work.

Authorization: planning only. Separate execution authorization includes task commits and merge into `main`; no push/deployment.

## Context for a fresh session

All paths are dotfiles-root-relative. Read current root/default `AGENTS.md` files and AIF-022/APR-014 in `pi/profiles/default/skills/agent-process/references/` before acting.

- Proposed worktree: `../.dotfiles-worktrees/default-subagent-cleanup-failures`.
- Proposed branch: `fix/default-subagent-cleanup-failures`; merge target: dotfiles `main`.
- Required reading: default `docs/subagents.md`, `extensions/{subagents,clear}.ts`, `lib/subagents/{rpc,visible,runtime,transport}.ts`, and existing `tests/subagent-{rpc,runtime,transport}.test.ts`.
- Starting evidence: `RpcChild.cancel()` catches termination failure and returns after storing an error. `SubagentRuntime.shutdown()` can then close transport and mark itself disposed. It selects children by status/retention rather than all still-live resource facts. A prior failed assignment can have settled status with a running process.
- On 2026-09-09 an offline check using actual runtime/RpcChild methods and injected process/socket boundaries left `processState=running` after failed termination while shutdown resolved and disposed the owner. No real child was launched.
- Visible cleanup requires authenticated host-exit evidence, pane closure and launcher exit. Do not replace this with guessed PIDs or broad process termination.
- The earlier review's active-reload finding is outside agreed scope. Existing settled-only reload remains unchanged; clarify conflicting prose rather than implementing active reload.
- Checkout was clean before plan creation; preserve concurrent changes at execution.

### Profiles and evidence

Planning profile: verified default, `pi/profiles/default`. Implementation/validation: default. Legacy and Onclave unchanged. Planning reproduction was failure injection, not proof of real termination failure recovery or physical Herdr behavior.

## Decisions and contracts

| Decision | Authority | Required behavior |
| --- | --- | --- |
| D1 | Repeated explicit operator direction | Active-child reload is unsupported and outside this plan. |
| D2 | Existing lifecycle | Capture assignment outcome independently from proving process/pane cleanup. |
| D3 | Existing intervention contract | Quit leaves acknowledged user-owned visible children available to the user; ordinary owned children are stopped. Explicit user cancellation still stops its target. |
| D4 | Demonstrated failure | A failed cleanup attempt must remain observable and controllable while the parent runtime remains alive. |

Proposed mechanism: a narrow cleanup result or propagated typed error identifying whether resources actually stopped. Use process/pane/transport facts, not assignment `status` alone. Keep assignment outcome distinct from resource state so a cleanup error does not erase a completed result.

- Attempt cleanup for all applicable children even when one fails. Aggregate bounded failures only after attempting independent resources. Do not clear ownership in a blanket `finally`.
- `/clear`/reset must not replace the owner or proceed to the clean-session transition while ordinary child cleanup remains unresolved. Surface the failure; keep the same owner and exact resource controls for an explicit subsequent cleanup attempt.
- A settled but still-running child is eligible for later cleanup. Already-exited resources are not terminated again; successful result delivery is not duplicated by cleanup attempts.
- Transport remains available where required to observe/control unresolved visible resources. Dispose only after applicable resources are proven closed or deliberately excluded by the existing user-intervention quit contract.
- Parent process exit cannot be vetoed merely by throwing from Pi's `session_shutdown`. Attempt bounded cleanup and report failure before returning. Do not promise in-memory ownership survives actual parent exit, add persistence, or redesign Pi shutdown.
- Preserve existing per-resource time bounds. No infinite waits or automatic retry loop. Exact type/helper names are implementation choices, not a requirement for a generic state machine.

## Execution guidance

Start a dedicated worktree/branch only after execution authorization. Carry this plan there and preserve concurrent work. Address the transition as a whole rather than adding separate patches per failure site. Scope checkpoints must exclude active-child reload, restart persistence, layout changes and speculative cleanup frameworks. If an assumption fails, use an in-scope simpler mechanism; ask before changing operator behavior. Remove only task-created detours.

## Tasks

- [x] **T1 - Make child cleanup success/failure explicit**
  - Depends on: none.
  - Files: `lib/subagents/{rpc,visible}.ts`, existing record/presentation types only as needed.
  - Do: retain confirmed assignment results and report cleanup errors separately; make cancellation/finish and automatic cleanup expose actual resource closure. Preserve exact-process and authenticated visible-host evidence, time bounds and intervention rules.
  - Verify: author regression cases for successful exit, failed termination and failed pane close without invoking production Herdr.
  - Done when: a successful return/result cannot silently imply resources closed when their facts remain live.
  - Evidence: Implemented explicit per-child cleanup results with bounded process/pane facts, separate cleanup errors, retained assignment outcomes, retryable cancellation/finish, and inert RPC regressions.

- [x] **T2 - Make runtime cleanup attempt all applicable resources and retain failures**
  - Depends on: T1.
  - Files: `lib/subagents/runtime.ts`, `extensions/subagents.ts`, `extensions/clear.ts` where the existing reset outcome is handled.
  - Do: select resources independently of settled assignment status; attempt all applicable cleanup; prevent reset replacement after failure; preserve unresolved owners/transport and allow explicit subsequent cleanup. Keep quit's user-owned visible exclusion unchanged.
  - Verify: transition fixture with two children: first fails, second succeeds, owner remains available; a later explicit successful attempt permits reset once. Check clear does not transition after failed reset.
  - Done when: failure of one resource does not prevent independent attempts or relinquish the unresolved one.
  - Scope checkpoint: no active-child `/reload` branch, migration, or tests added.
  - Evidence: Implemented independent shutdown attempts, unresolved-owner retention, transport revocation only after proven closure, and reset refusal on unresolved cleanup. Added clear/reset and retry fixture coverage without production Herdr operations.

- [x] **T3 - Add finite regressions and align documentation**
  - Depends on: T2.
  - Files: existing `tests/subagent-{rpc,runtime,transport}.test.ts`; proposed `tests/subagent-cleanup.test.ts`; default `docs/subagents.md`, root `pi/README.md`, root `CHANGELOG.md`.
  - Do: cover failed cancellation, completed-but-live cleanup, visible pane-close failure, all-child attempts, retry after failure, idempotent success, nonduplicated outcomes, and user-owned quit exclusion. Use existing fixtures/inert processes and controlled transport/CLI failures. Correct reload prose to the operator's settled-only assumption without changing its runtime.
  - Verify: final checks below; no live model or production pane operations.
  - Done when: documentation and tests distinguish assignment completion, resource closure, supported reset, and unsupported active reload.
  - Evidence: Added `tests/subagent-cleanup.test.ts`, updated RPC regressions, aligned default subagent docs and Pi README reload prose, and added the root changelog entry. Focused checks passed with inert fixtures; no live model or Herdr operation was run.

- [x] **T4 - Validate and integrate**
  - Depends on: T3.
  - Do: run agreed checks, record actual profile/results and limits, archive and merge locally.
  - Verify: target contains implementation plus dated archive with no active copy.
  - Done when: scoped correction is integrated or a concrete integration blocker is reported with worktree retained.
  - Evidence: On 2026-09-09 in the default profile, the four agreed Vitest files passed (36 tests), `pnpm run typecheck` passed, and `pnpm run check:runtime` passed. Task commit `c25864f1` archived the spec and was merged locally into recorded target `main` as `1dff1628`.

## Agreed validation and finish

From task worktree `pi/profiles/default`:

```sh
pnpm test subagent-cleanup.test.ts subagent-rpc.test.ts subagent-runtime.test.ts subagent-transport.test.ts
pnpm run typecheck
pnpm run check:runtime
```

`subagent-cleanup.test.ts` is proposed. Add clear/reset integration coverage to that fixture rather than a new broad live suite. These checks establish failure transitions, not physical Herdr focus or universal OS process-termination guarantees. Classify unrelated baseline failures and keep them out of scope. Fix demonstrated relevant failures, rerun affected checks, and stop when the agreed checks pass.

## Implementation ordering

This default-only correction has no predecessor plan. Finish its implementation, agreed checks and merge before starting `.specs/subagent-failure-reporting-and-control-ux/plan.md` implementation. Record the final resource-state/cleanup-error contract and integration commit here so the UX worktree can verify it contains that code. Do not fold UX rendering, terminal-tool failure provenance or control-description changes into this cleanup plan.

## Current handoff

- Status: completed and locally integrated on 2026-09-09.
- Completed: injected-failure reproduction, operator scope reconciliation, explicit cleanup contract, runtime/reset handling, finite regressions, documentation/changelog updates, agreed default-profile validation, task commit `c25864f1`, and merge `1dff1628` into recorded target `main`.
- Verification limit: no live model, production Herdr operation, physical focus check, or universal OS termination guarantee was exercised.
- Open operator decisions: none. Actual parent-exit persistence is explicitly not promised. No push or deployment was performed.

## Completion and archive

Set completed status and actual date after work/checks finish. Move the directory to `.specs/archive/default-subagent-cleanup-failures/` in the task worktree without overwriting an existing archive. Repair links. Commit implementation, changelog and archive together; merge into `main` while preserving unrelated target changes. If blocked, keep the worktree and report integration separately. Verify target/archive and absence of the active plan; rerun checks only if conflicts changed covered behavior. Remove the clean integrated worktree. No push.
