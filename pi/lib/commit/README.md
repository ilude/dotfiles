# Pi commit core

Pi owns `/commit` in `pi/extensions/workflow-commands.ts`; its commit-only execution loop lives in `pi/lib/workflow-commands/commit-orchestration.ts`. Structured commit tools live in `pi/extensions/commit.ts` and are registered from the existing extension set to avoid duplicate `registerCommand("commit", ...)` calls.

Both surfaces use the shared porcelain-v2 status parser, preflight, and exact-path staging primitives in `pi/lib/commit/`. Each planning pass takes one status snapshot and reuses it for preflight, candidate extraction, clean-tree detection, and dirty-submodule detection. A new snapshot is taken only after the workflow changes candidate state, such as committing a submodule or adding an ignore rule.

Entries expose `path`, `index`, `worktree`, `classification`, `ignored`, `safeToGitAdd`, `recommendedAction`, and `reason`. Ignored staged deletions are classified as `staged_deletion`, `safeToGitAdd: false`, `recommendedAction: keep_staged`.

Preflight blocks mutating operations during merge, rebase, cherry-pick, bisect, detached HEAD, and unmerged paths. By default, `/commit` processes dirty direct submodules before the parent: each submodule requires an upstream branch, receives a fast-forward-only pull, and runs the same commit workflow. `/commit push` pushes child commits before the parent; `--no-submodules` preserves the conservative leave-untouched behavior. Nested submodules are not processed automatically. Worktrees, sparse checkout, and partial index remain states requiring conservative handling before mutation.

Structured tools support exact-path planning through `commit_plan.paths`. Both structured staging and `/commit` use `git add -A -- <exact paths>` so modifications, additions, and deletions are staged without broadening the selected set. The model-visible result contains the selected entries, safe stage paths, expected staged paths, and an opaque `planId`. `commit_stage` accepts that handle and returns an opaque `stageId`; confirmation tokens remain internal to the extension.

Mutating tools (`commit_stage`, `commit_create`, and `commit_push`) use abort-aware Git execution and fail by throwing tool errors. The state behind a plan handle binds the repository, exact paths, and planned worktree content. The state behind a stage handle binds the repository, exact staged paths, and index tree. Handles expire after successful use and are cleared when the session starts. `commit_create` re-reads the staged set, runs `git diff --cached --check`, and scans added lines for secrets immediately before `git commit`.

`commit_push` is available only for an explicit push request. It verifies the expected HEAD, requires an upstream, fetches that upstream remote, rejects a behind or diverged branch, and uses a normal non-force push.

`/commit` remains the higher-level workflow for automatic logical grouping and dirty direct-submodule commits. Structured tools are deterministic primitives: callers choose groups by passing exact paths, and dirty-only submodule state is excluded from parent planning rather than committed automatically.
