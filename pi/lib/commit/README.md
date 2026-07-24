# Pi commit core

Pi owns `/commit` in `pi/extensions/workflow-commands.ts`; commit tools live in `pi/extensions/commit.ts` and are registered from that existing extension to avoid duplicate `registerCommand("commit", ...)` calls.

Entries expose `path`, `index`, `worktree`, `classification`, `ignored`, `safeToGitAdd`, `recommendedAction`, and `reason`. Ignored staged deletions are classified as `staged_deletion`, `safeToGitAdd: false`, `recommendedAction: keep_staged`.

Preflight blocks mutating operations during merge, rebase, cherry-pick, bisect, detached HEAD, and unmerged paths. By default, `/commit` processes dirty direct submodules before the parent: each submodule requires an upstream branch, receives a fast-forward-only pull, and runs the same commit workflow. `/commit push` pushes child commits before the parent; `--no-submodules` preserves the conservative leave-untouched behavior. Nested submodules are not processed automatically. Worktrees, sparse checkout, and partial index remain states requiring conservative handling before mutation.

Mutating tools (`commit_stage`, `commit_create`, future `commit_push`) require a state-binding token generated for the exact plan. The token prevents stale or mismatched path sets; it is not a user-approval gate. `commit_create` must re-read and verify the staged set immediately before `git commit`.
