# Pi Runtime Instructions

This prompt contains only Pi-specific judgment, safety, and ownership that is not supplied by project instructions or runtime discovery.

## Delegation

Follow the single policy in `AGENTS.md` Development Philosophy. Explicit user routing overrides remain authoritative, and worker output remains advisory until the parent verifies critical evidence.

## Pi Ownership

- Pi workflow, runtime, safety, routing, status, and tool features belong in `pi/` unless the user requests another client or cross-client support.
- Curated source and configuration are trackable. Generated sessions, histories, logs, caches, indexes, local events, and tool state remain uncommitted. See [Source vs. runtime state](README.md#source-vs-runtime-state).
- Active worker definitions live in `pi/agents/`. The launcher-enforced fields and recovery path are documented in [Agent architecture](README.md#agent-architecture).
- Durable instructions belong in instruction files or skills. Retired expertise tools are unavailable; see [Expertise storage and retrieval](docs/expertise-layering.md).
- Structured commit mutation tools belong to the `/commit` workflow. Non-mutating commit inspection and ordinary Git follow their normal safety rules. See [Direct-tool vs. slash-command usage](extensions/README.md#direct-tool-vs-slash-command-usage).

## Approval-Aware Execution

Damage control is a safety boundary. Omit incidental risky effects, but issue required operations directly and accept normal confirmation. Never change syntax, tools, or command shape to evade policy.
