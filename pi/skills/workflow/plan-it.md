# Plan an Executable Change

Turn `$ARGUMENTS` and relevant conversation context into a standalone plan. Do not implement the plan.

## Objective

Produce `.specs/{slug}/plan.md` with enough repository evidence, task detail, validation, and durable state for a fresh `/do-it` session to execute safely.

A PRD is optional. Use an explicit PRD path when provided; otherwise use the user's stated goal and constraints. Never select a PRD merely because it is the newest file.

## Hard Boundaries

- Planning is read-only except for the plan artifact and its owned planning evidence.
- Preserve explicit user decisions, rejected approaches, scope limits, and public interfaces.
- Ask only when unresolved ambiguity changes the executable outcome, destructive scope, or required user gate.
- Keep the plan to the requested outcome. Put useful but unnecessary work in explicit deferrals.
- Separate independent stateful replacements into distinct waves. Each such wave names backup evidence, restore action, rollback boundary, and one mutation target.
- A failed live mutation blocks later rollout work until the affected boundary is healthy again.
- Do not prescribe a fixed worker roster or runtime selection. Record a required capability only when execution needs specialized tools, permissions, or domain knowledge.

## Required Evidence

Inspect enough repository state to ground every executable claim:

- owning files and local instructions;
- supported entrypoints and likely affected boundaries;
- test, lint, typecheck, deployment, and rollback commands;
- platform, credential, external-system, and mutation constraints;
- existing `.specs/` paths and collision risks.

Use safe read-only probes when they resolve readiness. A command, file, variable, wrapper, or service required by a task must exist before that task runs.

## Plan Content

Read `templates/plan-template.md` and use it as the structural contract. The plan must include:

- context, objective, boundaries, assumptions, and explicit deferrals;
- risk, blast radius, rollback, approval, manual validation, and deployment decisions;
- concrete tasks with files, dependencies, mutation boundaries, required capabilities, acceptance criteria, exact verification commands, pass signals, and failure actions;
- execution waves and validation gates aligned with the dependency graph;
- an automation plan for operational steps and credential sources;
- end-to-end success criteria;
- a durable execution checklist that maps one-to-one to tasks and gates;
- non-secret evidence destinations for tasks and gates;
- archive conditions and durable incomplete-state requirements.

Choose the smallest executable task breakdown that preserves real dependencies. Record alternatives only when approach judgment matters; include the rejected trade-off that would help an executor avoid reopening the decision.

## Readiness Audit

Before writing the artifact, verify:

- the plan is standalone and project-specific;
- every task and gate has an action, success signal, failure action, and evidence destination;
- task, wave, dependency, validation, and checklist IDs agree;
- prerequisites exist before dependent work;
- validation exercises the requested workflow, not only an adjacent helper;
- repository-wide completion checks are named;
- stateful work has backup, restore, rollback, canary, and incident boundaries;
- manual gates exist only for risk that automation cannot safely resolve;
- no deferred item blocks completion or archive.

Repair deterministic plan defects before writing. Do not defer basic executability to `/review-it`.

## Artifact

Create a lowercase hyphenated slug that does not collide with an existing `.specs/` path. Write `.specs/{slug}/plan.md` from the template.

If no substantive goal exists, ask: "What should this plan accomplish? Describe the goal and any constraints."

## Definition of Done

- The plan artifact exists at a unique path.
- It can be resumed in a fresh session without conversation-only context.
- Its commands, dependencies, gates, and evidence requirements are executable and internally consistent.
- No implementation or deployment action ran.

## Report

First line:

`[OK] PLAN CREATED: no code was executed.`

Report the plan path, concise scope, task/dependency summary, assumptions or unresolved blockers, and both next commands:

```bash
/review-it .specs/{slug}/plan.md
/do-it .specs/{slug}/plan.md
```

Final line:

`FINAL STATUS: PLAN CREATED -- no code executed.`
