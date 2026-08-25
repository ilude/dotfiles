# Commit Workflow

- Ownership: the structured Pi commit workflow is owned by `pi/extensions/commit.ts` and `pi/lib/commit/`. Damage control independently governs Git commands invoked through shell tools.
- Visibility: commit tools are inactive by default and activate only for detected commit, stage, or push intent. Session replacement invalidates outstanding plan and stage handles.
- Planning: begin with non-mutating repository inspection. Select exact paths when only part of a worktree belongs in the commit. Unsafe repository states, unmerged paths, detached HEAD, and incompatible in-progress Git operations block mutation.
- Staging: stage only paths bound to the current plan handle. Never force-add ignored paths. Preserve staged deletions, handle partially staged renames without passing the missing source path to `git add`, and reject an unexpected staged set.
- Creation: require the current stage handle, a valid conventional subject, a whitespace-clean staged diff, and successful secret review. Commit creation is local and does not imply a push.
- Push: push only after an explicit user request. Require the expected commit hash, unchanged HEAD, an attached branch, and a non-diverged upstream. Use `git push --recurse-submodules=on-demand` so submodule commits referenced by the outgoing parent range reach their remotes first. Never force-push.
- Submodules: treat each direct submodule as an independent repository. Commit and push it first, pull it fast-forward-only, then commit the parent gitlink. The parent push must also cover clean submodule commits referenced by earlier local parent commits. Do not process nested submodules automatically.
- Failure: preserve the worktree and index on failure. A push failure after commit creation reports the push boundary and identifies the commits already created instead of claiming that commit creation failed. Diagnose the failed boundary rather than bypassing preflight, staged-set, secret, upstream, or divergence checks.
