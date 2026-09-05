# Plan an Executable Change

Turn `$ARGUMENTS` and relevant conversation context into `.specs/{slug}/plan.md` in the primary repository. Do not implement the plan. Use the latest stated goal and constraints as authoritative.

## Method

Load and follow `planning` for requirements, acceptance, and verification language. Before drafting, apply the repository completion-evidence and operator-decision rules to the requested outcome.

Create the smallest complete plan using the existing mechanism. Preserve supplied requirements, defined terms, normative words, actors, conditions, bounds, exceptions, and verification. Preserve explicit behavior, interfaces, scope limits, and safety boundaries. Do not add unrelated work.

## Lifecycle

When invoked as `/plan-it quick [request]`, treat `quick` as the mode selector rather than part of the requested outcome. Quick mode is for operator-selected small work sets: create and mechanically validate the same complete canonical plan, but skip all delegated subject-matter reviews and the final overengineering, gold-plating, and churn review. After recording `draft`, resolve any operator-owned blocker, reread the plan, and call `ready` directly. Do not call `plan_progress review` or delegate reviewers in quick mode.

The command writes the plan directly under the primary repository's `.specs/` directory and does not create a planning branch or worktree. Choose a concise kebab-case slug from the requested outcome and conversation context; never use an invocation ID or a generic `plan-*` fallback. Unrelated tracked or untracked primary changes do not block `/plan-it` and must remain untouched. The plan must require `/do-it` to create and own the implementation worktree before implementation begins.

Use `plan_progress` for this invocation. Persisted lifecycle stages are only `started`, `draft`, `blocked`, and `ready`.

## Final Report

After `plan_progress ready` succeeds, explain the plan in human terms and assess all four of these dimensions in the final assistant response: whether it follows good coding standards, whether it uses appropriate design patterns, whether it over-engineers the outcome, and whether it introduces unnecessary churn risk. The final assistant response must not contain `/do-it`, a next-command heading, a command block, or any other command presentation. Do not repeat the plan's Resume value. The command finalizer separately copies and renders the next command after the assistant response.

1. Create one canonical complete plan, establish real dependencies and mutation boundaries, then record `draft` with its path.
2. Select 0-4 subject-matter reviews according to the plan's actual risks. Use reviews when their domains add useful evidence; do not require them for low-risk plans. Each review reads the entire draft, challenges correctness and feasibility from its assigned domain, and applies the Verification-design rubric below to every task. Review strategy and concern are optional telemetry. Do not reuse one generic reviewer under several labels.
3. Apply every supported finding that affects the objective, completion evidence, dependencies, safety, executability, or validation. Reject findings that are irrelevant or unsupported. Record each subject-matter review with `plan_progress review` after disposition: use `covered` when supported findings have been repaired and `no_finding` when no repair was needed. Use `supported` only while a finding remains unresolved; it must later be recorded as `covered` after repair. Use `adversary`, `specialist`, or `proponent` for the perspective. `strategy` is optional telemetry, not a workflow prerequisite.
4. If a genuine operator-owned decision remains unresolved, call `blocked` and ask the operator. Git state, worktree state, transfer mechanics, commit state, and anticipated merge state are never `/plan-it` blockers; record them as `/do-it` execution context instead.
5. After correctness repairs, perform one final necessity/subtractive review. Ask exclusively for overengineering, gold-plating, unnecessary abstraction, duplicate state, excessive validation, and churn risks. Flag multi-claim tasks, validation steps without a stated trigger, and live checks without attempt caps as churn risks.
6. Apply necessary subtractive findings, then record the final review with role `subtractive`: use `covered` after repairing supported findings or `no_finding` when no repair was needed. An unresolved `supported` result cannot reach readiness. For every task, mechanism, state field, telemetry field, abstraction, and validation step, ask:
   - Is it required to prove `Completion Evidence` or preserve a stated safety boundary?
   - Does the first task test one assumption with the smallest representative slice?
   - Does it build for an unobserved failure, future provider/client, or unrequested scale?
   - Does it add persistence, retries, correlation, lifecycle, or cleanup before proving value?
   - Can fewer files, modes, checks, or mutations answer the question?
   - Can later work become conditional and be skipped when the first slice finds no signal?
   Remove or defer anything that fails this necessity test. A factually valid reviewer concern is not a required repair unless it blocks completion evidence.
7. Reread the reduced complete plan and call `ready`. In standard mode, readiness requires one final completed subtractive review, with any supported findings resolved first. Subject-matter reviews are optional and bounded at four records. In quick mode, readiness requires the draft and deterministic plan-file validation but no reviews. The tool then runs deterministic plan-file validation.

### Verification-design rubric

Every adversary, specialist, and proponent reviewer must apply these checks to every task. When one fails, return a supported finding that names the task key, cites the failed item number, and gives a proposed rewrite:

1. `Verify` directly falsifies `Done when`; it does not merely say that tests pass.
2. The check is tagged deterministic or live. A live check names one behavior, cleanup, `Max attempts`, `Session`, and `Terminal outcomes`.
3. Success does not depend on a child model choosing an action.
4. The task does not bundle more than one independently verifiable claim.
5. Every relied-on external-system contract, including API response shape, CLI flags, and wait or cancellation semantics, is cited from maintained documentation or an installed schema, or becomes a research question that blocks the task.
6. Each named test or check advances Completion Evidence rather than restating implementation.
7. The task states what ends it on failure without a retry.

The deterministic plan validator enforces the machine-readable portion of item 2; reviewers judge verification design and the remaining items.

If a shared TypeScript contract is changed, include one early typecheck before implementation expands, then defer typecheck until the slice settles. If a shared mechanism is unproven, specify one representative executable slice that can falsify it before expansion. Do not make typecheck a universal gate or add scheduler state for an experiment. For a task whose only changes are prose, configuration text, or documentation, `Verify:` is direct inspection of the changed content against the stated contract; do not name a test suite, typecheck, or repository-wide check unless the task changes something a parser, loader, or formatter reads.

A restored snapshot may contain a legacy post-draft stage. Treat it as compatibility telemetry only. Complete the current subject-matter and subtractive reviews before `ready`. Do not emit the removed `settle_review`, `adjudicate`, `repair`, `accept`, or `inspect` actions.

## Plan Contract

Use this template as authoring guidance rather than inferring intent from archived plans. Replace placeholders with plan-specific content and omit optional bullets that do not apply. Keep machine-consumed task, dependency, status, live-attempt, and closeout syntax; equivalent organization of the explanatory prose is acceptable:

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
  - Verify: `<deterministic check that falsifies Done when; run once when the task's edits are complete>`

- [ ] **T2: <Optional live evaluation task>**
  - Files: `<Exact files or targets>`
  - Change: <One bounded live evaluation.>
  - Done when: <One observable behavior reaches a terminal outcome and cleanup completes.>
  - Verify: live <Observe one behavior, then cleanup the isolated session.>
  - Max attempts: <positive integer>
  - Session: <isolated target>
  - Terminal outcomes: supported | rejected | blocked
  - Depends on: T1

## Live attempt ledger

| Task | Attempt | Preconditions | Result | Cleanup | Disposition |
| --- | --- | --- | --- | --- | --- |

## Execution Strategy

<Optional execution advice, such as independent task keys, bounded leaf packages, or work that must remain root-owned. Omit this section when it adds no useful guidance.>

## Validation

- [ ] <Direct completion-evidence check, when it runs (after which task settles), and expected result. Each confirmatory check appears once.>

## Retention

Keep incomplete work at `.specs/<slug>/plan.md`. After completion, `/do-it` archives this directory to `.specs/archive/<slug>/`.

- Closeout: Retain the committed workflow branch and worktree; do not merge into the primary branch.

## Execution Status

- State: Ready; implementation has not started.
- Blocker: None.
- Next: T1.
- Current frontier: T1; verify with `<direct check>`; remaining live attempts: N/A.
- Resume: `/do-it .specs/<slug>/plan.md`
```

The `Closeout` bullet is optional and must appear only when the operator explicitly requests commit-and-retain closeout. Its exact wording is the deterministic policy marker; do not paraphrase it.

Before calling `ready`, check the parsed status, task IDs, dependencies, and declared live-attempt metadata. Review objective, completion evidence, boundaries, verification, and recovery instructions for meaning, not heading or keyword matches. The deterministic validator does not prove those prose obligations or cleanup adequacy.

Use `## Execution Strategy` only when it adds useful execution advice; it may identify independent task keys, bounded leaf packages, or work that must remain root-owned, but remains advisory, does not assign authority-sensitive, integration-owning, or acceptance-gating work away from the root, and does not force delegation, parallel execution, or scheduler records.

State mutation boundaries explicitly: name the files or state owned by each task, what may be changed, and what remains untouched. Dependencies must identify actual prerequisites, not merely preferred order. A task is ready only when every required dependency is complete; independent ready tasks may proceed in parallel without adding scheduler records.

Use one checkbox list with the fewest independently executable tasks that cover the outcome. Use sequential unique keys `T1`, `T2`, and so on; there is no fixed task-count cap. Prefer the field labels `Files:`, `Change:`, `Done when:`, and `Verify:` for readability. Keep the machine-consumed `Verify:` tag and dependency syntax. Add `Depends on: T1` only when an actual prerequisite exists. Task-level `Done when` and `Verify` clauses must collectively prove the completion evidence. Untagged `Verify:` remains deterministic for compatibility; use the explicit tag in new plans. Include the optional live task and ledger only when live work exists. If research questions exceed ten, move them to `.specs/<slug>/research.md` and keep only task-blocking references in the plan.

Include only context, boundaries, assumptions, safety, current status, or blockers that change execution. For shared or live state, name the target, stop condition, and concise rollback required by active instructions.

Every canonical plan retains incomplete work at primary `.specs/{slug}/plan.md`. The default closeout requires `/do-it` to materialize the spec in its owned implementation worktree, archive the completed spec to `.specs/archive/{slug}/`, commit the workflow branch, merge it with `--no-ff` into the primary branch, verify merged HEAD, then remove only the owned worktree and branch. When the operator explicitly requests commit-and-retain closeout, include the exact `- Closeout:` bullet from the contract; `/do-it` then archives and commits on the workflow branch without merging, and retains the worktree, branch, and ownership record. Ignored specs remain untracked; no workflow may force-add or commit an ignored plan. Any dirty, unmerged, or conflict state preserves the implementation worktree and recoverable plan.

## Report

Report the execution-ready plan path, scope, dependencies, and assumptions or blockers.
