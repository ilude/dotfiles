---
name: justfile
description: "Justfile recipe implementation. Use when editing justfile/Justfile files, just recipes, dotenv handling, recursive just calls, or cross-platform just behavior. Not for general workflow UX or shell scripting."
---

# Justfile Workflow

**Auto-activate when:** editing `justfile`/`Justfile`, designing `just` recipes, debugging just variables, dotenv loading, or recursive just calls.

## Boundary

Use `justfile` for Just-specific implementation. Use `workflow-design` for command-surface design and `shell` for script syntax/behavior inside recipes.

## Core Principle

A Justfile should expose memorable project tasks while delegating complex logic to scripts when recipes grow too large.

## Practical Steps

- Follow existing recipe naming and grouping.
- Keep public recipes short and discoverable.
- Use private helper recipes for shared setup.
- Quote variables passed to shell commands.
- Be explicit about dotenv and environment requirements.
- Test recipes from a clean shell where practical.

## Cross-Platform Notes

- Match the repo's configured shell rather than assuming Bash.
- Avoid POSIX-only snippets when Windows support is claimed.
- Prefer calling checked-in scripts for complex multi-line logic.

## Anti-Patterns

- Hiding long shell programs inside recipes.
- Creating several aliases for the same task without need.
- Relying on untracked local environment variables.
- Recursive `just` calls that obscure failure location.

## Quick Checks

```bash
just --list
just --summary
```

Run the specific recipe you changed when safe.
