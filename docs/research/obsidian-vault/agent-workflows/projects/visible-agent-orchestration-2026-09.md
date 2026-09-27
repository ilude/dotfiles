---
status: research-note
source: September 2026 web research and installed Herdr 0.9.1 CLI
---

# Visible coding-agent orchestration: September 2026

## Why this matters

The local workflow needs Claude Code to delegate work to Pi using the Codex subscription while each worker remains visible and interactive in a Herdr pane. Hidden one-shot processes save Claude usage but conceal whether workers are active, blocked, or awaiting follow-up.

This note preserves relevant external implementations for both the Claude-to-Pi bridge and future Pi/Herdr subagent work. It is research context, not a decision to adopt another orchestration framework.

## Sources and useful signals

### [Herdr](https://github.com/herdrdev/herdr)

- Native visible panes and agent-aware lifecycle states.
- Structured `agent start`, `prompt`, `get`, `read`, `wait`, and `send-keys` operations.
- Stable pane IDs and live agent names avoid addressing workers by screen position.
- The installed 0.9.1 CLI is already the local terminal runtime, so another multiplexer would duplicate it.
- GitHub evidence inspected September 26, 2026: active the same day, about 40.9k stars, Apache-2.0.

### [tmux-agents](https://github.com/woonyong-choi/tmux-agents)

- Closest control-surface match: an MCP client launches, observes, prompts, waits for, and interrupts visible coding agents.
- Bounded and incremental pane reads reduce context use.
- Combined prompt-and-wait operations distinguish submission from completion.
- Restricting the server to agent panes is safer than exposing arbitrary shell execution.
- Its quiet-screen and prompt heuristics are tmux-specific and weaker than Herdr's native agent lifecycle.
- GitHub evidence inspected September 22, 2026: newly created, no adoption history yet. Borrow interface ideas, not maintenance reputation.

### [Pi Mux Subagents](https://github.com/davidsunglee/pi-mux-subagents)

- Pi-specific visible subagents with Herdr as the preferred mux adapter.
- Separates interactive/retained workers from auto-exiting one-shot workers.
- Separates project trust from execution policy.
- Uses explicit orchestration identities and completion return paths.
- GitHub evidence inspected September 2026: two stars and last pushed June 14. Treat as source material rather than a dependency.

### [AWS CLI Agent Orchestrator](https://github.com/awslabs/cli-agent-orchestrator)

- Separates supervisor control, provider launch configuration, and terminal runtime.
- Keeps workers as native authenticated CLI processes rather than replacing their interfaces.
- Provides structured MCP and API control surfaces across several coding CLIs.
- Far broader than the local requirement, with a server, profiles, web UI, flows, memory, and plugins.
- GitHub evidence inspected September 26, 2026: active the same day, about 1.35k stars, Apache-2.0.

### [Agent of Empires](https://github.com/agent-of-empires/agent-of-empires)

- Persistent, attachable coding-agent sessions with status detection and direct intervention.
- Supports Pi, Claude Code, Codex, and other native CLIs.
- Demonstrates the value of treating the visible session as the durable worker unit.
- Its TUI, web UI, containers, worktrees, and tmux dependency exceed the local need.
- GitHub evidence inspected September 26, 2026: active the same day, about 3.29k stars, MIT.

### [Claude Squad](https://github.com/smtg-ai/claude-squad)

- Established example of supervising native agents in persistent terminal sessions.
- Uses simple session and worktree primitives rather than replacing each agent CLI.
- Primarily a human-facing session manager, not a structured agent-to-agent bridge.
- GitHub evidence inspected September 2026: about 8.54k stars, last pushed August 20, AGPL-3.0.

### [Claude Code agent teams](https://code.claude.com/docs/en/agent-teams)

- Official interaction model for independent workers, direct operator access, split-pane visibility, and explicit working/idle/failed states.
- Confirms that visible panes are useful when parallel workers justify their coordination cost.
- Claude teammates consume the Anthropic allowance, so they do not solve the local subscription-routing requirement.

## Reusable patterns

- Keep each worker as a native, visible, interactive CLI process.
- Address workers with stable IDs or unique names, never pane order.
- Return structured lifecycle state; do not infer completion from terminal silence when the multiplexer already knows agent state.
- Bound transcript reads and allow follow-up prompts without restarting a worker.
- Separate launch configuration from runtime control.
- Preserve direct operator access and leave completed workers open when follow-up is likely.
- Distinguish prompt submission, observed work, settled completion, and blocked input.
- Constrain interruption and closure to an exact worker created or deliberately selected by the orchestrator.

## Possible Claude and Pi fit

A thin Claude-facing adapter can wrap the Herdr operations already installed locally. Claude remains the coordinator while Pi workers use the default Pi profile and Codex-backed models in visible panes. The same research can inform future Pi subagent UX without replacing Pi's authenticated ownership and result-delivery protocol with terminal scraping.

The smallest useful control surface is:

1. start a named Pi worker in a visible Herdr pane;
2. prompt it, optionally waiting for a settled or blocked state;
3. inspect status and bounded recent output;
4. send a follow-up or logical interrupt;
5. explicitly close a selected retained worker.

## Risks / reasons not to build more

- A generic Herdr shell bridge would grant broader control than Claude needs.
- Terminal text should not become a second task database or authoritative completion protocol.
- Direct Herdr sessions lack Pi's existing parent-child authenticated result and authority contracts unless the bridge adds a narrow ownership record.
- Automatically trusting repositories or bypassing permissions would conflate startup convenience with execution authority.
- Worktree automation, workflow DAGs, dashboards, databases, and a background daemon are not required for the first slice.
- Claude Code cannot be awakened by an MCP server after its turn has ended; ordinary tool waits must be bounded, and the operator can see long-running workers in Herdr meanwhile.

## KISS recommendation

Build one local stdio adapter around Herdr's structured agent lifecycle. Expose only start, prompt/wait, status/read, interrupt, and close for Pi workers created by that adapter. Keep workers interactive and retained by default. Do not add another multiplexer, daemon, task store, worktree manager, or completion-marker convention.

## Related notes

- [Agent terminal workspaces](../patterns/agent-terminal-workspaces.md)
- [Manaflow and cmux](manaflow-cmux.md)
- [Pi Coding Agent deep dive](pi-coding-agent-deep-dive.md)
- [Pi Link minimal terminal communication](pi-link-minimal-terminal-communication.md)
- [MCP 2026 stateless protocol](mcp-2026-stateless-protocol.md)
