# Plan an Executable Change

Turn `$ARGUMENTS` and relevant conversation context into `.specs/{slug}/plan.md` inside the one owned workflow worktree. Do not implement the plan. Use the latest stated goal and constraints as authoritative.

## Method

Load and follow `planning` for requirements, acceptance, and verification language. Before drafting, state the observable evidence that would prove the requested outcome and how that evidence could fail. Ask rather than choosing silently when materially different completion conditions fit the request.

Create the smallest complete plan using the existing mechanism. Preserve supplied requirements, defined terms, normative words, actors, conditions, bounds, exceptions, and verification. Preserve explicit behavior, interfaces, scope limits, and safety boundaries. Do not add unrelated work.

## Lifecycle

The command owns exactly one branch/worktree beneath repository-root `.worktrees/`. Create it before writing the plan, record its ownership, and resume that same record on continuation. All reads, writes, plan artifacts, and validation must target that worktree. Unrelated tracked or untracked changes in the primary worktree do not block `/plan-it` and must remain untouched. Unmerged or conflicting state stops the workflow and preserves the recovery worktree.

Use `plan_progress` for this invocation. Persisted lifecycle stages are only `started`, `draft`, `blocked`, and `ready`.

1. Create one canonical plan, then record `draft` with its path.
2. Reread the complete draft. Record `risk` as `low` or `material` and identify whether the primary or a read-only subagent performed the inspection.
3. Establish real dependencies, mutation boundaries, and the first dependency-ready work. Keep independent dependency-ready work parallel where that improves execution; never invent scheduler state to represent the plan.
4. If a shared TypeScript contract is changed, run an early typecheck before implementation expands. Do not make typecheck a universal planning gate for isolated prose, tests, or unrelated implementation.
5. If a shared mechanism is unproven, specify one representative executable slice that can falsify it before expanding the implementation. Keep the slice bounded and do not add scheduler state merely to support the experiment.
6. Perform one correctness review of the complete plan, using one adversarial perspective and, only for material risk, one distinct feasibility or domain perspective. Record mapped findings and do not create a duplicate review path.
7. Apply only findings that affect the objective, completion evidence, dependencies, safety, or validation. If an issue remains unresolved, call `blocked` with one concise concern and ask the operator. After the answer, update the plan.
8. Run one final parent-owned subtractive gate after correctness repair. Do not delegate another review. For every task, mechanism, state field, telemetry field, abstraction, and validation step, ask:
   - Is it required to prove `Completion Evidence` or preserve a stated safety boundary?
   - Does the first task test one assumption with the smallest representative slice?
   - Does it build for an unobserved failure, future provider/client, or unrequested scale?
   - Does it add persistence, retries, correlation, lifecycle, or cleanup before proving value?
   - Can fewer files, modes, checks, or mutations answer the question?
   - Can later work become conditional and be skipped when the first slice finds no signal?
   Remove or defer anything that fails this necessity test. A factually valid reviewer concern is not a required repair unless it blocks completion evidence.
9. Reread the reduced complete plan and call `ready`. The tool runs deterministic plan-file validation before recording readiness.

A restored snapshot may contain a legacy post-draft stage. Treat it as compatibility telemetry only: it may proceed to `ready` after the same deterministic validation. Do not emit duplicate review paths or the removed `settle_review`, `adjudicate`, `repair`, `accept`, or `inspect` actions.

## Plan Contract

Include `## Completion Evidence` after the objective with concise `Evidence:` and `Fails when:` statements settled from the request or operator discussion. This is the scope and stopping boundary.

State mutation boundaries explicitly: name the files or state owned by each task, what may be changed, and what remains untouched. Dependencies must identify actual prerequisites, not merely preferred order. A task is ready only when every required dependency is complete; independent ready tasks may proceed in parallel without adding scheduler records.

Use one checkbox list with 1-3 tasks. Each task names affected files or targets, dependencies only when present, the action, observable acceptance, and relevant verification. Task-level `Done when` and `Verify` clauses must collectively prove the completion evidence.

Include only context, boundaries, assumptions, safety, current status, or blockers that change execution. For shared or live state, name the target, stop condition, and concise rollback required by active instructions.

Every canonical plan retains incomplete work at `.specs/{slug}/plan.md` in the owned worktree and requires `/do-it` to archive the entire completed spec directory to `.specs/archive/{slug}/`, commit the workflow branch, merge it with `--no-ff` into the primary branch, verify merged HEAD, then remove only the owned worktree and branch. Any dirty, unmerged, or conflict state preserves the recovery worktree.

## Report

Report the execution-ready plan path, scope, dependencies, assumptions or blockers, and the direct next command:

```bash
/do-it .specs/{slug}/plan.md
```
