---
name: skills-engineer
description: "Skill and agent-definition authoring. Use when editing SKILL.md files, skill frontmatter/descriptions, activation triggers, agent definitions, or command/agent meta-instructions. Not for Pi slash-command placement; use pi-command."
---

# Skills Engineering

**Auto-activate when:** creating, reviewing, or optimizing `SKILL.md` files, skill descriptions, trigger boundaries, frontmatter, or agent definitions.

## Boundary

| Work | Use |
| --- | --- |
| Skill content, descriptions, activation triggers, agent definitions | `skills-engineer` |
| Pi slash commands, prompt templates, command placement | `pi-command` |
| General documentation prose | `docs` |

## Core Principle: Progressive Disclosure

Startup context reads skill metadata first. Keep descriptions narrow and bodies concise; put specialized detail behind clearly named subfiles only when needed.

## Frontmatter Rules

```yaml
---
name: skill-name
description: "Specific trigger scope. Use when ... Not for ..."
---
```

- `name` matches the directory and uses kebab-case.
- `description` names concrete triggers and excludes neighboring skills.
- Avoid broad words like "development", "review", or "docs" without qualifiers.

## Skill Body Rules

1. Start with `# Title` and an **Auto-activate when:** line.
2. Put boundary guidance before detailed process.
3. Prefer checklists and tables over long prose.
4. Keep repeated model-default advice out.
5. Include anti-patterns that prevent common routing mistakes.
6. Keep examples minimal; reference files for long examples.

## Activation Design

Good triggers are exact: file patterns, command names, artifact names, and user phrases. Add "Not for" boundaries when two skills overlap.

## Pi State Safety Reminder

If a skill teaches persistent Pi state, require idempotent operations, locked read-modify-write, atomic temp-file rename, exact reset scope, and tests for stale/concurrent writes.

## Anti-Patterns

- Description lists every related keyword and activates everywhere.
- Skill body duplicates generic coding advice.
- Multiple skills claim the same primary trigger.
- Claude/OpenCode-specific assumptions in a Pi skill without boundary notes.

## Quick Reference

A good skill answers: when should I load, what boundary prevents misrouting, and what non-obvious behavior should I follow?
