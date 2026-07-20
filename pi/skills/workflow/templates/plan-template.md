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

## Tasks

- [ ] **T1: {deliverable}**
  - Files: {exact paths}
  - Depends on: {IDs; omit when none}
  - Change: {bounded implementation action}
  - Done when: {observable acceptance criterion}
  - Verify: `{check that directly tests this outcome}`

{Add stages, failure actions, or more tasks only when real dependencies or risk require them.}

## Validation

- [ ] Requested workflow: `{user entrypoint or direct inspection}`
  - Expected: {observable outcome}
- [ ] Additional required check: `{omit when none}`
  - Expected: {observable outcome}

## Archive Rule

Archive to `.specs/archive/{slug}/plan.md` when every required checkbox is complete and no required action remains.

## Execution Status

- State: planned, not started
- Blocker: none
- Next: T1
- Resume: `/do-it {plan-path}`
