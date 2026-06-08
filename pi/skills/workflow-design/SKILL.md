---
name: workflow-design
description: "Developer/operator command UX design. Use when improving command surfaces, task runners, package scripts, Makefile/just workflows, deployment commands, or workflow docs. Not for shell-script syntax or Justfile-specific implementation details."
---

# Workflow Design

**Auto-activate when:** designing or consolidating developer/operator workflows, command surfaces, task runners, package scripts, deployment commands, or workflow documentation.

## Boundary

| Need | Use |
| --- | --- |
| Public command UX and workflow consolidation | `workflow-design` |
| Editing `justfile`/`Justfile` recipes | `justfile` |
| Writing shell or PowerShell scripts | `shell` |

## Core Principle

A good workflow has one obvious entry point, predictable side effects, and validation that matches user intent.

## Practical Steps

1. Inventory current command surfaces and users.
2. Choose the public entry point and hide internal steps.
3. Make commands composable, idempotent, and safe to rerun.
4. Centralize configuration and environment resolution.
5. Document the shortest successful path plus recovery steps.
6. Validate on the platforms the workflow claims to support.

## Design Checks

- Can a new contributor find the right command?
- Does the command name match its side effects?
- Are destructive operations explicit?
- Are platform assumptions documented or detected?
- Are internal helpers kept out of the public surface?

## Anti-Patterns

- Multiple equivalent commands with different behavior.
- Host/container boundary confusion.
- Workflows that require hidden local state.
- Documentation that lists commands without saying when to use them.

## Quick Reference

Design the operator experience first; implement with Just, shell, Make, or package scripts second.
