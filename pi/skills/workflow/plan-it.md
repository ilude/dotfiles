# Plan an Executable Change

Turn `$ARGUMENTS` and relevant conversation context into
`.specs/{slug}/plan.md`. Do not implement the plan.

## Method

Load and follow `planning` for requirements, acceptance, and verification language. Use an explicitly provided PRD; otherwise use the latest stated goal and constraints. Never choose a PRD merely because it is newest. If no substantive goal exists, ask what the plan should accomplish.

- Treat the latest user intent as authoritative when it changes earlier assumptions.
- Plan the smallest complete outcome using the existing mechanism.
- Translate source requirements into executable work without weakening them. Preserve requirement identifiers, defined terms, normative words, actors, conditions, bounds, exceptions, and verification.
- Do not invent architecture for later stages or hypothetical requirements.
- Expose unresolved ambiguity when competing interpretations would materially change design or acceptance. Make the first task the cheapest read-only check or bounded implementation attempt only when it can resolve that ambiguity without choosing a product decision.
- Preserve explicit behavior, interfaces, scope limits, and real safety boundaries. Exclude adjacent defects, generic hardening, and future lifecycle work.
- Inspect only enough to confirm ownership, paths, entrypoints, dependencies, validation, and a collision-free slug.
- Planning is read-only except for the plan artifact.

## Plan Contract

Use one checkbox list with 1-3 tasks. Each task names the affected files or
targets, dependencies only when present, the action, observable acceptance, and
relevant verification.

Include context, boundaries, assumptions, safety, current status, or blockers
only when they change execution. For shared or live state, name the target, stop
condition, and concise rollback required by active instructions.

Remove any task, section, or implementation decision whose absence would not break the requested outcome or a real safety boundary. Before writing, verify referenced paths and commands, dependency order, source requirement traceability where applicable, and workflow-level validation.

Every canonical plan must retain incomplete work at `.specs/{slug}/plan.md` and require `/do-it` to archive the entire completed spec directory to `.specs/archive/{slug}/`. Archival is part of plan completion, not an optional cleanup step.

## Artifact and Report

Create `.specs/{lowercase-hyphenated-slug}/plan.md`. Report its path, scope,
dependencies, assumptions or blockers, and:

```bash
/review-it .specs/{slug}/plan.md
/do-it .specs/{slug}/plan.md
```
