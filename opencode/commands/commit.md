---
description: Create logical git commits; use `fast` for one single-commit change
argument-hint: [fast] [push] [paths...]
model: anthropic/claude-haiku-4-5
---

If `$ARGUMENTS` begins with `fast`, use the fast single-commit mode in the shared commit instructions. Otherwise use the standard logical multi-commit mode. Pass through `push` and any explicit paths.

@~/.dotfiles/claude/shared/commit-instructions.md
