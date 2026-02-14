# Git Worktrees for Parallel Development

Git worktrees allow multiple working directories from the same repository, enabling parallel Claude sessions without stashing or context pollution.

## The Problem

Traditional workflow requires stashing and switching, which loses Claude context and risks stash conflicts.

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

# List all worktrees
git worktree list

# Remove after merging
git worktree remove .worktrees/feature-x

# Prune stale references
git worktree prune
```

## Parallel Claude Sessions

```bash
# Terminal 1: Main feature
cd ~/project && claude

# Terminal 2: Separate worktree
git worktree add .worktrees/hotfix hotfix-branch
cd .worktrees/hotfix && claude
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
git worktree remove .worktrees/feature-x
git branch -d feature-x  # Delete branch too
git worktree prune       # Periodic cleanup
```

## Gotchas

### Directory creation
`git worktree add` creates `.worktrees/` automatically. Do not pre-create it with `mkdir`.

### Untracked files are absent
Worktrees only contain tracked files from the checked-out branch. Gitignored files like `.env`, `.venv/`, `node_modules/`, and build artifacts are NOT present. Run any local setup (e.g., `uv sync`, `npm install`) in the new worktree if needed.

### Global config symlinks
If your project uses `~/.claude/` or `~/.config/opencode/` via symlinks pointing to the main worktree (e.g., `~/.claude -> ~/.dotfiles/claude`), edits to those files in a secondary worktree won't affect the live global config until merged back to the branch the main worktree has checked out.

### Checking worktree state
```bash
# List all worktrees and their branches
git worktree list

# Check if you're inside a worktree (non-main worktrees have a .git file, not directory)
[ -f .git ] && echo "worktree" || echo "main"
```
