---
created: 2026-07-16
status: draft
completed:
---

# Plan: Repository-wide test rationalization

## Goal

Inventory every test in the repository, give each static-content candidate an
explicit keep / replace-with-behavior / delete / accepted-loss decision in one
ledger, and execute the Python-side cleanup here. No useless test survives
unexamined, and no protective test is deleted without a recorded decision.

## Why

`test/test_config_patterns.py` (65 test functions, ~150 parametrized cases)
mostly asserts that shell files contain exact source fragments; its own header
admits it tests implementation details. The prior audit counted 89 strict and
106 broad static-content tests repo-wide. Those counts are classification
inputs, not deletion targets â€” the missing piece is a reconciled per-test
decision record, which this plan owns.

## Evidence base

- `.specs/workflow-test-rationalization/research/repo-state.md` â€” per-file
  recommendations (section "Prose/wording tests") and the compensation-vs-
  durable classification criteria.

## Boundaries

- A static grep test is nearly free; a spawned-shell test is not. Do not
  replace a cheap grep with a slow or flaky execution test â€” when a behavior
  test is not cheap and deterministic, prefer explicit accepted loss.
- Every deletion resolves to a ledger row. Behavior replacement precedes
  deletion of real protection: the replacement must fail against an
  intentional regression before the old check goes.
- Keep semantic checks that parse structured config and compare meaning: WSL /
  main Dotbot link parity (`test_config_patterns.py:841-868`), CI executable
  modes and referenced paths, root package-lock guard (`test_ci_contract.py`).
- Text inspection is legitimate only when runtime code parses that text or the
  token is an external protocol.
- Preserve WSL / Git Bash / MSYS2 semantics; platform-specific behavior runs on
  its supported platform or an equivalent deterministic fixture, never inferred
  from regex presence.
- Pi test deletions are executed by `.specs/harness-rework/plan.md` T5, but
  their decisions are recorded in this plan's ledger so one document reconciles
  the whole repository.
- Python tooling is uv-based; Pi is pnpm-only. LF endings, ASCII punctuation.
  Update `CHANGELOG.md`. Do not commit or push unless asked.

## Tasks

### T1: Build the decision ledger

Collect the full test inventory: `uv run pytest --collect-only -q` for Python
(all rootdir suites, including hook tests), Vitest listing under `pi/`, and any
other test entrypoints found in `Makefile`/CI. Identify every test that reads
tracked prose, prompts, templates, configuration, or source and asserts
literal content, presence, or shape without executing behavior. Record each in
`.specs/test-rationalization/ledger.md` with: test ID, file, what it nominally
protects, runtime consumer (verified, not assumed), decision (keep /
replace-with-behavior / delete / accepted-loss), one-line rationale, and which
plan/task executes it. Reconcile against the prior 89/106 counts â€” explain any
delta rather than forcing the numbers to match.

Done when: every collected static-content candidate has exactly one ledger row
and decision; no decision claims a runtime consumer that was not verified in
code.

### T2: Split test_config_patterns.py

Execute the ledger decisions for `test/test_config_patterns.py`. Keep
parsed-config semantic checks. Where startup/env/path/plugin behavior is
genuinely load-bearing and cheaply testable (deterministic fixture,
sub-second), replace with execution tests grouped by behavior. Delete cosmetic
source greps outright.

Done when: no retained case exists solely to match source text; the focused
suite runs faster than baseline; ledger rows for this file are marked executed.

### T3: Behavior-test the browser wrapper and narrow the CI contract

`test_agent_browser_brave.py`: exercise wrapper argument construction and
shutdown against a fake process; drop README-mention assertions.
`test_ci_contract.py`: keep the deployment contracts (executable modes,
workflow paths, package-lock guard) but stop regex-parsing shell out of
workflow YAML where a structured check is available. Execute any remaining
ledger decisions for other Python/hook test files identified in T1.

Done when: wrapper safety is proven by behavior, not string absence; CI
contract checks parse structure, not prose; no Python-side ledger row remains
unexecuted.

### T4: Final reconciliation

After the Pi-side deletions land (harness-rework T5), verify the ledger:
every row is executed or explicitly deferred with rationale, recollected test
counts match the ledger's arithmetic, and a fresh sweep finds no remaining
static-content test lacking a decision.

Done when: the ledger is closed â€” zero unclassified static-content tests
repo-wide â€” and before/after test counts and `make test-quick` wall time are
recorded at the bottom of the ledger.

## Dependencies

T1 first. T2 and T3 in parallel after T1. T4 last, after harness-rework T5.

## Validation

1. `uv run pytest test/ -v --tb=short` focused on changed files per task.
2. `make test-quick` once at the end; compare wall time and collected-test
   count against the T1 baseline.

## Out of scope

- Executing Pi TypeScript test changes (`.specs/harness-rework/plan.md` T5 â€”
  decisions recorded here, execution there).
- Adding new lint/format tooling (`.specs/quality-tooling/plan.md`).

## Execution status

- **Classification:** planned, not started
- **Next:** T1
- **Resume:** `/do-it .specs/test-rationalization/plan.md`
