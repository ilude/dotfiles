---
name: git-worktrees
description: Use git worktrees for parallel Claude development sessions. Activate when working on multiple features, needing to context-switch, or running parallel Claude sessions on different branches.
---

# Git Worktrees for Parallel Development

**Auto-activate when:** Need to work on multiple branches simultaneously, want parallel Claude sessions, or need to context-switch without stashing.

## The Problem

Traditional git workflow:
```bash
git stash           # Save current work
git checkout other  # Switch branch
# work...
git checkout main   # Switch back
git stash pop       # Restore work (hope nothing conflicts)
```

With Claude, this is worse because:
- Context is lost when switching tasks
- Can't run parallel Claude sessions on different branches
- Stash conflicts lose work

## The Solution: Git Worktrees

A worktree is a separate working directory linked to the same repo.

```
~/.dotfiles/              # Main worktree (main branch)
~/.dotfiles-feature-x/    # Second worktree (feature-x branch)
~/.dotfiles-bugfix/       # Third worktree (bugfix branch)
```

Each worktree:
- Has its own working directory
- Shares the same `.git` data
- Can have a different branch checked out
- Supports a separate Claude session

## Commands

### Create a Worktree
```bash
# From main repo
git worktree add ../project-feature-x feature-x

# Create new branch and worktree together
git worktree add -b feature-y ../project-feature-y
```

### List Worktrees
```bash
git worktree list
```

### Remove a Worktree
```bash
# After merging the branch
git worktree remove ../project-feature-x

# Force remove (if branch not merged)
git worktree remove --force ../project-feature-x
```

### Prune Stale Worktrees
```bash
git worktree prune
```

## Parallel Claude Sessions

### Setup
```bash
# Terminal 1: Main feature
cd ~/project
claude

# Terminal 2: Bug fix (separate worktree)
git worktree add ../project-hotfix hotfix-branch
cd ../project-hotfix
claude
```

### Benefits
- Each Claude has isolated context
- No stash conflicts
- Can run tests in parallel
- Easy to compare implementations

### Workflow Example
```
Terminal 1 (main)           Terminal 2 (hotfix)
────────────────            ───────────────────
Working on feature    →     "Fix critical bug"
Long context          →     Fresh context
Can continue later    →     Quick fix, merge, delete
```

## Best Practices

| Do | Don't |
|----|-------|
| Name worktrees descriptively | Use generic names like `temp` |
| Remove worktrees after merge | Leave stale worktrees around |
| Use for parallel work | Use for simple branch switches |
| One Claude per worktree | Share Claude across worktrees |

## When to Use

| Situation | Worktree? |
|-----------|-----------|
| Quick branch switch, come right back | No - just checkout |
| Parallel feature + hotfix | Yes |
| Long-running feature + quick review | Yes |
| Comparing two implementations | Yes |
| Running tests on two branches | Yes |

## Cleanup

After merging:
```bash
git worktree remove ../project-feature-x
git branch -d feature-x  # Delete the branch too
```

Periodic cleanup:
```bash
git worktree prune  # Remove references to deleted worktrees
```

---

## TL;DR

Git worktrees let you have multiple working directories from the same repo. Use them to run parallel Claude sessions on different branches without context pollution or stash conflicts.
