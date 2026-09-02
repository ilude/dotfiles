---
created: 2026-09-01
status: complete
---

# Make Pi browser control profile-aware and machine-local

## Objective

Pi can discover, configure, launch, inspect, and stop one Brave automation session through explicit machine-local profile identity and stable CDP target IDs, without guessing profiles, disrupting unowned browser processes, or accepting invalid browser comparisons.

## Completion Evidence

- Evidence: Focused tests and a sanitized Windows smoke script demonstrate that an isolated profile works without local configuration; a missing real-profile configuration returns discovered candidates and setup guidance; a configured alias resolves against live Brave profile metadata; enabled and disabled extension modes agree in the surviving root command line and runtime extension targets; each open action returns and remains bound to its newly created raw CDP target ID even with restored or duplicate-URL tabs; rendered account identity is verified separately from Brave profile identity through a redacted operator checkpoint; and stop reports a postcondition-backed outcome while terminating only a browser root whose launch ownership is still proven immediately before termination.
- Fails when: Any path guesses `Default` or a display-name alias, silently substitutes the active tab, accepts concurrent ownership, trusts a launcher PID or stale port, broad-kills Brave/Chrome, loses a spaced user-data path, claims a root stopped without post-stop process and CDP evidence, exposes credential/CAPTCHA data through page actions, stores machine identities in tracked files, launches an unintended browser while attaching to CDP, or accepts an A/B result after account, CAPTCHA/interstitial handling, locale, query, region, result mode, personalization indicator, or experiment state changed.

## Boundaries

- In scope: `scripts/agent-browser-brave`, its focused tests, an identity-free tracked local-config schema/example, one machine-local browser session record, Pi browser session/page tools and setup command, focused Pi tests, a sanitized Windows smoke script, the Pi browser skill, and owning Pi documentation.
- Out of scope: Solving or bypassing CAPTCHAs; reading or writing passwords, cookies, tokens, or web storage; arbitrary page evaluation; browsers other than Brave; concurrent automation sessions; modifying, diagnosing, migrating, or uninstalling extensions or their settings; identifying one offending extension among several; and automatic migration of existing local profile names.
- Preserve: Dedicated Pi-profile behavior; explicit per-call authorization before disrupting an occupied real profile; manual CAPTCHA completion followed by unconditional invalidation of the active comparison; current damage-control boundaries; unrelated browser processes, tabs, profiles, and working-tree changes; pnpm-only Pi validation.
- Assumptions: Brave `Local State` is authoritative for live profile directory/display metadata but does not prove rendered website account identity; `~/.pi/agent/browser-profiles.json` stores only operator intent such as aliases, purposes, permissions, and restart policy; a single machine-local session registry under `~/.pi/agent/browser/` is sufficient and must reject a second live owner; absent, stale, corrupt, or ambiguous configuration must guide setup rather than guess.

## Tasks

- [x] **T1: Prove profile, target, and browser-root ownership in the wrapper**
  - Files: `scripts/agent-browser-brave`, `test/test_agent_browser_brave.py`, `pi/browser-profiles.schema.json`, `pi/browser-profiles.example.json`
  - Change: First add a representative discovery/config slice for Windows, macOS, and Linux Brave stable roots, `BRAVE_USER_DATA_DIR`, `profile.info_cache`, canonical root-plus-directory identity, and explicit expansion of `~`, `$VAR`/`${VAR}`, and `%VAR%` with unknown-variable failure. Remove `work -> Default`; reject duplicate or case-colliding aliases, duplicate display names, missing/corrupt metadata, and stale directories. Then replace cwd-relative single-state handling with atomic machine-local state under `~/.pi/agent/browser/` that rejects a second live session. Record a generated launch marker and the surviving root's PID, creation time, executable, canonical user-data root, profile directory, and CDP port; revalidate the full tuple immediately before stop, and detach without termination when launch ownership is absent or mismatched. Distinguish `stopped`, `already_absent`, `detached`, `graceful_close_incomplete`, and `failed` outcomes, and clear state only after post-stop process and CDP checks prove the claimed outcome. Make open create or identify one exact raw CDP target and return its target ID; bind every later action to that target plus session ID, and never fall back after target closure, replacement, navigation race, restored-tab focus, or an identical-URL target. Add `enabled`/`disabled` extension modes; require both surviving-root command-line proof and runtime enumeration of extension background pages, workers, and pages, rejecting disagreement. Keep the versioned local-config contract behaviorally identical in Python and TypeScript through shared valid/invalid fixtures rather than adding separate validator dependencies.
  - Done when: Platform-parameterized tests prevent profile guessing, spaced-path parsing errors, ambiguous aliases, stale launcher/PID/port reuse, pre-existing-profile termination, forged state, broad process termination, false stop-success reporting, restored-tab or duplicate-URL fallback, stale/cross-session targets, concurrent ownership, unintended standalone browser launch, and command-line/runtime disagreement about extension mode. A fixture with at least 50 restored page targets plus extension workers lists and selects exact targets within a bound without taking an accessibility snapshot of every tab.
  - Verify: `uv run pytest test/test_agent_browser_brave.py`

- [x] **T2: Expose the verified protocol through bounded Pi tools**
  - Depends on: T1
  - Files: `pi/extensions/browser-control.ts`, `pi/lib/browser-control.ts`, `pi/tests/browser-control.test.ts`, `pi/tests/fixtures/browser-profiles/`, `pi/package.json`
  - Change: Register `browser_session` for discover/status/start/restart/stop and `browser_page` for list/open/select/snapshot/screenshot/click/fill/close. Have both consume T1's single protocol and state model rather than duplicate target or process state. Require session ID and raw CDP target ID for page mutations; reject password fields, cookie/storage access, CAPTCHA-targeted interaction, and snapshots/screenshots while a credential or CAPTCHA surface is detected. Any detected CAPTCHA, unusual-traffic page, consent interstitial, or other manual continuation increments a comparison generation and unconditionally invalidates the active comparison without inspecting cookies. Require an explicit per-call restart authorization bound to the resolved profile and occupied process set; noninteractive calls without it fail. Add `/browser-setup` to validate and write only allowed local fields with serialized read-modify-write, restrictive permissions where supported, atomic replace, and preservation of unrelated aliases. On `session_shutdown`, clean only isolated resources with proven ownership and always preserve real-profile browsers. Establish shared tool/result types and pass a focused typecheck before implementing the remaining page actions. Return bounded, redacted metadata by default and never place local identities in fixtures or telemetry.
  - Done when: Tests show isolated mode needs no local file; missing real-profile configuration returns discovered candidates and setup guidance; setup is atomic and secret-free; real-profile restart requires current authorization; pre-existing or ambiguously owned browsers survive stop/shutdown; credential and CAPTCHA operations are rejected; CAPTCHA/interstitial completion invalidates rather than resumes a comparison; and stale, closed, replaced, duplicate-URL, or cross-session targets cannot be acted upon.
  - Verify: `pnpm run typecheck && pnpm test browser-control.test.ts`

- [x] **T3: Document and smoke-test the cross-machine workflow**
  - Depends on: T2
  - Files: `pi/skills/browser-tools/SKILL.md`, `pi/README.md`, `scripts/smoke-browser-control.ps1`, `test/test_agent_browser_brave.py`, `pi/tests/browser-control.test.ts`
  - Change: Replace shell-level profile/PID guidance with the Pi discovery/setup/session/page workflow while retaining bounded diagnostics. Document tracked schema/example versus local aliases/permissions/runtime state, supported platform roots, first-run setup, single-session behavior, and explicit real-profile disruption. Add a Windows smoke script with machine-checkable sanitized assertions for profile directory/live display match, a separate operator-provided rendered-account alias checkpoint, stable newly created target ID and URL, command-line and runtime extension mode, query/result mode, personalization indicator, locale/region, comparison generation, and invalidation events; keep CAPTCHA and rendered-account checks manual and report only match status, never their sensitive content. Record one comparison transaction containing those invariants and accept the second leg only when extension mode is the sole changed invariant.
  - Done when: A clean-machine fixture recommends setup without guessing, a configured fixture resolves an alias against live metadata, and the smoke script either proves all comparison invariants, including a redacted rendered-account match, or rejects the comparison with the changed invariant named.
  - Verify: `pwsh -File scripts/smoke-browser-control.ps1`

## Validation

- [x] `git diff --check` passes and a bounded tracked-file scan confirms no local profile names, account identifiers, cookies, tokens, CAPTCHA material, absolute home paths, or generated browser state were added.
- [x] `uv run pytest test/test_agent_browser_brave.py` passes platform discovery, config parity, surviving-root ownership, truthful stop outcomes, exact-target creation, 50-plus restored-target behavior, extension command-line/runtime parity, concurrency rejection, and cleanup regressions.
- [x] `cd pi && pnpm test browser-control.test.ts && pnpm run typecheck` passes Pi setup, authorization, sensitive-surface, CAPTCHA/interstitial invalidation, exact-target lifecycle, and shared TypeScript contracts.
- [x] `pwsh -File scripts/smoke-browser-control.ps1` succeeds on Windows for isolated mode without local configuration, guides setup for an unconfigured real profile, verifies a configured alias against live metadata, separately verifies a redacted rendered-account alias, and either produces sanitized invariant evidence showing extension mode as the sole enabled/disabled comparison difference or rejects the comparison without changing unrelated browser state.

## Retention

Keep incomplete work at `.specs/pi-browser-profile-control/plan.md`. After completion, `/do-it` archives this directory to `.specs/archive/pi-browser-profile-control/`.

## Execution Status

- State: Complete. T1-T3 and all validation gates passed in the owned implementation worktree.
- Blocker: None.
- Evidence: Python 9 passed; Pi Vitest 10 passed; Pi typecheck passed; sanitized and live isolated Windows smoke passed with ownership-backed cleanup; `git diff --check` and bounded hygiene scan passed.
- Next: Archive, commit, merge with `--no-ff`, verify merged HEAD, and remove only the owned worktree and branch.
