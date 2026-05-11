# QA Validation Realism Review

## Finding 1
- severity: high
- evidence: Wave validators repeatedly say “Run typecheck and targeted Vitest,” but only one target filename is named, and final `pnpm run test` does not prove the same-turn seam, route-decision/status parity, Python parity, or privacy gates were specifically exercised. Passing broad tests could be false confidence if discovery/config skips relevant specs.
- required_fix: For each success criterion, map exact automated tests/commands to the criterion and require evidence of spec names, assertions covered, exit codes, and failure behavior.

## Finding 2
- severity: high
- evidence: Several gate commands are aspirational against current interfaces (`classify.py --prompt-file`, `evaluate.py --config/--data/--sequences/--json`, artifact hash checks) and the plan does not require a pre-gate proving the commands themselves exist before using them as validation.
- required_fix: Add command-contract tests or dry-run/help checks before implementation gates. Each gate must fail closed if the command or option is missing rather than silently validating different behavior.

## Finding 3
- severity: high
- evidence: Privacy validation is deferred mostly to T8/V4, but earlier waves run classifier/eval paths and produce evidence. Existing Python logging may write `prompt_excerpt` when routing logs are enabled, so early validation can contaminate artifacts before the final archive scan.
- required_fix: Move privacy hardening and log-disable defaults before any classifier/eval execution, or mandate isolated env vars disabling logs. Add an early grep/schema gate proving no raw prompt/excerpt was written.

## Finding 4
- severity: medium
- evidence: The checklist has status/evidence fields, but no resume ledger format requiring command history, changed files, blocker decisions, or next safe command. After a failed wave, a new agent could mark checkboxes based on stale or partial artifacts.
- required_fix: Define a mandatory resume ledger updated after every task with cwd, commit/worktree status, commands run, artifacts created, failures, repairs, and next action. Make wave advancement require ledger consistency.

## Finding 5
- severity: medium
- evidence: Failure/repair loops are underspecified. Many tasks say “Fail: repair” or “fail closed,” but do not require regression tests that first reproduce the failure, nor do they prevent proceeding after repair without rerunning upstream dependent gates.
- required_fix: Add a repair protocol: capture failing command, add/identify a regression test, fix, rerun the failed gate plus all dependent gates, and record before/after evidence in the ledger.
