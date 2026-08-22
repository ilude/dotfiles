# Plan an Executable Change

Turn `$ARGUMENTS` and relevant conversation context into `.specs/{slug}/plan.md`. Do not implement the plan. Use the latest stated goal and constraints as authoritative.

## Method

Load and follow `planning` for requirements, acceptance, and verification language. Before drafting, state the observable evidence that would prove the requested outcome and how that evidence could fail. Ask rather than choosing silently when materially different completion conditions fit the request.

Create the smallest complete plan using the existing mechanism. Preserve supplied requirements, defined terms, normative words, actors, conditions, bounds, exceptions, and verification. Preserve explicit behavior, interfaces, scope limits, and safety boundaries. Do not add unrelated work.

## Lifecycle

Use `plan_progress` for this invocation. Persisted lifecycle stages are only `started`, `draft`, `blocked`, and `ready`.

1. Create one canonical plan, then record `draft` with its path.
2. Reread the complete draft. Record `risk` as `low` or `material` and identify whether the primary or a read-only leaf performed the inspection.
3. For material risk, optionally run one bounded review round: one adversary plus either one feasibility proponent or one domain specialist. Record each result with `review`. A failed perspective may be retried once only with a materially different strategy; never rerun a healthy perspective. Review records are telemetry and do not create lifecycle stages.
4. Update the plan for supported findings. If an issue remains unresolved, call `blocked` with one concise concern and ask the operator. After the answer, update the plan.
5. Reread the complete plan and call `ready`. The tool runs deterministic plan-file validation before recording readiness.

A restored snapshot may contain a legacy post-draft stage. Treat it as compatibility telemetry only: it may proceed to `ready` after the same deterministic validation. Do not emit the removed `settle_review`, `adjudicate`, `repair`, `accept`, or `inspect` actions.

## Plan Contract

Include `## Completion Evidence` after the objective with concise `Evidence:` and `Fails when:` statements settled from the request or operator discussion. This is the scope and stopping boundary.

Use one checkbox list with 1-3 tasks. Each task names affected files or targets, dependencies only when present, the action, observable acceptance, and relevant verification. Task-level `Done when` and `Verify` clauses must collectively prove the completion evidence.

Include only context, boundaries, assumptions, safety, current status, or blockers that change execution. For shared or live state, name the target, stop condition, and concise rollback required by active instructions.

Every canonical plan retains incomplete work at `.specs/{slug}/plan.md` and requires `/do-it` to archive the entire completed spec directory to `.specs/archive/{slug}/`.

## Report

Report the execution-ready plan path, scope, dependencies, assumptions or blockers, and the direct next command:

```bash
/do-it .specs/{slug}/plan.md
```
