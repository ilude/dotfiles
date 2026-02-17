# Onyx MVP — Implementation Baseline

Recorded: 2026-02-16

## Runtime Versions

| Component | Version | Pin Strategy |
|-----------|---------|-------------|
| Bun | 1.3.9 | `engines` in package.json |
| Node.js | v25.6.1 | Reference only (Bun primary) |
| TypeScript | ~5.7.x | Via Bun bundled |

## Container Image Tags

| Service | Image | Tag |
|---------|-------|-----|
| API | custom (Dockerfile) | `oven/bun:1.3-alpine` base |
| Frontend | custom (Dockerfile) | `oven/bun:1.3-alpine` base |
| SurrealDB | `surrealdb/surrealdb` | shared with menos (existing) |
| MinIO | `minio/minio` | shared with menos (existing) |
| Ollama | `ollama/ollama` | shared with menos (existing) |
| SearXNG | `searxng/searxng` | `latest` (Onyx-owned) |

## Environment Minimums

| Variable | Default | Source |
|----------|---------|--------|
| `ONYX_PORT` | 18790 | API server |
| `ONYX_FRONTEND_PORT` | 18791 | SvelteKit |
| `SURREAL_URL` | `ws://surrealdb:8000` | Shared infra |
| `SURREAL_NS` | `onyx` | Onyx namespace |
| `SURREAL_DB` | `onyx` | Onyx database |
| `MINIO_ENDPOINT` | `minio:9000` | Shared infra |
| `MINIO_ACCESS_KEY` | (required) | From env |
| `MINIO_SECRET_KEY` | (required) | From env |
| `OLLAMA_URL` | `http://ollama:11434` | Shared infra |
| `SEARXNG_URL` | `http://searxng:8080` | Onyx-owned |

## Key Dependencies (initial)

| Package | Purpose |
|---------|---------|
| `hono` | HTTP + WebSocket server |
| `zod` | Schema validation |
| `surrealdb` | SurrealDB JS client |
| `minio` | MinIO JS client |
| `ai` (Vercel AI SDK) | Multi-provider LLM abstraction |
| `@sveltejs/kit` | Frontend framework |
| `bits-ui` / `shadcn-svelte` | UI components |
| `tailwindcss` | Styling |
| `argon2` | Password hashing |

## Orchestration Contracts

### Builder Handoff
Each builder returns: changed files list, test commands run + results, unresolved blockers (if any).

### Validator Contract
Each validator: runs all wave tests, publishes PASS/FAIL, lists unblocked tasks for next wave.

### Retry Policy
- Max 2 retries per failed task
- After 2 failures: escalate to coordinator for manual intervention
- Validation failure: create fix task, assign to original builder, re-validate
