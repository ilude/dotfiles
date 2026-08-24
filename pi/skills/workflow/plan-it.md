# Plan an Executable Change

Turn `$ARGUMENTS` and relevant conversation context into `.specs/{slug}/plan.md` in the primary repository. Do not implement the plan. Use the latest stated goal and constraints as authoritative.

## Method

Load and follow `planning` for requirements, acceptance, and verification language. Before drafting, state the observable evidence that would prove the requested outcome and how that evidence could fail. Ask rather than choosing silently when materially different completion conditions fit the request.

Create the smallest complete plan using the existing mechanism. Preserve supplied requirements, defined terms, normative words, actors, conditions, bounds, exceptions, and verification. Preserve explicit behavior, interfaces, scope limits, and safety boundaries. Do not add unrelated work.

## Lifecycle

The command writes the plan directly under the primary repository's `.specs/` directory and does not create a planning branch or worktree. Choose a concise kebab-case slug from the requested outcome and conversation context; never use an invocation ID or a generic `plan-*` fallback. Unrelated tracked or untracked primary changes do not block `/plan-it` and must remain untouched. The plan must require `/do-it` to create and own the implementation worktree before implementation begins.

Use `plan_progress` for this invocation. Persisted lifecycle stages are only `started`, `draft`, `blocked`, and `ready`.

1. Create one canonical complete plan, establish real dependencies and mutation boundaries, then record `draft` with its path.
2. Select 2-4 independent subject-matter experts whose domains match the plan's actual risks. Delegate their adversarial reviews in parallel when possible. Each expert reads the entire draft, challenges correctness and feasibility from its assigned domain, and returns findings mapped to the objective, completion evidence, tasks, safety, or validation. Do not reuse one generic reviewer under several labels.
3. Apply every supported finding that affects the objective, completion evidence, dependencies, safety, executability, or validation. Reject findings that are irrelevant or unsupported. Record each subject-matter review with `plan_progress review` after disposition: use `covered` when supported findings have been repaired and `no_finding` when no repair was needed. Use `supported` only while a finding remains unresolved; it must later be recorded as `covered` after repair. Use `adversary`, `specialist`, or `proponent` for the perspective. `strategy` is optional telemetry, not a workflow prerequisite.
4. If a genuine operator-owned decision remains unresolved, call `blocked` and ask the operator. Git state, worktree state, transfer mechanics, commit state, and anticipated merge state are never `/plan-it` blockers; record them as `/do-it` execution context instead.
5. After correctness repairs, spawn one fresh subagent that did not participate in the subject-matter reviews. Give it only the revised complete plan and ask exclusively for overengineering, gold-plating, unnecessary abstraction, duplicate state, excessive validation, and churn risks.
6. Apply necessary subtractive findings, then record the final review with role `subtractive`: use `covered` after repairing supported findings or `no_finding` when no repair was needed. An unresolved `supported` result cannot reach readiness. For every task, mechanism, state field, telemetry field, abstraction, and validation step, ask:
   - Is it required to prove `Completion Evidence` or preserve a stated safety boundary?
   - Does the first task test one assumption with the smallest representative slice?
   - Does it build for an unobserved failure, future provider/client, or unrequested scale?
   - Does it add persistence, retries, correlation, lifecycle, or cleanup before proving value?
   - Can fewer files, modes, checks, or mutations answer the question?
   - Can later work become conditional and be skipped when the first slice finds no signal?
   Remove or defer anything that fails this necessity test. A factually valid reviewer concern is not a required repair unless it blocks completion evidence.
7. Reread the reduced complete plan and call `ready`. Readiness requires at least two completed subject-matter reviews followed by one completed subtractive review. The tool then runs deterministic plan-file validation.

If a shared TypeScript contract is changed, include an early typecheck before implementation expands. If a shared mechanism is unproven, specify one representative executable slice that can falsify it before expansion. Do not make typecheck a universal gate or add scheduler state for an experiment.

A restored snapshot may contain a legacy post-draft stage. Treat it as compatibility telemetry only. Complete the current subject-matter and subtractive reviews before `ready`. Do not emit the removed `settle_review`, `adjudicate`, `repair`, `accept`, or `inspect` actions.

## Plan Contract

Include `## Completion Evidence` after the objective with concise `Evidence:` and `Fails when:` statements settled from the request or operator discussion. This is the scope and stopping boundary.

State mutation boundaries explicitly: name the files or state owned by each task, what may be changed, and what remains untouched. Dependencies must identify actual prerequisites, not merely preferred order. A task is ready only when every required dependency is complete; independent ready tasks may proceed in parallel without adding scheduler records.

Use one checkbox list with 1-3 tasks. Each task names affected files or targets, dependencies only when present, the action, observable acceptance, and relevant verification. Task-level `Done when` and `Verify` clauses must collectively prove the completion evidence.

Include only context, boundaries, assumptions, safety, current status, or blockers that change execution. For shared or live state, name the target, stop condition, and concise rollback required by active instructions.

Every canonical plan retains incomplete work at primary `.specs/{slug}/plan.md`. It requires `/do-it` to materialize the spec in its owned implementation worktree, archive the completed spec to `.specs/archive/{slug}/`, commit the workflow branch, merge it with `--no-ff` into the primary branch, verify merged HEAD, then remove only the owned worktree and branch. Ignored specs remain untracked and return to the primary local archive after a successful merge; no workflow may force-add an ignored plan. Any dirty, unmerged, or conflict state preserves the implementation worktree and recoverable plan.

## Report

Report the execution-ready plan path, scope, dependencies, assumptions or blockers, and the direct next command:

```bash
/do-it .specs/{slug}/plan.md
```
