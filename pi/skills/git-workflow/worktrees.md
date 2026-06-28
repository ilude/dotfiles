# Git Worktrees for Parallel Development

Git worktrees allow multiple working directories from the same repository, enabling parallel sessions without stashing or context pollution.

## The Problem

Traditional workflow requires stashing and switching, which loses session context and risks stash conflicts.

## Solution: `.worktrees/` Directory

All worktrees live inside `.worktrees/` within the project root. This keeps worktrees co-located with the project instead of scattered as sibling directories.

```
~/project/                          # Main worktree (main branch)
~/project/.worktrees/feature-x/     # Second worktree (feature-x branch)
~/project/.worktrees/bugfix/        # Third worktree (bugfix branch)
```

Each worktree has its own directory but shares the same `.git` data. The `.worktrees/` directory is globally gitignored via `~/.config/git/ignore`.

## Commands

```bash
# Create worktree with existing branch
git worktree add .worktrees/feature-x feature-x

# Create new branch and worktree together
git worktree add -b feature-y .worktrees/feature-y

# List all worktrees in script-friendly form
git worktree list --porcelain

# Remove after merging
git worktree remove .worktrees/feature-x

# Prune stale references
git worktree prune
```

## Parallel Sessions

```bash
# Terminal 1: Main feature
cd ~/project

# Terminal 2: Separate worktree
git worktree add .worktrees/hotfix hotfix-branch
cd .worktrees/hotfix
```

Benefits: isolated context, no stash conflicts, parallel tests, easy comparison.

## When to Use

| Situation | Use Worktree? |
|-----------|---------------|
| Quick branch switch, coming right back | No |
| Parallel feature + hotfix | Yes |
| Long-running feature + quick review | Yes |
| Comparing two implementations | Yes |
| Running tests on two branches | Yes |

## Cleanup

Distinguish Git metadata cleanup from filesystem cleanup:

```bash
# Remove a valid registered worktree directory after verifying the path
git worktree remove .worktrees/feature-x

# Prune stale Git metadata for missing worktree paths
git worktree prune

# Delete the branch only when it is no longer needed
git branch -d feature-x
```

Before claiming cleanup is complete, verify with `git worktree list --porcelain` and confirm any filesystem paths you report still exist or were removed. Do not delete stale worktree directories manually unless the user explicitly approves the exact paths.

## Gotchas

### Directory creation
`git worktree add` creates `.worktrees/` automatically. Do not pre-create it with `mkdir`.

### Untracked files are absent
Worktrees only contain tracked files from the checked-out branch. Gitignored files like `.env`, `.venv/`, `node_modules/`, and build artifacts are NOT present. Run any local setup (e.g., `uv sync`, `bun install`, or `pnpm install` for pnpm-locked projects) in the new worktree if needed.

### Global config symlinks
If your project uses global config symlinks pointing to the main worktree, edits to those files in a secondary worktree won't affect the live global config until merged back to the branch the main worktree has checked out.

### Checking worktree state
For status questions, run live state first:

```bash
# List all worktrees, branches, and prunable entries
git worktree list --porcelain

# Check dirty state in the current worktree
git status --short --branch

# Check if you're inside a worktree (non-main worktrees have a .git file, not directory)
[ -f .git ] && echo "worktree" || echo "main"
```

Report actual worktrees, branches, dirty state, stale/prunable entries, and convention mismatches such as paths outside `.worktrees/`.

### Branch and worktree changes
Before switching branches, adding worktrees, syncing branches, rebasing, or merging across branches, verify the current worktree is clean with `git status --short --branch`. If the user is preserving work before switching or syncing, an explicit `wip: ...` save-point commit is allowed. Treat WIP commits as local and temporary unless the user explicitly asks to push them.
