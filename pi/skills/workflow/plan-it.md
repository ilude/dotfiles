# Plan an Executable Change

Turn `$ARGUMENTS` and relevant conversation context into a standalone
`.specs/{slug}/plan.md`. Do not implement the plan.

## Goal and Scope

Use an explicitly provided PRD; otherwise use the user's stated goal and
constraints. Never choose a PRD merely because it is newest. If no substantive
goal exists, ask: "What should this plan accomplish? Describe the goal and any
constraints."

Produce the smallest critical path that achieves the outcome:

- Preserve explicit decisions, behavior, interfaces, and scope limits.
- Prefer existing maintained mechanisms over new frameworks or abstractions.
- Exclude adjacent defects, generic hardening, future lifecycle concerns, and
  hypothetical requirements.
- Resolve decisions that block the first task. Make later unknowns preflight
  checks with stop conditions.
- Ask only when ambiguity changes the outcome, destructive scope, or approval.
- Inspect only enough to confirm ownership, files, entrypoints, dependencies,
  validation, and a collision-free slug.
- Planning is read-only except for the plan. Do not prescribe workers or runtime.

Remove any task whose absence would not break the requested outcome or a real
safety boundary.

## Proportionality and Safety

Use the lowest level justified by the affected state:

- **Disposable or Git-recoverable local work:** rely on reproducibility and Git.
  Do not add backups, rollback sections, approvals, evidence files, or archives.
- **Shared but reversible external state:** name the target, required approval,
  stop condition, and one concise rollback. Record a prior revision only when
  recovery needs it.
- **Durable, destructive, difficult-to-recreate, or production state:** include
  explicit approval, backup and restore or verified no-prior-state handling,
  rollback boundaries, and staged validation.

Do not escalate controls merely because work technically mutates state. Ask
before destroying data of unknown value. Ordinary local work should have 1-3
tasks; add stages or operational handling only for real dependencies or risk.

## Plan Contract

Include:

- context, objective, boundaries, and relevant assumptions;
- one checkbox list whose tasks name files or targets, dependencies when present,
  action, observable acceptance, and relevant verification;
- direct validation of the changed workflow;
- current status, blocker if any, and next action.

Never assign overlapping same-file write scopes to parallel tasks; combine them
or add a dependency. Do not create a separate archive, evidence, safety,
documentation, or validation task unless it performs substantive required work.

Before writing, verify referenced paths and commands, dependency order,
workflow-level validation, and decisions blocking the first task.

## Artifact and Report

Create `.specs/{lowercase-hyphenated-slug}/plan.md`. Report its path, scope,
dependencies, assumptions or blockers, and:

```bash
/review-it .specs/{slug}/plan.md
/do-it .specs/{slug}/plan.md
```
