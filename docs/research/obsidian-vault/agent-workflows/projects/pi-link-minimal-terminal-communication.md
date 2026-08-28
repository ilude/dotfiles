---
status: research-note
source: docs/research/queue/pi-link.txt
captured: 2026-03-27
---

# Pi Link: minimal terminal communication

## Why this matters

[Pi Link](https://github.com/alvivar/pi-link) is a small WebSocket-based way for local Pi coding-agent terminals to discover one another and exchange messages. Its useful signal is a minimal communication layer rather than a larger orchestration service.

## Useful signals

- A small extension with a few communication tools can let agents cooperate through instructions without embedding orchestration in a separate system.
- Orchestration can be expressed as a skill: role-specific instructions explain how otherwise-equal terminals should work together.
- Collaboration loops can stay simple: a builder asks a reviewer for feedback, iterates, then asks a documentation agent to update docs before human review and commit. Similar loops can cover optimization, testing, and branching until a condition is met.
- Names such as `builder@project` route messages by role and project without requiring rigid agent groups.
- Persisting link names in the session makes resumed terminals addressable in the same way.
- Status exposed by internal Pi hooks can distinguish states such as `idle`, `thinking`, and `tool:bash`, with elapsed time. A status view can explain why a listed terminal is not answering and expose context pressure or other useful state without adding that telemetry to the model context.
- A lightweight shared scratch context could use a small key-value interface such as `link_set("auth_plan", "...stuff...")` and `link_get("auth_plan")`.

## Possible Pi fit

Prefer the thinnest local communication seam: explicit terminal names, a compact status listing, and shared scratch state only where repeated coordination needs it. Keep role behavior in skills or prompts so communication remains separate from orchestration policy.

## Risks / reasons not to build yet

The source is an informal project discussion, not a validated architecture. Status semantics, context pressure reporting, shared-state ownership, stale terminals, and message delivery failure need concrete use cases before adding machinery. More tools could make a simple terminal link into an implicit orchestration framework.

## KISS recommendation

Start with direct messages, discoverable names, and hook-derived status. Add shared scratch state only after repeated workflows show that messages and existing artifacts are insufficient.

## References

- [Pi Link on GitHub](https://github.com/alvivar/pi-link)
- [Pi Link on npm](https://www.npmjs.com/package/pi-link)

## Related notes

- [Agent workflow research index](../index.md)
- [Agent terminal workspaces](../patterns/agent-terminal-workspaces.md)
