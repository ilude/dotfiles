---
created: 2026-04-19
updated: 2026-04-27
status: research-note
source: .specs/zellij-windows-cockpit-v1/
---

# Zellij Windows Cockpit

## Core idea

Build a Windows-native terminal development cockpit using PowerShell 7, Zellij, Micro, Yazi, fzf/fd/ripgrep/bat, Pi, and project directories or Git worktrees as workspace boundaries.

The practical v1 is intentionally small: one project/worktree, one Pi pane, repo-managed config/layouts, and helper commands that make the layout a daily driver.

## Long-term vision

The broader concept is an IDE-like terminal workspace:

```text
File manager | editor | agent roster/status
             | active agent terminal
```

The far-right column is eventually a roster/status/task selector, while the active agent terminal shows only the selected backing Pi session. Multiple agents may exist behind the scenes, but v1 does **not** implement dynamic agent switching.

## V1 scope

- add Windows cockpit packages to WinGet DSC config
- add PowerShell helpers: `y`, `yf`, `ff`, `cproj`, `zproj`
- set editor/fzf defaults
- launch repo-owned Zellij config/layout explicitly
- add four panes: Yazi, Micro, one Pi terminal, and static help/status pane
- add health/help/menu commands later: `cockpit`, `cockpit-check`, `cockpit-help`
- upgrade `zproj` to attach-or-create behavior after the foundation works

## Design decisions

- PowerShell is workflow glue.
- Zellij owns layout/session/pane management.
- Micro is the non-modal terminal editor.
- Yazi is the project browser.
- Pi is the coding-agent runtime.
- Git worktrees are preferred for agent task isolation, but plain project directories are valid.
- Config is repo-managed and launched explicitly; no global Dotbot-linked Zellij config is required for first launch.

## Deferred ideas

Deferred because they turn into agent orchestration or PTY/session-management systems:

- role launcher for coordinator/implementer/tester/reviewer
- persistent backing agent sessions
- real TUI agent roster
- Pi-aware workspace coordination under `.agent/`
- dynamic switching of the active agent viewport
- structured command blocks
- persistent activity/event database

## Validation lessons

- File-presence and `rg` checks are not equivalent to Windows runtime validation.
- PowerShell helpers must be tested with `pwsh -NoProfile` and strict mode.
- Windows paths with spaces must be handled safely.
- Help text must not promise deferred multi-agent behavior.
- Missing tools should degrade clearly with actionable install guidance.

## KISS recommendation

Treat the cockpit as ergonomic shell glue, not a new orchestration platform. First ship one reliable Zellij workspace with one Pi pane and good health/help affordances. Revisit multi-agent rosters only after the single-agent cockpit is a daily-driver workflow.
