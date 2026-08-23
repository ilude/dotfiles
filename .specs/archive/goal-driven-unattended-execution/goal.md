# Goal: Goal-driven unattended execution

## Outcome

Make `/goal` the outcome-oriented entrypoint for both foreground and long-horizon unattended work. A user must be able to provide an objective once, let Pi continue safely for an extended period, and later inspect, stop, resume, or complete that objective without directly managing `/loop`, plan iterations, or subagent trees.

`/goal` owns the objective and lifecycle. It must compose the existing `/loop`, plan, task, subagent, compaction, and damage-control mechanisms rather than duplicate them.

## Operator interface

Preserve current foreground behavior:

```text
/goal <objective-or-file>
```

Add:

```text
/goal --unattended <objective-or-file>
/goal status
/goal stop
/goal resume
```

`/loop` remains available for advanced diagnostics, but ordinary unattended use must not require a loop ID or plan path.

Expose only these user-facing goal states:

```text
running
waiting_for_operator
completed
stopped
failed
```

## Unattended lifecycle

For `/goal --unattended`:

1. Persist the goal identity, objective source and hash, workspace, scope, linked plans, loop job reference, and completion contract.
2. Attach an existing applicable plan or create the minimum executable plan needed for the objective.
3. Launch the existing detached `/loop` supervisor behind the `/goal` interface.
4. Execute one coherent validated slice per loop invocation.
5. Use durable root tasks for dependencies and resumable work. Leaves and retries remain transient.
6. Continue independent ready work when one task fails or requires approval.
7. Stop cleanly as `waiting_for_operator` when no safe work remains.
8. Allow `/goal resume` to reconcile durable state before continuing. Never blindly replay a modifying attempt.
9. Complete only after linked plans, tasks, and validation evidence satisfy the objective.

Extend existing goal entries and loop job state where possible. Do not create another scheduler, executor, daemon, dashboard, or general-purpose registry.

## Failure and recovery policy

Replace the session watchdog's second same-agent spawn gate with outcome-based recovery per stable logical work item.

Qualifying failures are:

- `error`
- `inconclusive`
- schema-invalid output
- verifier contradiction

Capability-preflight rejection, cancellation, damage-control denial, infrastructure failure before execution, and valid `not_found` results do not consume the budget.

Use this state machine:

```text
up to 20 qualifying failures
-> suspend ordinary attempts
-> require an autonomous re-evaluation of evidence, assumptions, and strategy
-> allow exactly two materially different recovery attempts
-> if both fail, set the item to needs_operator
```

A materially different recovery must change a deterministic strategy component such as the agent, capabilities, evidence source, input partition, tested assumption, tool approach, or validation method. Prompt rewording alone does not qualify.

Keep the existing repeated identical tool-result guard so one unchanged failed action cannot consume the larger recovery allowance.

While unattended, `needs_operator` blocks only the affected task. Record it and continue independent work. Present the decision when the user returns or when no runnable work remains.

## Damage-control behavior

Do not weaken or bypass damage control.

During unattended execution:

1. Allowed actions execute normally.
2. Ask-tier actions return a structured `needs_approval` result without opening an interactive prompt.
3. The owning root task becomes blocked with a redacted permission-decision reference.
4. Hard-blocked actions remain blocked and non-grantable.
5. Independent work continues.
6. One genuinely safer in-scope alternative may be attempted.
7. Never obscure, split, rephrase, or substitute an action merely to evade policy matching.
8. Never automatically replay a denied action.

Do not activate broad session approvals, learned permissions, or runtime-generated authorization. A task ID, plan, prompt, retry, or prior similar approval is not authority.

## Required safety repairs

Before unattended execution is considered usable:

- A requested project-agent confirmation must fail closed when no UI is available.
- Modifying-worker scopes must use canonical filesystem containment and reject symlink escapes.
- Tree cancellation must be authorized so a child can cancel only itself and its descendants.
- Cancellation and release races must settle permits and scope leases exactly once.
- A blocked or failed child must not cancel or block unrelated siblings.

## Goal completion

Strengthen `goal_complete` so it verifies linked execution state instead of trusting only a supplied summary.

Completion must require:

- Every required linked plan task is terminal.
- No required task remains running or blocked.
- Relevant validation passed.
- The final repository state is identified.
- Known gaps are recorded accurately.
- Unrelated deferred work is not represented as completed.

Return a closeout containing the objective, completed work, changed artifacts, validation, repository state, blockers or gaps, and exact next action.

## Existing work

Reconcile the current uncommitted hierarchical-subagent changes and:

```text
.specs/hierarchical-subagent-orchestration/plan.md
```

Revise that plan in place where its requirements conflict with this goal. Do not create a competing orchestration plan or discard unrelated working-tree changes.

## Non-goals

Do not add:

- Another detached supervisor
- A task-owned execution engine
- Persistent live child-process trees
- Broad unattended shell authorization
- Automatic pushes or deployments
- Automatic approval replay
- Permission learning
- Provider hedging
- Cross-machine takeover
- A new dashboard
- Automatic rollback beyond existing Git-backed recovery

## Validation

Directly verify:

- Existing foreground `/goal` behavior remains intact.
- `/goal --unattended` launches and correlates a detached loop.
- Status, stop, and resume operate through the goal identity.
- Independent tasks continue after one task blocks.
- Twenty qualifying failures require replanning.
- Two failed recovery attempts produce `needs_operator`.
- No-UI damage-control asks defer rather than hang or execute.
- Project-agent trust, canonical scope containment, and cancellation ownership fail closed.
- `goal_complete` rejects incomplete linked work and accepts verified completion.
- Session replacement and compaction do not duplicate settled work.
- Complete Pi tests, typecheck, and focused formatting checks pass.
- An isolated disposable-repository smoke exercises the goal lifecycle without dangerous or live external mutations.

## Completion

Call `goal_complete` only when the goal-driven unattended lifecycle is implemented, documented, and validated. Name any behavior that remains process-local, untested across process failure, or deferred by the non-goals.
