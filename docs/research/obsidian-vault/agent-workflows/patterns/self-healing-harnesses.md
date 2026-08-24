# Self-healing harnesses

## Idea

Give the agent a tiny stable core plus a clearly writable helper surface. When the agent discovers a missing capability, it adds a helper or domain note instead of bloating the central system prompt.

## Seen in

- [Browser-use browser harness](../projects/browser-use-browser-harness.md)
- [Cloudflare and Astro issue triage](../projects/cloudflare-astro-issue-triage.md)

## Why it works

- Keeps core code small and auditable.
- Turns one-off debugging into reusable capability.
- Separates protected infrastructure from agent-authored glue.
- Makes learning concrete: helper files and domain skills can be reviewed in git.

## Repeated failure can expose repository defects

A missing capability is only one explanation for repeated agent failure. The
Cloudflare and Astro triage case identifies three other repository-facing
causes: opaque component boundaries, missing implementation rationale, and
insufficient regression coverage. Their reported HMR case improved after the
repository encoded the condition's rationale and added coverage rather than
only changing the model or harness. See the
[Cloudflare case study](https://blog.cloudflare.com/astro-issue-triage/).

Classify the failure before choosing a response:

- clarify a component boundary;
- document rationale that is also useful to human maintainers;
- add a focused regression test;
- improve an architecture guide;
- add a narrow helper only when capability is actually missing.

These changes still require ordinary review. The goal is not to let an agent
rewrite architecture or add explanatory noise to optimize its own behavior.

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
