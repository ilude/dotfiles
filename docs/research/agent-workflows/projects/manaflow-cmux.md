# manaflow-ai/cmux

Repo: https://github.com/manaflow-ai/cmux  
Site: https://cmux.com/

## What it is

A Ghostty/libghostty-based macOS terminal built for multitasking coding agents.

## Concrete implementation details

- Vertical and horizontal tabs for multiple terminal panes.
- Notification rings and badges when agents need attention.
- Notification panel to jump to pending work.
- In-app browser with an API derived from Vercel Agent Browser.
- Sidebar shows project context such as branch, PR, directory, ports, and latest notification text.
- Uses Claude Code stop hooks in the demo to signal completed/blocked panes.

## Source video

- [[../videos/cmux-video]]

## Related repo

- Vercel Agent Browser: https://github.com/vercel-labs/agent-browser

## Patterns

- [[../patterns/agent-terminal-workspaces]]

## KISS takeaways for Pi

- We do not need to clone cmux to benefit from the idea.
- Start with simple status files or terminal titles for agent state.
- Add a compact `pi status`/dashboard before building any GUI.
- Hooks/notifications should answer: which task needs attention, why, and where?
