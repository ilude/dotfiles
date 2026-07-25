# Plan an Executable Change

Turn `$ARGUMENTS` and relevant conversation context into
`.specs/{slug}/plan.md`. Do not implement the plan.

## Method

Use an explicitly provided PRD; otherwise use the latest stated goal and
constraints. Never choose a PRD merely because it is newest. If no substantive
goal exists, ask what the plan should accomplish.

- Treat the latest user intent as authoritative when it changes earlier
  assumptions.
- Plan the smallest complete outcome using the existing mechanism.
- Do not invent architecture for later stages or hypothetical requirements.
- When uncertainty changes the design, make the first task the cheapest check or
  implementation attempt that resolves it.
- Preserve explicit behavior, interfaces, scope limits, and real safety
  boundaries. Exclude adjacent defects, generic hardening, and future lifecycle
  work.
- Inspect only enough to confirm ownership, paths, entrypoints, dependencies,
  validation, and a collision-free slug.
- Planning is read-only except for the plan artifact.

## Plan Contract

Use one checkbox list with 1-3 tasks. Each task names the affected files or
targets, dependencies only when present, the action, observable acceptance, and
relevant verification.

Include context, boundaries, assumptions, safety, current status, or blockers
only when they change execution. For shared or live state, name the target, stop
condition, and concise rollback required by active instructions.

Remove any task, section, or implementation decision whose absence would not
break the requested outcome or a real safety boundary. Before writing, verify
referenced paths and commands, dependency order, and workflow-level validation.

## Artifact and Report

Create `.specs/{lowercase-hyphenated-slug}/plan.md`. Report its path, scope,
dependencies, assumptions or blockers, and:

```bash
/review-it .specs/{slug}/plan.md
/do-it .specs/{slug}/plan.md
```
