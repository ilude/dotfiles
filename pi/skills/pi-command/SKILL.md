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

## Tool schema compatibility

When adding or editing Pi TypeScript tools, their JSON schemas must be provider-safe, not merely TypeScript-valid.

Rules:

- Prefer `@sinclair/typebox` (`Type.Object`, `Type.String`, `Type.Array`, etc.) for tool `parameters`.
- Every object schema must include an explicit `properties` object, even when empty.
- Every array schema must include `items`.
- Avoid open-ended hand-written schemas like `{ type: "object", additionalProperties: true }`; Codex/OpenAI rejects object schemas without `properties`.
- If additional fields are intentionally accepted, use `Type.Object({...}, { additionalProperties: true })`.
- Add or update tests that register the extension and validate the exact registered tool schemas, not only command parsing or TypeScript compilation.

## State, concurrency, and idempotency

Pi extensions can run from multiple Pi instances in the same repo. Any extension or command that reads or writes local state must be safe under repeated calls and concurrent processes.

Rules:

- Prefer stateless behavior. If state is needed, keep it repo-local under `.pi/` unless the owning surface already has a different convention.
- Treat JSON/YAML/text state files as shared mutable state. Use locked read-modify-write for mutations, not separate load and save calls around tool logic.
- Use atomic writes: write complete content to a temp file in the same directory, then rename over the target.
- Do not assume one Pi process owns a state file. Design for two agents adding, updating, or deleting state at the same time.
- Make commands idempotent. Re-running setup, sync, cleanup, or registration commands should converge without duplicate entries or corrupt state.
- Use deterministic merge/update behavior for append-like state. Generate IDs inside the lock, then check for collisions against the latest loaded state.
- State reset commands may remove known extension-owned files, but scope them exactly, for example `.pi/todo.json`, not `.pi/*`.
- Add tests for locking or stale-write prevention when adding a new state file or changing a state mutation path.

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

4. For TypeScript tool changes, run the focused Pi tests for the owning surface, for example:

```bash
cd pi/tests && pnpm test task-tools.test.ts
```

5. For stateful extensions, verify idempotency and concurrent-safe mutation with focused tests before considering the command complete.
