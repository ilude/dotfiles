---
created: 2026-05-02
status: draft
completed:
---

# Plan: Deterministic Commit Helper for Slash Commit

## Context & Motivation

The `/commit push` workflow failed after `claude/state/menos_status.json` was removed from tracking and added to `.gitignore`. Git status correctly showed the file as a staged deletion, but the commit flow tried to `git add` the now-ignored path and failed. A second issue appeared when the generated commit message was rejected for not following the repo's conventional commit format.

This plan creates a deterministic V1 helper for commit planning and message validation. V1 deliberately does **not** own `git commit`, `git push`, broad secret scanning, or full auto-commit behavior. Instead, it produces reliable Git state classification, a safe staging plan, and local conventional-commit validation so the existing committer agent can avoid ignored-path/staged-deletion mistakes before mutating state.

## Constraints

- Platform: Windows via Git Bash/MSYS2 (`MINGW64_NT-10.0-26200`)
- Shell: `/usr/bin/bash`
- Python floor: `>=3.9` from `pyproject.toml`; invoke with `uv run python scripts/commit-helper ...`.
- Existing validation commands: `make test-quick`, `make lint`, and final `make check`.
- Commit messages must be conventional: `feat|fix|docs|chore|refactor|test|perf|ci|build(scope?): description`.
- V1 must be plan-first and non-mutating except for an explicit `stage --paths ...` subcommand.
- V1 must not implement `git commit` or `git push`; existing workflow performs those after helper validation.
- V1 must not force-add ignored files. If a future version supports this, it must require an explicit flag and user confirmation outside the helper.
- V1 must support the `git rm --cached` case: a local ignored file may exist while the index intentionally stages a deletion.
- Use repo-relative paths in JSON output; handle spaces, CRLF, and Windows/Git Bash path behavior.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Add more prose to `claude/shared/commit-instructions.md` only | Fastest; no new script | Still depends on agent interpreting porcelain status correctly; cannot deterministically prevent adding ignored staged deletions | Rejected: this exact failure was caused by prose-driven staging |
| Full auto-committer helper with commit/push/secret scanning | Centralizes the whole workflow | Too broad for V1; increases risk around hooks, remotes, partial staging, and false confidence from lightweight secret scanning | Rejected for V1; possible later phase |
| Deterministic planner/helper only | Solves observed failure with lower risk; keeps judgment and commit/push in existing committer workflow | Requires integration and tests; does not automate everything | **Selected** |
| Pi TypeScript extension only | Native Pi UX | `/commit` currently lives in Claude command/agent files and should be reusable across clients | Rejected: wrong first integration point |

## Objective

Produce a deterministic commit-helper V1 with three subcommands:

```text
status-json
stage-plan [--paths <paths...>]
validate-message <message>
```

Then update the slash commit instructions so the committer agent must use these commands before staging and committing. The end state must handle tracked files becoming ignored without trying to re-add them, and must reject invalid commit messages before `git commit` is attempted.

## Project Context

- **Language**: Python project tooling (`pyproject.toml`), shell/PowerShell scripts, dotfiles configuration
- **Test command**: `make test-quick`
- **Lint command**: `make lint`

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Define helper contract and JSON schema | 1 | feature | medium | planning-lead | -- |
| V1 | Validate wave 1 | -- | validation | medium | validation-lead | T1 |
| T2 | Implement commit-helper planner CLI | 1 | feature | medium | python-pro | V1 |
| T3 | Add real Git regression tests | 1 | feature | medium | qa-engineer | V1 |
| V2 | Validate wave 2 | -- | validation | medium | validation-lead | T2, T3 |
| T4 | Integrate helper into slash commit instructions | 1 | mechanical | small | documentation-engineer | V2 |
| V3 | Validate wave 3 | -- | validation | medium | validation-lead | T4 |

## Execution Waves

### Wave 1

**T1: Define helper contract and JSON schema** [medium] -- planning-lead
- Description: Create a contract document for the V1 helper. It must define commands, JSON fields, exit codes, path normalization, ignored-path behavior, staged-deletion behavior, and non-goals. Keep this separate from implementation to avoid parallel edits.
- Files: `docs/commit-helper-contract.md`
- Acceptance Criteria:
  1. [ ] Contract defines `status-json`, `stage-plan`, and `validate-message` only.
     - Verify: `grep -E "status-json|stage-plan|validate-message" docs/commit-helper-contract.md && ! grep -E "^## .*push|^## .*commit" docs/commit-helper-contract.md`
     - Pass: V1 commands are documented; commit/push are not V1 helper commands.
     - Fail: Contract still includes full commit/push automation.
  2. [ ] Contract defines per-path JSON fields: `path`, `index`, `worktree`, `classification`, `ignored`, `safe_to_git_add`, `recommended_action`, and `reason`.
     - Verify: `grep -E "safe_to_git_add|recommended_action|classification|ignored" docs/commit-helper-contract.md`
     - Pass: Required fields are documented.
     - Fail: Implementers can invent incompatible JSON shapes.
  3. [ ] Contract explicitly defines tracked ignored deletion as `classification: staged_deletion`, `ignored: true`, `safe_to_git_add: false`, `recommended_action: keep_staged`.
     - Verify: `grep -n "staged_deletion\|keep_staged\|safe_to_git_add.*false" docs/commit-helper-contract.md`
     - Pass: Original failure mode is specified.
     - Fail: The helper could still try to add the ignored path.

### Wave 1 -- Validation Gate

**V1: Validate wave 1** [medium] -- validation-lead
- Blocked by: T1
- Checks:
  1. Run T1 acceptance criteria.
  2. Confirm the contract is non-mutating by default and excludes commit/push.
  3. `make test-quick` -- all quick tests pass.
  4. `make lint` -- no new lint warnings.
- On failure: create a fix task, re-validate after fix.

### Wave 2 (parallel after V1)

**T2: Implement commit-helper planner CLI** [medium] -- python-pro
- Blocked by: V1
- Description: Implement `scripts/commit-helper` according to `docs/commit-helper-contract.md`. Use Python `argparse` and subprocess calls to Git. Output JSON for `status-json` and `stage-plan`; validate messages with deterministic exit codes. `stage-plan` must not mutate. If `stage --paths` is later needed, leave it out of V1 rather than adding underspecified mutation.
- Files: `scripts/commit-helper`
- Acceptance Criteria:
  1. [ ] `status-json` emits valid JSON with documented fields.
     - Verify: `uv run python scripts/commit-helper status-json | uv run python -m json.tool >/dev/null`
     - Pass: JSON parses successfully and includes documented top-level/per-path fields when changes exist.
     - Fail: Non-JSON output, missing fields, or uncaught Git errors.
  2. [ ] `stage-plan` marks already-staged deletions as not safe to add.
     - Verify: `uv run pytest test/test_commit_helper.py -k ignored_staged_deletion -q`
     - Pass: Test passes using a real temporary Git repo.
     - Fail: Helper recommends or attempts `git add` for staged deletion.
  3. [ ] `validate-message` rejects invalid messages and accepts conventional messages.
     - Verify: `uv run python scripts/commit-helper validate-message "Ignore generated menos status"; test $? -ne 0; uv run python scripts/commit-helper validate-message "chore: ignore generated menos status"`
     - Pass: Invalid message exits non-zero; valid message exits zero.
     - Fail: Hook-only validation remains the first defense.

**T3: Add real Git regression tests** [medium] -- qa-engineer
- Blocked by: V1
- Description: Add pytest coverage using temporary real Git repositories. Tests must avoid mocking Git for the original failure mode. Cover tracked-to-ignored staged deletion, ignored untracked files, modified tracked files, conventional message validation, and JSON parseability.
- Files: `test/test_commit_helper.py`
- Acceptance Criteria:
  1. [ ] Test reproduces the original ignored staged deletion flow with real Git commands.
     - Verify: `uv run pytest test/test_commit_helper.py -k ignored_staged_deletion -q`
     - Pass: Test creates a repo, tracks a file, ignores it, runs `git rm --cached`, and asserts `keep_staged` / `safe_to_git_add: false`.
     - Fail: Test uses only mocked porcelain output or does not assert the action fields.
  2. [ ] Test covers message validation.
     - Verify: `uv run pytest test/test_commit_helper.py -k message -q`
     - Pass: Invalid plain message rejected; valid `chore:` message accepted.
     - Fail: Invalid messages can pass until the hook rejects them.
  3. [ ] Test covers JSON output and path behavior for filenames with spaces.
     - Verify: `uv run pytest test/test_commit_helper.py -k "json or spaces" -q`
     - Pass: JSON parses and paths remain repo-relative.
     - Fail: Path quoting or JSON parsing fails.

### Wave 2 -- Validation Gate

**V2: Validate wave 2** [medium] -- validation-lead
- Blocked by: T2, T3
- Checks:
  1. Run acceptance criteria for T2 and T3.
  2. `make test-quick` -- all quick tests pass.
  3. `make lint` -- no new lint warnings.
  4. Cross-task integration: implementation output matches `docs/commit-helper-contract.md` exactly.
- On failure: create a fix task, re-validate after fix.

### Wave 3

**T4: Integrate helper into slash commit instructions** [small] -- documentation-engineer
- Blocked by: V2
- Description: Update the committer instructions so the `committer` agent must run `status-json` and/or `stage-plan` before staging, use `validate-message` before `git commit`, and distinguish prepared, committed, and pushed states. Existing commit/push commands remain outside the helper. Include the tracked-file-becomes-ignored example and explicitly forbid `git add` on entries where `safe_to_git_add` is false.
- Files: `claude/shared/commit-instructions.md`
- Acceptance Criteria:
  1. [ ] Instructions require `scripts/commit-helper status-json` or `stage-plan` before staging and `validate-message` before commit.
     - Verify: `grep -n "commit-helper status-json\|commit-helper stage-plan\|commit-helper validate-message" claude/shared/commit-instructions.md`
     - Pass: Required helper calls are present.
     - Fail: Agent can bypass deterministic planning.
  2. [ ] Instructions explicitly prohibit adding paths with `safe_to_git_add: false` and document `staged_deletion` / `keep_staged`.
     - Verify: `grep -n "safe_to_git_add: false\|staged_deletion\|keep_staged" claude/shared/commit-instructions.md`
     - Pass: Original failure mode is documented in the workflow.
     - Fail: Agent may re-add ignored staged deletions.
  3. [ ] Instructions keep push outside helper and require accurate push failure reporting.
     - Verify: `grep -n "Prepared:\|Committed:\|Pushed:\|push failed\|upstream" claude/shared/commit-instructions.md`
     - Pass: Reporting distinguishes states and does not claim success after staging only.
     - Fail: Workflow can report completion before commit/push success.

### Wave 3 -- Validation Gate

**V3: Validate wave 3** [medium] -- validation-lead
- Blocked by: T4
- Checks:
  1. Run T4 acceptance criteria.
  2. Run `uv run pytest test/test_commit_helper.py -q`.
  3. Run `make check`.
  4. Cross-task integration: instructions reference only implemented V1 helper commands.
- On failure: create a fix task, re-validate after fix.

## Dependency Graph

```text
Wave 1: T1 → V1
Wave 2: T2, T3 (parallel after V1) → V2
Wave 3: T4 → V3
```

## Success Criteria

1. [ ] The helper prevents the original failure mode end-to-end in a real temporary Git repository.
   - Verify: `uv run pytest test/test_commit_helper.py -k ignored_staged_deletion -q`
   - Pass: The ignored tracked deletion is classified as `staged_deletion`, `keep_staged`, `safe_to_git_add: false`.
2. [ ] Invalid commit messages are rejected before `git commit`.
   - Verify: `uv run python scripts/commit-helper validate-message "Ignore generated menos status"; test $? -ne 0`
   - Pass: Invalid message exits non-zero with a clear error.
3. [ ] `/commit` instructions require deterministic planning and accurate outcome reporting.
   - Verify: `grep -n "commit-helper\|Prepared:\|Committed:\|Pushed:" claude/shared/commit-instructions.md`
   - Pass: Workflow uses helper and distinguishes states.
4. [ ] Repo validation remains green.
   - Verify: `make check`
   - Pass: Lint and tests pass.

## Execution Status

- **Classification:** `blocked-by-failure`
- **Date:** 2026-05-02
- **Last completed wave/gate:** Wave 3 implementation completed; V3 automated feature checks passed except final repo-wide `make check`.
- **Next wave/gate to run:** Re-run V3 final validation after existing repo-wide lint failures are fixed or acknowledged.
- **Implemented:**
  - Added `docs/commit-helper-contract.md`.
  - Added `scripts/commit-helper` with `status-json`, `stage-plan`, and `validate-message`.
  - Added `test/test_commit_helper.py` with real temporary Git repository regression tests.
  - Updated `claude/shared/commit-instructions.md` to require helper-backed planning and message validation.
- **Commands run and results:**
  - `grep -E "status-json|stage-plan|validate-message" docs/commit-helper-contract.md && ! grep -E "^## .*push|^## .*commit" docs/commit-helper-contract.md` — passed.
  - `grep -E "safe_to_git_add|recommended_action|classification|ignored" docs/commit-helper-contract.md` — passed.
  - `grep -n "staged_deletion\\|keep_staged\\|safe_to_git_add.*false" docs/commit-helper-contract.md` — passed.
  - `make test-quick` — passed, 199 tests.
  - `make lint` — failed on pre-existing repo-wide ruff findings outside this implementation.
  - `uv run ruff check scripts/commit-helper test/test_commit_helper.py` — passed.
  - `uv run pytest test/test_commit_helper.py -q` — passed, 4 tests.
  - `uv run pytest test/test_commit_helper.py -k ignored_staged_deletion -q` — passed.
  - `uv run python scripts/commit-helper validate-message "Ignore generated menos status"; test $? -ne 0` — passed.
  - `grep -n "commit-helper\\|Prepared:\\|Committed:\\|Pushed:" claude/shared/commit-instructions.md` — passed.
  - `make check` — failed because `uv run ruff check` reports existing lint errors in files such as `claude/commands/yt-local/fetch_metadata.py`, `pi/skills/pdf-reader/scripts/pdf_search.py`, and others.
- **Commands/checks still needed:**
  - Fix or separately baseline the repo-wide existing ruff findings.
  - Re-run `make check`.
- **Manual steps:** None.
- **Archive status:** Not archived because final `make check` failed.
- **Resume:** Re-run `/do-it .specs/deterministic-commit-helper/plan.md` after the repo-wide lint failures are fixed or explicitly handled.

## Handoff Notes

- Keep the script neutral under `scripts/` so Claude, Pi, and OpenCode workflows can reuse it.
- V1 is intentionally not a full committer. Do not add `commit`, `push`, broad secret scanning, or force-add behavior unless the plan is revised.
- Use real temporary Git repositories for regression tests.
- Avoid destructive recovery commands in tests or workflow instructions unless inside disposable temporary directories.
- If future work adds push support, it must define remote/ref/upstream, detached HEAD, rejected push, and network failure semantics first.
