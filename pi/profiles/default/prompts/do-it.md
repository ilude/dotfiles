---
description: Complete a plan in its task worktree, archive and commit it, then merge unless disabled
argument-hint: "[--no-merge] [plan-path]"
---

Execute the selected implementation plan through its authorized closeout. Do not start another planning or review phase. Use technical judgment to adapt mechanisms within the plan's settled intent; changing intent, scope, settled decisions, or acceptance requires user approval.

Invocation arguments: $ARGUMENTS

Interpret the arguments as an optional `--no-merge` flag and an optional plan path or spec name. Recognize the flag before or after the plan selector. Resolve a relative path from the invocation cwd before changing worktrees; resolve a spec name under the owning repository's `.specs/`. With no selector, use the current conversation's plan. If the plan is missing or ambiguous, or the arguments are invalid, ask a focused question rather than choosing unrelated work.

This invocation authorizes execution of the selected plan and local task commits. It also authorizes local integration unless `--no-merge` is present. Push or deployment is authorized when the selected plan records the user's explicit authorization for it; this invocation neither adds nor revokes that authority. Do not silently resolve the plan's open consequential decisions.

- Create or resume the plan's dedicated task worktree and branch. Implement and validate there, preserving existing and unrelated work. Record a new worktree's originating checkout and branch as its integration target; for an existing task, use its recorded target. Resolve missing or conflicting target information before merging rather than assuming `main`.
- Complete the existing scope and agreed agent-owned checks. Resolve routine implementation problems and demonstrated task-relevant failures, continue independent work around blockers, and stop testing when the agreed checks pass. Do not add optional improvements, speculative fixes, audits, acceptance requirements, or promises in place of available work.
- Keep plan progress and evidence current without redefining requirements. Leave unfinished integration/cleanup checkboxes unchecked; record any blocker, next action, and who must act. Archival and passing checks are not whole-plan completion. Pending operator manual or live testing is a non-blocking verification limit, not a reason to delay authorized closeout.
- Once implementation and checks pass, archive the whole spec directory under `.specs/archive/<stub>/`, repair links, and commit the task changes and archive on the task branch. Do not mark the plan completed yet.
- By default, merge into the recorded parent checkout's branch without stashing, discarding, or committing unrelated changes. Resolve routine merge conflicts within the settled intent yourself; ask only for consequential decisions or prerequisites outside your authority. Verify the target contains the changes and archive and no active plan remains. Then record the actual completion date/status and closeout evidence in the archived plan, commit that metadata on the target, and remove the task worktree only when it has no uncommitted or unmerged work. Verify cleanup before reporting COMPLETED; if cleanup cannot finish, use CLEANUP PENDING.
- If integration is blocked, retain the worktree and report implementation/check results separately from pending integration. With `--no-merge`, do not merge or remove the committed task worktree; record integration as intentionally pending. This flag overrides merge and cleanup steps in the plan.

Start the final response with exactly one overall outcome, using both the colored symbol and explicit text (never color alone):

- 🟢 **COMPLETED**: implementation and agreed checks passed, merged into the recorded target, completion metadata committed, and task worktree cleanup verified.
- 🔴 **NOT COMPLETE: MERGE BLOCKED**: implementation is committed but integration could not finish.
- 🔴 **NOT COMPLETE: USER INPUT REQUIRED**: a consequential decision or prerequisite prevents finishing the plan; state the precise question and your recommendation where applicable.
- 🔵 **IMPLEMENTED: MERGE SKIPPED AS REQUESTED**: implementation and checks passed and changes are committed under `--no-merge`; retaining the worktree is intentional, not a failure or required fix.
- 🟡 **CLEANUP PENDING**: integration and completion metadata are committed, but task worktree cleanup remains unfinished. State explicitly that the changes are already on the target.

For blocked or cleanup-pending outcomes, put **Reason** and **Action needed** immediately after the heading, before successes. Name the concrete issue, who must act, and the exact next action; do not imply that work will resume automatically. Continue available agent-owned work instead of handing routine problems to the user. If several issues remain, lead with the blocking outcome and list each necessary action.

Then concisely report work and checks, spec location (active or archived), task branch and commits, merge target/result, and any retained worktree or cleanup remnants. Never lead with a success summary when the overall outcome is blocked. These are response labels, not new plan-frontmatter states or runtime tracking.
