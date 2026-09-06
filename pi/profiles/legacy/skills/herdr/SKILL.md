---
name: herdr
description: "Control Herdr terminal workspaces, tabs, panes, commands, and coding agents when the user explicitly requests Herdr. Requires HERDR_ENV=1."
---

# Herdr

## Gate

Check `HERDR_ENV=1` before controlling Herdr. If it is absent, report that the current process is outside Herdr and stop.

Stop when validation work targets the default interactive socket. Automation must use a dedicated session and pinned socket as documented in [automation contracts](references/automation.md).

Use the Herdr tools rather than raw CLI input:

- `herdr_layout` for workspaces, tabs, pane topology, and splits.
- `herdr_pane` for shells, tests, servers, builds, logs, and raw terminal control.
- `herdr_agent` for recognized coding agents, prompts, waits, output, and interactive keys.

## Topology

- Read opaque workspace, tab, and pane IDs from tool results. Never construct them.
- Default to a sibling pane in the current tab and current working directory.
- Preserve UI focus unless the user asks to change it.
- Create a tab, workspace, worktree, or different working directory only when requested.
- Do not close a pane you did not create unless the user explicitly asks.

## Coding agents

1. Create an available shell pane with `herdr_layout`.
2. Start the requested agent with `herdr_agent start` and a unique live name.
3. Submit work with `herdr_agent prompt` and wait for `idle`, `done`, or `blocked`.
4. Treat `blocked` as requiring inspection or input. Treat `unknown` as uncertain, not complete.
5. Read the result through `herdr_agent`. Use raw pane control only intentionally.

If terminal alternate-screen behavior prevents recovery of a complete response, ask the agent to write the response to a temporary Markdown file and return its path.

## Ordinary commands

Use `herdr_pane run` for commands and `wait_output` for tests, servers, builds, and watchers. Use `recent-unwrapped` for logs and transcripts. Output already present can satisfy `wait_output` immediately.

Use text output unless ANSI styling is evidence. Stop or close only processes and panes within the requested scope.
