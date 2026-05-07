# Skill stats logging research synthesis

Date: 2026-05-07

## Key correction

Initial local grep was too narrow. Web/docs and deeper installed-package type inspection show Pi already has the needed durable extension points outside editable `node_modules` implementation patches:

- `before_agent_start` exposes `event.systemPromptOptions.skills` after skill expansion/system prompt assembly.
- `appendEntry(customType, data?)` persists custom session entries that do not enter LLM context.
- Session format documents `CustomEntry` for extension state persistence.

## Recommended implementation path

Implement forward skill-load logging as a repo-owned Pi extension under `pi/extensions/`:

1. Register `pi.on("before_agent_start", ...)`.
2. Inspect `event.systemPromptOptions.skills`.
3. For each loaded skill, call `pi.appendEntry("skill-load", safePayload)`.
4. Payload must include only safe metadata: schema version, skill name, source, timestamp, optional session/turn IDs, optional safe path label.
5. `/skill-stats` should parse these custom entries first, then historical fallback signals.

## Useful references from research

- Pi extension docs: `https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/extensions.md`
- Pi session format docs: `https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/session-format.md`
- Local installed types:
  - `pi/extensions/node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts`
  - `pi/extensions/node_modules/@mariozechner/pi-coding-agent/dist/core/session-manager.d.ts`
  - `pi/extensions/node_modules/@mariozechner/pi-coding-agent/dist/core/system-prompt.d.ts`
  - `pi/extensions/node_modules/@mariozechner/pi-coding-agent/dist/core/skills.d.ts`

## Analogue patterns

- Claude Code: hooks/telemetry for structured lifecycle events; OTel can include skill names.
- OpenCode: plugin events for command/tool execution.
- Codex CLI: local history plus telemetry/export patterns.
- Aider: local-only JSONL analytics log is a good privacy pattern.

## Decision impact for plan

Forward logging should now be considered feasible with `forward-logging-local-hook: yes`. Wave 2 can proceed without upstream Pi changes, provided implementation avoids storing prompt text, expanded skill content, raw paths, or tool arguments.
