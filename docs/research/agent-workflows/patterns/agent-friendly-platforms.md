# Agent-friendly platforms

## Idea

Developer experience is becoming agent experience: docs, APIs, rules, plugins, and validations should make models more likely to do the right thing.

## Seen in

- [[../projects/convex-agent-plugins]]
- [[../videos/codex-replaced-claude-video]]

## Building blocks

- Best-practice rules for common mistakes.
- Task-specific skills.
- Custom reviewer/advisor agents.
- MCP or CLI access to live platform state.
- Hooks for validation and code generation.

## KISS version for our repos

For each platform/tool we use often, create a small package of guidance:

```text
docs/platform-guides/<tool>/
  README.md
  rules.md
  examples.md
  validation.md
```

Only add automation after the rules stabilize.

## Anti-patterns

- Adding integrations before documenting expected behavior.
- Making one giant “platform expert” prompt.
- Depending on remote MCP state when a simple CLI command is enough.
