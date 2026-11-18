---
name: herdr
description: Route Herdr work to desktop/herdr-core or original TUI guidance. Use for explicitly requested Claude Code/ccyl or independent-session communication, long-running processes/logs, visible-agent recovery, and desktop windows, spaces, tabs or customization.
---

# Herdr host routing

Use the runtime `herdr_host` context to choose the interface. Pi's own `tui` mode means interactive Pi, not necessarily the Herdr TUI.

- **Pi in T3 Code:** an explicit `ccyl` request uses T3's configured `ccyl` provider and subscription models through generic `delegate_task`, not Herdr or a shell launch. Follow the extension's T3 external-client guidance; named Pi role enforcement does not carry over.
- **Herdr desktop or herdr-core:** read [herdr-desktop](../herdr-desktop/SKILL.md). Use `herdr-app` for the window and `hc` for core terminals.
- **Original Herdr TUI:** read the [TUI reference](references/tui.md) before operating it. The existing `herdr_agent`, `herdr_layout` and `herdr_pane` tools belong to this integration only.
- **Ordinary terminal or unverified host:** do not infer membership from installed executables, `TERM_PROGRAM`, or an open app. For an explicit request, select the requested application and inspect its state. If desktop versus TUI intent remains ambiguous, ask.

A complete original-TUI caller context takes priority over inherited `HC_*` markers when nested. Otherwise, `HC_TERMINAL_ID` and `HC_TERMINAL_SOCKET` identify a core terminal; the terminal's `herdr.space` and `herdr.tab` labels establish desktop membership. A failed probe leaves that membership unverified.

Both interfaces remain available for explicit work. Host detection routes guidance; it does not port tools, change profiles, grant communication authority, or authorize unrelated terminal cleanup.
