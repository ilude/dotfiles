---
name: workflow-design
description: "Command UX: command surfaces, task runners, package scripts, Makefile/just workflows, deployment commands, or workflow docs. Not for shell syntax or Justfile implementation."
---

# Workflow Design

## Boundary

| Need | Use |
| --- | --- |
| Public command UX and workflow consolidation | `workflow-design` |
| Editing `justfile`/`Justfile` recipes | `justfile` |
| Writing shell or PowerShell scripts | `shell` |

## Core Principle

A good workflow has one obvious entry point and predictable side effects. When the requested contract requires workflow behavior to be preserved, validate the user path. `pi/AGENTS.md` Development Philosophy owns general implementation and delegation strategy.

## Practical Steps

1. Inventory current command surfaces and users.
2. Choose the public entry point and hide internal steps.
3. Make commands composable, idempotent, and safe to rerun.
4. Centralize configuration and environment resolution.
5. Document the shortest successful path plus recovery steps.
6. When preserving workflow behavior, validate through the same entry point and sequence the user will run.
7. When the requested contract includes platform support, validate on those platforms.

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
