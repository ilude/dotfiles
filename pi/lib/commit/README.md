# Pi commit core

Pi owns `/commit` in `pi/extensions/workflow-commands.ts`; commit tools live in `pi/extensions/commit.ts` and are registered from that existing extension to avoid duplicate `registerCommand("commit", ...)` calls.

Entries expose `path`, `index`, `worktree`, `classification`, `ignored`, `safeToGitAdd`, `recommendedAction`, and `reason`. Ignored staged deletions are classified as `staged_deletion`, `safeToGitAdd: false`, `recommendedAction: keep_staged`.

Preflight blocks mutating operations during merge, rebase, cherry-pick, bisect, detached HEAD, and unmerged paths. Submodules, worktrees, sparse checkout, and partial index are surfaced explicitly; V1 treats them as states requiring conservative handling before mutation.

Mutating tools (`commit_stage`, `commit_create`, future `commit_push`) require a state-binding token generated for the exact plan. The token prevents stale or mismatched path sets; it is not a user-approval gate. `commit_create` must re-read and verify the staged set immediately before `git commit`.
