---
created: 2026-05-03
status: completed
completed: 2026-05-03
---

# Plan: Pi auto-resume watchdog for transient WebSocket interruptions

## Context & Motivation

Pi sessions sometimes stop after a transient `WebSocket error`, especially around long tool output or file writes. Manual recovery is usually sending `continue`. Research found that a write-specific retry hook is unsafe and too narrow: the write may already have succeeded, and a PostToolUse hook may not run if the transport/session loop is interrupted. Pi exposes lifecycle events and message APIs that may support a generalized liveness watchdog, but literal transport-error observability is not yet proven. Therefore this plan starts with a mandatory feasibility gate, then implements the smallest safe recovery path: observe-only or manually enabled guarded continuation with bounded automation.

## Constraints

- Platform: Windows via MSYS2/Git Bash (`MINGW64_NT-10.0-26200`)
- Shell: `/usr/bin/bash`
- Keep changes idempotent and LF-only.
- Pi TypeScript validation is pnpm-only: `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`.
- Auto-resume must never replay tools directly; it must ask the agent to verify the last operation before repeating it.
- First release must be conservative: default `observe-only` unless T1 proves reliable runtime interruption detection and the executor explicitly documents why auto mode is safe.
- Required defaults unless T1 justifies different values: enabled mode `observe-only`, stale threshold `90s`, max auto-resumes `1 per user prompt` and `3 per session`, cooldown `5m`, no resume while Pi built-in auto-retry is active, user-visible notification on every detection/resume.
- Rollback/disable must be documented: set mode to disabled/remove extension, reload Pi, verify no watchdog status or notifications remain.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Write-specific PostToolUse retry hook | Targets observed write failure | May not run; can duplicate successful writes; misses non-write stalls | Rejected: unsafe and too narrow |
| Atomic retrying write wrapper | Improves file-write reliability | Does not resume stalled agent loop; risks diverging from upstream tools | Rejected for this plan |
| Observe-only detector plus manual `/resume-safe` command | Safest first step; proves visibility before automation | Does not fully remove manual intervention until auto mode is enabled | **Selected as fallback/minimum** |
| General liveness watchdog with bounded guarded continuation | Solves manual `continue` problem across tools | Needs reliable event/error detection and strong loop protection | **Selected only after T1 feasibility gate** |
| Immediate Pi core patch | Could fix root cause | Higher maintenance and exact failing path is unproven | Rejected initially |

## Objective

Produce a Pi-native interruption watchdog that first observes and reports likely stalled runs, provides a safe manual `/resume-safe` continuation, and enables bounded auto-continuation only if feasibility is proven. The completed work must include concrete defaults, rollback docs, executable state-transition validation, negative tests, and manual runtime validation.

## Project Context

- **Language**: Python, shell, and Pi TypeScript extensions
- **Test command**: `make test`; focused validation uses `make test-quick`
- **Lint command**: `make lint`

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Feasibility gate: map Pi event/error observability | 1-2 | feature | medium | planning-lead | -- |
| V1 | Validate feasibility gate | -- | validation | medium | validation-lead | T1 |
| T2 | Implement conservative watchdog and `/resume-safe` | 1-3 | feature | medium | builder | V1 |
| T3 | Add executable watchdog tests/harness | 1-3 | feature | medium | eval-engineer | V1 |
| V2 | Validate implementation wave | -- | validation | medium | validation-lead | T2, T3 |
| T4 | Document configuration, defaults, rollback, and limits | 1-2 | mechanical | small | technical-writer | V2 |
| V3 | Validate documentation and final contract | -- | validation | medium | validation-lead | T4 |

## Execution Waves

### Wave 1

**T1: Feasibility gate: map Pi event/error observability** [medium] -- planning-lead
- Description: Inspect Pi extension docs/types and existing patterns to decide whether literal `WebSocket error` or only idle/stall state is observable from extensions. Produce a committed note or code comment with a hard decision: `extension-auto-ok`, `extension-observe-only`, or `runtime-patch-required`.
- Files: likely `pi/extensions/auto-resume-watchdog.ts` comments or `pi/README.md` note.
- Acceptance Criteria:
  1. [ ] Decision is explicit and evidence-backed.
     - Verify: `grep -R "extension-auto-ok\|extension-observe-only\|runtime-patch-required" -n pi/extensions pi/README.md --exclude-dir=node_modules`
     - Pass: one decision marker exists with cited event/API evidence.
     - Fail: inspect installed `.d.ts` files and docs before implementation.
  2. [ ] T1 defines final mode and defaults for T2.
     - Verify: `grep -R "observe-only\|90s\|5m\|max auto-resumes" -n pi/extensions pi/README.md --exclude-dir=node_modules`
     - Pass: defaults are documented or explicitly overridden with rationale.
     - Fail: do not start T2/T3.

### Wave 1 -- Validation Gate

**V1: Validate feasibility gate** [medium] -- validation-lead
- Blocked by: T1
- Checks:
  1. Run T1 acceptance criteria.
  2. Confirm T2 scope matches T1 decision: auto mode only if `extension-auto-ok`; otherwise observe-only plus `/resume-safe` or runtime follow-up.
- On failure: create a fix task and do not proceed to implementation.

### Wave 2 (parallel)

**T2: Implement conservative watchdog and `/resume-safe`** [medium] -- builder
- Blocked by: V1
- Description: Add a Pi extension that tracks lifecycle state, records last tool context, notifies on likely stalls, and registers `/resume-safe`. If T1 allows auto mode, implement bounded guarded auto-continuation behind explicit config; otherwise keep observe-only/manual recovery. Do not replay tools directly.
- Files: likely `pi/extensions/auto-resume-watchdog.ts` plus optional helper.
- Acceptance Criteria:
  1. [ ] Extension implements state tracking and guarded continuation only.
     - Verify: `cd pi/extensions && pnpm run typecheck`
     - Pass: typecheck exits 0; code has no direct tool replay path.
     - Fail: fix typing/runtime API usage or remove unsupported feature.
  2. [ ] Loop protection and rollback controls exist.
     - Verify: `grep -R "observe-only\|disabled\|cooldown\|max.*resume\|auto_retry" -n pi/extensions --exclude-dir=node_modules`
     - Pass: mode, cooldown, max attempts, and built-in auto-retry guard are implemented.
     - Fail: add controls before validation.

**T3: Add executable watchdog tests/harness** [medium] -- eval-engineer
- Blocked by: V1
- Description: Add `pi/extensions/auto-resume-watchdog-test.mjs`, an executable Node harness for watchdog state transitions. Cover: stale active run, exactly one guarded continuation in auto mode, observe-only detection without sending, cooldown/max attempts, `agent_end` reset, long-running valid tool not resumed early, built-in auto-retry active, provider outage/no activity, and active user steering/follow-up.
- Files: `pi/extensions/auto-resume-watchdog-test.mjs` plus optional test helper exports from `pi/extensions/auto-resume-watchdog.ts`.
- Acceptance Criteria:
  1. [ ] Tests/harness execute, not just grep/typecheck.
     - Verify: `cd pi/extensions && pnpm run typecheck && node ./auto-resume-watchdog-test.mjs`
     - Pass: command exits 0 and prints `auto-resume-watchdog tests passed`.
     - Fail: nonzero exit, missing file, missing expected output, or test command hidden behind `|| true`.
  2. [ ] Negative cases are covered by executable assertions.
     - Verify: `cd pi/extensions && node ./auto-resume-watchdog-test.mjs`
     - Pass: harness exits 0, prints `auto-resume-watchdog tests passed`, and includes assertions for long-running valid tool, built-in auto-retry active, provider outage/no activity, active steering/follow-up, observe-only mode, cooldown, and max attempts.
     - Fail: add executable assertions before validation.

### Wave 2 -- Validation Gate

**V2: Validate implementation wave** [medium] -- validation-lead
- Blocked by: T2, T3
- Checks:
  1. Run acceptance criteria for T2 and T3.
  2. `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck` -- exits 0.
  3. `make test-quick` -- passes.
  4. Cross-task integration: T3 actually exercises T2 behavior and respects T1 decision.
- On failure: create a fix task, re-validate after fix.

### Wave 3

**T4: Document configuration, defaults, rollback, and limits** [small] -- technical-writer
- Blocked by: V2
- Description: Document mode (`disabled`, `observe-only`, `auto` if supported), default values, notification text, exact guarded continuation prompt, manual `/resume-safe`, limitations, and rollback steps.
- Files: likely `pi/README.md` and top comments in `pi/extensions/auto-resume-watchdog.ts`.
- Acceptance Criteria:
  1. [ ] Docs explain safe semantics and rollback.
     - Verify: `grep -R "resume-safe\|observe-only\|rollback\|verify the last\|90s\|5m" -n pi/README.md pi/extensions --exclude-dir=node_modules`
     - Pass: docs include defaults, prompt text, disable/rollback, and verification-before-repeat.
     - Fail: update docs before final validation.

### Wave 3 -- Validation Gate

**V3: Validate documentation and final contract** [medium] -- validation-lead
- Blocked by: T4
- Checks:
  1. Run T4 acceptance criteria.
  2. `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck` -- exits 0.
  3. `make lint` -- no new warnings.
  4. Documentation matches implemented defaults and T1 decision.
- On failure: create a fix task, re-validate after fix.

## Dependency Graph

```
Wave 1: T1 → V1
Wave 2: T2, T3 (parallel, blocked by V1) → V2
Wave 3: T4 (blocked by V2) → V3
```

## Execution Status

- **Completion classification:** `completed-and-archived`
- **Date:** 2026-05-03
- **Last completed wave/gate:** All waves, automated validation, repo-wide validation, and manual validation passed.
- **Archive status:** Archived. Manual validation was confirmed by the user: observe-only loaded without interrupting normal long-running work, `/resume-safe` delivered the guarded continuation prompt, and disabled mode removed watchdog status/notifications.
- **Commands run and results:**
  - `grep -R "extension-auto-ok\|extension-observe-only\|runtime-patch-required" -n pi/extensions pi/README.md --exclude-dir=node_modules` -- passed.
  - `grep -R "observe-only\|90s\|5m\|max auto-resumes" -n pi/extensions pi/README.md --exclude-dir=node_modules` -- passed.
  - `cd pi/extensions && pnpm run typecheck && node ./auto-resume-watchdog-test.mjs` -- passed and printed `auto-resume-watchdog tests passed`.
  - `grep -R "observe-only\|disabled\|cooldown\|max.*resume\|auto_retry" -n pi/extensions --exclude-dir=node_modules` -- passed.
  - `grep -R "resume-safe\|observe-only\|rollback\|verify the last\|90s\|5m" -n pi/README.md pi/extensions --exclude-dir=node_modules` -- passed.
  - `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck && cd ../.. && make test-quick && make lint` -- passed.
- **Remaining items:** None.

## Success Criteria

1. [ ] Feasibility is resolved before implementation.
   - Verify: T1 marker exists and V1 confirms scope.
   - Pass: implementation matches `extension-auto-ok`, `extension-observe-only`, or `runtime-patch-required` decision.
2. [ ] Watchdog cannot spam or blindly repeat operations.
   - Verify: run executable T3 command plus inspect continuation path.
   - Pass: max attempts/cooldown/auto-retry guard work; no tool replay path exists.
3. [ ] Manual/runtime behavior is validated.
   - Verify: run a Pi session with mode enabled; test normal session, `/resume-safe`, and simulated/observed stall if possible.
   - Pass: notification appears, guarded continuation is sent only in allowed mode, and no duplicate action occurs without verification.
4. [ ] Repo and Pi validation pass.
   - Verify: `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck && cd ../.. && make test-quick && make lint`
   - Pass: all commands exit 0 with no new warnings.

## Validation Contract

`/do-it` must satisfy this contract before reporting the plan complete or archiving it.

### Required automated validation

1. [ ] Run the strongest repo-wide validation command or command set for this project.
   - Command: `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck && cd ../.. && make test-quick && make lint`
   - Pass: exits 0 with no errors or warnings
   - Fail: do not archive; update `## Execution Status` with the failing command and next fix

2. [ ] Run task-specific verification from every acceptance criterion above, including the executable watchdog test/harness command added by T3.
   - Command: see each task's `Verify:` command
   - Pass: every criterion passes exactly as written
   - Fail: create/fix a task, rerun affected checks, then rerun repo-wide validation

### Manual validation

- Required: yes
- Steps:
  1. Run a Pi session with watchdog `observe-only` or explicit `auto` mode enabled and confirm normal long-running work is not interrupted.
  2. Run `/resume-safe` and confirm the agent receives the guarded continuation prompt.
  3. If T1/T2 implement auto mode, induce or simulate a stalled active run and confirm exactly one auto-resume notification and one guarded continuation occur within limits.
  4. Disable or remove the extension, reload Pi, and confirm no watchdog status/notifications remain.

If manual validation is required and not confirmed passed, `/do-it` must classify the result as `implemented-awaiting-manual-validation`, update `## Execution Status`, and must not archive the plan.

### Deployment validation

- Required: no
- Procedure: None.

### Archive rule

`/do-it` may archive this plan only after automated validation, task-specific verification, manual validation, deployment validation, and repo-wide validation pass.

## Handoff Notes

Do not assume literal `WebSocket error` detection is available to extensions. If T1 cannot prove it, implement observe-only idle-stall detection plus `/resume-safe`, and document a follow-up runtime/client patch instead of pretending WebSocket detection exists. Guarded continuation prompt should be close to: “Continue after the transient interruption. First verify whether the last tool/file operation completed before repeating it. Do not repeat irreversible operations without verification.”
