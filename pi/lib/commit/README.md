# Pi commit helpers

Pi owns `/commit` in `pi/extensions/workflow-commands.ts`; its commit-only execution loop lives in `pi/lib/workflow-commands/commit-orchestration.ts`.

The workflow uses the shared porcelain-v2 status parser, preflight, exact-path staging, and submodule helpers in this directory. Each planning pass takes one status snapshot and reuses it for preflight, candidate extraction, clean-tree detection, and dirty-submodule detection. A new snapshot is taken only after the workflow changes candidate state, such as committing a submodule or adding an ignore rule.

Entries expose `path`, `index`, `worktree`, `classification`, `ignored`, `safeToGitAdd`, `recommendedAction`, and `reason`. Ignored staged deletions are classified as `staged_deletion`, `safeToGitAdd: false`, `recommendedAction: keep_staged`.

Preflight blocks mutating operations during merge, rebase, cherry-pick, bisect, detached HEAD, and unmerged paths. By default, `/commit` processes dirty direct submodules before the parent: each submodule requires an upstream branch, receives a fast-forward-only pull, and runs the same commit workflow. `/commit push` pushes child commits before the parent; `--no-submodules` preserves the conservative leave-untouched behavior. Nested submodules are not processed automatically.

`/commit` remains the higher-level workflow for automatic logical grouping, secret review, and dirty direct-submodule commits. Ordinary Bash Git workflows remain governed by damage control and use targeted staging and repository-required checks.
