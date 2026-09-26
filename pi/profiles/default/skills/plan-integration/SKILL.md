---
name: plan-integration
description: Close out an authorized, already-committed plan task by integrating its task branch locally, recording completion metadata, and cleaning its worktree
---

# Plan integration

Use this procedure only as the Integrator with the runtime-issued closeout manifest and matching runtime provenance. The orchestrator has completed implementation, agreed checks, spec archival, and the task-branch commit. The manifest is the bounded authority: do not substitute another checkout, branch, commit, spec, or task.

## Verify and proceed

1. Read the manifest and provenance supplied in the child system context. Confirm the task commit, task branch/worktree, archived plan and active spec stub, target checkout/branch, recorded starting target commit when present, and `noMerge` state. This role must start in the recorded target checkout. If the handoff is absent, inconsistent, or says `noMerge`, stop and report `USER INPUT REQUIRED`; do not attempt a mutation.
2. Inspect actual Git state before acting. Resume from observed state rather than repeating completed work. Require the target branch and task branch to match the manifest, confirm the task commit and archived plan, and check for pending merges, existing metadata, stashes, and worktree registration.
3. Integrate only locally. Keep disjoint unrelated target changes in place when Git can preserve them. If overlap requires preservation, preserve tracked and untracked changes in a uniquely named stash; do not include ignored files. Record and verify the exact stash object and captured paths before merging. Never use `stash pop` or substitute a different stash.
4. Resolve routine task-branch merge conflicts only within the authorized plan. If target edits overlap consequentially with task changes, or restoration conflicts, stash identity is ambiguous/missing, the target is wrong, or another user-only decision is needed, preserve all evidence and return the exact paths and state. Do not choose between consequential edits.
5. Restore the exact preservation stash after integration and verify the restored changes. Drop only its uniquely matching stash reference after successful restoration. Keep the stash and task worktree when restoration is unresolved.
6. Commit completion metadata only after the target contains the task commit and archived plan and unrelated target changes are restored. Verify the archive, completed metadata, and absence of the active spec. Remove the task worktree only after metadata is committed and the task worktree has no uncommitted or unmerged work. Retain the task branch.
7. If Git deregisters the worktree but leaves a Windows long-path remnant, remove only the exact manifest task-worktree path after confirming it is absent from `git worktree list` and remains within the repository's `.worktrees` directory. Never clear the shared directory.

Use the repository-owned bounded closeout entrypoint when it is available; do not invent a broader cleanup or recovery mechanism. Do not push, deploy, force-push, rewrite history, delete branches, modify ignored files, or act outside the manifest.

## Return

Return one typed outcome: `COMPLETED`, `MERGE BLOCKED`, `USER INPUT REQUIRED`, or `CLEANUP PENDING`. Include the reason/action when stopped, target and task commits, stash OID and state when applicable, merge and metadata results, archive/active-spec checks, worktree registration/path state, retained recovery artifacts, and concise commands/check evidence. Distinguish verified facts from unresolved state. Do not ask the user directly; return consequential choices to the orchestrator, which owns user communication and the final response.
