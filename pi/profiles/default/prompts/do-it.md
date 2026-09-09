---
description: Complete a plan in its task worktree, archive and commit it, then merge unless disabled
argument-hint: "[--no-merge] [plan-path]"
---

Execute the selected implementation plan through its authorized closeout. Do not start another planning or review phase. Use technical judgment to adapt mechanisms within the plan's settled intent; changing intent, scope, settled decisions, or acceptance requires user approval.

Invocation arguments: $ARGUMENTS

Interpret the arguments as an optional `--no-merge` flag and an optional plan path or spec name. Recognize the flag before or after the plan selector. Resolve a relative path from the invocation cwd before changing worktrees; resolve a spec name under the owning repository's `.specs/`. With no selector, use the current conversation's plan. If the plan is missing or ambiguous, or the arguments are invalid, ask a focused question rather than choosing unrelated work.

This invocation authorizes execution of the selected plan and local task commits. It also authorizes local integration unless `--no-merge` is present. It does not authorize push or deployment or silently resolve the plan's open consequential decisions.

- Create or resume the plan's dedicated task worktree and branch. Implement and validate there, preserving existing and unrelated work. Record a new worktree's originating checkout and branch as its integration target; for an existing task, use its recorded target. Resolve missing or conflicting target information before merging rather than assuming `main`.
- Complete the existing scope and agreed agent-owned checks. Resolve routine implementation problems and demonstrated task-relevant failures, continue independent work around blockers, and stop testing when the agreed checks pass. Do not add optional improvements, speculative fixes, audits, acceptance requirements, or promises in place of available work.
- Keep plan progress and evidence current without redefining requirements. Pending operator manual or live testing is a non-blocking verification limit, not a reason to delay authorized closeout.
- Once implementation and checks pass, archive the whole spec directory under `.specs/archive/<stub>/`, repair links, and commit the task changes and archive on the task branch. Do not mark the plan completed yet.
- By default, merge into the recorded parent checkout's branch without stashing, discarding, or committing unrelated changes. Verify the target contains the changes and archive and no active plan remains. Then record the actual completion date/status and closeout evidence in the archived plan, commit that metadata on the target, and only then declare completion. Remove the task worktree only when it has no uncommitted or unmerged work.
- If integration is blocked, retain the worktree and report implementation/check results separately from pending integration. With `--no-merge`, do not merge or remove the committed task worktree; record integration as intentionally pending. This flag overrides merge and cleanup steps in the plan.

Finish concisely with completed work and checks, archived spec path, task branch and commits, and either the merge target/result or the retained worktree and reason integration is pending.
