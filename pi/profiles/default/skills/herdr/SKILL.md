---
name: herdr
description: Use Herdr for requested long-running development servers, Docker/Compose processes, and visible logs when inside Herdr. Discover deferred pane/layout tools and installed documentation.
---

# Herdr

Use automatically for requested long-running processes when `HERDR_ENV=1`; otherwise use the existing execution workflow. Preserve focus unless the user requests otherwise.

This is a local wrapper, not the upstream Herdr skill. On first use run `herdr --skill` and read its complete output, even if it says to skip when a skill is already loaded. Do not reload identical documentation for every operation; refresh after a Herdr version change or syntax mismatch. Use targeted CLI help for missing syntax. Our approved automatic invocation policy supersedes upstream's explicit-mention restriction; other targeting/safety guidance still applies.

Discover `herdr_layout` and `herdr_pane` through `tool_search`. Use the structured tools for their covered operations rather than bypassing their safety handling with raw terminal submissions.

- Inspect existing panes before creating duplicates. Prefer a sibling pane in the project cwd; choose right/down based on available layout. New panes preserve focus.
- Submit commands only to verified idle Bash/PowerShell shells. Unknown foreground processes or cwd are not safe command targets. Use `subagent` for defined agent work, not these process tools; see [subagents](../../docs/subagents.md).
- Use bounded fresh readiness/log checks or a health endpoint. Old scrollback may match immediately. Submitted does not mean ready or successful.
- `compose up`, detached containers, and `logs -f` have distinct ownership. Interrupting/closing a log viewer does not stop containers. Destructive cleanup is not implied by a stop request.
- Interrupt gracefully, then inspect. Close only verified panes created by this Pi session, with explicit tool confirmation. Process-tool ownership is intentionally forgotten on session replacement/reload; do not invent ownership to close older panes. The separate subagent runtime retains its own authenticated child ownership and performs its own cleanup.
- Pi exit does not stop services. Do not close unrelated panes or stop the Herdr server.

Setup and limitations: [../../docs/herdr.md](../../docs/herdr.md).
