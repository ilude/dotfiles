---
created: 2026-07-16
status: draft
completed:
---

# Plan: Shell and config test rationalization

## Goal

Split the static-content Python tests into three honest categories: semantic
config checks worth keeping, behavior worth testing through execution, and
source-shape assertions worth deleting â€” including deletions with explicitly
accepted coverage loss where a behavior replacement would be slow or flaky.

## Why

`test/test_config_patterns.py` (65 test functions, ~150 parametrized cases)
mostly asserts that shell files contain exact source fragments. Its own header
admits it tests implementation details. These tests fail on harmless refactors
and pass on real breakage, and they are the largest block of the repository's
static-contract inventory.

## Evidence base

- `.specs/workflow-test-rationalization/research/repo-state.md` â€” per-file
  recommendations (sections "Prose/wording tests").

## Boundaries

- A static grep test is nearly free; a spawned-shell test is not. Do not
  replace a cheap grep with a slow or flaky execution test â€” when a behavior
  test is not cheap and deterministic, prefer explicit accepted loss.
- Every deletion is classified: semantic-keep, behavior-replaced, or
  accepted-loss with one-line rationale (in the test file's commit message or a
  removal note).
- Keep semantic checks that parse structured config and compare meaning: WSL /
  main Dotbot link parity (`test_config_patterns.py:841-868`), CI executable
  modes and referenced paths, root package-lock guard (`test_ci_contract.py`).
- Preserve WSL / Git Bash / MSYS2 semantics; platform-specific behavior runs on
  its supported platform or an equivalent deterministic fixture, never inferred
  from regex presence.
- Python tooling is uv-based. LF endings, ASCII punctuation. Update
  `CHANGELOG.md`. Do not commit or push unless asked.

## Tasks

### T1: Split test_config_patterns.py

Classify all 65 functions using the repo-state report. Keep parsed-config
semantic checks. Where startup/env/path/plugin behavior is genuinely
load-bearing and cheaply testable (zsh/bash available in CI or locally,
deterministic fixture, sub-second), replace with execution tests grouped by
behavior. Delete cosmetic source greps outright.

Done when: no retained case exists solely to match source text; every removed
case carries a classification; focused suite runs faster than baseline.

### T2: Behavior-test the browser wrapper and narrow the CI contract

`test_agent_browser_brave.py`: exercise wrapper argument construction and
shutdown against a fake process; drop README-mention assertions.
`test_ci_contract.py`: keep the deployment contracts (executable modes,
workflow paths, package-lock guard) but stop regex-parsing shell out of
workflow YAML where a structured check is available.

Done when: wrapper safety is proven by behavior, not string absence; CI
contract checks parse structure, not prose.

## Validation

1. `uv run pytest test/ -v --tb=short` focused on changed files per task.
2. `make test-quick` once at the end; compare wall time and collected-test
   count against a before-run recorded at start.

## Out of scope

- Pi TypeScript tests (`.specs/harness-rework/plan.md` T5).
- Adding new lint/format tooling (`.specs/quality-tooling/plan.md`).

## Execution status

- **Classification:** planned, not started
- **Next:** T1, T2 in parallel
- **Resume:** `/do-it .specs/shell-test-rationalization/plan.md`
