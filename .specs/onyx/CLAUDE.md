# Onyx - Working Context

This file provides context for Claude Code when working on the Onyx project.

## What Is Onyx

Personal AI assistant platform — OpenClaw's concept rebuilt in **TypeScript/Bun** on existing menos infrastructure (SurrealDB, MinIO, Ollama). Runs on Linux with Docker. Single-user MVP.

## Why Not Just Use OpenClaw

- Overly difficult to get working with available model subscriptions
- Highly reliant on brew for extensibility — user runs Linux + Docker, not macOS
- Onyx removes macOS dependency while keeping the same concept: always-on AI assistant with memory, web search, scheduling, chat UI

## Key Files

- `prd.md` — comprehensive PRD with 10 decided architectural decisions (D1-D10)
- `research/openclaw-notes.md` — research notes: Docker setup, memory architecture, enhancement options, hybrid search tuning, decision matrix
- `research/` — source analyses, comparisons, prompt extraction, and research outputs from PicoClaw, NanoClaw, Nanobot, OpenClaw
- `features/` — future feature design documents (e.g., ToolResult duality)

## MAJOR PIVOT: Python → TypeScript/Bun (2026-02-16)

Original stack was Python/FastAPI/LiteLLM. Changed to full TypeScript/Bun because:
- Claude Agent SDK has official TypeScript package (`@anthropic-ai/claude-agent-sdk`)
- GitHub Copilot has official TypeScript SDK (`@github/copilot-sdk`)
- OpenAI Codex has official TypeScript SDK (`@openai/codex-sdk`)
- Vercel AI SDK handles all API-key providers (OpenAI, Anthropic, Bedrock, Ollama, OpenRouter, etc.)
- One language across frontend (SvelteKit) + backend = shared types, simpler stack
- LiteLLM is no longer needed — all providers have native TypeScript SDKs

### Provider Architecture (D4)

| Provider Type | SDK | Auth Method |
|--------------|-----|-------------|
| Claude Pro/Max subscription | `@anthropic-ai/claude-agent-sdk` | OAuth |
| GitHub Copilot subscription | `@github/copilot-sdk` | OAuth device flow |
| OpenAI/Codex subscription (ChatGPT Plus/Pro) | `@openai/codex-sdk` | OAuth device flow |
| API key providers (OpenAI, Anthropic, Bedrock, Ollama, OpenRouter, Google, Azure, etc.) | Vercel AI SDK (`ai`) | API keys / credentials |

Custom abstraction layer unifies all four backends behind a single interface.
**Note**: MVP supports both subscription SDK backends and API key/credential providers.

### Stack

| Component | Technology |
|-----------|-----------|
| Backend runtime | Bun / Hono (HTTP + WebSocket) |
| Frontend | SvelteKit + shadcn-svelte + Tailwind CSS |
| LLM providers | 4-SDK abstraction layer (Vercel AI SDK first, subscription SDKs Phase 2) |
| Scheduling | TBD (node-cron, BullMQ, or similar) |
| Package manager | Bun / package.json |
| SurrealDB client | surrealdb.js |
| MinIO client | minio-js |

## MVP Scope (Phase 1)

- **Web UI** (SvelteKit + shadcn-svelte + Tailwind CSS) — primary interface, OpenClaw dashboard-style chat + admin
- **Memory** (files-first in MinIO, SurrealDB as search index, hybrid vector + BM25)
- **Web search** (SearXNG)
- **Event loop / scheduling** (TBD JS scheduler)
- **Filesystem + MinIO**
- **SurrealDB** replacing SQLite
- **Auth**: Username/password (single user) + optional bearer token for API clients
- **Provider**: Four-SDK abstraction (subscription backends + API key/credential providers)

NOT MVP: git tools, docker tools, mermaid rendering, model routing, menos integration, bot plugins (Discord/Telegram — Phase 2)

## Roadmap

### Phase 1: MVP — Personal Assistant via Web UI
Project scaffold, four-SDK providers, OpenAI-compatible API (Hono), sessions, memory, MVP tools (memory/sessions/web/fs/runtime/schedule), agent definitions, web UI, username/password auth (+ optional bearer token).

### Phase 2: Integrations & Multi-Platform
Bot plugins (Discord, Telegram), menos integration, subscription provider hardening (OAuth UX/reliability/fallbacks), additional tools (model routing, mermaid, git, docker), CLI plugin.

### Phase 3: Future
Multi-user, sandbox isolation, plugin extraction to separate processes, passkey auth (WebAuthn), MCP support.

## Architecture Decisions

| ID | Decision | One-liner |
|----|----------|-----------|
| D1 | Memory | Files-first in MinIO, SurrealDB as search index |
| D2 | menos integration | Shared infra, Onyx queries menos, conversations stay in Onyx |
| D3 | Bot plugins | Phase 2, in-process with interfaces for future extraction |
| D4 | LLM providers | 4-SDK TypeScript abstraction (Phase 1: Vercel AI SDK; Phase 2: subscription SDKs) |
| D5 | Sessions | MinIO JSONL + SurrealDB metadata |
| D6 | API | OpenAI-compatible HTTP API (Hono) |
| D7 | Web UI | SvelteKit + shadcn-svelte + Tailwind CSS |
| D8 | Tool system | Built-in tool groups + custom tools + cron scheduling |
| D9 | Agent format | OpenClaw-compatible JSON config + workspace markdown |
| D10 | Deployment | Single Docker Compose stack, shared network with menos |

## Auth Strategy

- **Phase 1**: Username/password login with session cookie (web UI) + optional bearer token (API)
- **Phase 2**: Passkey as optional auth method
- **Phase 3**: Advanced auth hardening (multi-user-oriented)

## Testing

| Layer | Framework | Command |
|-------|-----------|---------|
| API unit/integration | `bun test` | `bun test` |
| Frontend unit | Vitest | `bun run test` (in frontend/) |
| E2E | Playwright | `bun run test:e2e` |

## Frontend Documentation (LLM-Friendly)

- Svelte/SvelteKit: https://svelte.dev/llms-full.txt (also medium, small variants)
- shadcn-svelte: https://www.shadcn-svelte.com/llms.txt
- Tailwind CSS: No official llms.txt (PR rejected), use standard docs

## Reference Repos

- `ilude/agent-spike` — SvelteKit + Svelte 5, chat UI, SSE, vault editing, separate frontend/API services
- `Ministry-of-Downhill-Redistribution/slash-ski` — SvelteKit + Tailwind 4 + Bun, Lucia auth, Prisma

## Still Open

- **Frontend serving**: Separate SvelteKit + API services (like agent-spike) vs unified? Leaning toward separate.
- **JS scheduling library**: node-cron vs BullMQ vs other
- **SurrealDB JS client maturity**: Need to verify feature parity with Python client

## Model Notes

- Claude Opus 4.5 still active on API (`claude-opus-4-5-20251101`), not deprecated
- Opus 4.6 (`claude-opus-4-6`) is current default in Claude Code
- All Opus 4.x models (4, 4.1, 4.5, 4.6) are active
