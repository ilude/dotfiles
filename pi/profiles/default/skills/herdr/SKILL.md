---
name: herdr
description: Use Herdr for requested long-running development servers and visible logs inside Herdr, or when owned subagent controls cannot reach a visible agent or pane and cross-agent recovery is needed. Discover the deferred controls and installed documentation.
---

# Herdr

Use automatically for requested long-running processes when `HERDR_ENV=1`; otherwise use the existing execution workflow. Preserve focus unless the user requests otherwise.

This is a local wrapper, not the upstream Herdr skill. For operations covered by structured tools, use their schemas directly. On first raw CLI use run `herdr --skill` and read its complete output, even if it says to skip when a skill is already loaded. Do not reload identical documentation for every operation; refresh after a Herdr version change or syntax mismatch. Use targeted CLI help for missing syntax. Our approved automatic invocation policy supersedes upstream's explicit-mention restriction; other targeting/safety guidance still applies.

Discover `herdr_agent`, `herdr_layout`, and `herdr_pane` through `tool_search`. Useful searches include `Herdr agent control`, `read or prompt another agent`, and `cross-agent pane recovery`. These deferred tools cover the connected Herdr server only, not other Herdr servers or machines.

For an owned child, use `subagent_control` first. If it cannot see or reach a visible agent or pane, use `tool_search` to activate Herdr control, inspect the connected layout, and prefer asking a live earlier coordinator to reconcile its workers. Use `herdr_agent` to inspect, read, prompt, wait for, or send keys to live agents. If the target has no functioning agent interface, use `herdr_pane` to inspect and read the exact pane, then deliberately interrupt or close only the selected non-caller pane. Idle does not by itself mean stale. Exact existing panes are not restricted to those created by this Pi session, and closing them does not require a separate confirmation field. The executing pane remains protected. This is a conditional recovery path, not a replacement for ordinary structured subagent ownership.

- To reopen a saved Pi session, use `herdr_layout` with `action: "resume"` and its session UUID. It resolves the saved cwd, launches and focuses a Pi tab, and checks startup in one call. Inspect returned IDs if readiness is unconfirmed; do not blindly relaunch. No separate shell creation, command submission, or raw CLI discovery is needed.
- Inspect existing panes before creating duplicates. Prefer a sibling pane in the project cwd; choose right/down based on available layout. New panes preserve focus. Use `herdr_pane` move to place a non-caller pane in a new tab in an existing different workspace; cross-workspace moves return a new pane ID.
- Submit commands only to verified idle Bash/PowerShell shells. Unknown foreground processes or cwd are not safe command targets. Use `subagent` for defined agent work, not these process tools; see [subagents](../../docs/subagents.md).
- Use bounded fresh readiness/log checks or a health endpoint. Old scrollback may match immediately. Submitted does not mean ready or successful.
- `compose up`, detached containers, and `logs -f` have distinct ownership. Interrupting/closing a log viewer does not stop containers. Destructive cleanup is not implied by a stop request.
- Inspect before cleanup. Interrupt gracefully, then inspect again. A deliberate interrupt or close may target an exact existing non-caller pane in the connected Herdr server, including one from an earlier Pi session; the executing pane remains protected. Do not infer staleness from idle state or close anything automatically. The separate subagent runtime retains its own authenticated child ownership and performs its own cleanup.
- Pi exit does not stop services. Do not close unrelated panes or stop the Herdr server.

Setup and limitations: [../../docs/herdr.md](../../docs/herdr.md). If a direct Pi tab is missing from Herdr Agents, verify that `local.pi` was regenerated from the lasting checkout and that its foreground process is the real Pi CLI, not an in-process dynamic-import wrapper. Reopen settled tabs through the corrected launcher; `/reload` cannot change an existing process's OS command line. A successful bootstrap API acknowledgment alone is not proof of registration.
