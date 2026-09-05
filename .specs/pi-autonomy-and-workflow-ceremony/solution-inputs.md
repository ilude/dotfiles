# Simplification direction and implementation-planning inputs

Recommendation, not an approved implementation plan. Nothing here changes current runtime policy. The investigation supports a deletion-first change spanning runtime and owning instructions, not a controller patch plus more exceptions.

## Desired operating model

- The request supplies the outcome and constraints. The agent chooses routine methods and recovers in scope.
- Commands make common requests convenient. Retained useful operations are also callable by the agent without asking the user to type the command again.
- Plans describe work; they do not grant execution authority. Tasks preserve work that needs durable tracking; they are not universal prerequisites.
- Checks answer concrete questions about the requested behavior. Failures prompt diagnosis of the product, harness, or external assumption, not automatic patching or automatic operator interruption.
- Ask when unresolved choices materially change the user's behavior, scope, tradeoffs, acceptance, authority, or live risk. Do not invent the answer. Do not ask for discoverable facts or routine implementation choices.
- Preserve real safety and ownership at the operation that can violate them.

These are replacements for conflicting rules, not a second layer of instructions above them.

## Compare the materially different approaches

| Approach | Benefit | Why select or reject |
| --- | --- | --- |
| Fix the controller WeakMap and leave everything else | Smallest immediate bug fix | Insufficient for the request: conversational entrypoint, partial startup, duplicate requirements, and counter-driven interruptions remain |
| Add recovery commands, exceptions, more lifecycle states, and more review gates | Can make individual stuck states escapable | Reject: adds machinery to compensate for unnecessary prerequisites and requires the agent to navigate more policy |
| Remove procedural coupling and expose retained operations through shared command/tool paths | Addresses the cause while retaining continuation and safety | Recommended; requires a coordinated runtime/instruction/test change and explicit handling of unfinished state |
| Delete all goal/loop/worktree machinery | Lowest local code volume | Reject without a changed requirement: loses unattended continuation, process ownership, and recoverable closeout that the user still uses |

## Proposed implementation slices

These slices describe a coherent change, not mandatory waves, reviewer passes, or independent validation budgets. Integrate the selected outcome before applying the then-authorized validation approach.

### 1. Remove planning as execution authority

Owning surfaces: `goal.ts`, `workflow-commands.ts`, `plan-lifecycle.ts`, tool visibility, planning prompts/contracts.

- Remove compulsory plan-review lifecycle and readiness bookkeeping from ordinary authorized execution.
- Make `/plan-it` a convenient planning entrypoint whose useful capability can be requested conversationally.
- Retain only parsing required by a consumer that actually executes structured plan data: path containment, unambiguous task selection, real dependencies, and current state.
- Do not replace the WeakMap controller with another controller solely to preserve a dependency that can be deleted.
- If a retained cross-extension operation still needs sharing, use an actual shared function/service or the existing event bus with explicit ownership. Do not key it by unrelated extension API instances.

### 2. Preserve intent and make startup recoverable

Owning surfaces: goal parsing/startup/context/persistence, slash-command model delivery, command/tool wrappers.

- Preserve a recoverable exact objective before setup work that can fail. Use the existing session/file mechanism; preview is display-only.
- Do not silently choose new acceptance criteria or rewrite the user's saved prompt as a summary.
- Commit active workflow state only when the retained prerequisites succeed, or clearly record partial preparation without imposing unrelated tool gates.
- After a failure, retain created files/worktrees and inspect ownership before any cleanup. Report what happened and what can proceed, including ordinary inspection and explicitly requested documentation work.
- Expose useful start/status/stop/resume operations through the same implementation used by commands. Limit command-only context to host operations that genuinely need it.
- Where session replacement requires queued command dispatch, exercise the installed API's actual dispatch option and observe delivery.

### 3. Reduce duplicate state without removing continuation

Owning surfaces: goals, loop jobs, tasks, plan selection, ownership/closeout.

- Avoid requiring the same work to be declared complete in plan checkboxes, mirrored tasks, condition fields, and integration prose just to clear goal state.
- Keep one work ledger for a given workflow where possible, plus separate process/ownership data only for the invariants it enforces.
- Keep unattended supervision, identity, interruption evidence, approval state, and no-replay behavior. Do not conflate a live process with progress or a stopped process with completed work.
- Let inspection resolve known in-scope partial work. Ask only when ownership, result, or the required next decision remains materially ambiguous.
- Preserve existing archive/merge receipts until their unfinished closeout paths are settled. Avoid broad state migration or a new schema when removal is sufficient.

### 4. Remove instructions that regenerate ceremony

Owning surfaces are listed in `runtime-and-tests.md`.

- Replace fixed late-only validation and arbitrary global repair counts with targeted evidence selection and reassessment when the mechanism or harness is contradicted.
- Preserve the useful parts of the user's anti-churn intent: comprehend the full affected transition before edits, design faithful tests, do not rerun unchanged passing checks, do not treat every warning as a required repair, and stop speculative patching.
- Retire mandatory reviewer counts/order and exhaustive criteria for every procedural step.
- Put two missing engineering decisions in `pi-extension`: command convenience must not exclude agent access; runtime enforcement needs a concrete invariant rather than a workflow preference.
- Keep the existing closed-contract rule: a reviewer suggestion is not a new requirement. Do not create a requirements registry, approval ledger, or automatic acceptance judge to enforce this.
- Update owning contracts and README with accepted behavior in the same implementation; remove superseded text rather than retaining exceptions and history.

### 5. Replace the relevant tests with behavior checks

Delete assertions for removed policies. Keep safety and preservation tests. Add only the few seam/transition checks below that are necessary for the implemented design. Do not run an unrelated full-suite gate merely because a workflow changed; broaden only where actual shared impact or release requirements justify it.

## Focused behavioral checks for the later change

These are examples to refine against the accepted scope, not extra requirements for the original benchmark.

| Scenario | Observable success | Failure this catches |
| --- | --- | --- |
| Conversational planning request | Agent produces the requested planning result without a second operator command; equivalent command path uses the same retained operation | Tool exists but cannot initialize its prerequisite |
| Real extension-host identities | Retained cross-extension behavior works with independently constructed API objects | Same-object mock hides the production WeakMap mismatch |
| Startup failure followed by ordinary work | Exact objective and prepared resources remain recoverable; actionable reason reaches model/operator; permitted inspection and requested prompt preservation work | Half-created goal blocks unrelated work or loses intent |
| Exact prompt preservation | Stored text retains original requirements; display preview does not become the authoritative source | Omitted sample counts, safety conditions, deadlines, or added integration permission |
| Interruption and resume | Resume identifies actual remaining work and owner; no duplicate mutation or loss of dirty work | Removing state gates creates unsafe replay |
| Completion/closeout interruption | Verified work is not reimplemented; selected archive/commit/retain/merge policy resumes only its unfinished step | Completed work reopens or unrelated branch/worktree is removed |
| Concurrent test workers | Requested model/effort and outcomes correlate by stable worker identity regardless of launch order | Harness forces nonexistent ordering or hides wrong-worker behavior |
| A failed development check | Classification and next action follow new evidence within scope; unchanged passing checks remain valid | Speculative product patches or a procedural count causing needless reauthorization |
| Genuine user ambiguity | Agent asks before choosing materially different behavior/acceptance; continues discoverable routine work | More execution freedom becomes permission to invent requirements |
| Genuine safety refusal | Same unauthorized destructive/wrong-target/credential action remains refused; owned permitted action is not newly blocked | Simplification bypasses a real boundary |

Runtime tests can prove state, dispatch, and preservation. Transcript-based examples can demonstrate instruction behavior, not guarantee every future judgment. Do not store policy prose in source-spelling assertions.

## Unfinished-state handling

Before implementing against active work, inspect current state without mutating it. The following cases need explicit handling in the selected design:

- Foreground session entry with `planning: true` but no task mapping.
- Prepared worktree/plan from failed startup, with no persisted active goal entry.
- Draft or ready plan that never entered a lifecycle, or old lifecycle records with retired stages.
- Existing raw goal already materialized into a root task: preserve real work/results rather than recreating it.
- Active/stopped loop with process-instance ownership, `PI_GOAL_ID`, or an interrupted modifying attempt.
- Archived plan, committed archive, merged workflow, or merge receipt with cleanup still pending.
- Divergent primary and worktree edits, unknown owner, or another live process: do not reconcile by deletion or automatic adoption.
- Explicit live-attempt limits and genuine observed attempts: retain them; do not count unexecuted placeholders or reset limits by renaming tasks.

Prefer reading existing records and reporting the actual remaining operation. No bulk deletion of sessions, task records, loop jobs, worktrees, or archived plans. A compatibility shim is justified only by an existing supported unfinished state, not a speculative future case.

## Decisions not silently made by this investigation

The user has clearly rejected exclusive command entrypoints, needless ceremony, invented requirements, and speculative churn. That is enough to recommend the changes above. It does not automatically settle every existing workflow default:

1. Should invoking `/goal` still imply an isolated worktree and automatic Git closeout, or merely persistent focus on the requested outcome?
2. Should `/do-it` retain its current fresh-session and automatic merge defaults? They may remain conveniences even after all underlying operations become agent-callable.
3. Which existing explicitly requested review or experiment limits must remain for already-authored work? Preserve them unless the user changes them; do not retroactively declare them ceremony.

These choices belong in the later implementation discussion because they change visible behavior, not because another planning gate is required. No decision is needed merely to finish this investigation.

## Scope boundaries and material unknowns

- No runtime behavior was exercised here. Later focused host tests must confirm dispatch, failure recovery, and supported non-TUI control behavior.
- No complete census of historical sessions or every test was attempted. The inspected examples establish mechanisms, not rates or guaranteed gains.
- The current benchmark plan and other work may be changing independently. Reinspect target/ownership and current accepted requirements before implementation; do not reuse a stale worktree snapshot.
- Narrow analytics input selection is a separately actionable efficiency issue. It is not a prerequisite for removing workflow coupling and does not justify a new analytics engine.
- Background result delivery had a recoverable gap during this investigation. Its cause was not investigated here; existing parallel work already examines related delivery behavior. Do not silently add that product repair to this package.

Investigation can stop: more retrospective examples would not change the main mechanism, the recommended direction, or the identified preservation risks.
