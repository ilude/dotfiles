---
created: 2026-02-19T11:52:40-05:00
plan_file: .specs/test-modernization/plan.md
mode: analysis-only
status: in-progress
---

# Review Scratchpad

## Root Cause Registry
- RC-1: Ambiguous test oracle for shell-script behavior ("subprocess" vs "replicate logic") can produce non-equivalent pytest coverage.
- RC-2: Verification command/result mismatch (broad `grep -c bats Makefile` cannot validate scoped expectation).
- RC-3: Conflicting target state for bats references ("pytest-only suite" vs conditional allowance).
- RC-4: Validator tasks (V1/V2) are named but lack explicit pass/fail gates and artifacts.
- RC-5: Objective includes performance target but acceptance criteria lacks measurable runtime gate.
- RC-6: Sync-test scope lacks deterministic exclusion rules for platform-conditional links.
- RC-7: Negative-path verification currently depends on manual destructive edit of real config.
- RC-8: Plan removes bats assets but omits updates to repository documentation that still instruct bats usage.
- RC-9: Windows "no skips" statement is broader than modernization scope and conflicts with existing `@needs_bash` tests.
- RC-10: Accepted decision (pure Python oracle) is not yet reflected in T1 wording/verification.
- RC-11: T2 marker verification is internally inconsistent (`grep -c needs_bash == 2` vs class-level allowance).

## Issue Queue
- I1 (resolved): Define a single authoritative test strategy for `git_ssh_setup` conversion.
- I2 (resolved): Make verification commands for T4 measurable and internally consistent.
- I3 (resolved): Resolve conflicting end-state for bats removal vs allowed retention in Makefile.
- I4 (resolved): Define concrete validation gates for V1/V2 wave validators.
- I5 (resolved): Add measurable performance acceptance criteria aligned with objective.
- I6 (resolved): Define exact exclusion rules for install.conf ↔ wsl sync test scope.
- I7 (resolved): Replace destructive/manual-failure verification with deterministic, automated negative test method.
- I8 (resolved): Include docs/reference updates for removed bats workflows.
- I9 (resolved): Clarify Windows skip policy scope to avoid conflict with existing bash-dependent pytest markers.
- I10 (resolved): Dependency follow-up — align T1 acceptance text with chosen pure-Python oracle.
- I11 (resolved): Resolve T2 `needs_bash` verification contradiction (count-based check vs class-level marker allowance).

## Decisions
- I1: User selected Option B (pure Python reimplementation as oracle for `git_ssh_setup` conversion).
- I2: User selected Option A (targeted grep checks scoped to execution targets).
- I3: User selected Option A (full bats removal everywhere in Makefile and test flow).
- I4: User selected Option A (explicit validator checklists with commands, expected outcomes, evidence).
- I5: User selected Option A (add before/after timing criterion with deterministic method).
- I6: User selected Option A (explicit exclusion rules for conditional/platform links in sync test).
- I7: User selected Option A (automated fixture-based negative test using temp YAML copies).
- I8: User selected Option A (add docs cleanup task and acceptance checks for bats removal).
- I9: User selected Option A (scope skip policy to migrated tests only, not whole suite).
- I10: User selected Option A (rewrite T1 acceptance to pure-Python-only strategy).
- I11: User selected Option A (behavioral verification of bash-dependent tests instead of marker-count grep).

## Background Tasks

## Failures

## Final Reanalysis Notes
- Reanalysis complete after I11: no additional net-new material issues found.
