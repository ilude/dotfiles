---
name: pi-command
description: "Pi command-surface guidance. Use when creating, reviewing, relocating, or documenting Pi slash commands, prompt templates, workflow skills, or command placement. Not for generic skill authoring; use skills-engineer."
---

# Pi Command Authoring

**Auto-activate when:** deciding where a Pi slash command, prompt template, workflow command, or command-related skill belongs.

## Boundary

Use `pi-command` for command surface and placement decisions. Use `skills-engineer` for generic skill quality, frontmatter, or activation trigger editing.

## Placement Rules

| Need | Preferred surface |
| --- | --- |
| Pi workflow slash command or prompt | `pi/skills/workflow/` or Pi command extension |
| Structured tool-backed command | `pi/extensions/` |
| Shared Claude/OpenCode wrapper | `claude/commands/` only when cross-client support is requested |
| OpenCode override | `opencode/commands/` |

Pi-first rule: when improving agent runtime features, implement in Pi unless the request is explicitly Claude/OpenCode-only.

## Practical Steps

1. Identify the owning runtime: Pi, shared wrapper, or client-specific.
2. Check for command name collisions and existing behavior.
3. Choose prompt template vs TypeScript extension based on whether tools/state are required.
4. Keep command docs and examples near the owning surface.
5. Validate with Pi-specific pnpm commands for TypeScript changes.

## State and Safety

Stateful commands must be idempotent and use locked read-modify-write plus atomic writes for shared `.pi/*.json` files. Reset commands must target exact owned files, never broad globs.

## Anti-Patterns

- Modifying `claude/` as a proxy for Pi behavior.
- Creating duplicate commands with unclear precedence.
- Adding state without lock/atomic-write behavior.
- Using `bun` for Pi TypeScript validation.

## Quick Reference

Command surface decisions are routing decisions. Pick the owner first, then edit the smallest file set that implements that owner’s behavior.
