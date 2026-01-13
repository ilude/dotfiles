# Git Worktrees for Parallel Development

Git worktrees allow multiple working directories from the same repository, enabling parallel Claude sessions without stashing or context pollution.

## The Problem

Traditional workflow requires stashing and switching, which loses Claude context and risks stash conflicts.

## Solution: Separate Working Directories

```
~/.dotfiles/              # Main worktree (main branch)
~/.dotfiles-feature-x/    # Second worktree (feature-x branch)
~/.dotfiles-bugfix/       # Third worktree (bugfix branch)
```

Each worktree has its own directory but shares the same `.git` data.

## Commands

```bash
# Create worktree with existing branch
git worktree add ../project-feature-x feature-x

# Create new branch and worktree together
git worktree add -b feature-y ../project-feature-y

# List all worktrees
git worktree list

# Remove after merging
git worktree remove ../project-feature-x

# Prune stale references
git worktree prune
```

## Parallel Claude Sessions

```bash
# Terminal 1: Main feature
cd ~/project && claude

# Terminal 2: Separate worktree
git worktree add ../project-hotfix hotfix-branch
cd ../project-hotfix && claude
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

```bash
git worktree remove ../project-feature-x
git branch -d feature-x  # Delete branch too
git worktree prune       # Periodic cleanup
```
