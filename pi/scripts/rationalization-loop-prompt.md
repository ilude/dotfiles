# Rationalization phase 3-5 loop

Work autonomously through these plans:

- `.specs/rationalization-phase3/plan.md`
- `.specs/rationalization-phase4/plan.md`
- `.specs/rationalization-phase5/plan.md`

## Iteration contract

Complete exactly one logical, validated slice per invocation. Re-read the three
plans' execution status, inspect only the source needed for the selected slice,
and choose the next runnable task from recorded dependencies. If an interrupted
slice left working-tree changes, recover and finish that slice before starting
another.

Prefer this order when dependencies permit:

1. Phase 3 runnable work.
2. Phase 5 T1 so decision data starts accumulating.
3. Phase 4 runnable work.
4. Remaining phase 5 work.
5. Any task newly unblocked by prior slices.

A gate in one task does not block independent tasks or plans. Record the gated
task accurately and continue elsewhere on the next iteration. Never infer a
user decision. Phase 3 T3 already contains the selected lease-registry decision.
Later gates for policy cutover, plan-scoped authorization, report candidate
selection, audit proposal selection, and interactive approval validation remain
user-owned until the required evidence or design exists.

## Work rules

- Work directly on one coherent slice. Delegate only bounded independent
  investigation, specialty work, or independent verification.
- Keep writes single-threaded in this worktree.
- Preserve public schemas unless the plan explicitly permits an additive field.
- Diagnose failures before changing code. Do not suppress errors or remove
  behavior as a workaround.
- Validate the exact changed contract and user workflow named by the plan.
- Update the owning plan's checklist and State block with verified facts.
- Add the required CHANGELOG entry for each implemented slice.
- Commit each validated slice with one conventional commit. Stage exact paths;
  never use `git add .`, `git add -A`, or broad directory staging.
- Do not stage unrelated changes, modify loop files, push, amend, rebase, reset,
  discard work, or clean the worktree.
- Inspect Git state only when recovering an interrupted slice or at the commit
  boundary. Do not audit completed phase 2 work or unrelated history.
- Use pnpm for all work under `pi/`. Do not use npm or Bun there.
- Keep file content ASCII and LF-only.

## Stop and continuation behavior

If the selected slice fails, make one evidence-driven recovery attempt. If it
remains blocked, record the exact blocker in its plan and leave independent work
for the next iteration. Do not repeat the same failed command or speculative fix.

End every invocation with exactly one marker on its own final line:

- `RALPH_STATUS: progress` after creating a validated commit.
- `RALPH_STATUS: quiescent` when all three plans are complete or every remaining
  task is waiting on a user decision, unavailable credential, required elapsed
  data, or interactive validation.
- `RALPH_STATUS: blocked` when no commit was possible and the blocker was
  recorded, but another recovery iteration may find runnable work.

Do not claim progress without a commit. Do not call `goal_complete`.
