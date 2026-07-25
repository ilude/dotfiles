---
name: background-terminals
description: "Managed background terminals, bg_start/bg_status/bg_list/bg_kill, /ps, dev servers, watchers, or concurrent long-running shell commands. Not for timers or durable tasks."
---

# Managed Background Terminals

Use managed background terminals for long-lived Bash processes such as development servers, file watchers, and concurrent command work.

## Contract

- Start work with `bg_start`; its command is evaluated by damage-control before any process is spawned.
- Use Bash syntax on macOS and Windows. Set `PI_BACKGROUND_SHELL` to an absolute Bash path only when the normal Pi-compatible shell resolution is insufficient.
- Treat terminal IDs and state as process-local. Use durable `task` records when workflow intent must survive the current process.
- Do not poll `bg_status`. Natural completion is delivered automatically; inspect status only when current output is needed.
- Use `bg_kill` to terminate managed process trees. `/ps` provides a live list and bounded stdout/stderr detail view.
- Do not use background terminals for waits, reminders, or polling loops. Use the scheduler for waits of 60 seconds or longer.

## Output and lifecycle

- Live stdout and stderr are bounded in memory and spill to private capped temporary logs.
- Completion messages are bounded. Use `/ps` to locate session-local log paths when more output is needed.
- Pi shutdown terminates running process trees and removes session-local logs.
