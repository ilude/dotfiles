# OpenClaw

Repo: https://github.com/openclaw/openclaw  
Docs: https://docs.openclaw.ai/

## What it is

A self-hosted personal AI assistant that connects to chat/channel surfaces and runs on local devices.

## Pi support signal

Strong. Armin Ronacher's article says Pi is the small coding agent under the hood of OpenClaw:

- https://lucumr.pocoo.org/2026/1/31/pi/

OpenClaw docs/search results also reference `pi-coding-agent` for skill prompt formatting.

## Concrete implementation details to study

- Markdown-first skills and memory.
- Gateway/control-plane architecture.
- Channel plugins for chat surfaces.
- Workspace setup and local-first assistant behavior.
- Plain Markdown memory files such as `MEMORY.md` per docs.

## Related resources

- Skills archive: https://github.com/openclaw/skills
- Curated skills: https://github.com/VoltAgent/awesome-openclaw-skills
- Agent templates: https://github.com/mergisi/awesome-openclaw-agents
- Supermemory plugin: https://github.com/supermemoryai/openclaw-supermemory

## Patterns

- [[../patterns/markdown-skills-memory]]

## KISS takeaways for Pi

- Keep skills as Markdown directories with narrow scope.
- Treat memory as curated notes, not full chat logs.
- Prefer source-controlled workflow knowledge and gitignored runtime state.
- Avoid installing huge generic skill packs; create local skills from repeated successful workflows.
