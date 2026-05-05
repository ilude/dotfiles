# get-convex/convex-agent-plugins

Repo: https://github.com/get-convex/convex-agent-plugins  
Docs: https://docs.convex.dev/ai/using-cursor

## What it is

Official Convex plugins for AI coding agents. Current stated support is Cursor and Claude Code, not Pi directly.

## Concrete implementation details

- 18 persistent best-practice rules.
- 6 specialized skills.
- 2 custom agents.
- MCP integration for deployment data and operations.
- Development hooks for validation, codegen, and pre-commit checks.

## Pi support signal

Weak direct support, but strong adaptation value. The structure maps cleanly to Pi concepts:

- Rules → project instructions / AGENTS.md / Pi skill guidance.
- Skills → Pi skills.
- Custom agents → Pi subagents.
- Hooks → Pi extensions or explicit workflow commands.
- MCP → future tool integration or external command wrapper.

## Source video

- ../videos/smart-pi-daytona-convex-video.md

## Patterns

- ../patterns/agent-friendly-platforms.md
- ../patterns/markdown-skills-memory.md

## KISS takeaways for Pi

- Package domain expertise in small, named capabilities.
- Add rules that prevent common mistakes before adding automation.
- Keep platform-specific knowledge close to the project using it.
