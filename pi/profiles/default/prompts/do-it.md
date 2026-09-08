---
description: Complete a plan in its task worktree, archive and commit it, then merge unless disabled
argument-hint: "[--no-merge] [plan-path]"
---

Complete the selected implementation plan using the active planning skill. Read that skill and the plan before acting.

Invocation arguments: $ARGUMENTS

Interpret the arguments as an optional `--no-merge` flag and an optional plan path or spec name. Recognize the flag before or after the plan selector. Resolve a relative path from the invocation cwd before changing worktrees; resolve a spec name under the owning repository's `.specs/`. With no selector, use the current conversation's plan. If the plan is missing or ambiguous, or the arguments are invalid, ask a focused question rather than choosing unrelated work.

This invocation authorizes execution of the selected plan and local task commits. It also authorizes local integration unless `--no-merge` is present. It does not authorize push or deployment or silently resolve the plan's open consequential decisions.

- Create or resume the plan's dedicated task worktree and branch. Implement and validate there, preserving existing and unrelated work.
- For a new task worktree, record the originating checkout and branch as its parent integration target. For an existing task, use its recorded target; Git does not record worktree parentage. Resolve missing or conflicting target information before merging, rather than assuming `main`.
- Complete the existing scope and agreed checks. Do not add optional improvements, speculative fixes, new audits or extra acceptance requirements. Fix demonstrated task-relevant failures and stop testing when the agreed checks pass.
- Follow task dependencies, update completion evidence, and continue actionable work until complete or concretely blocked. If a blocker remains, continue independent tasks and report what prevents completion. Do not archive unfinished implementation or substitute a promise to continue for execution.
- Once implementation and its agreed checks are complete, record the actual completion date and archive the whole spec directory, including reviews and supporting files, under `.specs/archive/<stub>/`. Repair affected links and commit the task changes and archived spec in the task branch.
- By default, merge the task branch back into the recorded parent checkout's branch without stashing, discarding or committing unrelated changes. Verify integration and remove the task worktree only when it has no uncommitted or unmerged work. If integration is blocked, retain it and report the blocker separately from implementation completion.
- With `--no-merge`, archive and commit in the task branch but do not merge or remove the task worktree. Record integration as intentionally pending, not as unfinished implementation; this flag overrides merge and cleanup steps in the plan.

Finish with a concise result: completed work and checks, archived spec path, task branch and commit(s), and either the merge target/result or the retained worktree and reason integration is pending.
