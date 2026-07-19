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

Damage-control is a safety boundary, not a target to evade. Before an operation likely to require confirmation, decide whether its effect is necessary for the requested outcome. Omit incidental cleanup, narrow targets, and prefer overwriteable scratch output or non-destructive tools when they preserve the intended result.

Do not switch languages, wrappers, aliases, encodings, or command shapes to hide the same risky effect. Issue a necessary risky operation plainly and allow the normal confirmation boundary. Use the approval-aware operations guidance for deletion, protected paths, destructive Git, process control, package/cache removal, uploads, or external infrastructure mutation.
