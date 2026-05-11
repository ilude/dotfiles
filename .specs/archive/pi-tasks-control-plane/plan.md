---
created: 2026-05-07
status: superseded
completed: 2026-05-11
---

# Plan: Pi Tasks Control Plane MVP

## Context & Motivation

The user asked to borrow the `tintinweb/pi-tasks` Pi extension behavior into this dotfiles repo. Research found that upstream provides Claude-style task tools, dependency DAGs, persistent display, output/stop/execute controls, storage scopes, auto-clear, and subagent integration. Open upstream issues/PRs highlighted missing persisted stats, widget noise controls, `TaskCreateMany`, silent persistence failure handling, and real-session friction reductions.

A PRD was written and adversarially reviewed at `.specs/pi-tasks-control-plane/PRD.md`. The reviewed decision is to implement a native MVP, not full upstream parity: evolve this repo's existing canonical task registry and `/tasks` surface, add create/list/get/update task tools including batch creation, add dependency/lifecycle/display/security contracts, and defer risky execution orchestration (`TaskExecute`, `TaskStop`, `TaskOutput`, auto-cascade, prompt output injection) to later phases.

## Constraints

- Platform: Windows Git Bash/MSYS2 (`MINGW64_NT-10.0-26200`) in `C:/Users/mglenn/.dotfiles`.
- Shell: bash is appropriate for git/pnpm validation; use pwsh only for Windows-native operations.
- Pi TypeScript is pnpm-only. Do not use npm/Bun in `pi/extensions` or `pi/tests`.
- Do not create helper `.ts` files at top level of `pi/extensions/`; every top-level `pi/extensions/*.ts` is auto-discovered as an extension factory.
- Use the existing `pi/lib/task-registry.ts` and `pi/lib/operator-state.ts` as the single source of truth; do not create a parallel tracker.
- Preserve existing registry behavior for current subagent/team producers.
- MVP must not register `TaskExecute`, `TaskStop`, or `TaskOutput` as working tools.
- MVP must not persist unredacted secrets, tokens, or sensitive data in metadata/output.
- No external credentials or network access are required for implementation.
- Existing user changes are present in the repo; do not overwrite unrelated edits.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Vendor `tintinweb/pi-tasks` directly | Fast import of many features | Duplicates registry, conflicts with repo conventions, brings execution/widget scope too early | Rejected |
| Install upstream package as-is | Minimal local implementation | Does not integrate with existing `task-registry` or subagent producers | Rejected |
| Full upstream parity in one pass | Maximum feature coverage | Too broad; mixes data model, execution, widget, auto-cascade, and safety risks | Rejected |
| Native MVP first, phased parity later | Fits existing architecture, safer, testable, smaller scope | Requires deliberate schema/tool work before richer features | **Selected** |
| Opposite pattern: ephemeral in-memory task list only | Simpler for throwaway sessions | Does not solve durable subagent/operator coordination in this repo | Rejected for this project |

## Objective

Produce a native Pi Tasks Control Plane MVP that:

1. Evolves the canonical task registry with backward-compatible task fields, `skipped` lifecycle support, execution stats, tombstone metadata, and safe mutation outcomes.
2. Adds dependency graph validation and bidirectional edge maintenance without graph corruption.
3. Adds redaction helpers so task metadata/output rendering cannot persist or display representative secrets.
4. Adds pure task rendering/settings support for `hidden`, `compact`, and `full` display modes.
5. Adds LLM-callable MVP tools: `TaskCreate`, `TaskCreateMany`, `TaskList`, `TaskGet`, and `TaskUpdate`.
6. Improves `/tasks` list/show/state-change behavior and fixes terminal filtering.
7. Passes Pi TypeScript typecheck and Vitest tests using pnpm.

## Project Context

- **Language**: TypeScript for Pi extensions/tests; Python/shell elsewhere in repo.
- **Marker files detected**: `pyproject.toml`, `Makefile`, `.gitattributes`; Pi-specific package manifests in `pi/extensions/package.json` and `pi/tests/package.json`.
- **Test command**: `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test`.
- **Lint/type command**: `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`.
- **Repo-wide validation**: `make check` exists, but this plan's authoritative Pi validation is the pnpm-only Pi command set above; optionally run `make check-pi-extensions` if available locally.
- **Relevant existing files**:
  - `pi/lib/task-registry.ts`
  - `pi/lib/operator-state.ts`
  - `pi/extensions/tasks.ts`
  - `pi/extensions/README.md`
  - `pi/tests/task-registry.test.ts`
  - `pi/tests/tasks.test.ts`
  - `pi/tests/subagent.test.ts`

## Implementation Contracts

- Lifecycle matrix: `pending -> running|blocked|completed|cancelled|skipped|failed`; `running -> blocked|completed|failed|cancelled|skipped`; `blocked -> pending|running|failed|cancelled|skipped`; `failed -> pending|running|cancelled|skipped`; `skipped -> pending`; `completed|cancelled` allow metadata/tombstone annotations only.
- `skipped` satisfies dependency readiness like `completed`; `cancelled`, `failed`, and deleted-without-tombstone do not unblock silently.
- T1 must choose and document one schema policy before broad implementation: backward-compatible `schemaVersion: 1` optional fields or explicit `TaskRecordV2` migration. Legacy v1 records with unknown fields must round-trip through list/get/update/transition/dependency/tool mutation paths.
- MVP batch/dependency mutation model is all-or-nothing. Injected write failure must leave persisted task files unchanged or return `conflict`/`persist_failed` with an explicit repair handle and deterministic recovery test.
- Create and batch create must support idempotent retry after `persist_failed` by client keys, deterministic aliases, or repair handles; retries must not duplicate partially persisted tasks.
- MVP tool schemas must be TypeBox-compatible through existing Pi `registerTool` patterns. Tests must assert exact names, required fields, status enum, dependency/filter fields, and outcome codes.
- Deferred tools `TaskExecute`, `TaskStop`, and `TaskOutput` must be absent from registered MVP tools, or return explicit non-success `deferred` and perform no shell/subagent execution.
- Extension-to-lib imports from `pi/extensions/*.ts` use `../lib/*.js`; lib-to-lib and test-to-source imports follow current `.ts` repo pattern unless changed globally.
- Reusable schemas/helpers live in `pi/lib/` or a non-auto-discovered subdirectory; do not add top-level helper files like `pi/extensions/task-tool-schemas.ts`.
- Clean-checkout Vitest commands must first ensure `pi/extensions` dependencies are installed because `pi/tests` depends on Pi packages from `pi/extensions/node_modules`.
- Redaction/rejection is mandatory at every task ingress and egress path before persistence, rendering, and tool/slash-command output, but verification is staged by wave: T2/V1 covers helper plus registry paths; T4/V2 covers renderer paths; T5/T6/V3 covers tool and slash-command paths.
- Tests must use fake sentinel secrets only, such as `pi_test_secret_12345` and synthetic invalid PEM blocks. Do not commit real-looking credentials, valid private keys, or live high-entropy tokens.
- Archive preflight must scan evidence logs and git diff for sentinel/private-key markers and fail archive if matches remain.
- Canonical `/tasks` grammar: `/tasks|/tasks list`, `/tasks list --all`, `/tasks show <id-prefix>`, `/tasks create`, `/tasks start <id>`, `/tasks complete <id>`, `/tasks skip <id>`, `/tasks cancel <id>`, `/tasks retry|reopen <id>`, `/tasks clear completed`, `/tasks settings`, `/tasks settings mode compact|full|hidden`, `/tasks help`.
- Compact display priority must surface urgent states before pending work: `failed`, `blocked`, `running`, `pending`, then terminal summary counts.
- Warning copy must include attempted action, safe task id/title, reason, persistence status, and a suggested next command. Retry/reopen output must state that it does not execute work.

## Automation Plan

| Operation | Command/wrapper | Credentials | Evidence |
|-----------|-----------------|-------------|----------|
| Preflight | `mkdir -p .specs/pi-tasks-control-plane/evidence && { git status --short && cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck && cd ../tests && pnpm install --frozen-lockfile && pnpm run test -- task-registry.test.ts tasks.test.ts; } 2>&1 | tee .specs/pi-tasks-control-plane/evidence/preflight.log; test ${PIPESTATUS[0]} -eq 0` | none | `.specs/pi-tasks-control-plane/evidence/preflight.log` |
| Implement | repo edits via Pi edit tools; no deployment | none | git diff plus task-specific test outputs |
| Verify task-specific tests | `{ cd pi/extensions && pnpm install --frozen-lockfile && cd ../tests && pnpm install --frozen-lockfile && pnpm run test -- task-registry.test.ts task-dependencies.test.ts task-security.test.ts task-renderer.test.ts task-tools.test.ts tasks.test.ts; } 2>&1 | tee .specs/pi-tasks-control-plane/evidence/task-tests.log; test ${PIPESTATUS[0]} -eq 0` | none | `.specs/pi-tasks-control-plane/evidence/task-tests.log` |
| Typecheck | `{ cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck; } 2>&1 | tee .specs/pi-tasks-control-plane/evidence/typecheck.log; test ${PIPESTATUS[0]} -eq 0` | none | `.specs/pi-tasks-control-plane/evidence/typecheck.log` |
| Full Pi tests | `{ cd pi/extensions && pnpm install --frozen-lockfile && cd ../tests && pnpm install --frozen-lockfile && pnpm run test; } 2>&1 | tee .specs/pi-tasks-control-plane/evidence/pi-tests.log; test ${PIPESTATUS[0]} -eq 0` | none | `.specs/pi-tasks-control-plane/evidence/pi-tests.log` |
| Repo validation | `make check-pi-extensions 2>&1 | tee .specs/pi-tasks-control-plane/evidence/repo-validation.log; test ${PIPESTATUS[0]} -eq 0` | none | `.specs/pi-tasks-control-plane/evidence/repo-validation.log` |
| Deploy | not applicable; local dotfiles extension code only | none | none |
| Rollback | Path-scoped only: write intended-file manifest from `git diff --name-only`, review with user, then revert only confirmed paths; never broad checkout/reset and never without explicit confirmation | none | rollback manifest and user confirmation |

## Execution Checklist

This checklist is the durable resume ledger for `/do-it`. Every executable task, validation gate, and final completion gate has exactly one matching checkbox. Checked means verified complete; unchecked means pending, in-progress, blocked, or invalidated.

`/do-it` must mark each item `[x]` immediately after that item passes its required verification and before starting any dependent or next sequential step. `/review-it` must preserve checked state, add unchecked items for new executable work, and never mark implementation or validation work complete.

### Preflight

- [ ] P0: Preflight validation and evidence directory ready
  - Status: pending
  - Evidence: --

### Wave 1

- [ ] T1: Evolve task registry schema, lifecycle, persistence outcomes, and stats
  - Status: pending
  - Evidence: --
- [ ] T2: Add task security redaction helper and tests
  - Status: pending
  - Evidence: --
- [ ] V1: Validate wave 1 foundation
  - Status: pending
  - Evidence: --

### Wave 2

- [ ] T3: Add dependency graph helper and invariant tests
  - Status: pending
  - Evidence: --
- [ ] T4: Add task renderer/settings helper and tests
  - Status: pending
  - Evidence: --
- [ ] V2: Validate wave 2 graph/render integration
  - Status: pending
  - Evidence: --

### Wave 3

- [ ] T5: Add MVP task tools extension and tool tests
  - Status: pending
  - Evidence: --
- [ ] T6: Upgrade `/tasks` command surface and tests
  - Status: pending
  - Evidence: --
- [ ] V3: Validate wave 3 tool and command integration
  - Status: pending
  - Evidence: --

### Wave 4

- [ ] T7: Final documentation, evidence capture, and cleanup
  - Status: pending
  - Evidence: --
- [ ] V4: Validate final Pi MVP integration
  - Status: pending
  - Evidence: --

### Final Gates

- [ ] F1: Task-specific verification complete
  - Status: pending
  - Evidence: --
- [ ] F2: Repo-wide validation complete
  - Status: pending
  - Evidence: --
- [ ] F3: Manual validation complete or not required
  - Status: pending
  - Evidence: --
- [ ] F4: Deployment validation complete or not required
  - Status: pending
  - Evidence: --
- [ ] F5: Archive preflight complete
  - Status: pending
  - Evidence: --

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| P0 | Preflight validation and evidence directory ready | -- | validation | small | qa-engineer | -- |
| T1 | Evolve task registry schema, lifecycle, persistence outcomes, and stats | 3-4: `pi/lib/task-registry.ts`, `pi/lib/operator-state.ts`, `pi/tests/task-registry.test.ts`, fixtures if needed | feature | medium | typescript-pro | P0 |
| T2 | Add task security redaction helper and tests | 2-3: `pi/lib/task-security.ts`, `pi/tests/task-security.test.ts`, registry/tool/render integration tests | feature | medium | security-reviewer | P0 |
| V1 | Validate wave 1 foundation | -- | validation | medium | qa-engineer | T1, T2 |
| T3 | Add dependency graph helper and invariant tests | 2-3: `pi/lib/task-dependencies.ts`, `pi/tests/task-dependencies.test.ts`, registry integration | feature | medium | backend-dev | V1 |
| T4 | Add task renderer/settings helper and tests | 3: `pi/lib/task-renderer.ts`, `pi/lib/task-settings.ts`, `pi/tests/task-renderer.test.ts` | feature | medium | typescript-pro | V1 |
| V2 | Validate wave 2 graph/render integration | -- | validation | medium | qa-engineer | T3, T4 |
| T5 | Add MVP task tools extension and tool tests | 3-4: `pi/extensions/task-tools.ts`, `pi/tests/task-tools.test.ts`, `pi/lib/task-registry.ts`, helpers | feature | medium | typescript-pro | V2 |
| T6 | Upgrade `/tasks` command surface and tests | 2-3: `pi/extensions/tasks.ts`, `pi/tests/tasks.test.ts`, renderer/settings helpers | feature | medium | typescript-pro | V2 |
| V3 | Validate wave 3 tool and command integration | -- | validation | medium | qa-engineer | T5, T6 |
| T7 | Final documentation, evidence capture, and cleanup | 2-3: `pi/README.md` or `pi/extensions/README.md` if needed, `.specs/pi-tasks-control-plane/evidence/*`, plan status notes | mechanical | small | coding-light | V3 |
| V4 | Validate final Pi MVP integration | -- | validation | medium | qa-engineer | T7 |

## Execution Waves

### Preflight

**P0: Preflight validation and evidence directory ready** [small] -- qa-engineer
- Description: Prepare evidence directory and verify Pi dependencies/tests are runnable from this checkout before implementation.
- Files: `.specs/pi-tasks-control-plane/evidence/preflight.log`
- Acceptance Criteria:
  1. [ ] Evidence directory exists and preflight command is captured.
     - Verify: `mkdir -p .specs/pi-tasks-control-plane/evidence && { git status --short && cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck && cd ../tests && pnpm install --frozen-lockfile && pnpm run test -- task-registry.test.ts tasks.test.ts; } 2>&1 | tee .specs/pi-tasks-control-plane/evidence/preflight.log; test ${PIPESTATUS[0]} -eq 0`
     - Pass: command exits 0 and `preflight.log` exists with non-secret output.
     - Fail: fix dependency/test infrastructure before editing implementation files.

### Wave 1 (parallel)

**T1: Evolve task registry schema, lifecycle, persistence outcomes, and stats** [medium] -- typescript-pro
- Description: Extend the canonical registry without creating a second tracker. Add optional MVP fields, `skipped` state support, terminal filtering awareness, execution stats persistence, tombstone metadata, and typed mutation outcomes. Preserve legacy v1 fixture loading and unknown fields unless intentionally migrated.
- Files: `pi/lib/task-registry.ts`, `pi/lib/operator-state.ts`, `pi/tests/task-registry.test.ts`, optional `pi/tests/fixtures/task-record-v1.json`.
- Acceptance Criteria:
  1. [ ] Legacy records load with defaults.
     - Verify: `cd pi/tests && pnpm run test -- task-registry.test.ts -t "loads legacy task records"`
     - Pass: v1 fixture records load, keep existing fields, and get safe defaults for new optional fields.
     - Fail: records return null, lose fields, or corrupt JSON is treated the same as legacy JSON.
  2. [ ] `skipped` lifecycle transitions are enforced.
     - Verify: `cd pi/tests && pnpm run test -- task-registry.test.ts -t "skipped transitions"`
     - Pass: allowed transitions match the PRD and invalid transitions return/throw typed validation errors.
     - Fail: `skipped` behaves accidentally like `completed`/`cancelled` or cannot be explicitly reopened to `pending`.
  3. [ ] Stats persist across reload.
     - Verify: `cd pi/tests && pnpm run test -- task-registry.test.ts -t "execution stats persist"`
     - Pass: start/end/duration/token usage survive read-after-write and process reload simulation.
     - Fail: stats disappear after task completion or reload.
  4. [ ] Persistence outcomes are typed.
     - Verify: `cd pi/tests && pnpm run test -- task-registry.test.ts -t "persistence failure"`
     - Pass: failed writes do not report success and produce `persist_failed` or an equivalent typed error outcome.
     - Fail: tests can pass by checking only warning text while durable state is inconsistent.

**T2: Add task security redaction helper and tests** [medium] -- security-reviewer
- Description: Add a small reusable helper for redacting or rejecting representative secrets before task metadata/output is persisted or rendered. Keep scope pragmatic: cover common token/key patterns without introducing heavyweight secret scanning dependencies unless already present.
- Files: `pi/lib/task-security.ts`, `pi/tests/task-security.test.ts`, optional integration call sites in `pi/lib/task-registry.ts` after T1 shape is known.
- Acceptance Criteria:
  1. [ ] Representative secrets are redacted or rejected before persistence/rendering.
     - Verify: `cd pi/tests && pnpm run test -- task-security.test.ts`
     - Pass: tests cover common API-token/private-key-like strings in prompt, metadata, and output-like fields.
     - Fail: raw representative secrets appear in serialized task data or renderer/tool output fixtures.
  2. [ ] Redaction failure is non-success.
     - Verify: `cd pi/tests && pnpm run test -- task-security.test.ts -t "redaction failure"`
     - Pass: invalid/sensitive inputs return a validation/redaction failure outcome, not `ok`.
     - Fail: helper silently drops data without warning or returns success after failing to inspect input.
  3. [ ] Redaction is integrated with registry persistence paths available after T1.
     - Verify: `cd pi/tests && pnpm run test -- task-security.test.ts -t "registry redaction integration"`
     - Pass: raw sentinel strings are absent from serialized task JSON and registry read/update fixtures.
     - Fail: helper tests pass but registry ingress/egress paths leak raw sentinel values.

### Wave 1 -- Validation Gate

**V1: Validate wave 1 foundation** [medium] -- qa-engineer
- Blocked by: T1, T2
- Checks:
  1. Run T1 and T2 acceptance criteria.
  2. `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck` -- TypeScript compiles.
  3. `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test -- task-registry.test.ts task-security.test.ts` -- foundation tests pass.
  4. Confirm no new top-level helper files were added under `pi/extensions/` except intended extension entrypoints.
- On failure: create a focused fix task for the failing area, rerun V1, and do not start Wave 2 until V1 passes.

### Wave 2 (parallel)

**T3: Add dependency graph helper and invariant tests** [medium] -- backend-dev
- Blocked by: V1
- Description: Implement dependency edge normalization and validation around the evolved registry. Preserve bidirectional `blocks`/`blockedBy` views, reject self-edges/duplicates/cycles, and define all-or-nothing or repair-record behavior for partial writes.
- Files: `pi/lib/task-dependencies.ts`, `pi/tests/task-dependencies.test.ts`, likely integration points in `pi/lib/task-registry.ts`.
- Acceptance Criteria:
  1. [ ] Graph invariants are enforced.
     - Verify: `cd pi/tests && pnpm run test -- task-dependencies.test.ts`
     - Pass: self-edges, duplicate edges, cycles, dangling references, tombstone references, and valid dependencies have explicit tests.
     - Fail: dependency graph can become one-sided, cyclic, or silently corrupted.
  2. [ ] Partial-write behavior is tested.
     - Verify: `cd pi/tests && pnpm run test -- task-dependencies.test.ts -t "partial write"`
     - Pass: simulated write interruption either rolls back or leaves explicit repair state/warning.
     - Fail: one side of `blocks`/`blockedBy` persists without detectable conflict.

**T4: Add task renderer/settings helper and tests** [medium] -- typescript-pro
- Blocked by: V1
- Description: Implement pure rendering and settings helpers for `hidden`, `compact`, and `full` modes. Do not depend on persistent widget APIs. Use the PRD priority order and ensure `/tasks` can use the same renderer.
- Files: `pi/lib/task-renderer.ts`, `pi/lib/task-settings.ts`, `pi/tests/task-renderer.test.ts`.
- Acceptance Criteria:
  1. [ ] Display modes render deterministic output.
     - Verify: `cd pi/tests && pnpm run test -- task-renderer.test.ts`
     - Pass: tests cover zero, one, many, blocked, running, failed, skipped, completed, and cancelled tasks in hidden/compact/full modes.
     - Fail: renderer ignores mode, requires UI widget APIs, or emits terminal noise by default.
  2. [ ] Settings default to low-noise compact mode.
     - Verify: `cd pi/tests && pnpm run test -- task-renderer.test.ts -t "default compact"`
     - Pass: default compact output shows at most two highest-priority non-terminal tasks plus summary counts.
     - Fail: default output is full/noisy or priority order is nondeterministic.

### Wave 2 -- Validation Gate

**V2: Validate wave 2 graph/render integration** [medium] -- qa-engineer
- Blocked by: T3, T4
- Checks:
  1. Run T3 and T4 acceptance criteria.
  2. `cd pi/tests && pnpm run test -- task-registry.test.ts task-dependencies.test.ts task-renderer.test.ts task-security.test.ts` -- all foundation/helper tests pass together.
  3. Verify renderer output handles dependency/tombstone/skipped data from the real registry shape, not only hand-rolled fixtures.
  4. `cd pi/extensions && pnpm run typecheck` -- helper imports compile.
  5. Renderer redaction integration test passes: `cd pi/tests && pnpm run test -- task-renderer.test.ts -t "redacts rendered task fields"`.
- On failure: fix integration mismatches before starting Wave 3.

### Wave 3 (parallel)

**T5: Add MVP task tools extension and tool tests** [medium] -- typescript-pro
- Blocked by: V2
- Description: Add `pi/extensions/task-tools.ts` as the only new top-level extension entrypoint for MVP tools. Register `TaskCreate`, `TaskCreateMany`, `TaskList`, `TaskGet`, and `TaskUpdate` with explicit schemas/result shapes. Do not register working `TaskExecute`, `TaskStop`, or `TaskOutput` in MVP.
- Files: `pi/extensions/task-tools.ts`, `pi/tests/task-tools.test.ts`, helper modules under `pi/lib/`.
- Acceptance Criteria:
  1. [ ] MVP tools register with expected names and schemas.
     - Verify: `cd pi/tests && pnpm run test -- task-tools.test.ts -t "registers task tools"`
     - Pass: mocked `ExtensionAPI` captures exact MVP tool names and schema essentials.
     - Fail: typecheck passes but tools are missing, misnamed, or schema-incomplete.
  2. [ ] `TaskCreateMany` supports batch dependency creation.
     - Verify: `cd pi/tests && pnpm run test -- task-tools.test.ts -t "TaskCreateMany"`
     - Pass: empty arrays reject; single/multi batches work; invalid dependency batch fails without silent partial graph corruption.
     - Fail: follow-up `TaskUpdate` is required to wire normal intra-batch dependencies.
  3. [ ] Tool results use typed outcomes and redaction.
     - Verify: `cd pi/tests && pnpm run test -- task-tools.test.ts -t "typed outcomes"`
     - Pass: validation, not-found, persistence, and redaction failures produce non-success tool results.
     - Fail: errors are ad hoc strings or report success after failure.

**T6: Upgrade `/tasks` command surface and tests** [medium] -- typescript-pro
- Blocked by: V2
- Description: Update the existing slash command to use the new renderer/settings and registry state model. Fix terminal filtering, add `skip`, `complete`, `start`, `clear completed`, and help/settings behavior where feasible for MVP. Keep retry semantics explicit: retry reopens/marks runnable; it does not execute work.
- Files: `pi/extensions/tasks.ts`, `pi/tests/tasks.test.ts`, shared renderer/settings helpers.
- Acceptance Criteria:
  1. [ ] Terminal filtering bug is fixed.
     - Verify: `cd pi/tests && pnpm run test -- tasks.test.ts -t "hides terminal tasks by default"`
     - Pass: completed/cancelled/skipped tasks are hidden by default and visible with explicit all/show behavior.
     - Fail: the existing `|| true` behavior or equivalent terminal noise remains.
  2. [ ] New state commands are explicit and safe.
     - Verify: `cd pi/tests && pnpm run test -- tasks.test.ts -t "state commands"`
     - Pass: start/complete/skip/cancel/retry route through lifecycle validation and rejected transitions produce warnings.
     - Fail: slash command bypasses transition invariants or reports retry as execution.
  3. [ ] `/tasks help` documents MVP grammar.
     - Verify: `cd pi/tests && pnpm run test -- tasks.test.ts -t "help"`
     - Pass: help output mentions list/show/create/start/complete/skip/cancel/retry/clear completed/settings or the exact implemented MVP subset.
     - Fail: users must infer command grammar from failures.

### Wave 3 -- Validation Gate

**V3: Validate wave 3 tool and command integration** [medium] -- qa-engineer
- Blocked by: T5, T6
- Checks:
  1. Run T5 and T6 acceptance criteria.
  2. `cd pi/tests && pnpm run test -- task-tools.test.ts tasks.test.ts task-registry.test.ts task-dependencies.test.ts task-renderer.test.ts task-security.test.ts` -- all MVP-specific tests pass together.
  3. `cd pi/extensions && pnpm run typecheck` -- no extension type errors.
  4. Confirm no deferred execution tools are registered as working tools.
  5. `find pi/extensions -maxdepth 1 -type f -name "*task*.ts" | sort` shows only intended extension entrypoints such as `pi/extensions/tasks.ts` and `pi/extensions/task-tools.ts`; reusable helpers/schemas are under `pi/lib/` or non-auto-discovered directories.
  6. Tool and slash-command redaction integration tests pass: `cd pi/tests && pnpm run test -- task-tools.test.ts tasks.test.ts -t "redaction"`.
- On failure: add a focused fix task and rerun V3 before Wave 4.

### Wave 4

**T7: Final documentation, evidence capture, and cleanup** [small] -- coding-light
- Blocked by: V3
- Description: Update minimal docs only where necessary to make the new MVP discoverable and leave evidence files/logs for validation. Avoid broad README churn. Confirm generated/runtime task state is not committed.
- Files: `pi/extensions/README.md` or `pi/README.md` if needed, `.specs/pi-tasks-control-plane/evidence/*`, possibly `.gitignore` only if new generated evidence/state paths require it.
- Acceptance Criteria:
  1. [ ] MVP usage and deferred scope are documented.
     - Verify: `grep -R "TaskCreateMany\|skipped\|TaskExecute" pi/README.md pi/extensions/README.md .specs/pi-tasks-control-plane/plan.md`
     - Pass: docs or plan clearly state MVP tools and that execution tools are deferred.
     - Fail: documentation implies full upstream parity or working deferred tools.
  2. [ ] Evidence directory contains validation logs.
     - Verify: `find .specs/pi-tasks-control-plane/evidence -maxdepth 1 -type f | sort`
     - Pass: expected logs exist after validation runs and contain non-secret pass/fail output.
     - Fail: no durable evidence is captured for `/do-it` resume/archive decisions.

### Wave 4 -- Validation Gate

**V4: Validate final Pi MVP integration** [medium] -- qa-engineer
- Blocked by: T7
- Checks:
  1. `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`.
  2. `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test`.
  3. `make check-pi-extensions` is required because this repo defines it; only treat failure as non-blocking if it is proven unrelated infrastructure failure and documented in evidence.
  4. Inspect `git status --short` and ensure only intended source/spec files changed; no `.env`, secrets, generated runtime task files, or package-lock files are present.
- On failure: do not mark final gates complete; create/fix focused tasks and rerun V4.

## Dependency Graph

```
Preflight: P0
Wave 1: T1, T2 (parallel, both depend on P0) -> V1
Wave 2: T3, T4 (parallel, both depend on V1) -> V2
Wave 3: T5, T6 (parallel, both depend on V2) -> V3
Wave 4: T7 (depends on V3) -> V4
Final Gates: V4 -> F1 -> F2 -> F3 -> F4 -> F5
```

## Success Criteria

1. [ ] The native MVP task control plane is implemented without a parallel tracker.
   - Verify: `grep -R "createTask\|TaskRecord" pi/lib pi/extensions/task-tools.ts pi/extensions/tasks.ts | head -80`
   - Pass: task tools and slash command use `pi/lib/task-registry.ts`/helpers, not a second independent task store.
2. [ ] MVP task tools are available and deferred tools are not falsely registered.
   - Verify: `cd pi/tests && pnpm run test -- task-tools.test.ts -t "registers task tools"`
   - Pass: `TaskCreate`, `TaskCreateMany`, `TaskList`, `TaskGet`, and `TaskUpdate` are registered; `TaskExecute`, `TaskStop`, and `TaskOutput` are absent or explicitly deferred in docs only.
3. [ ] Registry, dependency, security, renderer, tool, and slash-command tests pass together.
   - Verify: `cd pi/tests && pnpm run test -- task-registry.test.ts task-dependencies.test.ts task-security.test.ts task-renderer.test.ts task-tools.test.ts tasks.test.ts`
   - Pass: Vitest exits 0 with no unexpected warnings.
4. [ ] Full Pi validation passes.
   - Verify: `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck && cd ../tests && pnpm install --frozen-lockfile && pnpm run test`
   - Pass: both commands exit 0.

## Validation Contract

`/do-it` must satisfy this contract before reporting the plan complete or archiving it.

### Automation completeness

- Required: yes.
- `/do-it` must run all validation through documented commands above.
- Credentials required: none.
- Manual-only steps: none required; manual review of UI is optional and must not block archive if automated renderer/slash-command tests pass.

### Required automated validation

1. [ ] Run Pi extension typecheck.
   - Command: `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`
   - Pass: exits 0 with no TypeScript errors.
   - Fail: do not archive; update `## Execution Status` with the failing command and next fix.

2. [ ] Run full Pi tests.
   - Command: `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test`
   - Pass: exits 0 with no failing tests.
   - Fail: do not archive; create/fix a task, rerun affected checks, then rerun full Pi tests.

3. [ ] Run task-specific verification from every acceptance criterion above.
   - Command: see each task's `Verify:` command.
   - Pass: every acceptance criterion passes exactly as written.
   - Fail: create/fix a task, rerun affected checks, then rerun full validation.

4. [ ] Run repo wrapper.
   - Command: `make check-pi-extensions`
   - Pass: exits 0 and validates the repo-owned Pi wrapper.
   - Fail: do not archive unless failure is proven unrelated to this plan and documented.

### Manual validation

- Required: no.
- Steps:
  1. None. Optional operator smoke testing in a live Pi session may be recorded, but automated tests are the required acceptance gate.

If manual validation is voluntarily performed and fails, `/do-it` must classify the result as `implemented-awaiting-fix`, update `## Execution Status`, and must not archive the plan until the issue is resolved or explicitly declared out of scope.

### Deployment validation

- Required: no.
- Procedure: None. This is local dotfiles source code; no deploy/push is part of this plan.

If deployment is requested separately, create a new plan or explicit follow-up before pushing/rolling out.

### Archive rule

Before archive, run:

```bash
! grep -R -nE "pi_test_secret_|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|AKIA[0-9A-Z]{16}" .specs/pi-tasks-control-plane/evidence 2>/dev/null && ! grep -R -nE "BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|AKIA[0-9A-Z]{16}" pi/tests 2>/dev/null
```

This scan rejects sentinel/private-key markers in evidence logs and rejects real-looking private-key/AWS-key patterns in tests. Fake sentinel literals such as `pi_test_secret_12345` are allowed in committed test files only; they must not appear in evidence logs or rendered/tool output artifacts.

`/do-it` may archive this plan only after all required automated validation, task-specific verification, manual validation completion-or-not-required, deployment validation completion-or-not-required, repo-wide validation, and archive preflight pass. Evidence logs should be stored under `.specs/pi-tasks-control-plane/evidence/` and must not contain secrets.

### Final gate evidence mapping

- F1 evidence: `.specs/pi-tasks-control-plane/evidence/task-tests.log` plus any focused task logs referenced by failed/retried work.
- F2 evidence: `.specs/pi-tasks-control-plane/evidence/typecheck.log`, `.specs/pi-tasks-control-plane/evidence/pi-tests.log`, and `.specs/pi-tasks-control-plane/evidence/repo-validation.log`.
- F3 evidence: checklist note stating manual validation is not required, or optional smoke-test notes if performed.
- F4 evidence: checklist note stating deployment validation is not required.
- F5 evidence: archive preflight secret-scan command output and clean `git status --short` review showing no secret/runtime/generated files.

## Execution Status

- Status: superseded on 2026-05-11 by `.specs/pi-control-plane-consolidation/plan.md`; not started for this MVP plan, but some prerequisite/operator-layer task infrastructure already exists.
- Last completed item: none for this plan's checklist.
- Current blocker: none; start at P0 if executing this plan.
- Existing code found on 2026-05-11: `pi/lib/task-registry.ts`, `pi/extensions/tasks.ts`, `pi/tests/task-registry.test.ts`, and `pi/tests/tasks.test.ts` implement the earlier operator-layer task registry and basic `/tasks` surface.
- Existing coverage is partial relative to this plan: durable task records, basic lifecycle, task stats fields, urgency grouping, `/tasks` list/show/cancel/retry behavior, and registry tests exist.
- Not yet complete for this plan: no `TaskCreateMany`/MVP task tools extension was found, no dependency DAG fields such as `blocks`/`blockedBy`, no `skipped` state in the current urgency/state set, no display settings helper for `hidden|compact|full`, no tombstone/persist_failed control-plane outcomes, and no evidence directory logs for this plan.
- Validation evidence: `make check` passed on 2026-05-11, so existing task code is currently green, but that does not satisfy this MVP plan's unchecked acceptance gates.
- Next safe action: continue remaining task-control-plane work from `.specs/pi-control-plane-consolidation/plan.md`, reusing existing registry/command code instead of rebuilding it.

## Handoff Notes

- Start by reading `.specs/pi-tasks-control-plane/PRD.md` and `.specs/pi-tasks-control-plane/review-1/synthesis.md` for product rationale, but execute this `plan.md` as the source of truth.
- Use `PI_OPERATOR_DIR` in tests to isolate registry state in temp directories.
- Prefer TypeBox schemas consistent with existing Pi extension patterns.
- Import helpers with existing ESM `.js` import style where applicable.
- Do not touch `.env` files or persist secrets in task fixtures.
- Do not use `npm install`, `npm test`, `bun install`, or `bun test` for Pi TypeScript work.
- If implementation reveals that schema migration to `TaskRecordV2` is larger than expected, pause after T1/V1 and update this plan before broad tool work.
