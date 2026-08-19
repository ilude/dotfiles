# Plan an Executable Change

Turn `$ARGUMENTS` and relevant conversation context into
`.specs/{slug}/plan.md`. Do not implement the plan. The selected primary model
owns plan decisions, reviewer selection, adjudication, and readiness.

## Method

Load and follow `planning` for requirements, acceptance, and verification
language. Use an explicitly provided PRD; otherwise use the latest stated goal
and constraints. Never choose a PRD merely because it is newest. If no
substantive goal exists, ask what the plan should accomplish.

- Treat the latest user intent as authoritative when it changes earlier assumptions.
- Before drafting, state the observable evidence that would prove the requested outcome and how that evidence could fail. If materially different completion conditions fit the request, discuss them with the operator and settle one; do not fill the gap yourself.
- Plan the smallest complete outcome using the existing mechanism.
- Translate supplied source requirements into executable work without weakening them. Preserve supplied requirement identifiers, defined terms, normative words, actors, conditions, bounds, exceptions, and verification; do not invent requirement IDs or contracts.
- Do not invent architecture for later stages or hypothetical requirements.
- Expose unresolved ambiguity when competing interpretations would materially change design or acceptance. Ask the operator rather than choosing silently.
- Preserve explicit behavior, interfaces, scope limits, and real safety boundaries. Exclude adjacent defects, generic hardening, future lifecycle work, and tasks not required by the requested outcome or a real safety boundary.
- Inspect only enough to confirm ownership, paths, entrypoints, dependencies, validation, and a collision-free slug.
- Planning is read-only except for the canonical plan artifact.

## Lifecycle

Use `plan_progress` for the active invocation. Do not skip, duplicate, or reorder
its transitions.

1. Create one canonical plan, then record `draft` with its path.
2. Reread the complete draft. Record `risk` as `low` or `material` and identify whether the primary or a read-only leaf performed the inspection.
3. For low risk, launch no reviewers and record `settle_review`.
4. For material risk, use direct root-to-leaf delegation for one adversary plus either one feasibility proponent for a distinct disputed claim or one domain specialist for needed domain evidence. Use one round and no more than two perspectives. Record each bounded result with `review`. A failed perspective may be retried once only with a materially different strategy; never rerun a healthy perspective. When remaining evidence covers a failed perspective, record the retry outcome as `covered`. Then record `settle_review`.
5. Verify every outcome-changing claim against the plan and repository. A finding is advisory unless it maps to requested acceptance, a stated invariant, or a safety boundary. Record `adjudicate`, classifying each settled perspective as `required_repair`, `rejected`, `deferred`, `operator_decision`, or `no_change`. Ask the operator and stop when a required product choice remains unresolved.
6. Apply at most one coherent repair pass. Record `repair` when a required repair was applied, otherwise record `accept`. Do not launch a second or post-repair panel.
7. Reread the complete result and record `inspect`. When the primary lacks file tools, use one read-only leaf for this inspection.
8. Set plan frontmatter status to `ready`, then record `ready`. This transition runs deterministic plan-contract validation and must pass before reporting readiness.

Reviewers are advisory leaves and never edit the plan. The primary writes when
it has file tools. Otherwise delegate serialized plan creation or repair to one
scoped modifying leaf using the primary's chosen content; never run concurrent
plan writers. Do not create review directories, reviewer ledgers, debate
transcripts, synthesis workers, or separate reviewer artifacts.

## Plan Contract

Include `## Completion Evidence` after the objective with concise `Evidence:` and `Fails when:` statements settled from the request or operator discussion. This is the plan's scope and stopping boundary.

Use one checkbox list with 1-3 tasks. Each task names the affected files or
targets, dependencies only when present, the action, observable acceptance, and
relevant verification.

Include context, boundaries, assumptions, safety, current status, or blockers
only when they change execution. For shared or live state, name the target, stop
condition, and concise rollback required by active instructions.

Remove any task, section, or implementation decision not required by the completion evidence or a real safety boundary. Before readiness, verify that task-level `Done when` and `Verify` clauses collectively prove the completion evidence, then verify referenced paths and commands, dependency order, source requirement traceability where applicable, and workflow-level validation.

Every canonical plan must retain incomplete work at `.specs/{slug}/plan.md` and
require `/do-it` to archive the entire completed spec directory to
`.specs/archive/{slug}/`. Archival is part of plan completion, not optional
cleanup.

## Report

Report the execution-ready plan path, scope, dependencies, assumptions or
blockers, and the direct next command:

```bash
/do-it .specs/{slug}/plan.md
```
