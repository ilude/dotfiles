---
created: 2026-05-29
status: draft
completed:
---

# Plan: Custom Pi /goal Command

## Context & Motivation

The current Pi goal workflow is provided by `npm:@narumitw/pi-goal` in `pi/settings.json`. It rejects long inline objectives with `Goal objective is too long (.../4000 characters)` because the package hardcodes a 4000-character maximum and repeats the objective in the initial prompt, active system prompt, and continuation prompts.

The requested replacement is a local Pi `/goal` command with a smaller user-facing command surface:

- `/goal <objective>` for inline objectives.
- `/goal <optional_path>/goal_prompt_file.md` for file-backed objectives.

Research found several other Pi goal packages and Ralph-style loop patterns. The useful common pattern for this repo is: keep durable task context in files or session state, inject compact reminders during ongoing turns, use an explicit completion tool, and produce a closeout report. The implementation should not adopt larger systems such as multiple open goal pools, drafting interviews, external CLI delegation, independent auditors, dashboards, or project-wide goal databases for this MVP.

Local investigation found that Pi command collisions are suffixed (`/goal:1`, `/goal:2`) and tool collisions use first-registration-wins behavior with diagnostics. Therefore the installed third-party goal package must be disabled or removed from `pi/settings.json` so the local extension owns both `/goal` and `goal_complete` cleanly.

## Constraints

- Platform: Windows with Git Bash/MSYS2 (`MINGW64_NT-10.0-26200`).
- Shell: `/usr/bin/bash`.
- Package manager: Pi TypeScript validation is pnpm-only in this repo.
- Existing repo instructions require LF line endings and ASCII punctuation in file content.
- Do not use npm or bun for Pi TypeScript validation.
- Existing uncommitted work is present in Pi damage-control files and `pi/settings.json`; executors must avoid overwriting unrelated local changes.
- Local extension placement should follow existing conventions: top-level `pi/extensions/*.ts`.
- Disable `npm:@narumitw/pi-goal` rather than relying on command/tool precedence.
- Inline objective target cap: use 15000 characters unless implementation discovers a Pi provider/schema reason to choose a smaller value.
- Path-backed objectives should read the file on start and use compact later reminders instead of repeatedly injecting the full file text.
- Completion must produce a final closeout report covering accomplished work, validation, current state, known gaps, and next steps to consider.

## Risk & Manual Gate Decision

Manual gates are exceptional. Decide based on blast radius and rollback, not generic confidence. Be conservative for work/shared systems and data/resources that cost money; treat personal/local GitHub repos as localized-to-user when changes are reversible and validated.

- **Risk level:** low
- **Blast radius:** personal-local-repo
- **Rollback:** easy with normal git revert or file edits
- **Manual approval before action:** not required
- **Manual validation after action:** not required
- **Decision reason:** This is a local dotfiles/Pi extension change with no external service mutation, no production deployment, and automated typecheck/test validation available. The only config mutation is disabling a package in `pi/settings.json`, which is reversible.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Keep `@narumitw/pi-goal` and raise its limit | Smallest diff; preserves current behavior | Still repeats large objectives every turn; package code is external; closeout reporting remains limited | Rejected: does not solve efficient long-goal handling |
| Wrap the existing package with another local command | Less code than a replacement | Command collisions create `/goal:1` style names; `goal_complete` collision is first-registration-wins; behavior would be brittle | Rejected: collision behavior was verified as unsafe for this goal |
| Build a focused local `pi/extensions/goal.ts` and disable the package | Owns `/goal` and `goal_complete`; can implement file-backed reminders and closeout output directly; follows local extension patterns | More code and tests than a config tweak | **Selected** |
| Adopt a full disk-backed multi-goal system | Supports multiple active goals, focus switching, auditors, and archival workflows | Much larger command surface than requested; more state and edge cases | Rejected: over-scoped for the requested two input forms |
| Ralph-style fresh-process outer loop | Strong for large task batches and context reset | Not a direct fit for an interactive Pi `/goal` command; would require separate loop scripts and task files | Rejected for MVP; file-backed goals can borrow compact durable-state ideas |

## Objective

Implement a local Pi `/goal` extension that owns `/goal` and `goal_complete`, supports inline and existing-file objectives, allows larger inline objectives up to 15000 characters, avoids repeated full objective injection after startup, and emits a structured closeout report when the goal is completed.

## MVP Boundary

The smallest user-visible outcome is:

1. Running `/goal Finish this concrete task` starts a local active goal and prompts the agent to work until completion.
2. Running `/goal path/to/goal_prompt_file.md` starts a file-backed goal from an existing markdown/text file.
3. Active turns receive compact goal guidance instead of the full long file every time.
4. Calling `goal_complete` marks the goal complete and produces a closeout report with accomplished work, validation, current state, known gaps, and next steps.

This is sufficient because it solves the actual friction: long goal setup and useful end-of-goal reporting. It is small enough for one focused implementation session.

## Explicit Deferrals

- No pause/resume/clear/status subcommands in this MVP.
- No token budget support.
- No multiple simultaneous goals or goal focus picker.
- No independent auditor session.
- No external CLI delegation.
- No persistent project-level `.pi/goals/` goal pool.
- No rich TUI widget beyond status text or simple notifications if needed.
- No automatic markdown goal file creation.

## Project Context

- **Language**: TypeScript for Pi extensions, Python/shell elsewhere in the dotfiles repo.
- **Test command**: `cd pi/tests && pnpm install --frozen-lockfile && pnpm test goal.test.ts`
- **Lint command**: no dedicated Pi extension lint command detected; TypeScript check is `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`.
- **Repo-wide validation command**: `make check-pi-extensions` for Pi extension typecheck plus Vitest suite; `make check` is broader and slower.
- **Relevant files**: `pi/extensions/goal.ts`, `pi/settings.json`, `pi/tests/goal.test.ts`, possibly `pi/tests/helpers/mock-pi.ts` only if existing mocks cannot support needed assertions.

## Automation Plan

| Operation | Command/wrapper | Credentials | Evidence |
|-----------|-----------------|-------------|----------|
| Preflight | `git status --short && python -m json.tool pi/settings.json >/dev/null` | none | terminal output showing current dirty files and valid JSON |
| Dependency install for extension validation | `cd pi/extensions && pnpm install --frozen-lockfile` | none | exit code 0 |
| Dependency install for tests | `cd pi/tests && pnpm install --frozen-lockfile` | none | exit code 0 |
| Focused typecheck | `cd pi/extensions && pnpm run typecheck` | none | exit code 0, no TypeScript errors |
| Focused test | `cd pi/tests && pnpm test goal.test.ts` | none | exit code 0, Vitest reports passing `goal.test.ts` |
| Pi extension validation | `make check-pi-extensions` | none | exit code 0, typecheck and Vitest suite pass |
| Repo-wide validation | `make check-pi-extensions` for this Pi-scoped MVP | none | exit code 0 |
| Deploy | `not applicable` | none | none |
| Rollback | `git diff -- pi/extensions/goal.ts pi/settings.json pi/tests/goal.test.ts` then reverse or revert the local changes if needed | none | working tree restored or diff reviewed |

## Execution Checklist

This checklist is the durable resume ledger for `/do-it`. Every executable task, validation gate, and final completion gate has exactly one matching checkbox. Checked means verified complete; unchecked means pending, in-progress, blocked, or invalidated.

`/do-it` must mark each item `[x]` immediately after that item passes its required verification and before starting any dependent or next sequential step. `/review-it` must preserve checked state, add unchecked items for new executable work, and never mark implementation or validation work complete.

### Wave 1

- [ ] T1: Implement local goal extension
  - Status: pending
  - Evidence: --
- [ ] T2: Disable third-party goal package
  - Status: pending
  - Evidence: --
- [ ] V1: Validate wave 1 integration
  - Status: pending
  - Evidence: --

### Wave 2

- [ ] T3: Add focused goal extension tests
  - Status: pending
  - Evidence: --
- [ ] V2: Validate tests and typecheck
  - Status: pending
  - Evidence: --

### Final Gates

- [ ] F1: Task-specific verification complete
  - Status: pending
  - Evidence: --
- [ ] F2: Repo-wide validation complete
  - Status: pending
  - Evidence: --
- [ ] F3: Manual validation not required or completed
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
| T1 | Implement local goal extension | 1 | feature | medium | typescript-builder | -- |
| T2 | Disable third-party goal package | 1 | mechanical | small | config-editor | -- |
| V1 | Validate wave 1 integration | -- | validation | medium | validation-specialist | T1, T2 |
| T3 | Add focused goal extension tests | 1-2 | feature | medium | test-engineer | V1 |
| V2 | Validate tests and typecheck | -- | validation | medium | validation-specialist | T3 |

## Execution Waves

### Wave 1 (parallel)

**T1: Implement local goal extension** [medium] -- typescript-builder
- Description: Create `pi/extensions/goal.ts` as a local Pi extension. It must register `/goal` and `goal_complete`, manage one session-scoped active goal, support inline and existing-file objectives, inject compact active-goal instructions before agent turns, and send continuation prompts when a turn ends without completion and there are no pending messages. Keep implementation focused and avoid unsupported subcommands.
- Files: `pi/extensions/goal.ts`
- Acceptance Criteria:
  1. [ ] Registers `/goal` and `goal_complete` with provider-safe schemas.
     - Verify: `cd pi/extensions && pnpm run typecheck`
     - Pass: TypeScript exits 0 with no schema/type errors.
     - Fail: TypeScript reports missing imports, incompatible Pi types, or invalid schema shapes; fix extension types before continuing.
  2. [ ] Inline objective handling accepts non-empty objectives up to 15000 characters and rejects longer objectives with an actionable warning.
     - Verify: `cd pi/tests && pnpm test goal.test.ts`
     - Pass: focused tests cover accepted and rejected inline objective lengths.
     - Fail: tests show the limit is still 4000, empty input starts a goal, or error wording does not guide the user.
  3. [ ] File-backed objective handling treats the argument as a file only when it resolves to an existing file under the current working directory or as an explicitly supplied safe path.
     - Verify: `cd pi/tests && pnpm test goal.test.ts`
     - Pass: tests cover an existing goal file and a non-existing path falling back to inline text or warning according to implementation rules.
     - Fail: traversal, missing files, or ambiguous path-like objectives behave unexpectedly.
  4. [ ] Active prompt injection is compact after goal creation.
     - Verify: `cd pi/tests && pnpm test goal.test.ts`
     - Pass: tests assert `before_agent_start` includes a compact reminder with file path/hash or short inline objective, not repeated full long file content.
     - Fail: full file content is injected on every turn.
  5. [ ] `goal_complete` returns and displays a closeout report with accomplished work, validation, current state, known gaps, and next steps.
     - Verify: `cd pi/tests && pnpm test goal.test.ts`
     - Pass: tests assert closeout fields are required or defaulted explicitly and completion clears active state.
     - Fail: completion only returns a one-line summary or leaves the goal active.

**T2: Disable third-party goal package** [small] -- config-editor
- Description: Edit `pi/settings.json` so `npm:@narumitw/pi-goal` no longer loads. Preserve valid JSON and existing disabled package conventions. Do not change unrelated settings.
- Files: `pi/settings.json`
- Acceptance Criteria:
  1. [ ] `npm:@narumitw/pi-goal` is not in the active `packages` array.
     - Verify: `python -m json.tool pi/settings.json >/dev/null && ! rg '"npm:@narumitw/pi-goal"' pi/settings.json -n --glob '!**/_disabled*'`
     - Pass: JSON is valid and active package entry is absent. If the entry is retained under `_disabledPackages`, document that as intentional.
     - Fail: JSON is invalid or the package remains active.
  2. [ ] Existing package settings are otherwise preserved.
     - Verify: `git diff -- pi/settings.json`
     - Pass: diff only disables/removes the goal package and preserves formatting style.
     - Fail: unrelated provider/model/router settings changed.

### Wave 1 -- Validation Gate

**V1: Validate wave 1 integration** [medium] -- validation-specialist
- Blocked by: T1, T2
- Checks:
  1. Run T1 and T2 acceptance criteria.
  2. `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck` -- all TypeScript checks pass.
  3. `python -m json.tool pi/settings.json >/dev/null` -- settings JSON is valid.
  4. Cross-task integration: confirm the local extension owns the intended names by checking only one local `/goal` registration exists in repo code and the third-party package is no longer active in settings.
- On failure: create a fix task, re-validate after fix.

### Wave 2

**T3: Add focused goal extension tests** [medium] -- test-engineer
- Blocked by: V1
- Description: Add a focused Vitest suite for the goal extension. Use `pi/tests/helpers/mock-pi.ts` and extend the mock only if necessary. Tests must validate command registration, inline objective parsing, file objective detection, session-state restoration from custom entries, compact prompt injection, continuation scheduling guard behavior where feasible, and structured closeout output.
- Files: `pi/tests/goal.test.ts`, possibly `pi/tests/helpers/mock-pi.ts`
- Acceptance Criteria:
  1. [ ] Focused test file covers command/tool registration and both objective modes.
     - Verify: `cd pi/tests && pnpm test goal.test.ts`
     - Pass: Vitest reports all tests in `goal.test.ts` passing.
     - Fail: tests fail, are skipped without reason, or do not exercise file-backed behavior.
  2. [ ] Tests cover completion closeout shape and state clearing.
     - Verify: `cd pi/tests && pnpm test goal.test.ts`
     - Pass: test assertions prove closeout fields are included and active state is cleared after completion.
     - Fail: completion can pass without closeout evidence or active state remains.
  3. [ ] Tests do not require network access or a live Pi TUI.
     - Verify: `cd pi/tests && pnpm test goal.test.ts`
     - Pass: tests run fully with mocks and temp files.
     - Fail: tests depend on external package state, user input, or live UI.

### Wave 2 -- Validation Gate

**V2: Validate tests and typecheck** [medium] -- validation-specialist
- Blocked by: T3
- Checks:
  1. `cd pi/tests && pnpm install --frozen-lockfile && pnpm test goal.test.ts` -- focused tests pass.
  2. `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck` -- extension typecheck passes.
  3. `make check-pi-extensions` -- Pi extension typecheck and Vitest suite pass.
  4. Review `git diff -- pi/extensions/goal.ts pi/settings.json pi/tests/goal.test.ts pi/tests/helpers/mock-pi.ts` for unrelated changes.
- On failure: create a fix task, re-run focused checks, then re-run `make check-pi-extensions`.

## Dependency Graph

```
Wave 1: T1, T2 (parallel) -> V1
Wave 2: T3 -> V2
Final: V2 -> F1, F2, F3, F4, F5
```

## Success Criteria

1. [ ] The local repo contains a focused `pi/extensions/goal.ts` implementation that owns `/goal` and `goal_complete` without the third-party goal package active.
   - Verify: `python -m json.tool pi/settings.json >/dev/null && rg 'registerCommand\("goal"' pi/extensions/goal.ts && rg 'name:\s*"goal_complete"' pi/extensions/goal.ts && ! rg '"npm:@narumitw/pi-goal"' pi/settings.json -n --glob '!**/_disabled*'`
   - Pass: all commands exit 0 except the active-package search, which must find no active entry.
2. [ ] Inline and file-backed goals are covered by automated tests, including long inline objective behavior and compact file-backed prompt injection.
   - Verify: `cd pi/tests && pnpm test goal.test.ts`
   - Pass: focused test suite exits 0 and includes assertions for inline, file-backed, compact reminder, and completion closeout behavior.
3. [ ] Pi TypeScript validation passes.
   - Verify: `make check-pi-extensions`
   - Pass: command exits 0 with no typecheck or Vitest failures.
4. [ ] Completion produces a closeout report usable for handoff.
   - Verify: `cd pi/tests && pnpm test goal.test.ts`
   - Pass: tests assert accomplished work, validation, current state, known gaps, and next steps appear in the tool result or visible custom message.

## Validation Contract

`/do-it` must satisfy this contract before reporting the plan complete or archiving it.

### Automation completeness

- Required: yes
- `/do-it` must be able to run all agent-runnable validation/deployment steps through documented commands, scripts, playbooks, or wrappers.
- Credentials required: none.
- Manual-only steps: none.

### Required automated validation

1. [ ] Run focused goal tests.
   - Command: `cd pi/tests && pnpm install --frozen-lockfile && pnpm test goal.test.ts`
   - Pass: exits 0; Vitest reports `goal.test.ts` passing.
   - Fail: do not archive; fix failures and rerun.

2. [ ] Run Pi extension typecheck.
   - Command: `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`
   - Pass: exits 0 with no TypeScript errors.
   - Fail: do not archive; fix type errors and rerun.

3. [ ] Run Pi extension validation suite.
   - Command: `make check-pi-extensions`
   - Pass: exits 0 with no errors or warnings.
   - Fail: do not archive; update execution status with failing command and next fix.

4. [ ] Run task-specific verification from every acceptance criterion above.
   - Command: see each task's `Verify:` command.
   - Pass: every acceptance criterion passes as written.
   - Fail: create or fix a task, rerun affected checks, then rerun repo-wide validation.

### Manual validation

- Required: no
- Justification: Automated validation is sufficient for this local, reversible Pi extension change.
- Steps:
  1. None.

If manual validation is not required, `/do-it` may mark the manual gate complete after recording why automated evidence is sufficient.

### Deployment validation

- Required: no
- Procedure: None.

If deployment is required and skipped, cancelled, or fails, `/do-it` must not archive the plan.

### Archive rule

`/do-it` may archive this plan only after all required automated validation, task-specific verification, deployment validation if any, and repo-wide validation pass. Do not require manual validation merely to increase confidence in non-destructive behavior that automated checks already cover.

## Telemetry & Evidence Contract

Future execution should record non-secret evidence in a machine-readable shape. This plan does not require implementing runtime telemetry; it defines the evidence record expected from `/do-it` or the executor's report.

Required fields for each task, validation gate, and final gate:

```yaml
episode_id: pi-goal-command
phase_id: wave-1 | wave-2 | final
task_id: T1 | T2 | V1 | T3 | V2 | F1 | F2 | F3 | F4 | F5
validation_command: <exact command or not-applicable>
status: pending | in_progress | passed | failed | blocked | not_required
archive_status: not_ready | ready | archived
started_at: <ISO-8601 timestamp>
completed_at: <ISO-8601 timestamp or null>
evidence: <terminal summary, non-secret artifact path, or diff reference>
```

Plan review data contract for adaptive embedded review:

```yaml
plan_profile: local-pi-extension-mvp
review_panel_decision: focused-review-recommended
expected_reviewer_count: 2
selected_reviewer_personas:
  - pi-extension-reviewer
  - test-validation-reviewer
selection_reasons:
  - command/tool collision behavior affects correctness
  - session-state and prompt-injection behavior require focused tests
complexity_score: 5
risk_score: 2
expected_high_risk_areas:
  - duplicate /goal or goal_complete registrations if the package remains active
  - accidental repeated injection of full file-backed objectives
  - incomplete closeout report shape
  - overwriting unrelated existing uncommitted work in pi/settings.json
```

## Handoff Notes

- Start by checking current diffs. This repository already has unrelated uncommitted Pi damage-control work and a modified `pi/settings.json`; preserve unrelated changes.
- Do not use `commit_stage` or `commit_create`; committing is not part of this plan unless separately requested.
- Use pnpm for Pi TypeScript work exactly as documented in repo instructions.
- For a single Vitest file, run `cd pi/tests && pnpm test goal.test.ts`; do not insert `--` before the file filter.
- If the active `pi/settings.json` diff already moved `npm:@narumitw/pi-goal` to `_disabledPackages`, verify that it is not still active rather than rewriting the whole file.
- If implementation needs helper exports for testing, keep them narrowly named and local to `goal.ts` rather than introducing a broad framework.
