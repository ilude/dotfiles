---
created: 2026-02-22T20:56:49.100696+00:00
plan_file: .specs/onyx-session-fix/plan.md
mode: review-then-apply
status: in-progress
---

# Review Scratchpad

## Root Cause Registry
- RC1: Backend step references unstable line numbers instead of stable code anchors/signatures.
- RC2: WS consistency objective is under-specified relative to HTTP duplicate-history fix.

## Issue Queue
- Issue 1 (resolved): Replace brittle orchestrator line-number instructions with method/behavior anchored edits.
- Issue 2 (resolved): Objective requires WS consistency audit, but task details only move persistence timing for WS and may miss duplicate-history parity checks.

## Decisions
- Issue 1: Option 1 selected - replace line-number references with method/behavior anchored instructions.
- Issue 2: Option 1 selected - explicitly require WS duplicate-history parity check with HTTP paths.

## Background Tasks

## Failures

## Final Reanalysis Notes
- Applied decisions verified in `.specs/onyx-session-fix/plan.md`:
  - Issue 1 reflected: backend instructions now anchored to methods/behavior, no brittle line references.
  - Issue 2 reflected: WS duplicate-history consistency requirement added to task + acceptance criteria.
