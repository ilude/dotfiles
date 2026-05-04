---
created: 2026-05-04
status: completed
completed: 2026-05-04
---

# Plan: Pi Reload Status Indicator

## Context & Motivation

The Pi custom footer currently shows the runtime version as `π v0.72.0`. The user wants that label to become `π v0.72.0[reload]` when files that `/reload` would reload have changed since Pi started. The `[reload]` hint should use white brackets and a pink `reload` word.

The selected approach is a throttled mtime scan. This avoids cross-platform file watcher flakiness while keeping the implementation small. Review found three must-fix requirements before execution: behavioral verification must replace static-inspection-only proof, reset/clear behavior must be handled on Pi reload when lifecycle access is available, and filesystem traversal must be explicitly bounded.

## Constraints

- Platform: Windows via Git Bash/MSYS2 (`MINGW64_NT-10.0-26200`).
- Shell: Git Bash/MSYS2 bash for repo commands; PowerShell is available but not required.
- Pi TypeScript validation is pnpm-only for `pi/extensions`; do not use Bun/npm for Pi TypeScript validation.
- Keep implementation localized to `pi/extensions/operator-status.ts` unless a small helper is needed for deterministic tests.
- Do not introduce file watchers or destructive git operations.
- Prefer pink (`\x1b[38;5;205m`) over red; reserve red for errors.
- Behavioral validation is required. Static inspection may supplement but cannot replace executable changed/unchanged/throttle/reload-reset checks.
- If no existing test harness covers `operator-status.ts`, create a focused helper test or temporary script runnable from `pi/extensions` that records unchanged, changed, throttle-cache, and reload-reset outcomes. Prefer committing a small reusable test/helper when it fits existing project patterns; otherwise document the temporary harness command and output in execution notes.
- A reload lifecycle signal likely exists: `pi/extensions/session-hooks.ts` handles `pi.on("session_start", ...)` and `event.reason === "reload"`.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Throttled mtime scan of reloadable paths | Simple, reliable on Windows/Git Bash/MSYS2, easy to test with temp files | Needs bounded path list and throttle | **Selected** |
| File watcher dirty flag | Immediate and cheap during render | Watcher lifecycle/debounce/cross-platform risk | Rejected: too much machinery for a footer hint |
| Manifest/hash snapshot | Best diagnostics and add/delete detection | More code than needed | Rejected for now |
| Wait for official reload-dirty API | Semantically ideal | No such API found during review | Rejected for this iteration |

Opposite-pattern check: for security-critical policy reloads, a manifest/hash or official reload API would be correct. This footer hint is non-critical, so mtime polling is proportionate.

## Objective

Implement a Pi footer reload indicator that appends white-bracketed, pink `[reload]` to the existing version label whenever bounded reloadable files have `mtimeMs` newer than the current baseline. The indicator must clear/reset after `/reload` when the lifecycle hook is accessible, or document the exact API limitation and restart-clear fallback.

## Project Context

- **Language**: TypeScript for Pi extensions.
- **Test command**: `cd pi/extensions && pnpm run typecheck`; if tests are added or relevant Pi tests cover this area, also run `cd pi/tests && pnpm run test`.
- **Lint command**: no dedicated Pi extension lint command detected.

## Automation Plan

| Operation | Command/wrapper | Credentials | Evidence |
|-----------|-----------------|-------------|----------|
| Preflight | `git status --short && rg -n "formatPiStatusLine|setFooter|session_start|event.reason|reload" pi/extensions` | none | output recorded in execution notes |
| Implement | edit `pi/extensions/operator-status.ts`; add `pi/extensions/reload-status.ts` only if needed for pure helper/test seam | none | git diff showing detector, label, reset, and bounded traversal |
| Behavior verify | run existing tests if available; otherwise create and run a focused helper test or temporary script from `pi/extensions` for unchanged, changed, throttle-cache, and reload-reset behavior | none | harness/test output recorded in execution notes |
| Typecheck | `cd pi/extensions && pnpm run typecheck` | none | command exits 0 |
| Optional tests | `cd pi/tests && pnpm run test` if tests are added or existing tests cover footer/reload helpers | none | exits 0, or execution notes explain non-applicability |
| Rollback | no rollback unless requested; first run `git diff -- pi/extensions/operator-status.ts pi/extensions/reload-status.ts`, then ask explicit confirmation before any `git checkout -- <paths>` | none | pre/post rollback diff/status if rollback occurs |

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Confirm reload semantics and bounded path scope | 1-3 | mechanical/research | small | typescript-pro | -- |
| T2 | Implement throttled reload-dirty detector | 1-2 | feature | medium | typescript-pro | V1 |
| T3 | Integrate `[reload]` label and reload reset | 1 | feature | small | typescript-pro | V1 |
| V1 | Validate wave 1 scoping | -- | validation | small | qa-engineer | T1 |
| V2 | Validate implementation | -- | validation | medium | qa-engineer | T2, T3 |

## Execution Waves

### Wave 1

**T1: Confirm reload semantics and bounded path scope** [small] -- typescript-pro
- Description: Inspect Pi extension reload behavior and determine the initial reloadable path set. Start from likely reloadable surfaces, but keep only paths supported by static evidence. Clarify whether `pi/settings.json` or `~/.pi/agent/settings.json` is in scope.
- Files: read-only inspection of `pi/extensions/**/*.ts`, `pi/settings.json`, `pi/README.md`, and relevant settings/reload docs.
- Acceptance Criteria:
  1. [ ] Reloadable path list is explicit and justified.
     - Verify: `rg -n "reloadable|needsReload|RELOAD|session_start|event.reason" pi/extensions .specs/pi-reload-status/plan.md`
     - Pass: output shows a concrete path list/helper and evidence for reload lifecycle behavior.
     - Fail: path scope remains guessed or conversation-only.
  2. [ ] Traversal rules are bounded.
     - Verify: inspect implementation notes/code for explicit roots, extensions, missing-root handling, and exclusions.
     - Pass: rules use explicit roots and file extensions; exclude `node_modules`, caches, histories, sessions, expertise logs, `.pi` generated state, and prompt-routing data.
     - Fail: any unbounded repo-wide recursive scan or unspecified glob behavior remains.

### Wave 1 -- Validation Gate

**V1: Validate wave 1 scoping** [small] -- qa-engineer
- Blocked by: T1
- Checks:
  1. Confirm T1 identified bounded reloadable paths and exclusions.
  2. Confirm no credentials or manual discovery are required.
  3. Confirm reset-on-reload feasibility was checked via existing `session_start`/`event.reason === "reload"` lifecycle evidence.
- On failure: create a fix task before implementation.

### Wave 2

**T2: Implement throttled reload-dirty detector** [medium] -- typescript-pro
- Blocked by: V1
- Description: Add a detector with startup baseline, mtime comparison, cached result, and throttle interval (about 5 seconds). Missing optional paths must be ignored. Prefer a pure/exported helper seam that accepts candidate paths plus injectable baseline/current time so behavior can be tested without running Pi. If no existing harness can exercise the helper, create a focused test or temporary script under `pi/extensions` and record the exact command/output.
- Files: prefer `pi/extensions/operator-status.ts`; create `pi/extensions/reload-status.ts` only if needed for readability or deterministic testing.
- Acceptance Criteria:
  1. [ ] Unchanged files do not set the indicator.
     - Verify: run a focused unit/helper test or temp-file harness with baseline newer than candidate mtimes.
     - Pass: executable check returns false/no suffix.
     - Fail: helper returns true on startup/unchanged files.
  2. [ ] Changed files set the indicator.
     - Verify: run a focused unit/helper test or temp-file harness that touches a candidate newer than baseline.
     - Pass: executable check returns true/suffix.
     - Fail: detector cannot distinguish changed vs unchanged files.
  3. [ ] Throttle/cache behavior is proven.
     - Verify: run helper/harness with injectable clock or controlled scan timestamps, plus `rg -n "RELOAD_SCAN_INTERVAL|lastReloadScan|cachedNeedsReload|mtimeMs" pi/extensions`.
     - Pass: calls inside throttle window use cached result; code contains throttle/caching state.
     - Fail: every footer render rescans or behavior is only statically inferred.
  4. [ ] Traversal is bounded in code.
     - Verify: inspect code and run targeted `rg` for traversal roots/exclusions.
     - Pass: no unbounded scan of repo root, `.pi`, `node_modules`, caches, sessions, expertise, or prompt-routing data.
     - Fail: broad recursive scan remains.

**T3: Integrate `[reload]` label and reload reset** [small] -- typescript-pro
- Blocked by: V1
- Description: Update footer rendering so unchanged state is unchanged and dirty state appends `[reload]`. Use `ANSI.white` for brackets and `ANSI.pink` for `reload`. Wire detector baseline reset to reload lifecycle if accessible from this extension (`session_start` with `event.reason === "reload"`); if inaccessible, document exact API limitation and restart-clear fallback. Include this reset path in the focused helper test or temporary harness.
- Files: `pi/extensions/operator-status.ts`.
- Acceptance Criteria:
  1. [ ] Footer text contains visible `π v0.72.0[reload]` only when reload is needed.
     - Verify: formatter/helper test or executable harness.
     - Pass: unchanged state has no suffix; dirty state appends exactly `[reload]` without extra words/spaces.
     - Fail: label appears in unchanged state or is placed elsewhere.
  2. [ ] ANSI color scoping is correct.
     - Verify: inspect label construction.
     - Pass: brackets use `ANSI.white`, word uses `ANSI.pink`, reset is applied after label.
     - Fail: red is used without justification, full version turns pink, or reset is missing.
  3. [ ] `/reload` clears/resets indicator when lifecycle hook is available.
     - Verify: helper/lifecycle test or documented API evidence for baseline reset on `event.reason === "reload"`.
     - Pass: reset is implemented, or execution notes prove the hook is inaccessible from `operator-status.ts` and document restart-clear fallback.
     - Fail: stale `[reload]` can remain after `/reload` with no documented limitation.

### Wave 2 -- Validation Gate

**V2: Validate implementation** [medium] -- qa-engineer
- Blocked by: T2, T3
- Checks:
  1. Run all T2/T3 executable behavior checks.
  2. `cd pi/extensions && pnpm run typecheck` -- exits 0.
  3. If tests were added or existing tests cover this area, `cd pi/tests && pnpm run test` -- exits 0.
  4. Confirm evidence is recorded: behavior harness/test output, typecheck output, optional test decision, path-scope evidence.
- On failure: create a fix task, rerun affected checks, then rerun typecheck.

## Dependency Graph

```text
Wave 1: T1 → V1
Wave 2: T2, T3 (parallel after V1) → V2
```


## Execution Status

- Completion classification: completed-and-archived
- Date: 2026-05-04
- Last completed wave/gate: Wave 2 / V2 plus repo-wide completion validation
- Implemented: bounded reload-status mtime detector, footer `[reload]` integration, reload baseline reset on `session_start` reload, focused Vitest coverage, and minor validation repair for existing prompt/operator tests.
- Commands run and results:
  - `git status --short && rg -n "formatPiStatusLine|setFooter|session_start|event.reason|reload|reloadable|needsReload|RELOAD" pi/extensions pi/settings.json pi/README.md .specs/pi-reload-status/plan.md` -- passed; confirmed lifecycle/search evidence.
  - `cd pi/extensions && pnpm run typecheck` -- passed.
  - `cd pi/tests && pnpm exec vitest run tests/reload-status.test.ts tests/operator-status.test.ts` -- passed, 17 tests.
  - `uv run ruff check --fix test/test_pi_agent_metadata.py` -- passed; repaired repo-wide lint failure.
  - `make check` -- passed; final repo-wide gate passed, including Pi extension typecheck and 891 Vitest tests.
- Manual validation: not required by Validation Contract.
- Deployment validation: not required.
- Remaining checks: none.
- Rerun `/do-it .specs/pi-reload-status/plan.md`: no; plan is complete and archived.

## Success Criteria

1. [ ] Unchanged reloadable files do not show `[reload]`.
   - Verify: executable helper/unit/temp-file check.
   - Pass: no suffix appears.
2. [ ] Changed reloadable files show `π v0.72.0[reload]`.
   - Verify: executable helper/unit/temp-file check.
   - Pass: exact suffix appears.
3. [ ] Repeated footer renders are safe.
   - Verify: executable throttle/cache check plus `cd pi/extensions && pnpm run typecheck`.
   - Pass: cache behavior is proven and typecheck exits 0.
4. [ ] `/reload` clears/resets the indicator when lifecycle access is available.
   - Verify: executable lifecycle/helper check or documented API limitation.
   - Pass: reset implemented, or fallback is explicitly justified.

## Validation Contract

`/do-it` must satisfy this contract before reporting the plan complete or archiving it.

### Automation completeness

- Required: yes.
- No credentials are required.
- Manual UI validation is optional only; archive depends on executable helper/lifecycle checks, not human visual judgment.

### Required automated validation

1. [ ] Run targeted Pi extension validation.
   - Command: `cd pi/extensions && pnpm run typecheck`
   - Pass: exits 0.
   - Fail: do not archive; record failing command and fix next.
2. [ ] Run task-specific executable checks.
   - Command: see each task's `Verify:` command; if no existing test harness covers the behavior, create and run a focused helper test or temporary script from `pi/extensions`.
   - Pass: unchanged, changed, throttle-cache, bounded traversal, ANSI label, and reload-reset behavior pass, with command/output recorded in execution notes.
   - Fail: do not archive; fix and rerun.
3. [ ] Run broader tests if applicable.
   - Command: `cd pi/tests && pnpm run test`
   - Pass: exits 0, or execution notes state why not applicable.
   - Fail: do not archive.

### Manual validation

- Required: no.
- Steps: None. Optional user check may edit a reloadable file, observe `[reload]`, run `/reload`, and observe the indicator clear if lifecycle reset was implemented.

### Deployment validation

- Required: no.
- Procedure: None.

### Archive rule

`/do-it` may archive this plan only after required automated validation, task-specific executable verification, and targeted TypeScript validation pass. Execution notes must include non-secret evidence for typecheck, behavior checks, optional test decision, and bounded path-scope evidence.

## Handoff Notes

- Existing footer code lives in `pi/extensions/operator-status.ts` and defines `formatPiStatusLine` plus local ANSI constants.
- The previous status color edit changed git branch label colors; avoid unrelated color churn.
- Existing reload lifecycle evidence: `pi/extensions/session-hooks.ts` handles `pi.on("session_start", ...)` and `event.reason === "reload"`.
- Keep scans bounded. Do not recursively scan all of `.pi`, `node_modules`, session histories, expertise logs, caches, or generated prompt-routing data.
- If rollback is requested, inspect `git diff -- <paths>` first and ask for explicit confirmation before any checkout.
- Record durable evidence in execution notes rather than relying on transient terminal output.
