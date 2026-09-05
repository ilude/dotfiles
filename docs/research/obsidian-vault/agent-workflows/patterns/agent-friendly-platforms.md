# Agent-friendly platforms

## Idea

Developer experience is becoming agent experience: docs, APIs, rules, plugins, and validations should make models more likely to do the right thing.

## Seen in

- ../projects/convex-agent-plugins.md

## Building blocks

- Best-practice rules for common mistakes.
- Task-specific skills.
- Custom reviewer/advisor agents.
- MCP or CLI access to live platform state.
- Hooks for validation and code generation.

## Request-scoped remote tools

The [MCP 2026 stateless protocol](../projects/mcp-2026-stateless-protocol.md)
removes the assumption that remote MCP requires hidden protocol sessions. For a
remote tool surface:

- prefer request-scoped operations;
- keep application state explicit and owned by the domain service;
- expose stable method and tool identity for policy and telemetry;
- require caller, argument, and resource checks beyond header admission;
- use current authorization and protocol versions;
- retain a simple CLI or direct HTTP adapter when cross-client interoperability
  does not justify MCP.

MCP remains an adapter surface, not the source of truth for platform state.

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
- Depending on hidden remote state when a request-scoped API or simple CLI command is enough.

## Related notes

- [MCP 2026 stateless protocol](../projects/mcp-2026-stateless-protocol.md)
- [Convex agent plugins](../projects/convex-agent-plugins.md)
