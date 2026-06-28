---
name: git-workflow
description: Activate when working with git operations, commits, branches, or version control. Trigger on git commands, .git/ files, .gitignore, .gitattributes, or mentions of commit, push, merge, rebase, reset, filter-branch, or history rewrite.
---

# Git Workflow Guidelines

Compact index for git operations. Load linked files for worktrees or hosting setup.

## Auto-activate when

- Running or explaining git commands; editing `.gitignore`, `.gitattributes`, hooks, branch/commit workflows, submodules, remotes, or release history.
- User mentions commit, push, merge, rebase, reset, stash, worktree, branch, PR, tag, filter-branch, or history rewrite.
- Do not use for non-git file edits unless staging/commit behavior is part of the task.

## Project-specific rules

- Default branch is `main`.
- Never force-push submodule repos.
- Do not amend or rebase already-pushed submodule commits.
- Pull inside a submodule before updating the parent repo's pinned submodule reference.
- If submodule fetch fails: `git pull --no-recurse-submodules` then `git submodule update --init --recursive`.
- Git identity is directory/remote driven; machine-specific SSH config belongs in gitignored local files.
- For Pi structured commits, do not call `commit_stage`/`commit_create` outside `/commit`; ordinary shell git is allowed when the user explicitly asks.

## Practical steps

1. Inspect state before mutation: `git status --short --branch` and relevant diffs.
2. For worktree status questions, run live state first: `git worktree list --porcelain` and `git status --short --branch`; report actual worktrees, branches, dirty state, stale/prunable entries, and convention mismatches.
3. Before branch or worktree changes, verify the current worktree is clean or get explicit direction to preserve work.
4. Separate user changes from agent changes; never stage unrelated files.
5. Run secret/whitespace checks before committing when practical.
6. Allow explicit `wip: ...` save-point commits when the user is preserving work before switching or syncing; treat them as local and temporary unless the user explicitly asks to push.
7. Prefer revert/restore over destructive history operations; ask before resets, force pushes, or deleting stale worktree directories.

## Quick validation

| Purpose | Commands |
|---|---|
| Status | `git status --short --branch` |
| Worktree status | `git worktree list --porcelain` plus `git status --short --branch` in the relevant worktree |
| Review unstaged diff | `git diff -- <path>` |
| Review staged diff | `git diff --cached -- <path>` |
| Whitespace check | `git diff --check` / `git diff --cached --check` |
| Submodule state | `git submodule status --recursive` |

## Anti-patterns

- Staging with broad `git add .` in a dirty worktree.
- Amending, rebasing, resetting, or force-pushing without explicit approval and remote-state awareness.
- Editing `.gitignore` to hide generated artifacts without understanding why they appeared.
- Mixing formatting-only churn with behavior changes in the same commit.

## Optional references

- [reference.md](reference.md) - detailed guidance, examples, and templates.
- [worktrees.md](worktrees.md), [github-setup.md](github-setup.md), [gitlab.md](gitlab.md).
