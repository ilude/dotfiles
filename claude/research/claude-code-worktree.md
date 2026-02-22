# Claude Code `--worktree` Feature Research

**Date**: 2026-02-22

## Overview

Built-in git worktree support for Claude Code CLI. Creates an isolated worktree at `<repo>/.claude/worktrees/<name>/` and starts Claude in it. Each worktree gets its own branch (`worktree-<name>`), its own working directory, but shares the same git history and remotes.

## CLI Usage

```bash
claude --worktree feature-auth     # Named worktree + branch
claude -w bugfix-123               # Short flag
claude --worktree                  # Auto-generates random name
```

### Subagent Isolation

Add `isolation: worktree` to a custom agent's frontmatter, or ask Claude to "use worktrees for your agents" during a session. Each subagent gets its own worktree, auto-cleaned when it finishes without changes.

### Cleanup Behavior

- No changes → worktree + branch auto-removed on exit
- Changes exist → Claude prompts to keep or remove

## Known Gotchas

### 1. Stale Worktrees (Open Bug #26725)

If a session crashes or ends abnormally, worktrees persist forever. No GC on startup, no `--cleanup` command. Discovered when `git branch -D` fails with "branch used by worktree."

**Mitigation**:
```bash
git worktree list              # See what's lingering
git worktree remove <path>     # Remove specific worktree
git worktree prune             # Clean stale refs
```

### 2. Dependencies Not Shared

Worktrees don't share `node_modules`, `.venv`, `target/`, etc. Each needs its own dependency install.

### 3. Submodules Need Re-Init

`git submodule update --init --recursive` required in each worktree.

### 4. `.env` and Local Config Don't Copy

Gitignored local config files won't exist in the worktree. Copy manually or automate.

### 5. Same Branch Can't Be Checked Out Twice

Git enforces unique branch per worktree.

### 6. Worktree Location Needs `.gitignore`

Built-in flag puts worktrees at `.claude/worktrees/` inside the repo. Add to `.gitignore` or they pollute `git status`.

## POLA-Aligned Best Practices

### `.gitignore` Immediately

```
.claude/worktrees/
```

### Limit Parallelism to 2-3

Review bandwidth is the bottleneck, not Claude's speed. More worktrees = more merge conflicts = more surprise.

### Use Descriptive Names Always

```bash
claude -w fix-zsh-plugin-download   # Good
claude -w                           # Bad — random name
```

### Partition Work by File Scope

Two worktrees touching the same files = guaranteed merge conflicts. Plan tasks to touch **disjoint files**.

### Run `/init` in Each Worktree Session

Re-establishes CLAUDE.md context. Worktrees are separate directories.

### Add a Cleanup Alias

```bash
alias wt-clean='git worktree list && git worktree prune && echo "Pruned stale refs"'
```

### Prefer Manual Worktrees for Complex Setups

For repos with submodules, the built-in flag may surprise with missing submodules/config. Manual creation allows a setup step:

```bash
git worktree add ../project-feature -b feature-x
cd ../project-feature
git submodule update --init --recursive
claude
```

### Avoid Worktrees for Dotfiles/Symlink Repos

Worktrees create a second copy of the tree but symlinks in `install.conf.yaml` point at the original. Running `install` from a worktree would overwrite live symlinks. Sequential work is safer.

## Summary

Solid for **application codebases** with parallel isolated Claude sessions. For **dotfiles/infrastructure repos** with symlinks and submodules, the surprise surface area is higher — sequential work or manually-managed worktrees outside the repo are safer.

Main POLA risks: stale cleanup, missing dependencies/submodules, invisible merge conflicts between worktrees.

## Sources

- [Claude Code Common Workflows (official docs)](https://code.claude.com/docs/en/common-workflows)
- [incident.io: Shipping faster with Claude Code and Git Worktrees](https://incident.io/blog/shipping-faster-with-claude-code-and-git-worktrees)
- [Git Worktrees with Claude Code: Complete Guide](https://notes.muthu.co/2026/02/git-worktrees-with-claude-code-the-complete-guide/)
- [Parallel AI Coding with Git Worktrees (Agent Interviews)](https://docs.agentinterviews.com/blog/parallel-ai-coding-with-gitworktrees/)
- [Boris Cherny announcement (Threads)](https://www.threads.com/@boris_cherny/post/DVAAnexgRUj/)
- [GitHub Issue #26725: Stale worktrees never cleaned up](https://github.com/anthropics/claude-code/issues/26725)
- [SuperGok: Claude Code Git Worktree Support](https://supergok.com/claude-code-git-worktree-support/)
- [Steve Kinney: Git Worktrees for Parallel AI Development](https://stevekinney.com/courses/ai-development/git-worktrees)
