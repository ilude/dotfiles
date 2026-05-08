---
name: pi-command
description: Use when creating, reviewing, relocating, or documenting Pi slash commands, prompt templates, skills, or command-surface placement decisions.
---

# Pi command authoring

Use this skill before adding or moving Pi commands. Choose the smallest command surface that matches the behavior.

## Placement decision table

| Need | Put it here | Why |
|---|---|---|
| Prompt-only slash command with static instructions and optional arguments | `pi/prompts/<name>.md` | Native Pi prompt templates provide slash autocomplete, frontmatter, `argument-hint`, and `$ARGUMENTS` substitution without TypeScript. |
| Reusable domain workflow or guidance that agents should apply while doing related work | `pi/skills/<name>/SKILL.md` | Skills are discovered from `~/.dotfiles/pi/skills/*` and can guide agents without becoming slash commands. |
| Runtime/state/UI/autocomplete/git/session command | TypeScript extension, usually `pi/extensions/workflow-commands.ts` for shared workflow commands or a focused top-level extension when needed | TypeScript can call Pi APIs, inspect state, register custom handlers, run safe workflows, and control session/UI behavior. |

## Collision and precedence checks

- Extension commands take precedence over prompt templates. A top-level `pi/extensions/*.ts` file that calls `registerCommand("handoff", ...)` will shadow `pi/prompts/handoff.md`.
- Before adding a prompt template, search for collisions:

```bash
grep -R 'registerCommand("<name>"' pi/extensions/*.ts
```

- Do not add prompt-only commands to `workflow-commands.ts`. If the command body is just instructions, use `pi/prompts/<name>.md`.
- Top-level files in `pi/extensions/` are auto-discovered as extensions; put helper code under `pi/lib/`.

## Worked examples

### `/handoff` prompt-template command

Use `pi/prompts/handoff.md` because the command is static guidance with optional focus text. Include frontmatter and `$ARGUMENTS`:

```markdown
---
description: Compact the current conversation into a handoff document for another agent to pick up
argument-hint: "[next-session focus]"
---

Write the handoff. Next-session focus:

$ARGUMENTS
```

### `/commit` TypeScript command

Keep `/commit` in TypeScript because it performs git status inspection, secret scanning, staged-file planning, validation, and user-facing workflow control. This belongs in `pi/extensions/workflow-commands.ts`, not `pi/prompts/commit.md`.

## Verification checklist

1. Verify prompt discovery configuration if using `pi/prompts/`:

```bash
python -m json.tool pi/settings.json >/dev/null
```

2. Verify no extension shadows the prompt:

```bash
! grep -R 'registerCommand("<name>"' pi/extensions/*.ts
```

3. Verify TypeScript still compiles after command-surface changes:

```bash
cd pi/extensions && pnpm run typecheck
```
