---
created: {YYYY-MM-DD}
status: draft
completed:
---

# Plan: {title}

## Context

{Only the evidence and prior decisions a fresh executor needs.}

## Objective

{One concrete, verifiable end state.}

## Boundaries

- In scope: {requested outcome and owned surfaces}
- Out of scope: {explicit exclusions}
- Preserve: {interfaces, behavior, data, and decisions}
- Assumptions: {only assumptions that affect execution, or "None."}

{Add approach decisions or operational safety only when the work actually requires them.}

## Requirements Contract

{Include only when the source contains normative requirements. Preserve each source identifier, defined term, actor, condition, required outcome, measure or bound, exception, and verification. Do not restate narrative text as formal requirements.}

## Tasks

- [ ] **T1: {deliverable}**
  - Files: {exact paths}
  - Depends on: {IDs; omit when none}
  - Change: {bounded implementation action}
  - Done when: {observable acceptance criterion}
  - Verify: `{check that directly tests this outcome}`

{Add stages, failure actions, or more tasks only when real dependencies or risk require them.}

## Validation

- [ ] Focused check: `{user entrypoint, direct inspection, or check that exercises the changed contract}`
  - Expected: {observable outcome}
- [ ] Complete repository gate: `{gate required by applicable repository instructions; omit when none}`
  - Expected: {observable outcome}

## Retention

Keep the plan at this path after completion. Archive or move it only when the user asks.

## Execution Status

- State: planned, not started
- Blocker: none
- Next: T1
- Resume: `/do-it {plan-path}`
