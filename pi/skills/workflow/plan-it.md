# Plan an Executable Change

Turn `$ARGUMENTS` and relevant conversation context into `.specs/{slug}/plan.md` in the primary repository. Do not implement the plan. Use the latest stated goal and constraints as authoritative.

## Method

Load and follow `planning` for requirements, acceptance, and verification language. Before drafting, state the observable evidence that would prove the requested outcome and how that evidence could fail. Ask rather than choosing silently when materially different completion conditions fit the request.

Create the smallest complete plan using the existing mechanism. Preserve supplied requirements, defined terms, normative words, actors, conditions, bounds, exceptions, and verification. Preserve explicit behavior, interfaces, scope limits, and safety boundaries. Do not add unrelated work.

## Lifecycle

When invoked as `/plan-it quick [request]`, treat `quick` as the mode selector rather than part of the requested outcome. Quick mode is for operator-selected small work sets: create and mechanically validate the same complete canonical plan, but skip all delegated subject-matter reviews and the final overengineering, gold-plating, and churn review. After recording `draft`, resolve any operator-owned blocker, reread the plan, and call `ready` directly. Do not call `plan_progress review` or delegate reviewers in quick mode.

The command writes the plan directly under the primary repository's `.specs/` directory and does not create a planning branch or worktree. Choose a concise kebab-case slug from the requested outcome and conversation context; never use an invocation ID or a generic `plan-*` fallback. Unrelated tracked or untracked primary changes do not block `/plan-it` and must remain untouched. The plan must require `/do-it` to create and own the implementation worktree before implementation begins.

Use `plan_progress` for this invocation. Persisted lifecycle stages are only `started`, `draft`, `blocked`, and `ready`.

1. Create one canonical complete plan, establish real dependencies and mutation boundaries, then record `draft` with its path.
2. Select 0-4 subject-matter reviews according to the plan's actual risks. Use reviews when their domains add useful evidence; do not require them for low-risk plans. Each review reads the entire draft, challenges correctness and feasibility from its assigned domain, and returns findings mapped to the objective, completion evidence, tasks, safety, or validation. Review strategy and concern are optional telemetry. Do not reuse one generic reviewer under several labels.
3. Apply every supported finding that affects the objective, completion evidence, dependencies, safety, executability, or validation. Reject findings that are irrelevant or unsupported. Record each subject-matter review with `plan_progress review` after disposition: use `covered` when supported findings have been repaired and `no_finding` when no repair was needed. Use `supported` only while a finding remains unresolved; it must later be recorded as `covered` after repair. Use `adversary`, `specialist`, or `proponent` for the perspective. `strategy` is optional telemetry, not a workflow prerequisite.
4. If a genuine operator-owned decision remains unresolved, call `blocked` and ask the operator. Git state, worktree state, transfer mechanics, commit state, and anticipated merge state are never `/plan-it` blockers; record them as `/do-it` execution context instead.
5. After correctness repairs, perform one final necessity/subtractive review. Ask exclusively for overengineering, gold-plating, unnecessary abstraction, duplicate state, excessive validation, and churn risks.
6. Apply necessary subtractive findings, then record the final review with role `subtractive`: use `covered` after repairing supported findings or `no_finding` when no repair was needed. An unresolved `supported` result cannot reach readiness. For every task, mechanism, state field, telemetry field, abstraction, and validation step, ask:
   - Is it required to prove `Completion Evidence` or preserve a stated safety boundary?
   - Does the first task test one assumption with the smallest representative slice?
   - Does it build for an unobserved failure, future provider/client, or unrequested scale?
   - Does it add persistence, retries, correlation, lifecycle, or cleanup before proving value?
   - Can fewer files, modes, checks, or mutations answer the question?
   - Can later work become conditional and be skipped when the first slice finds no signal?
   Remove or defer anything that fails this necessity test. A factually valid reviewer concern is not a required repair unless it blocks completion evidence.
7. Reread the reduced complete plan and call `ready`. In standard mode, readiness requires one final completed subtractive review, with any supported findings resolved first. Subject-matter reviews are optional and bounded at four records. In quick mode, readiness requires the draft and deterministic plan-file validation but no reviews. The tool then runs deterministic plan-file validation.

If a shared TypeScript contract is changed, include an early typecheck before implementation expands. If a shared mechanism is unproven, specify one representative executable slice that can falsify it before expansion. Do not make typecheck a universal gate or add scheduler state for an experiment.

A restored snapshot may contain a legacy post-draft stage. Treat it as compatibility telemetry only. Complete the current subject-matter and subtractive reviews before `ready`. Do not emit the removed `settle_review`, `adjudicate`, `repair`, `accept`, or `inspect` actions.

## Plan Contract

Write the canonical plan from this exact structural contract rather than inferring its format from archived plans. Replace every placeholder with plan-specific content and omit optional bullets that do not apply:

```markdown
---
created: YYYY-MM-DD
status: ready
---

# <Outcome title>

## Objective

<One falsifiable outcome.>

## Completion Evidence

- Evidence: <Observable proof that the objective is complete.>
- Fails when: <Observable condition that disproves completion.>

## Boundaries

- In scope: <Owned behavior, files, or state.>
- Out of scope: <Adjacent work that remains untouched.>
- Preserve: <Existing interfaces, behavior, and safety controls.>
- Assumptions: <Only execution-changing assumptions, or None.>

## Tasks

- [ ] **T1: <Executable task name>**
  - Files: `<Exact files or targets>`
  - Change: <Bounded mutation and mechanism.>
  - Done when: <Observable task acceptance condition.>
  - Verify: `<Direct check or command>`

## Validation

- [ ] <Direct completion-evidence check and expected result.>

## Retention

Keep incomplete work at `.specs/<slug>/plan.md`. After completion, `/do-it` archives this directory to `.specs/archive/<slug>/`.

## Execution Status

- State: Ready; implementation has not started.
- Blocker: None.
- Next: T1.
- Resume: `/do-it .specs/<slug>/plan.md`
```

Before calling `ready`, verify mechanically against the structure above: frontmatter says exactly `status: ready`; every required `##` heading exists; `Completion Evidence` has separate `- Evidence:` and `- Fails when:` bullets; `Validation` contains at least one checkbox; `Execution Status` contains `- State:` and the canonical resume command; and `Retention` names the canonical archive directory.

State mutation boundaries explicitly: name the files or state owned by each task, what may be changed, and what remains untouched. Dependencies must identify actual prerequisites, not merely preferred order. A task is ready only when every required dependency is complete; independent ready tasks may proceed in parallel without adding scheduler records.

Use one checkbox list with 1-3 tasks. Use sequential unique keys `T1` through `T3`. Every task must use the exact field labels `Files:`, `Change:`, `Done when:`, and `Verify:`. Add `Depends on: T1` only when an actual prerequisite exists. Task-level `Done when` and `Verify` clauses must collectively prove the completion evidence.

Include only context, boundaries, assumptions, safety, current status, or blockers that change execution. For shared or live state, name the target, stop condition, and concise rollback required by active instructions.

Every canonical plan retains incomplete work at primary `.specs/{slug}/plan.md`. It requires `/do-it` to materialize the spec in its owned implementation worktree, archive the completed spec to `.specs/archive/{slug}/`, commit the workflow branch, merge it with `--no-ff` into the primary branch, verify merged HEAD, then remove only the owned worktree and branch. Ignored specs remain untracked and return to the primary local archive after a successful merge; no workflow may force-add an ignored plan. Any dirty, unmerged, or conflict state preserves the implementation worktree and recoverable plan.

## Report

Report the execution-ready plan path, scope, dependencies, assumptions or blockers, and the direct next command:

```bash
/do-it .specs/{slug}/plan.md
```
