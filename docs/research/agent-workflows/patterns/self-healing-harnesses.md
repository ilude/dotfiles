# Self-healing harnesses

## Idea

Give the agent a tiny stable core plus a clearly writable helper surface. When the agent discovers a missing capability, it adds a helper or domain note instead of bloating the central system prompt.

## Seen in

- [[../projects/browser-use-browser-harness]]

## Why it works

- Keeps core code small and auditable.
- Turns one-off debugging into reusable capability.
- Separates protected infrastructure from agent-authored glue.
- Makes learning concrete: helper files and domain skills can be reviewed in git.

## KISS version for our workflow

Create per-domain helper folders like:

```text
.pi/workflows/<domain>/
  README.md
  helpers/
  examples/
  known-failures.md
```

Rules:

1. The agent can suggest helpers.
2. The human reviews helpers before they become default workflow behavior.
3. Helpers must be short, named, and testable.
4. Each helper documents when to use it and when not to use it.

## Anti-patterns

- Letting the agent modify core harness code freely.
- Accumulating hundreds of generic helpers with unclear owners.
- Hiding learned behavior in chat history only.
