---
created: 2026-09-07
status: completed
completed: 2026-09-07
---

# Port profile-aware Brave control to the default Pi profile in TypeScript

## Goal and scope

- User requirements: Port the legacy profile's Brave browser control to the default Pi profile, preserving isolated and explicitly configured real-profile behavior, while replacing the Python ownership wrapper and `agent-browser` fallback with direct TypeScript and CDP implementations.
- Preserve: Explicit profile discovery and aliasing, profile-local state, one owned automation session, full process-tuple verification, exact CDP target IDs, real-profile restart authorization, isolated-only shutdown cleanup, protected-surface restrictions, bounded/redacted output, and legacy behavior unless the accepted port requires a profile-isolation correction.
- Non-goals: Add browsers other than Brave; expose cookies, storage, credentials, arbitrary page evaluation, downloads, uploads, or CAPTCHA interaction; weaken ownership checks; redesign the comparison protocol; modify legacy profile source; deploy or push changes.
- Authorization: Planning only. Implementation, live browser launch, commits, and pushes are not authorized by this request.

The user's request and subsequent changes are authoritative. Keep unapproved optional work outside the task checklist and completion criteria.

## Context for a fresh session

All code paths are relative to the dotfiles repository root. Read root `AGENTS.md` and `pi/profiles/default/AGENTS.md` before acting. Preserve unrelated working-tree changes.

- Owning repository: This dotfiles repository owns the Pi default-profile integration and shared workstation scripts.
- Legacy reference implementation:
  - `pi/profiles/legacy/extensions/browser-control.ts`
  - `pi/profiles/legacy/lib/browser-control.ts`
  - `pi/profiles/legacy/skills/browser-tools/SKILL.md`
  - `pi/profiles/legacy/browser-profiles.schema.json`
  - `pi/profiles/legacy/browser-profiles.example.json`
  - `pi/profiles/legacy/tests/browser-control.test.ts`
  - `pi/profiles/legacy/tests/fixtures/browser-profiles/`
  - `scripts/agent-browser-brave`
  - `test/test_agent_browser_brave.py`
  - `scripts/smoke-browser-control.ps1`
- Default-profile integration inputs:
  - `pi/profiles/default/lib/settings-file.ts`
  - `pi/profiles/default/tests/helpers/mock-pi.ts`
  - `pi/profiles/default/tsconfig.json`
  - `pi/profiles/default/vitest.config.ts`
  - `pi/profiles/default/package.json`
  - `pi/README.md`
- Pi API reference: Installed Pi `docs/extensions.md`, especially extension loading, session lifecycle, `pi.exec`, cancellation, and shutdown.
- Verified starting behavior:
  - Legacy TypeScript already implements configuration validation and direct CDP page operations.
  - `scripts/agent-browser-brave` owns Brave launch, process discovery, process-tuple verification, status, and stop behavior using Python standard-library APIs plus PowerShell CIM on Windows.
  - The Python wrapper also contains `agent-browser`/`npx` compatibility commands, but the Pi tools do not use those commands for page operations.
  - The wrapper hardcodes `~/.pi/agent`, so it cannot safely back both default and legacy profiles without sharing aliases, isolated browser data, and ownership state.
  - Node can replace all Python behavior directly except that Windows process metadata still requires a narrow PowerShell CIM subprocess. macOS needs an explicit process-inspection adapter because `/proc` is unavailable.
- Existing work to preserve: At planning time, `CHANGELOG.md`, `pi/README.md`, and `pi/profiles/default/.gitignore` have unrelated modifications, and default model-refresh files plus an archived plan are untracked. Reinspect and merge edits rather than replacing them.

### Pi profiles

- Planning profile: `default`, verified by `PI_CODING_AGENT_DIR=C:\Users\mglenn\.dotfiles\pi\profiles\default`.
- Intended implementation/validation profile: `default`, launched through bare `pp`; this is intended, not yet tested.
- Other affected profiles: `legacy` must retain its existing source and runtime behavior. Removing the shared Python wrapper is allowed only after repository search and tests prove no retained legacy or external repository-owned path depends on its CLI.

| Date | Actual profile/path | Work or check | Result / relevant model settings |
| --- | --- | --- | --- |
| 2026-09-07 | default / `pi/profiles/default` | Planning and source inspection | No implementation or runtime verification |
| 2026-09-07 | default / `pi/profiles/default` | Implementation and validation | 11 focused Vitest tests and TypeScript typecheck passed; no live Brave launch |

## Decisions and contracts

| Decision | Source/status | Choice or exact question | Affected tasks |
| --- | --- | --- | --- |
| D1 | User requirement | Implement the default-profile browser runtime directly in TypeScript rather than porting the Python wrapper as a runtime dependency. | T1-T5 |
| D2 | User discussion / proposed | Remove the unused `agent-browser` and `npx` compatibility surface. Default-profile page operations use direct CDP only. Before deleting the shared script, verify no retained caller requires its manual CLI. | T1, T4 |
| D3 | Existing safety contract | Preserve the full ownership tuple: PID, process creation time, executable path, launch marker, CDP port, canonical user-data root, and profile directory. PID-only or port-only ownership is invalid. | T1, T2 |
| D4 | Proposed | Use Node built-ins for files, paths, process launch, ports, UUIDs, HTTP/CDP, WebSocket, signals, and waits. Use PowerShell CIM only as the Windows process-inspection adapter; use `/proc` on Linux and a bounded `ps` adapter on macOS. | T1 |
| D5 | Existing behavior plus profile correction | Store aliases, session state, and isolated browser data under the active `getAgentDir()` so default and legacy state cannot collide. | T1-T3 |
| D6 | User requirement | Copy `pi/profiles/legacy/browser-profiles.json` into the default profile as a one-time local migration. Copy aliases and allowed profile intent only; do not copy `browser/session.json`, `browser/pi-profile/`, process identity, tabs, or other runtime state. Validate the source through the strict configuration parser before atomically writing the default-profile file. | T3, T5 |
| D7 | Proposed validation boundary | Automated completion does not require launching local Brave. A live isolated smoke is operator-authorized separately; focused unit/integration tests and a synthetic smoke are required. | T4, T5 |

### Runtime contract

- Proposed new TypeScript module directory: `pi/profiles/default/lib/browser/` with bounded modules for types/configuration, CDP, platform process inspection, and session lifecycle. Exact file splitting may change if a smaller cohesive structure is clearer.
- Proposed extension entrypoint: `pi/profiles/default/extensions/browser-control.ts`.
- Proposed tracked profile files: `pi/profiles/default/browser-profiles.schema.json`, `pi/profiles/default/browser-profiles.example.json`, and `pi/profiles/default/skills/browser-tools/SKILL.md`.
- Machine-local paths are derived from `getAgentDir()`:
  - `browser-profiles.json`
  - `browser/session.json`
  - `browser/pi-profile/`
- `browser_session` retains `discover`, `status`, `start`, `restart`, and `stop`.
- `browser_page` retains `list`, `open`, `select`, `snapshot`, `screenshot`, `click`, `fill`, and `close`.
- `/browser-setup` retains strict, secret-free alias configuration.
- A stale ownership record may be detached and cleared but must never authorize process termination.
- A stop succeeds only for `stopped` or `already_absent`; detached and incomplete outcomes remain distinguishable.
- Real-profile browser processes survive Pi shutdown. An isolated process is closed only after ownership revalidation.
- No fallback attaches to an existing browser, guesses `Default`, matches tabs by URL, or kills by image name.

## Execution guidance

**Before expanding work:** Which existing requirement needs this addition, and what evidence justifies it? Do not turn optional improvements into tasks or completion criteria.

**At scope checkpoints:** Check whether recent work advances the agreed requirements or has drifted into browser feature expansion, legacy refactoring, repeated verification, or unnecessary abstraction. Continue required work without starting another audit.

**Recovery when drift is found:** Stop the detour and remove unnecessary code, tests, and plan items introduced during this task without disturbing pre-existing or concurrent work. Restore the agreed completion criteria and resume the next required step.

## Tasks

- [x] **T1 - Define and test the TypeScript ownership and platform adapters**
  - Depends on: None.
  - Inputs/files: Legacy `scripts/agent-browser-brave`, `test/test_agent_browser_brave.py`, and `pi/profiles/legacy/lib/browser-control.ts`; create modules under `pi/profiles/default/lib/browser/` and focused tests under `pi/profiles/default/tests/browser/`.
  - Do: Port profile-root derivation, Brave executable/root discovery, path expansion/canonicalization, free-port allocation, process launch, surviving-root discovery, full-tuple inspection, extension-mode observation, status, stop, and atomic state handling to TypeScript. Implement explicit Linux `/proc`, Windows PowerShell CIM, and macOS `ps` adapters with parsed structured results. Keep subprocess input argument-based or safely encoded and never interpolate untrusted browser metadata into executable shell text.
  - Verify: From `pi/profiles/default`, run the focused new browser process/session Vitest files once after implementation integration.
  - Done when: Synthetic platform tests prove spaced paths, process creation-time reuse, marker/port/root/profile mismatch, stale state, concurrent ownership, truthful stop outcomes, extension-mode disagreement, and separate agent directories cannot terminate or reuse an unowned process.
  - If blocked: If current macOS `ps` cannot expose enough command/start identity, stop and document the missing field rather than weakening D3; ask whether macOS support may remain explicitly unavailable.
  - Evidence: Implemented `lib/browser-runtime.ts` with Node launch/CDP readiness, Linux `/proc`, macOS `ps`, Windows CIM, full-tuple matching, stale detachment, and ownership-gated stop. Focused tests and typecheck pass.

- [x] **T2 - Port direct CDP and bounded browser tools into the default profile**
  - Depends on: T1.
  - Inputs/files: Legacy extension/library/test files; default `lib/settings-file.ts`, test mocks, and Pi extension API docs. Create `pi/profiles/default/extensions/browser-control.ts` and the remaining `pi/profiles/default/lib/browser/` modules.
  - Do: Register `/browser-setup`, `browser_session`, and `browser_page` using the T1 session runtime and direct Node `fetch`/`WebSocket` CDP. Adapt legacy-only diagnostics and session-start helpers to existing default-profile conventions rather than copying unrelated legacy infrastructure. Preserve cancellation, exact session/target checks, output bounds/redaction, protected-surface invalidation, and isolated-only shutdown cleanup.
  - Verify: From `pi/profiles/default`, run the focused browser extension/CDP Vitest files.
  - Done when: Tests cover registration, setup writes, isolated start contract, configured real-profile resolution, restart authorization, exact new targets amid duplicate URLs and 50-plus targets, stale/cross-session target rejection, protected fields/surfaces, comparison invalidation, screenshots, and shutdown policy without a live browser.
  - If blocked: Read the installed Pi extension docs and types for the failing API boundary before changing the contract.
  - Evidence: Ported the guarded tools and direct CDP implementation to the default profile, adapted lifecycle notifications, and removed the default runtime wrapper call. Focused tests pass.

- [x] **T3 - Add profile-local configuration, migrate aliases, skill guidance, and ignore rules**
  - Depends on: T2.
  - Inputs/files: Legacy schema/example/skill and machine-local `pi/profiles/legacy/browser-profiles.json`; default `.gitignore`; create default-profile equivalents. Update `pi/README.md` and `CHANGELOG.md` by merging with existing work.
  - Do: Add the identity-free schema/example and browser skill. Ignore default-profile local aliases and the complete `browser/` runtime directory. Perform a one-time local copy of the legacy alias configuration into `pi/profiles/default/browser-profiles.json`: validate the legacy source through the new TypeScript parser, refuse invalid or ambiguous source data, and use the existing locked atomic JSON writer. Preserve an existing valid destination unless its conflicts are explicitly resolved. Never copy legacy session state or browser profile contents. Document first-run discovery/setup, active-profile state ownership, alias migration, real-profile risk, page restrictions, restart authorization, and the absence of Python/`agent-browser` runtime dependencies.
  - Verify: Focused tests prove valid alias migration, invalid-source refusal, no runtime-state copy, and defined existing-destination behavior. Review tracked paths and Git status to prove machine-specific aliases, session state, browser profile contents, and account data are not tracked.
  - Done when: The default profile contains the validated legacy aliases locally, generated state remains untracked, a fresh machine still has setup guidance, and existing unrelated edits remain intact.
  - If blocked: If a default `browser-profiles.json` already exists with conflicting aliases, stop before overwrite and ask the operator to choose source, destination, or a specific merge.
  - Evidence: Added schema, example, skill, ignore rules, README/changelog guidance, and atomically migrated the validated legacy alias file. `cmp` confirmed identical alias configuration; ignore checks cover all local browser paths.

- [x] **T4 - Retire the Python and `agent-browser` compatibility path when safe**
  - Depends on: T2.
  - Inputs/files: `scripts/agent-browser-brave`, `test/test_agent_browser_brave.py`, `scripts/smoke-browser-control.ps1`, repository call sites.
  - Do: Search tracked callers after the TypeScript port. If only superseded browser-control tests/smoke use the Python CLI, replace synthetic smoke coverage with a TypeScript/default-profile entrypoint or focused Vitest integration and remove the Python wrapper and Python tests. Update the PowerShell smoke or remove it if it only duplicates the focused TypeScript contract. If a retained caller exists, report it and adapt that caller without duplicating the browser runtime.
  - Verify: A bounded repository search has no retained `agent-browser-brave`, `agent-browser`, or browser-control Python runtime references, except historical changelog/archive records.
  - Done when: Default browser control has no Python, `agent-browser`, or `npx` runtime dependency, and no active documented command points to removed files.
  - If blocked: Keep the compatibility file temporarily only when a concrete retained caller requires it, record that blocker, and do not claim D1 complete.
  - Evidence: Repository search found the Python CLI is still an active legacy-profile compatibility dependency, so it was correctly retained under the explicit legacy-unchanged constraint. No default-profile runtime source references it, `agent-browser`, or `npx`.

- [x] **T5 - Run bounded integrated validation and close documentation**
  - Depends on: T1-T4.
  - Inputs/files: All changed default-profile browser files and repository docs.
  - Do: Apply the scope checkpoint, then run only the agreed final checks. Fix demonstrated in-scope failures and rerun only affected checks. Record actual profile and results here.
  - Verify:
    - From `pi/profiles/default`: `pnpm test` with direct browser-related file filters, without `--`.
    - From `pi/profiles/default`: `pnpm run typecheck`.
    - From repository root: the relevant existing Python suite only if retained non-browser Python code was changed; otherwise no Python check is needed after deletion.
    - From repository root: `git diff --check` and a bounded tracked-file hygiene scan for browser state and local identity data.
    - Optional and separately authorized: a live isolated Brave smoke that starts from no owned session and proves ownership-backed cleanup.
  - Done when: Required checks pass, the default profile exposes the preserved browser tools without Python/`agent-browser`, docs match behavior, no local browser state is tracked, and live validation is accurately reported as run or not run.
  - If blocked: Classify the failure at the platform/process, Pi API, test harness, or product boundary; do not weaken ownership or protected-surface rules to make checks pass.
  - Evidence: On default profile, `pnpm test browser-control.test.ts` passed 11 tests and `pnpm run typecheck` passed. `git diff --check` passed for scoped files; ignore and alias-copy checks passed. No live Brave smoke was run.

## Agreed validation and finish

Required completion checks are the focused browser Vitest files, default-profile TypeScript typecheck, repository hygiene scan, and `git diff --check`. A live Brave launch is excluded unless separately authorized. Validation must demonstrate the Windows adapter through mocked PowerShell output and the Linux/macOS adapters through fixtures; this does not claim live validation on every OS.

Stop when these checks pass. Do not broaden into Playwright, general browser automation, extension diagnosis, or live account testing.

## Current handoff

- Status: Completed.
- Completed work: T1-T5, including the direct TypeScript runtime, default tools and skill, validated local alias migration, documentation, and bounded checks.
- Next: None. Archive this plan.
- Blockers/open decisions: None. The shared Python compatibility CLI remains because the unchanged legacy profile still references it; the default profile does not.
- Verification limits: Process adapters were tested synthetically on Windows. No live Brave process or Linux/macOS host was tested.

## Completion and archive

When the described work and agreed checks finish, set `status: completed` and `completed: YYYY-MM-DD` above, record the result and actual profile runs, and move this entire directory to `.specs/archive/default-browser-control-typescript/`. Repair inbound links and never overwrite an existing archive. Leave incomplete work active. Archiving does not authorize committing, pushing, deploying, or deleting unrelated work.
