---
created: 2026-05-10
status: reviewed
completed:
---

# Plan: Agent Browser Pi Tooling

## Context & Motivation

The user wants this dotfiles repo to make Vercel `agent-browser` usable by Pi, with Brave as the browser target on Windows. Exploration proved the raw CLI can work: `npx -y agent-browser --version` returned `agent-browser 0.27.0`, and launching Brave with CDP then running `agent-browser connect` exposed pages and snapshots. The important failure mode was profile selection: `agent-browser --profile Default` selected Chrome (`Default (Your Chrome)`), not Brave, so the plan must not document that as the Brave recipe.

A prior manual test used Brave's real Default profile and successfully reached logged-in `https://x.com/home`, but that access is sensitive because a CDP-connected process can act as the logged-in user. The implementation must default to a dedicated Pi Brave profile, make real-profile mode explicit and manually approved, and never use broad browser process kills.

## Constraints

- Platform: Windows Git Bash/MSYS2 detected (`MINGW64_NT-10.0-26200`); repo is cross-platform for Linux, macOS, Git Bash/MSYS2, PowerShell, and WSL.
- Shell: Git Bash/MSYS2 for POSIX commands; PowerShell is available and preferred for Windows-native process/profile discovery.
- Repo markers detected: `pyproject.toml`, `Makefile`, `.gitattributes`.
- Detected likely repo-wide validation: `make check`; targeted validation includes `make lint`, `make test-quick`, and wrapper smoke checks.
- Package-manager policy from `AGENTS.md`: prefer Bun generally; Pi TypeScript validation is pnpm-only; do not introduce `package-lock.json`.
- V1 scope is intentionally narrow: add one runtime helper/wrapper, one canonical Pi-facing usage surface, and validation. Do not modify `Brewfile`, `wsl/packages`, global OS package lists, `install`, `install.ps1`, or `pi/extensions/` in this pass unless a later reviewed task explicitly adds that scope.
- V1 runtime contract: the wrapper may use `npx -y agent-browser` internally as the fallback execution path when no installed `agent-browser` binary is found, but only for runtime invocation and smoke checks. The wrapper must report the resolved command source, must not create `package-lock.json`, and must not require direct `agent-browser ...` commands in validation unless it has resolved an installed binary path.
- Default browser mode must use a dedicated Pi Brave profile. Real Brave Default profile mode is an explicit, manual, authenticated workflow only.
- Default CDP port must be ephemeral loopback-only. Fixed port `9222` is allowed only when the user explicitly requests it or when documenting the historical manual test.
- Cleanup must never use broad process kills such as `taskkill /IM brave.exe`, `pkill brave`, or `killall Brave`. Cleanup may close only an owned session/process after validating process identity.
- Evidence for authenticated sessions must be minimal and redacted: do not archive raw real-profile screenshots, raw snapshots, cookies, tokens, account handles, auth-bearing URLs, or local user profile paths unless the user explicitly approves.

### Platform Support Matrix

| Platform | V1 support | Required behavior |
|----------|------------|-------------------|
| Windows Git Bash/MSYS2 | supported | discover Brave executable/user-data paths, launch dedicated Pi profile, connect `agent-browser`, verify Brave identity |
| Windows PowerShell | supported through wrapper internals | use for native process discovery/identity checks where needed |
| macOS | documented-only in V1 unless discovered safe during T1 | provide clear diagnostic and future install guidance; do not edit `Brewfile` in V1 |
| native Linux | documented-only in V1 unless discovered safe during T1 | provide clear diagnostic; do not assume Brave exists |
| WSL | documented unsupported or Windows-host-bridge only in V1 | do not assume Linux Brave can access Windows Brave profiles; print explicit unsupported/bridge guidance |

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Minimal `agent-browser` + Brave wrapper and one Pi quick start | Small, testable, matches proven workflow, avoids install churn | Leaves durable global installation and native Pi tool for later | **Selected for V1** |
| Modify global install flows now (`install.ps1`, `Brewfile`, WSL packages) | Convenient if stable | Cross-platform package availability and package-manager choice are not fully proven | Rejected for V1; defer behind discovery/future task |
| Add `pi-agent-browser-native` package immediately | Pi-native tool avoids shell quoting and handles artifacts/spills | Adds third-party Pi package dependency and broader integration risk | Rejected for V1; document as future option |
| Use `agent-browser --profile Default` | Read-only profile snapshot in docs | In this environment it selected Chrome, not Brave | Rejected as Brave recipe; add negative docs/test check |
| Direct real Brave Default profile with CDP | Proven to access logged-in X | Sensitive; can control logged-in browser | Allowed only via explicit real-profile mode with typed confirmation |
| MCP/browser-use/Stagehand/gstack | Rich ecosystems | User narrowed to no MCP and focus on `agent-browser`; several are heavier or Playwright-backed | Rejected for this plan |

## Objective

When complete, this repo will have a narrow, safe V1 integration that lets Pi agents discover and use `agent-browser` with Brave through one documented helper path.

Concrete end state:

1. A safe helper/wrapper exists for Windows Brave + `agent-browser` workflows.
2. The helper defaults to a dedicated Pi Brave profile and an ephemeral loopback CDP port.
3. The helper verifies it connected to Brave, not Chrome, before reporting success.
4. Real Brave Default profile mode exists only as an explicit manual workflow requiring typed confirmation; `Default` means Brave's profile directory, even when the visible profile display name differs by machine (for example `Work` on this machine).
5. Pi-facing guidance explains how to use the wrapper for `agent-browser` snapshots/refs/screenshots and when to report partial results.
6. Automated checks validate wrapper help/status, Brave identity checks, safety constraints, and one canonical quick start.

## Project Context

- **Language**: Python/shell/PowerShell/dotfiles; Pi docs/skills may be edited in this plan.
- **Out of scope**: `pi/extensions/` TypeScript implementation and global package manager changes.
- **Test command**: `make test-quick` for targeted quick tests; `make check` for full validation.
- **Lint command**: `make lint`; Python lint is `make lint-python`.

## Automation Plan

| Operation | Command/wrapper | Credentials | Evidence |
|-----------|-----------------|-------------|----------|
| Preflight | `git status --short && command -v node || true && npx -y agent-browser --version` | none | command output, no lockfile created |
| Runtime availability | `scripts/agent-browser-brave --check` | none | reports resolved agent-browser command source or safe install instructions |
| Launch safe Brave profile | `scripts/agent-browser-brave --open https://example.com --title` | local dedicated Pi profile only | sanitized status showing Brave executable identity, profile mode `pi`, localhost CDP port, title `Example Domain` |
| Explicit real Brave Default profile | `scripts/agent-browser-brave --real-brave-default --confirm-real-profile` (or `--real-brave-profile Default`) plus typed confirmation | user's local logged-in Brave default profile; explicit user approval required | minimal redacted status only; no raw snapshot/screenshot archived by default |
| Verify Pi guidance | targeted test/grep selected by T4 for exactly one canonical quick start | none | test output showing canonical doc exists and no conflicting Chrome/default-profile recipe |
| Repo-wide validation | `make check` | none | exit 0 with no errors/warnings |
| Rollback | `git restore -- <changed paths>` before commit, or remove added scripts/docs | none | clean `git status --short` |

## Execution Checklist

This checklist is the durable resume ledger for `/do-it`. Every executable task, validation gate, and final completion gate has exactly one matching checkbox. Checked means verified complete; unchecked means pending, in-progress, blocked, or invalidated.

`/do-it` must mark each item `[x]` immediately after that item passes its required verification and before starting any dependent or next sequential step. `/review-it` must preserve checked state, add unchecked items for new executable work, and never mark implementation or validation work complete.

### Wave 1

- [x] T1: Audit exact surfaces and finalize V1 file targets
  - Status: completed
  - Evidence: selected `scripts/agent-browser-brave`, `pi/skills/pi-skills/browser-tools/SKILL.md`, `pi/README.md`, and `test/test_agent_browser_brave.py`; no install-flow or Pi TypeScript files selected for V1.
- [x] V1: Validate wave 1
  - Status: completed
  - Evidence: reviewed `rg -n "agent-browser|browser-tools|Brave" ...`; implementation scope remained helper/docs/tests only.

### Wave 2

- [x] T2: Add runtime availability and safe Brave wrapper
  - Status: completed
  - Evidence: `scripts/agent-browser-brave --help`, `--check`, `--status`, safe Example Domain smoke, and `--close-owned` passed.
- [x] T3: Add canonical Pi agent-browser usage guidance
  - Status: completed
  - Evidence: canonical guidance added to `pi/skills/pi-skills/browser-tools/SKILL.md`; cross-link added in `pi/README.md`.
- [x] V2: Validate wave 2
  - Status: completed
  - Evidence: targeted wrapper/docs checks passed; unsafe broad-kill grep returned no unsafe implementation hits.

### Wave 3

- [x] T4: Add validation tests and documentation cross-links
  - Status: completed
  - Evidence: added `test/test_agent_browser_brave.py`; `uv run pytest test/test_agent_browser_brave.py -v --tb=short` passed (4 tests).
- [ ] V3: Validate wave 3
  - Status: blocked
  - Evidence: `make test-quick` and `make lint` passed; `make check` failed in pre-existing Pi Vitest area `tests/codex-status.test.ts` with `TypeError: Cannot read properties of undefined (reading 'handler')`.

### Final Gates

- [x] F1: Task-specific verification complete
  - Status: completed
  - Evidence: `scripts/agent-browser-brave --check`, `--open https://example.com --title --snapshot`, `--status`, `--close-owned`, docs grep/review, and targeted pytest passed.
- [ ] F2: Repo-wide validation complete
  - Status: blocked
  - Evidence: `make check` failed in Pi Vitest `tests/codex-status.test.ts`; see `## Execution Status`.
- [x] F3: Manual validation complete or not required
  - Status: completed
  - Evidence: no authenticated real-profile validation was requested; V1 manual validation is not required.
- [x] F4: Deployment validation complete or not required
  - Status: completed
  - Evidence: no external deployment required by Validation Contract.
- [ ] F5: Archive preflight complete
  - Status: blocked
  - Evidence: archive preflight blocked because F2/V3 repo-wide validation has not passed.

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Audit exact surfaces and finalize V1 file targets | 0-1 plan/status notes | research | small | planning-oriented agent | -- |
| V1 | Validate wave 1 | -- | validation | small | validation agent | T1 |
| T2 | Add runtime availability and safe Brave wrapper | 1-3 files (`scripts/agent-browser-brave`, optional `.ps1` helper/test fixture) | feature | medium | shell/PowerShell specialist | V1 |
| T3 | Add canonical Pi agent-browser usage guidance | 1-2 files (`pi/skills/.../SKILL.md` or one docs page plus one cross-link) | feature | medium | Pi command/skills agent | V1 |
| V2 | Validate wave 2 | -- | validation | medium | validation agent | T2, T3 |
| T4 | Add validation tests and documentation cross-links | 2-4 files (`test/`, canonical docs, optional script tests) | feature | medium | validation/tooling agent | V2 |
| V3 | Validate wave 3 | -- | validation | medium | validation agent | T4 |

## Execution Waves

### Wave 1

**T1: Audit exact surfaces and finalize V1 file targets** [small] -- planning-oriented agent
- Description: Read install/package and Pi guidance surfaces, then record exact V1 edit targets before implementation. T1 must not choose global install-flow edits unless it creates a new reviewed task; V1 defaults to helper/docs only.
- Files: read `install.ps1`, `install`, `Brewfile`, `wsl/packages`, `pi/README.md`, `pi/skills/`, `AGENTS.md`, `README.md`, `Makefile`, existing `test/` patterns.
- Acceptance Criteria:
  1. [ ] Exact target files for T2-T4 are listed in `/do-it` notes or `## Execution Status`.
     - Verify: `grep -R "agent-browser\|browser-tools\|Brave" -n AGENTS.md README.md pi scripts install.ps1 install Brewfile wsl 2>/dev/null | head -100`
     - Pass: output is reviewed; one canonical guidance surface is selected; no duplicate recipe path is chosen.
     - Fail: unclear ownership or duplicate docs; stop and ask whether to update existing or create new guidance.
  2. [ ] Selected Pi surfaces are classified before implementation.
     - Verify: inspect `/do-it` notes or `## Execution Status`.
     - Pass: selected surfaces are classified as `pi/skills/docs`; `pi/extensions` and `pi/tests` are explicitly out of scope unless a new reviewed task names exact files and pnpm commands.
     - Fail: implementation would touch `pi/extensions` or `pi/tests` without explicit validation commands.

### Wave 1 -- Validation Gate

**V1: Validate wave 1** [small] -- validation agent
- Blocked by: T1
- Checks:
  1. Confirm T1 selected exact files and no implementation changes were made except status notes.
  2. Confirm no global install-flow files (`Brewfile`, `wsl/packages`, `install`, `install.ps1`) are selected for V1 edits unless the plan is updated and re-reviewed.
  3. Confirm Pi TypeScript remains out of scope.
- On failure: update T1 notes and rerun V1.

### Wave 2 (parallel after V1)

**T2: Add runtime availability and safe Brave wrapper** [medium] -- shell/PowerShell specialist
- Blocked by: V1
- Description: Add a wrapper that checks/resolves `agent-browser`, launches/connects Brave, and exposes validation operations through the wrapper. Default mode uses a dedicated Pi profile, an ephemeral loopback CDP port, and verifies the connected target is Brave. Real-profile mode uses unambiguous flags and typed confirmation only.
- Files: likely `scripts/agent-browser-brave`, optional `scripts/agent-browser-brave.ps1`, tests/docs.
- Canonical command contract: all validation browser interactions go through the wrapper (`--check`, `--open`, `--title`, `--snapshot`, `--status`, `--close-owned`) unless the wrapper reports a resolved installed binary path and uses that path internally. Direct `agent-browser ...` commands are not required for plan success.
- Required state contract:
  - State path: gitignored local runtime state under `.pi/agent-browser-brave/state.json` when running inside a repo, otherwise under the user-local Pi state directory if available.
  - Fields: `pid`, `processStartTime` or platform equivalent, `executablePath`, `userDataDir`, `profileDirectory`, `profileMode`, `cdpPort`, `startedAt`, `sessionId`, `agentBrowserCommandSource`.
  - Cleanup must validate PID, start time when available, executable path, user-data-dir/profile marker, and CDP port before termination. If validation fails, refuse to kill and print manual cleanup instructions.
  - Stale records must be handled idempotently.
  - No broad Brave/Chrome process kill commands are allowed.
- Real-profile confirmation contract:
  - Flag shape: `--real-brave-profile Default --confirm-real-profile`.
  - Required typed confirmation: `I UNDERSTAND THIS CONTROLS MY REAL BRAVE PROFILE`.
  - Non-interactive execution without the exact confirmation must abort before launching/connecting.
  - Help examples must show dedicated profile first; real-profile examples must include warnings.
- Acceptance Criteria:
  1. [ ] Helper reports runtime availability without mutating global install state.
     - Verify: `scripts/agent-browser-brave --check`
     - Pass: exits 0 when the wrapper can resolve an agent-browser command path/fallback; otherwise exits nonzero with repo-approved install guidance and no global mutation.
     - Fail: installs automatically, creates lockfiles, or gives ambiguous package-manager advice.
  2. [ ] Wrapper discovers Brave on Windows and supports safe default profile mode.
     - Verify: `scripts/agent-browser-brave --help && scripts/agent-browser-brave --status`
     - Pass: help documents dedicated profile default, ephemeral port, Brave identity check, real-profile typed confirmation, command-source reporting, and cleanup rules.
     - Fail: wrapper assumes Chrome, uses fixed `9222` by default, or lacks safety warnings.
  3. [ ] Wrapper opens a safe test page, captures a snapshot, and proves the CDP target is Brave.
     - Verify: `scripts/agent-browser-brave --open https://example.com --title --snapshot && scripts/agent-browser-brave --status`
     - Pass: wrapper output/status identifies Brave executable/process or Brave user-data root, profile mode `pi`, loopback CDP endpoint, resolved agent-browser command source, title includes `Example Domain`, and snapshot includes the Example Domain heading/link refs.
     - Fail: command opens Chrome, connects to a pre-existing wrong CDP target, cannot prove Brave identity, or touches unrelated browser sessions.
  4. [ ] Cleanup is identity-checked and fail-visible.
     - Verify: `scripts/agent-browser-brave --close-owned && scripts/agent-browser-brave --status`
     - Pass: output states exactly what was closed, what remains open, CDP port status, and confirms no broad browser kill was attempted.
     - Fail: cleanup kills unverified PIDs or gives ambiguous output.
  5. [ ] No npm lockfile or global install-flow edits were introduced.
     - Verify: `git status --short | grep -E 'package-lock.json|Brewfile|wsl/packages| install$|install.ps1' && exit 1 || true`
     - Pass: no new `package-lock.json`; no V1 edits to deferred install files.
     - Fail: lockfile appears or global install files changed.

**T3: Add canonical Pi agent-browser usage guidance** [medium] -- Pi command/skills agent
- Blocked by: V1
- Description: Add/update exactly one canonical Pi-facing guidance surface so agents know the wrapper is available, when to use it, and safe command patterns. Add at most one repo-level cross-link. Do not edit `pi/extensions/` in V1.
- Files: likely one `pi/skills/.../SKILL.md` or one docs page plus one cross-link.
- Acceptance Criteria:
  1. [ ] Pi guidance has concrete command examples and safety rules.
     - Verify: targeted check selected by T4 plus `grep -R "agent-browser" -n pi AGENTS.md README.md | head -100`
     - Pass: one canonical surface includes wrapper open/snapshot/click/screenshot/connect/status, real-profile warning, and says not to use `agent-browser --profile Default` as the Brave recipe.
     - Fail: docs are generic, omit safety constraints, or conflict with wrapper command names.
  2. [ ] X/timeline guidance is bounded and fail-visible if included.
     - Verify: inspect guidance for max attempts/timeouts, dedupe strategy, auth-required handling, and partial-result reporting.
     - Pass: guidance says report partial results rather than claim completion when fewer than requested items are found.
     - Fail: guidance encourages unbounded loops or silent partial completion.

### Wave 2 -- Validation Gate

**V2: Validate wave 2** [medium] -- validation agent
- Blocked by: T2, T3
- Checks:
  1. Run acceptance criteria for T2 and T3.
  2. Run `make lint` if touched files are lint-covered; otherwise run targeted shell/PowerShell syntax checks documented by T2.
  3. Verify no broad process-kill commands were introduced: `grep -R "taskkill.*IM brave\|killall.*Brave\|pkill.*brave\|taskkill.*IM chrome\|pkill.*chrome" -n scripts install.ps1 pi README.md AGENTS.md` should find no unsafe cleanup path.
  4. Verify no conflicting Chrome/default-profile Brave recipe was introduced: targeted test or grep must fail if docs recommend `agent-browser --profile Default` for Brave.
  5. Cross-task integration: wrapper, docs, and validation all name the same command and profile modes.
- On failure: create a fix task, re-validate after fix.

### Wave 3

**T4: Add validation tests and documentation cross-links** [medium] -- validation/tooling agent
- Blocked by: V2
- Description: Add targeted tests/checks so future agents can verify the wrapper and docs. Include cross-link from at most one repo-level location to the canonical Pi guidance. Ensure validation evidence can be archived without secrets.
- Files: likely `test/` shell/Python tests, canonical docs/skill, optional script tests.
- Acceptance Criteria:
  1. [ ] Tests/checks cover wrapper safety and docs discoverability.
     - Verify: targeted test command selected by implementation, e.g. `uv run pytest test -k agent_browser` or `make test-quick` if test suite is broad.
     - Pass: tests exit 0 and fail on unsafe broad Brave/Chrome kills, missing canonical docs, or conflicting `agent-browser --profile Default` Brave recipe.
     - Fail: no automated check catches the known failure modes.
  2. [ ] Documentation has one canonical quick start.
     - Verify: targeted test plus `grep -R "agent-browser" -n README.md AGENTS.md pi/README.md pi/skills scripts | head -120`
     - Pass: there is one clear primary doc and cross-links, not multiple conflicting recipes.
     - Fail: users cannot tell whether to use Chrome profile mode, Brave CDP mode, or wrapper mode.
  3. [ ] Timeline extraction guidance, if present, has fixture/unit coverage.
     - Verify: run the targeted test added by implementation.
     - Pass: repeated/partial snapshots dedupe correctly, stop after bounded attempts, report auth-required and partial-result status.
     - Fail: extraction can silently return duplicates or claim completion with fewer than requested items.

### Wave 3 -- Validation Gate

**V3: Validate wave 3** [medium] -- validation agent
- Blocked by: T4
- Checks:
  1. Run T4 acceptance criteria.
  2. Run `make test-quick`.
  3. Run `make lint`.
  4. Run `make check` before final completion.
  5. If any edit under `pi/tests/` occurs despite V1 scope, run `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test` or a documented single-file `pnpm test <file>` with no `--` separator.
  6. Confirm no `.env`, secret, raw auth state, real-profile screenshot, or unredacted account/profile evidence was created or tracked.
- On failure: fix and rerun V3.

## Dependency Graph

```
Wave 1: T1 → V1
Wave 2: T2, T3 (parallel after V1) → V2
Wave 3: T4 → V3
Final: V3 → F1, F2, F3, F4, F5
```

## Success Criteria

1. [ ] Runtime helper availability check is repeatable and non-mutating.
   - Verify: `scripts/agent-browser-brave --check && scripts/agent-browser-brave --check`
   - Pass: both runs exit consistently; no lockfiles or global install-flow edits appear.
2. [ ] Brave + `agent-browser` wrapper opens a safe test page and proves Brave identity.
   - Verify: `scripts/agent-browser-brave --open https://example.com --title --snapshot && scripts/agent-browser-brave --status`
   - Pass: status proves Brave target/profile mode `pi`; title/snapshot show Example Domain; no unrelated Brave processes are terminated.
3. [ ] Real Brave Default profile mode is explicit opt-in and non-blocking for archive unless the user requests authenticated validation.
   - Verify: `scripts/agent-browser-brave --help` and optional manual test only after approval.
   - Pass: warnings are clear; exact typed confirmation is required; archive can proceed without real-profile test when not requested.
4. [ ] Pi guidance is discoverable and actionable.
   - Verify: targeted doc test plus `grep -R "agent-browser" -n AGENTS.md README.md pi/README.md pi/skills scripts | head -120`
   - Pass: output points to one canonical quick start and no conflicting recipes.

## Validation Contract

`/do-it` must satisfy this contract before reporting the plan complete or archiving it.

### Automation completeness

- Required: yes
- `/do-it` must run all agent-runnable validation through documented commands, scripts, or wrappers.
- Authenticated real-profile access is optional and manual. If requested, the user must explicitly approve it and type the exact confirmation string. No credential, auth-state, raw real-profile page dump, or unredacted evidence may be committed.
- Manual-only steps must be justified and include exact user actions plus expected success signals.

### Required automated validation

1. [ ] Run the strongest repo-wide validation command or command set for this project.
   - Command: `make check`
   - Pass: exits 0 with no errors or warnings
   - Fail: do not archive; update `## Execution Status` with the failing command and next fix

2. [ ] Run task-specific verification from every acceptance criterion above.
   - Command: see each task's `Verify:` command
   - Pass: every acceptance criterion passes exactly as written
   - Fail: create/fix a task, rerun affected checks, then rerun repo-wide validation

3. [ ] Run targeted browser smoke verification when the host has Brave and network access.
   - Command: `scripts/agent-browser-brave --open https://example.com --title && scripts/agent-browser-brave --status`
   - Pass: status proves Brave target and title includes `Example Domain`
   - Fail: document whether failure is missing Brave, missing/resolution-failed `agent-browser`, network, wrong CDP target, or wrapper bug

### Evidence handling

- Required: yes
- Archive only minimal non-secret pass/fail evidence: command names, exit codes, sanitized status, and redacted paths.
- Do not archive raw authenticated screenshots, raw snapshots, raw X timelines, cookies, tokens, account handles, auth-bearing URLs, or local profile paths unless the user explicitly approves.
- Replace user-specific paths/profile names with placeholders in durable docs and archived evidence.

### Manual validation

- Required: no for V1 completion; yes only if the user explicitly requests authenticated real-profile validation.
- Steps when requested:
  1. User approves real Brave Default profile access for the session.
  2. User or wrapper receives the warning and types exactly: `I UNDERSTAND THIS CONTROLS MY REAL BRAVE PROFILE`.
  3. Executor runs the implemented real-profile wrapper mode, not ad hoc commands and not broad process cleanup.
  4. Expected success signal: sanitized wrapper status shows Brave target/profile mode `real`; wrapper URL/title/snapshot command shows the target page and a logged-in-only UI signal. Raw snapshot is not archived by default.

If requested manual validation is not confirmed passed, `/do-it` must classify the result as `implemented-awaiting-manual-validation`, update `## Execution Status`, and must not archive as fully complete.

### Deployment validation

- Required: no external deployment.
- Procedure: local helper/browser validation only. V1 does not deploy or modify global OS install flows.

### Archive rule

`/do-it` may archive this plan only after all required automated validation, task-specific verification, repo-wide validation, evidence redaction checks, and any user-requested manual validation pass. Archive evidence must include sanitized command outputs or paths for helper availability, Brave smoke test, docs check, and repo-wide validation.

## Handoff Notes

- Historical successful local Brave path used placeholders equivalent to:
  - Brave exe: `<LOCALAPPDATA>/BraveSoftware/Brave-Browser/Application/brave.exe`
  - Brave user data: `<LOCALAPPDATA>/BraveSoftware/Brave-Browser/User Data`
  - Profile directory: `Default` (the default Brave profile directory; the visible display name may differ by machine, e.g. `Work` here)
  - CDP port: `9222` only for manual testing, not default wrapper behavior
- `agent-browser --profile Default` selected Chrome in this environment and must not be documented as the Brave recipe.
- X.com timelines are virtualized. Extraction loops must dedupe and report partial results; do not claim 20 tweets read if fewer unique articles were captured.
- Avoid broad cleanup. Never add `taskkill /IM brave.exe`, `pkill brave`, `killall Brave`, or equivalent. Use recorded owned PID/session cleanup only after identity checks, or leave the browser open with manual instructions.
- The user prefers practical tooling that Pi can understand. Prefer a small wrapper plus clear Pi skill/docs before adding a larger Pi extension dependency.

## Execution Status

- Completion classification: blocked-by-failure
- Last updated: 2026-05-10
- Last completed wave/gate: Wave 3 implementation (T4) and task-specific verification (F1) completed.
- Next wave/gate to run: V3/F2 repo-wide validation after the unrelated Pi Vitest failure is resolved.
- Implemented:
  - Added `scripts/agent-browser-brave` safe Brave + `agent-browser` wrapper.
  - Updated `pi/skills/pi-skills/browser-tools/SKILL.md` with the canonical Pi-facing Brave wrapper quick start, safety rules, real-profile confirmation warning, and bounded timeline guidance.
  - Added `pi/README.md` cross-link for the wrapper.
  - Added `test/test_agent_browser_brave.py` coverage for wrapper safety and docs discoverability.
- Commands run and results:
  - `scripts/agent-browser-brave --help`: passed.
  - `scripts/agent-browser-brave --check`: passed; resolved `npx-fallback:agent-browser` and Brave executable.
  - `scripts/agent-browser-brave --status`: passed; initially no owned session state.
  - `uv run pytest test/test_agent_browser_brave.py -v --tb=short`: passed, 4 tests.
  - `scripts/agent-browser-brave --open https://example.com --title --snapshot`: passed; title `Example Domain`; snapshot included `Example Domain` heading and `Learn more` link ref.
  - `scripts/agent-browser-brave --status`: passed; sanitized status showed profile mode `pi`, loopback CDP endpoint, `braveIdentityVerified: true`, and `npx-fallback:agent-browser`.
  - `scripts/agent-browser-brave --close-owned`: passed; closed only the owned Brave PID and reported no broad browser kill attempted.
  - `make test-quick`: passed, 199 pytest tests.
  - `make lint`: passed, ruff and shellcheck.
  - `make check`: failed during Pi Vitest after repo Python tests and Pi extension typecheck passed. Failing test: `tests/codex-status.test.ts > /usage command > shows status when /clear input passes through`; error: `TypeError: Cannot read properties of undefined (reading 'handler')` at `tests/codex-status.test.ts:328`.
- Why not archived: required repo-wide validation (`make check`) failed. The failure is in existing/parallel Pi TypeScript changes outside this V1 plan scope (`pi/extensions`/`pi/tests` were explicitly out of scope for this implementation), so archive preflight cannot pass in this run.
- Checks still needed:
  1. Resolve the Pi Vitest failure in `tests/codex-status.test.ts` / related Pi extension changes, or restore unrelated in-progress Pi TypeScript edits to a passing state.
  2. Re-run `make check` and confirm exit 0.
  3. Re-run `/do-it .specs/agent-browser-pi-tooling/plan.md` after `make check` passes so V3/F2/F5 can be marked complete and the plan can be archived.
- Remaining user/manual steps: none for the agent-browser V1 feature unless authenticated real Brave profile validation is explicitly requested later. If requested, prefer `scripts/agent-browser-brave --real-brave-default --confirm-real-profile --open <url> --title` and type `I UNDERSTAND THIS CONTROLS MY REAL BRAVE PROFILE`; do not archive raw authenticated snapshots/screenshots. `--real-brave-profile Default` is the equivalent explicit directory form.
