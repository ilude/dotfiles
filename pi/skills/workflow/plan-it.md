# Plan an Executable Change

Turn `$ARGUMENTS` and relevant conversation context into a standalone `.specs/{slug}/plan.md`. Do not implement the plan.

## Objective

Give a fresh `/do-it` session the smallest plan that preserves the requested outcome, real dependencies, relevant validation, and resume state.

Use an explicit PRD path when provided. Otherwise use the user's stated goal and constraints. Never select a PRD because it is merely the newest file.

## Boundaries

- Planning is read-only except for the plan artifact.
- Preserve explicit decisions, scope limits, public interfaces, and rejected approaches only when they prevent likely rework.
- Ask only when ambiguity changes the outcome, destructive scope, or required approval.
- Keep useful but unnecessary work out of the plan.
- Do not prescribe a worker roster or runtime. Name a capability only when execution requires specialized tools, permissions, or knowledge.

## Repository Context

Inspect only enough repository state to verify ownership, supported entrypoints, affected boundaries, relevant checks, external constraints, and a collision-free `.specs/` path. Stop investigating when those facts are sufficient.

## Proportionality

Use `templates/plan-template.md` as the compact default.

- A local change should normally have 1-3 tasks.
- Add stages or waves only for a real dependency, staged rollout, or independent stateful target.
- Add operational safety only for actual destructive, stateful, deployment, external-mutation, secret, paid-resource, hardware, or irreversible work.
- Add approach decisions only when an executor could reasonably reopen a material choice.
- Do not create separate evidence files unless an external audit, migration record, or user request requires them.
- Record each fact once. Do not duplicate tasks across tables, wave narratives, dependency graphs, checklists, and success sections.

## Required Content

Every plan includes:

- context, objective, boundaries, and assumptions that affect execution;
- one checkbox list of executable tasks, with files, dependencies when present, action, acceptance, and relevant verification;
- validation that directly tests the requested outcome;
- concise archive and resume state.

Conditionally include stages, decisions, failure actions, rollback, backup, approval, canary, deployment, or incident handling only when the work requires them.

## Readiness

Before writing, confirm that referenced files, prerequisites, and commands exist; dependencies agree with task order; validation exercises the requested workflow; and no omitted decision blocks execution.

For actual stateful mutation, include one target, backup and restore or explicit no-prior-state handling, rollback boundary, and stop-on-failure behavior.

## Artifact

Create a lowercase hyphenated slug that does not collide with an existing `.specs/` path. If no substantive goal exists, ask: "What should this plan accomplish? Describe the goal and any constraints."

## Report

Report the plan path, scope, dependencies, assumptions or blockers, and the next commands:

```bash
/review-it .specs/{slug}/plan.md
/do-it .specs/{slug}/plan.md
```
