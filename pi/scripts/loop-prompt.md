# Plan execution loop

The invocation message lists the plan files owned by this loop. When it also
names an unattended goal, `/goal` owns the objective and lifecycle while this
existing loop remains the detached supervisor.

## Iteration contract

Complete exactly one logical, validated slice per invocation. Re-read the listed
plans' execution status, inspect only the source needed for the selected slice,
and choose the next runnable task from recorded dependencies. Reconcile durable
goal and task state before continuing an interrupted slice. Never blindly replay
a modifying attempt.

A gate in one task does not block independent tasks or plans. Record the gated
task accurately and continue elsewhere on the next iteration. Never infer a
user decision.

For an unattended goal:

- If plan tasks are not linked to durable root tasks, create the minimum root
  task graph with `task`, then link each plan key through `goal_progress`.
- Mark one ready root task running and call `goal_progress begin_attempt` with
  its stable plan key and deterministic strategy before any modifying-capable
  tool.
- Settle every attempt through `goal_progress record_outcome`. Capability
  rejection, cancellation, permission denial, pre-execution infrastructure
  failure, and valid `not_found` do not consume the qualifying-failure budget.
- When ordinary attempts are suspended after twenty qualifying failures, use
  `goal_progress re_evaluate` to reassess evidence, assumptions, and strategy.
  The next two recovery strategies must change deterministic components;
  prompt rewording is not a strategy change.
- If an ask-tier damage-control decision returns `needs_approval`, do not replay
  or disguise it. The affected task waits for the operator while independent
  ready tasks continue. At most one safer alternative may run, and only after
  `begin_attempt` records a materially different deterministic strategy.
- A persisted attempt owned by an earlier Pi process is stale. Call
  `goal_progress reconcile`, record concrete reconciliation evidence, and
  inspect durable task and repository state before beginning a materially
  different replacement attempt.
- Record focused validation through `goal_progress` in the same Pi process that
  observed the successful `bash` or `pwsh` result. Record changed artifacts
  through `goal_progress`.
- Call `goal_complete` only after linked plans, linked required root tasks,
  validation evidence, and repository state satisfy the objective. If it
  rejects completion, preserve its exact blockers and continue only safe ready
  work.

## Work rules

- Work directly on one coherent slice.
- Keep writes single-threaded in this worktree.
- Preserve public schemas unless a plan explicitly permits an additive field.
- Diagnose failures before changing code. Do not suppress errors or remove
  behavior as a workaround.
- Validate the exact changed contract and user workflow named by the plan.
- Update the owning plan's checklist and State block with verified facts.
- Add any CHANGELOG entry required by the plan or repository.
- Commit each validated slice with one conventional commit. Stage exact paths;
  never use `git add .`, `git add -A`, or broad directory staging.
- Do not stage unrelated changes, modify loop files, push, amend, rebase, reset,
  discard work, or clean the worktree.
- Inspect Git state only when recovering an interrupted slice or at the commit
  boundary. Do not audit completed or unrelated history.
- Follow the repository's package-manager and validation rules.
- Keep file content ASCII and preserve the repository's line-ending policy.

## Stop and continuation behavior

If the selected slice fails, make one evidence-driven recovery attempt unless
`goal_progress` suspends ordinary attempts. If it remains blocked, record the
exact blocker in its plan and durable task, then select independent work on the
next iteration. Do not repeat the same failed command or speculative fix.

End every invocation with exactly one marker on its own final line:

- `LOOP_STATUS: progress` after creating a validated commit.
- `LOOP_STATUS: quiescent` when the goal is completed, all listed plans are
  complete, or every remaining task is waiting on a user decision, unavailable
  credential, required elapsed data, or interactive validation.
- `LOOP_STATUS: blocked` when no commit was possible and the blocker was
  recorded, but another recovery iteration may find runnable work.

Do not claim progress without a commit.
