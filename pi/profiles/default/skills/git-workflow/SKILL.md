---
name: git-workflow
description: Safely integrate plan or subagent branches, especially when the destination checkout has existing changes. Use for Git merges, dirty-worktree preservation, conflict handling, and post-merge cleanup.
---

# Git workflow

Prefer ordinary Git commands and separate, reviewable steps. Preserve all existing work.

## Authorized plan closeout

For `/do-it` execution, the orchestrator commits the implementation and archived plan on the task branch, then dispatches the Integrator from the recorded target checkout. The Integrator owns local merge, completion metadata, restoration, and worktree cleanup under its role skill. It may temporarily preserve tracked and untracked target changes when needed, excluding ignored files and leaving disjoint changes in place where safe. It resolves routine conflicts within settled intent and may preserve both sides of an additive `CHANGELOG.md` restoration conflict; other restoration conflicts and consequential overlaps require exact evidence and a consequential decision. Ordinary closeout returns those choices to the parent, which owns user questions and final reporting. Only runtime-prepared Herdr runs use a same-tab successor with native operator questions and final reporting. It establishes `INTEGRATION READY` before cleanup; the orchestrator finishes its explicitly authorized obligations and releases its exact origin for graceful retirement before the successor removes the task worktree. Blocked closeout keeps both panes/worktree; post-delivery cleanup failure reports the retained path without undoing integration. `--no-merge` skips Integrator dispatch and leaves the committed worktree in place. Push and deployment remain governed by the plan's explicit authorization.

Outside this authorized closeout contract, use the ordinary operator-approved preservation workflow below. Do not infer stash authority from a plan branch or a dirty destination.

Do not merge around existing changes with Git plumbing such as `commit-tree`, `update-index`, or `update-ref`. Never use a broad checkout or restore to erase conflicts or pre-existing work.

## Stash workflow

1. Obtain operator approval before temporarily removing pre-existing changes from the checkout, unless the authorized `/do-it` Integrator closeout contract above applies.
2. Preserve tracked and untracked changes with a named stash. Do not include ignored files automatically:

```bash
git stash push --include-untracked -m "temporary pre-merge preservation: <plan>"
git rev-parse refs/stash
```

Record the returned stash commit. Confirm the intended changes were captured and check whether relevant ignored files remain before merging.
3. Run `git merge <branch>` as a separate command. If the merge cannot be completed safely, stop without applying or deleting the stash.
4. Restore the exact recorded stash with `git stash apply <recorded-stash-commit>`, not `pop`.
5. If restoration conflicts, preserve the stash, report the conflicts, and do not discard either side.
6. Verify the restored paths and resulting `git status`. Drop only the stash entry whose commit matches the recorded commit, and only after restoration is confirmed. If its current stash reference cannot be identified unambiguously, leave it in place and report it.

Never assume a successful merge proves the stashed work was restored.

## Worktree isolation

Use a separate worktree for plan implementation or parallel work when practical so the main checkout remains untouched. A worktree prevents branch-switch and implementation-state conflicts, but it does not make later integration into a dirty destination safe; use the decision order above when merging.
