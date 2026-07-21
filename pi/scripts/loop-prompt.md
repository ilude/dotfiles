# Plan execution loop

The invocation message lists the plan files owned by this loop.

## Iteration contract

Complete exactly one logical, validated slice per invocation. Re-read the listed
plans' execution status, inspect only the source needed for the selected slice,
and choose the next runnable task from recorded dependencies. If an interrupted
slice left working-tree changes, recover and finish that slice before starting
another.

A gate in one task does not block independent tasks or plans. Record the gated
task accurately and continue elsewhere on the next iteration. Never infer a
user decision.

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

If the selected slice fails, make one evidence-driven recovery attempt. If it
remains blocked, record the exact blocker in its plan and select independent
work on the next iteration. Do not repeat the same failed command or speculative
fix.

End every invocation with exactly one marker on its own final line:

- `LOOP_STATUS: progress` after creating a validated commit.
- `LOOP_STATUS: quiescent` when all listed plans are complete or every remaining
  task is waiting on a user decision, unavailable credential, required elapsed
  data, or interactive validation.
- `LOOP_STATUS: blocked` when no commit was possible and the blocker was
  recorded, but another recovery iteration may find runnable work.

Do not claim progress without a commit. Do not call `goal_complete`.
