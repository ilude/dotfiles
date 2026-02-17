# Onyx MVP Validation Checklist

## How to Use This Document

This document is designed for a validation agent to systematically verify that the Onyx MVP (Phase 1) was built correctly against the PRD (D1-D12) and team plan (T0-T31).

**Workflow:**
1. Clone the `onyx` submodule and `cd onyx/`
2. Run contract checks first (API behavior, security boundaries, runtime outcomes), then run implementation evidence checks
3. Mark each check as `[x]` (pass) or `[FAIL]` with a note
4. Record any partial passes with details on what works and what does not
5. After completing all sections, fill in the Summary Metrics at the bottom

**Recommended Validator Run Order (Fast Path):**
1. Prerequisites (Section 0) and Build/Install health (Section 1)
2. Ship blockers first: Sections 5b, 6, 11, 13, 19, 21
3. Run all remaining behavioral checks by section order (2 -> 20)
4. Finish with evidence-only checks and note any acceptable implementation variance
5. Complete Summary Metrics and PRD Decision Coverage tables

**Conventions:**
- All commands assume `cwd` is the `onyx/` repository root unless otherwise noted
- Prefer `bun test`/project task commands over ad-hoc shell pipelines for portability and determinism
- Infrastructure services (SurrealDB, MinIO, Ollama) must be running for integration checks
- Checks marked **(critical)** are blocking for MVP ship readiness
- Checks marked **(negative)** test that the system rejects invalid input correctly
- File paths reference expected implementation from the team plan, but equivalent implementations are acceptable when PRD outcomes are met

**Contract-First Scoring Rules:**
- Behavioral checks (API contract, auth/security outcomes, runtime/tool behavior, persistence effects) are authoritative for pass/fail
- Implementation-shape checks (specific file paths, module layout, internal naming) are evidence checks, not standalone blockers
- If behavior passes but implementation differs from plan location/shape, mark pass with a variance note instead of fail
- Only fail MVP readiness on implementation variance when it causes a behavioral, compatibility, or security failure

**Default Commands For Checks Without Inline Snippets:**
- If a checklist item does not include its own command block, run the default command for that section and mark pass/fail using the stated expected outcome for that item.
- Record concrete evidence in notes (test name, endpoint response field, or log line) for each such check.

```bash
# Section default commands
# 0. Prerequisites
cd onyx && bun --version && docker compose version && jq --version && node --version

# 1. Project Structure & Build
cd onyx && bun install && npx @biomejs/biome check . && bun run build

# 2. Shared Types & Schemas
cd onyx && bun test shared/

# 3. Configuration System
cd onyx && bun test api/src/config.test.ts

# 4a. SurrealDB
cd onyx && bun test api/src/db/

# 4b. MinIO
cd onyx && bun test api/src/storage/

# 5a. Auth System
cd onyx && bun test api/src/auth/

# 5b. Secret Broker & Security
cd onyx && bun test api/src/secrets/ && bun test api/src/security/

# 6. Provider Abstraction
cd onyx && bun test api/src/providers/

# 7. Sessions
cd onyx && bun test api/src/sessions/

# 8. Memory System
cd onyx && bun test api/src/memory/

# 9. Agent System
cd onyx && bun test api/src/agents/

# 10. Tool System
cd onyx && bun test api/src/tools/

# 11. Agent Runtime
cd onyx && bun test api/src/agents/runtime.test.ts

# 12. Context Assembly
cd onyx && bun test api/src/agents/context.test.ts

# 13. HTTP Gateway
cd onyx && bun test api/src/gateway/http.test.ts

# 14. WebSocket Gateway
cd onyx && bun test api/src/gateway/websocket.test.ts

# 15. Heartbeat Engine
cd onyx && bun test api/src/heartbeat/

# 16. Notification System
cd onyx && bun test api/src/heartbeat/notify.test.ts

# 17. Frontend
cd onyx/frontend && bun run test

# 18. Onboarding Wizard
cd onyx/frontend && bun run test

# 19. Docker Compose
cd onyx && docker compose build && docker compose up -d && docker compose ps

# 20. E2E Integration
cd onyx && bun run test:e2e && bun test tests/integration/ && bun test

# 21. Cross-Cutting Concerns
cd onyx && bun test api/src/secrets/ && bun test api/src/security/
```

---

## Prerequisites

Before running validation, ensure the following are available:

- [ ] `onyx/` submodule is cloned and accessible
- [ ] Bun runtime is installed (`bun --version`)
- [ ] `jq` is installed for JSON output checks (`jq --version`)
- [ ] Docker and Docker Compose are installed (`docker compose version`)
- [ ] SurrealDB is running (port 8000) with namespace `onyx` available
- [ ] MinIO is running (port 9000) with API access
- [ ] Ollama is running (port 11434) with `nomic-embed-text` model available
- [ ] SearXNG is running (port 8888) for web search tests
- [ ] Node.js available for `npx` commands (biome)

---

## 1. Project Structure & Build

**Source tasks:** T1 (monorepo scaffold)
**PRD decisions:** Foundation for all D1-D12

### File Structure

- [ ] **(evidence)** `onyx/package.json` exists with Bun workspace configuration
- [ ] **(evidence)** `onyx/tsconfig.json` exists at root
- [ ] **(evidence)** `onyx/biome.json` exists at root
- [ ] **(evidence)** `onyx/api/package.json` exists
- [ ] **(evidence)** `onyx/api/tsconfig.json` exists
- [ ] **(evidence)** `onyx/api/src/index.ts` exists (Hono entry point)
- [ ] **(evidence)** `onyx/frontend/package.json` exists (SvelteKit project)
- [ ] **(evidence)** `onyx/shared/package.json` exists
- [ ] **(evidence)** `onyx/shared/tsconfig.json` exists
- [ ] **(evidence)** `onyx/Dockerfile` exists (multi-stage for API)
- [ ] **(evidence)** `onyx/docker-compose.yml` exists
- [ ] **(evidence)** `onyx/.env.example` exists (no secret values, variable names only)
- [ ] **(evidence)** `onyx/.gitignore` exists

### Build & Install

- [ ] **(critical)** `bun install` succeeds with zero errors
  ```bash
  cd onyx && bun install && echo "OK"
  # Expected: Clean install, "OK" printed
  ```

- [ ] **(critical)** Hono server starts on port 18790
  ```bash
  cd onyx && bun test api/src/gateway/
  # Expected: Health/startup coverage passes and includes healthy /health status
  ```

- [ ] **(critical)** Bun workspace resolves `@onyx/shared` from api package
  ```bash
  cd onyx && bun test api/
  # Expected: API package tests confirm @onyx/shared workspace resolution
  ```

- [ ] Bun workspace resolves `@onyx/shared` from frontend package
  ```bash
  cd onyx/frontend && bun run test
  # Expected: Frontend tests confirm @onyx/shared workspace resolution
  ```

- [ ] **(critical)** Biome check passes on all files
  ```bash
  cd onyx && npx @biomejs/biome check .
  # Expected: Exit 0, no errors
  ```

- [ ] TypeScript compilation succeeds without errors
  ```bash
  cd onyx && bun run build  # or tsc --noEmit if configured
  # Expected: Exit 0
  ```

---

## 2. Shared Types & Schemas

**Source tasks:** T2
**PRD decisions:** D1 (memory types), D5 (session types), D6 (API types), D8 (tool types), D9 (agent types)

**Expected evidence files:**
- `shared/src/types.ts`
- `shared/src/schemas.ts`
- `shared/src/index.ts`

### Type Coverage

- [ ] **(evidence)** All PRD types defined (D1, D5, D6, D8, D9)
  ```bash
  cd onyx && bun test shared/
  # Expected: Shared type-definition coverage tests pass
  ```

- [ ] **(evidence)** Types include: Message, Session, Agent, Provider, Tool, MemoryFile, MemoryChunk, MemoryMeta, ChatCompletionRequest, ChatCompletionResponse, ToolDefinition, ToolResult, Notification
  ```bash
  cd onyx && bun test shared/
  # Expected: Shared type presence/shape tests pass for required contract types
  ```

### Schema Validation

- [ ] **(critical)** Zod schemas validate OpenAI-compatible chat completion request/response
  ```bash
  cd onyx && bun test shared/
  # Expected: All tests pass
  ```

- [ ] **(evidence)** Package exports work from api
  ```bash
  cd onyx && bun test api/
  # Expected: API import/export compatibility tests pass
  ```

---

## 3. Configuration System

**Source tasks:** T3
**PRD decisions:** D9 (agent format), D11 (runtime config), D12 (heartbeat config)

**Expected evidence files:**
- `api/src/config.ts`
- `api/src/config.test.ts`

### Config Loading

- [ ] **(critical)** Config loads from `~/.config/onyx/onyx.json` with Zod validation
  ```bash
  cd onyx && bun test api/src/config.test.ts
  # Expected: All tests pass (valid config, invalid config rejection, defaults)
  ```

- [ ] Environment variables override config file values
  ```bash
  cd onyx && bun test api/src/config.test.ts
  # Expected: Env override case passes (e.g., ONYX_PORT resolves over file/default)
  ```

- [ ] Missing config file creates/uses default config
  ```bash
  cd onyx && bun test api/src/config.test.ts
  # Expected: Missing-file/default-config case passes
  ```

- [ ] **(negative)** Invalid config is rejected with descriptive Zod error

### Config Shape

- [ ] **(evidence)** Config schema includes `runtime` section (maxTurns, timeouts, contextBudget per D11)
- [ ] **(evidence)** Config schema includes `models` section (defaultModel, heartbeatModel, cronModel, subagentModel per D4)
- [ ] **(evidence)** Config schema includes `failover` section (retries, backoffMs, fallbackModel per D11)
- [ ] **(evidence)** Config schema includes agent definitions with heartbeat config (intervalMinutes, activeHours, timezone per D12)
- [ ] **(evidence)** Config schema includes secret references (SecretRef), not raw credentials

---

## 4. Infrastructure Clients

### 4a. SurrealDB Client & Migrations

**Source tasks:** T4
**PRD decisions:** D1 (memory schema), D5 (session schema)

**Expected evidence files:**
- `api/src/db/client.ts`
- `api/src/db/migrations/`
- `api/src/db/migrate.ts`

- [ ] **(critical)** Client connects to SurrealDB and runs migrations
  ```bash
  cd onyx && bun test api/src/db/
  # Expected: All tests pass (connection, migration, schema verification)
  ```

- [ ] **(critical)** All tables from D1 + D5 are created
  ```bash
  cd onyx && bun test api/src/db/
  # Expected: Migration/schema tests verify required tables and schema
  ```

- [ ] `memory_file` has fields: agent_id, path, checksum, indexed_at, source (per D1 schema)
- [ ] `memory_chunk` has fields: file, agent_id, content, start_line, end_line, embedding, source (per D1 schema)
- [ ] `memory_chunk` has MTREE index on embedding (dimension 1024)
- [ ] `memory_chunk` has full-text search index on content (per D1 FTS requirements)
- [ ] `memory_meta` has fields: agent_id, provider, model, chunk_size, chunk_overlap
- [ ] `session` has fields per D5 schema (id, agent_id, title, created_at, updated_at, message_count, token_count, last_message_preview, minio_path, status)
- [ ] Session table has indexes: idx_session_agent, idx_session_updated

- [ ] **(critical)** Migrations are idempotent (safe to re-run)
  ```bash
  cd onyx && bun test api/src/db/
  # Expected: Idempotent migration test passes (re-run safe)
  ```

- [ ] Connection uses namespace `onyx` (separate from menos namespace)

### 4b. MinIO Client & Bucket Setup

**Source tasks:** T5
**PRD decisions:** D1 (memory storage), D5 (session storage)

**Expected evidence files:**
- `api/src/storage/minio.ts`

- [ ] **(critical)** Client creates buckets on startup if they don't exist
  ```bash
  cd onyx && bun test api/src/storage/
  # Expected: All tests pass
  ```

- [ ] **(critical)** `onyx-memory` bucket has versioning enabled (per D1)
  ```bash
  cd onyx && bun test api/src/storage/
  # Expected: Bucket setup/versioning assertions pass
  ```

- [ ] **(evidence)** `onyx-sessions` bucket exists
- [ ] CRUD operations work for memory files (put, get, list, delete)
- [ ] CRUD operations work for session JSONL files

---

## 5. Authentication & Security

### 5a. Auth System

**Source tasks:** T6
**PRD decisions:** D6 (API auth)

**Expected evidence files:**
- `api/src/auth/password.ts`
- `api/src/auth/session.ts`
- `api/src/auth/middleware.ts`

- [ ] **(critical)** Password hashing with argon2id works
  ```bash
  cd onyx && bun test api/src/auth/
  # Expected: Hash + verify tests pass
  ```

- [ ] **(critical)** Auth middleware accepts valid session cookie
- [ ] **(critical)** Auth middleware accepts valid bearer token
- [ ] **(negative)** Invalid credentials return 401
  ```bash
  cd onyx && bun test api/src/auth/
  # Expected: Negative auth tests return 401 for invalid credentials/token
  ```

- [ ] Session cookie is HttpOnly and Secure
- [ ] **(evidence)** Login endpoint exists: `POST /v1/auth/login`

### 5b. Secret Broker & Credential Isolation

**Source tasks:** T6b
**PRD decisions:** D4 (provider credentials), D7 (config storage), D8 (credential isolation)

**Expected evidence files:**
- `api/src/secrets/broker.ts`
- `api/src/secrets/ref.ts`
- `api/src/secrets/resolve.ts`
- `api/src/security/redact.ts`
- `api/src/security/audit.ts`

- [ ] **(critical)** `onyx.json` persists only secret references, never raw provider credentials
  ```bash
  cd onyx && bun test api/src/secrets/ref.test.ts
  # Expected: Validation rejects plaintext secret fields and accepts reference-only config
  ```

- [ ] **(critical)** Provider backends execute with broker-resolved secrets; model prompts/tool payloads/stream deltas never contain raw credentials
  ```bash
  cd onyx && bun test api/src/secrets/isolation.test.ts
  # Expected: Requests succeed; prompts/tool payloads/log events/streamed deltas contain no secret values
  ```

- [ ] **(critical)** Redaction middleware scrubs known key/token patterns from logs/tool results/transcripts before persistence
  ```bash
  cd onyx && bun test api/src/security/redact.test.ts
  # Expected: Secret canary strings are redacted in all output channels
  ```

- [ ] **(critical)** Startup fails fast when required secret references cannot be resolved
  ```bash
  cd onyx && bun test api/src/secrets/startup.test.ts
  # Expected: Deterministic startup error with unresolved ref diagnostics
  ```

- [ ] Secret access emits auditable events with allow/deny outcomes
  ```bash
  cd onyx && bun test api/src/security/audit.test.ts
  # Expected: Audit stream contains timestamped secret-access records without raw secret content
  ```

- [ ] **(evidence)** SecretRef schema includes: provider, key, version, scope fields
- [ ] Secret broker supports env/file/manager adapter backends
- [ ] Gateway password is never used as a config-encryption key
- [ ] Password reset/login flows do not expose provider credentials

---

## 6. Provider Abstraction

**Source tasks:** T7
**PRD decisions:** D4 (LLM provider strategy)

**Expected evidence files:**
- `api/src/providers/interface.ts`
- `api/src/providers/vercel-ai.ts`
- `api/src/providers/claude-agent.ts`
- `api/src/providers/codex.ts`
- `api/src/providers/copilot.ts`
- `api/src/providers/router.ts`
- `api/src/providers/failover.ts`

### Unified Interface

- [ ] **(evidence)** `ProviderBackend` interface defined with: complete, stream, listModels
- [ ] Interface supports per-task model selection (different models for different roles)

### Backends

- [ ] **(critical)** Vercel AI SDK provider completes a chat request (mock or real Ollama)
  ```bash
  cd onyx && bun test api/src/providers/
  # Expected: All tests pass, including streaming
  ```

- [ ] Claude subscription backend (`@anthropic-ai/claude-agent-sdk`) implemented
- [ ] Codex subscription backend (`@openai/codex-sdk`) implemented
- [ ] Copilot subscription backend (`@github/copilot-sdk`) implemented

- [ ] Claude/Codex/Copilot subscription backends can authenticate and complete requests
  ```bash
  cd onyx && bun test api/src/providers/subscription/
  # Expected: Per-backend integration tests pass for auth bootstrap + completion + streaming
  ```

### Routing

- [ ] **(critical)** Router dispatches to correct backend based on model prefix
  ```bash
  cd onyx && bun test api/src/providers/
  # Expected: Router prefix-dispatch tests pass for all supported prefixes
  ```

### Failover

- [ ] **(critical)** Failover retries N times then falls back to configured fallback model
  ```bash
  cd onyx && bun test api/src/providers/
  # Expected: Retry/backoff/fallback behavior tests pass
  ```

- [ ] Backoff timing matches config (e.g., [1000, 3000] ms)
- [ ] `fallbackModel: null` returns error to user instead of falling back

### Docker Auth State (D4)

- [ ] Subscription backends persist OAuth/session artifacts on host-mounted volumes
- [ ] Container rebuild/restart does not invalidate authenticated providers when host mounts are unchanged
- [ ] Missing/expired auth state sets provider status to `unauthenticated`

---

## 7. Sessions

**Source tasks:** T8
**PRD decisions:** D5 (session persistence)

**Expected evidence files:**
- `api/src/sessions/manager.ts`

### Session Lifecycle

- [ ] **(critical)** Create session writes metadata to SurrealDB and creates JSONL file in MinIO
  ```bash
  cd onyx && bun test api/src/sessions/
  # Expected: All tests pass
  ```

- [ ] JSONL stored at `onyx-sessions/{agent_id}/{session_id}.jsonl`
- [ ] JSONL message format matches D5 spec (ts, role, content, tool_calls fields)

### Operations

- [ ] **(critical)** Append message adds to JSONL and updates SurrealDB metadata (message_count, updated_at)
  ```bash
  cd onyx && bun test api/src/sessions/
  # Expected: Append/update metadata consistency tests pass
  ```

- [ ] List sessions returns sorted by updated_at descending
  ```bash
  cd onyx && bun test api/src/sessions/
  # Expected: Sorting-by-updated_at tests pass
  ```

- [ ] Search sessions works
  ```bash
  cd onyx && bun test api/src/sessions/
  # Expected: Session search behavior tests pass
  ```
- [ ] Session status supports "active" and "archived"
  ```bash
  cd onyx && bun test api/src/sessions/
  # Expected: Active/archive status transition tests pass
  ```

---

## 8. Memory System

**Source tasks:** T9
**PRD decisions:** D1 (memory architecture)

**Expected evidence files:**
- `api/src/memory/files.ts`
- `api/src/memory/indexer.ts`
- `api/src/memory/search.ts`
- `api/src/memory/sync.ts`
- `api/src/memory/embeddings.ts`

### File Sync

- [ ] **(critical)** File sync detects changed files and re-indexes
  ```bash
  cd onyx && bun test api/src/memory/
  # Expected: Sync tests pass (create file -> index, modify file -> re-index, delete file -> remove chunks)
  ```

- [ ] Checksum-based change detection works
- [ ] Stale chunks are deleted automatically on re-index
- [ ] Storage layout matches D1: `{agent_id}/MEMORY.md`, `{agent_id}/memory/YYYY-MM-DD.md`

### Chunking

- [ ] Files chunked at ~400 tokens with 80 token overlap (per D1)

### Embeddings

- [ ] **(critical)** Embedding fallback works: Ollama -> API -> FTS-only
  ```bash
  cd onyx && bun test api/src/memory/
  # Expected: Embedding fallback tests pass (including FTS-only path)
  ```

- [ ] Uses `nomic-embed-text` model from Ollama (1024 dimensions)
- [ ] `memory_meta` tracks embedding fingerprint (provider, model, chunk_size, chunk_overlap)
- [ ] Fingerprint change triggers full re-embed + reindex

### Hybrid Search

- [ ] **(critical)** Hybrid search returns results from both vector and BM25
  ```bash
  cd onyx && bun test api/src/memory/
  # Expected: Hybrid vector+BM25 search tests pass
  ```

- [ ] Weighted RRF merge in TypeScript (70% vector, 30% BM25 per D1 example)
- [ ] FTS index validated at startup; fail fast if missing (per D1 FTS requirements)

### Memory Loading

- [ ] **(critical)** MEMORY.md is always loaded fully (not just searched)
  ```bash
  cd onyx && bun test api/src/memory/
  # Expected: MEMORY.md full-load inclusion tests pass
  ```

- [ ] MinIO bucket versioning enables MEMORY.md version history

---

## 9. Agent System

**Source tasks:** T10
**PRD decisions:** D9 (agent format), D11 (agent routing)

**Expected evidence files:**
- `api/src/agents/loader.ts`
- `api/src/agents/workspace.ts`
- `api/src/agents/router.ts`

### Agent Loading

- [ ] **(critical)** Loads agent list from onyx.json and reads workspace markdown files
  ```bash
  cd onyx && bun test api/src/agents/
  # Expected: All tests pass
  ```

- [ ] Reads workspace files: SOUL.md, USER.md, IDENTITY.md, AGENTS.md, TOOLS.md, HEARTBEAT.md, MEMORY.md
- [ ] **(evidence)** Workspace path: `~/.config/onyx/workspace/`

### Routing

- [ ] **(critical)** Routing resolves correct agent from channel + metadata (first-match-wins)
  ```bash
  cd onyx && bun test api/src/agents/
  # Expected: Routing tests pass (including first-match-wins)
  ```

- [ ] Default agent used when no binding matches
  ```bash
  cd onyx && bun test api/src/agents/
  # Expected: Default-agent fallback tests pass
  ```
- [ ] **(evidence)** Error returned when no binding matches and no default agent exists
  ```bash
  cd onyx && bun test api/src/agents/
  # Expected: No-match/no-default error case is covered in tests
  ```

### Graceful Degradation

- [ ] Missing workspace files handled gracefully (empty defaults)
  ```bash
  cd onyx && bun test api/src/agents/
  # Expected: Missing workspace file fallback tests pass
  ```

---

## 10. Tool System

### 10a. Framework

**Source tasks:** T11
**PRD decisions:** D8 (tool system), D11 (tool execution)

**Expected evidence files:**
- `api/src/tools/registry.ts`
- `api/src/tools/executor.ts`
- `api/src/tools/types.ts`
- `api/src/tools/loop-detect.ts`
- `api/src/tools/sanitize.ts`

- [ ] **(critical)** Registry registers and looks up tools by name
  ```bash
  cd onyx && bun test api/src/tools/
  # Expected: All tests pass
  ```

- [ ] Tool definitions follow OpenAI function calling format (name, description, parameters)
  ```bash
  cd onyx && bun test api/src/tools/
  # Expected: Tool-definition contract tests pass
  ```
- [ ] Tools execute sequentially (not parallel in MVP per D11)
  ```bash
  cd onyx && bun test api/src/tools/
  # Expected: Sequential execution ordering tests pass
  ```

- [ ] **(critical)** Executor handles tool timeout (returns timeout error as tool result, not thrown)
  ```bash
  cd onyx && bun test api/src/tools/
  # Expected: Timeout returns ToolResult error without uncaught exception
  ```

- [ ] Tool failure captured as error in tool result (LLM sees error and reasons about it per D11)
  ```bash
  cd onyx && bun test api/src/tools/
  # Expected: Tool failure propagation/continuation tests pass
  ```

- [ ] **(critical)** Loop detection catches same tool+args called consecutively
  ```bash
  cd onyx && bun test api/src/tools/
  # Expected: Loop-detection guard tests pass
  ```

- [ ] **(critical)** Tool results sanitized/redacted before reaching logs, transcripts, or stream output
  ```bash
  cd onyx && bun test api/src/tools/
  # Expected: Tool-result sanitization/redaction tests pass
  ```

### 10b. Memory Tools

**Source tasks:** T12
**PRD decisions:** D8 (memory tool group)

**Expected evidence files:**
- `api/src/tools/memory/`

- [ ] **(critical)** `memory_search` tool returns hybrid search results
  ```bash
  cd onyx && bun test api/src/tools/memory/
  # Expected: Tests pass, results match expected format
  ```

- [ ] `memory_write` tool writes to MinIO and triggers re-index
  ```bash
  cd onyx && bun test api/src/tools/memory/
  # Expected: memory_write persistence and reindex tests pass
  ```
- [ ] `memory_read` tool returns file content from MinIO
  ```bash
  cd onyx && bun test api/src/tools/memory/
  # Expected: memory_read content retrieval tests pass
  ```

### 10c. Web Tools

**Source tasks:** T13
**PRD decisions:** D8 (web tool group)

**Expected evidence files:**
- `api/src/tools/web/`

- [ ] `web_search` calls SearXNG and returns parsed results
  ```bash
  cd onyx && bun test api/src/tools/web/
  # Expected: Tests pass with mock SearXNG responses
  ```

- [ ] `web_fetch` fetches URL and converts HTML to text
  ```bash
  cd onyx && bun test api/src/tools/web/
  # Expected: web_fetch HTML-to-text behavior tests pass
  ```

### 10d. FS + Runtime Tools

**Source tasks:** T14
**PRD decisions:** D8 (fs and runtime tool groups)

**Expected evidence files:**
- `api/src/tools/fs/`
- `api/src/tools/runtime/`

- [ ] FS tools read/write/edit files correctly
  ```bash
  cd onyx && bun test api/src/tools/fs/
  # Expected: All tests pass
  ```

- [ ] `runtime_exec` executes command and returns stdout/stderr
  ```bash
  cd onyx && bun test api/src/tools/runtime/
  # Expected: runtime_exec stdout/stderr capture tests pass
  ```

- [ ] **(critical)** `runtime_exec` respects timeout
  ```bash
  cd onyx && bun test api/src/tools/runtime/
  # Expected: runtime_exec timeout tests pass
  ```

- [ ] `runtime_exec` is accepted only for single-user, self-hosted operation (per D8 risk acceptance)
  ```bash
  cd onyx && bun test api/src/tools/runtime/
  # Expected: runtime_exec policy/guardrail tests pass for self-hosted scope
  ```

### 10e. Session + Schedule Tools

**Source tasks:** T15
**PRD decisions:** D8 (session and schedule tool groups)

**Expected evidence files:**
- `api/src/tools/sessions/`
- `api/src/tools/schedule/`

- [ ] Session tools interact with session manager correctly
  ```bash
  cd onyx && bun test api/src/tools/sessions/
  # Expected: All tests pass
  ```

- [ ] `sessions_list`, `sessions_history`, `sessions_send` all functional
  ```bash
  cd onyx && bun test api/src/tools/sessions/
  # Expected: sessions_* tool behavior tests pass
  ```
- [ ] Schedule tool creates cron jobs that persist
  ```bash
  cd onyx && bun test api/src/tools/schedule/
  # Expected: schedule create/list persistence tests pass
  ```

- [ ] Cancel job removes scheduled task
  ```bash
  cd onyx && bun test api/src/tools/schedule/
  # Expected: schedule cancel/removal tests pass
  ```

---

## 11. Agent Runtime (ReAct Loop)

**Source tasks:** T16
**PRD decisions:** D11 (agent runtime)

**Expected evidence files:**
- `api/src/agents/runtime.ts`
- `api/src/agents/runtime.test.ts`

### Core Loop

- [ ] **(critical)** Simple message (no tools) streams response to completion
  ```bash
  cd onyx && bun test api/src/agents/runtime.test.ts
  # Expected: All tests pass
  ```

- [ ] **(critical)** Tool call loop: LLM requests tool -> execute -> append result -> re-call -> final response
  ```bash
  cd onyx && bun test api/src/agents/runtime.test.ts
  # Expected: ReAct tool-call loop tests pass
  ```

### Safety Limits

- [ ] **(critical)** Max turns enforcement stops runaway loops
  ```bash
  cd onyx && bun test api/src/agents/runtime.test.ts
  # Expected: Max-turns guard tests pass
  ```

- [ ] Turn timeout (turnTimeoutMs) enforced per LLM call
- [ ] Tool timeout (toolTimeoutMs) enforced per tool execution
- [ ] Total timeout (totalTimeoutMs) enforced for entire agent turn

### Abort/Cancel

- [ ] **(critical)** Abort cancels in-flight streaming
  ```bash
  cd onyx && bun test api/src/agents/runtime.test.ts
  # Expected: Abort/partial-save behavior tests pass
  ```

- [ ] In-progress tool execution completes even after abort (tools may have side effects per D11)
- [ ] Partial response saved to session

### Integration

- [ ] Provider failover integration works during ReAct loop
- [ ] Memory write-back at turn end (daily log append)

---

## 12. Context Assembly

**Source tasks:** T17
**PRD decisions:** D11 (context assembly, token budgets)

**Expected evidence files:**
- `api/src/agents/context.ts`
- `api/src/agents/context.test.ts`

### System Prompt Assembly

- [ ] **(critical)** System prompt assembled from all 10 sections in correct order:
  1. Identity + Safety
  2. Tool Call Style
  3. Skills Summary
  4. Messaging Rules
  5. Silent Reply Protocol
  6. Heartbeat Instructions
  7. Bootstrap Files (SOUL.md, USER.md, AGENTS.md)
  8. Tools
  9. Memory
  10. Session Metadata
  ```bash
  cd onyx && bun test api/src/agents/context.test.ts
  # Expected: All tests pass, sections in correct order
  ```

- [ ] Static sections ordered before dynamic sections for prompt caching optimization

### Token Budgets

- [ ] **(critical)** Token budget enforcement trims history when exceeded
  ```bash
  cd onyx && bun test api/src/agents/context.test.ts
  # Expected: Token budget trimming tests pass
  ```

- [ ] Budget split: ~30% system prompt, ~15% memory, ~45% history, ~10% response headroom
- [ ] Response headroom minimum is 4096 tokens (non-negotiable floor per D11)
- [ ] Tool call + result pairs are atomic (never split during trimming)
- [ ] Core workspace files (SOUL, AGENTS, USER) are never truncated
- [ ] Skills truncated LRU-first when system prompt budget exceeded

### Memory in Context

- [ ] **(critical)** MEMORY.md content always included regardless of budget pressure
  ```bash
  cd onyx && bun test api/src/agents/context.test.ts
  # Expected: MEMORY.md inclusion-under-pressure tests pass
  ```

- [ ] Hybrid search results included in memory segment
- [ ] Today's daily log included in memory segment

---

## 13. HTTP Gateway

**Source tasks:** T18
**PRD decisions:** D6 (API design)

**Expected evidence files:**
- `api/src/gateway/http.ts`

### OpenAI-Compatible Endpoints

- [ ] **(critical)** `POST /v1/chat/completions` returns OpenAI-compatible response
  ```bash
  cd onyx && bun test api/src/gateway/http.test.ts
  # Expected: Chat completions contract test passes with assistant role in response
  ```

- [ ] **(evidence)** Response includes: id, object, created, model, choices, usage fields
- [ ] `choices[].finish_reason` is "stop" for normal completion

- [ ] **(critical)** SSE streaming works with `"stream": true`
  ```bash
  cd onyx && bun test api/src/gateway/http.test.ts
  # Expected: Streaming/SSE contract tests pass
  ```

- [ ] `GET /v1/models` returns list of available models
- [ ] `GET /health` returns health status (no auth required)

### Onyx-Specific Endpoints

- [ ] `GET /v1/sessions` lists sessions
- [ ] `GET /v1/sessions/{id}` returns session details
- [ ] `DELETE /v1/sessions/{id}` deletes session
- [ ] `GET /v1/memory/search` searches memory
- [ ] `POST /v1/memory` writes to memory
- [ ] `GET /v1/agents` lists agents
- [ ] `GET /v1/agents/{id}` returns agent config

### Auth & Headers

- [ ] **(critical)** Auth required on all endpoints except /health
  ```bash
  cd onyx && bun test api/src/gateway/http.test.ts
  # Expected: Unauthenticated access to protected endpoints returns 401
  ```

- [ ] `x-onyx-agent-id` header accepted for agent selection
- [ ] `x-onyx-session-id` header accepted for session selection
- [ ] `x-onyx-include-memory` header accepted
- [ ] `x-onyx-session-id` returned in response headers

- [ ] **(critical)(negative)** `x-onyx-*` fields in request body return 400
  ```bash
  cd onyx && bun test api/src/gateway/http.test.ts
  # Expected: Body-carried x-onyx-* fields are rejected with 400
  ```

---

## 14. WebSocket Gateway

**Source tasks:** T19
**PRD decisions:** D7 (WebSocket protocol)

**Expected evidence files:**
- `api/src/gateway/websocket.ts`
- `api/src/gateway/websocket.test.ts`

- [ ] **(critical)** WebSocket connection established with valid auth (cookie or token)
  ```bash
  cd onyx && bun test api/src/gateway/websocket.test.ts
  # Expected: Connection accepted
  ```

- [ ] **(critical)** `chat.send` triggers agent runtime and streams deltas back
  ```bash
  cd onyx && bun test api/src/gateway/websocket.test.ts
  # Expected: chat.send delta stream tests pass
  ```

- [ ] `chat.tool_call` messages sent when agent invokes tools
- [ ] `chat.abort` stops in-flight generation
  ```bash
  cd onyx && bun test api/src/gateway/websocket.test.ts
  # Expected: WebSocket abort path tests pass
  ```

- [ ] **(negative)** Unauthenticated WebSocket connection rejected

---

## 15. Heartbeat Engine

**Source tasks:** T20
**PRD decisions:** D12 (heartbeat system)

**Expected evidence files:**
- `api/src/heartbeat/engine.ts`

### Scheduling

- [ ] **(critical)** Heartbeat tick fires on schedule and invokes agent runtime
  ```bash
  cd onyx && bun test api/src/heartbeat/
  # Expected: All tests pass
  ```

- [ ] Cron-based scheduling with configurable interval
- [ ] Active hours enforcement (per D12 config: start/end times, timezone)

### Transcript Management

- [ ] **(critical)** No-op heartbeats (HEARTBEAT_OK) logged to audit log, NOT to conversation transcript
  ```bash
  cd onyx && bun test api/src/heartbeat/
  # Expected: HEARTBEAT_OK audit-only behavior tests pass
  ```

- [ ] Action-producing heartbeats go into conversation transcript normally

### Session Modes

- [ ] Cron session modes work: isolated creates fresh session, main uses existing
  ```bash
  cd onyx && bun test api/src/heartbeat/
  # Expected: Isolated/main session-mode tests pass
  ```

- [ ] Auto-selection logic: context-referencing tasks use main, self-contained use isolated

### Heartbeat Context Assembly

- [ ] Heartbeat uses SOUL + IDENTITY + USER + HEARTBEAT.md (not full tool set per D12)
- [ ] Heartbeat has access to `schedule` tool only (not fs/runtime/web per D12)

---

## 16. Notification System

**Source tasks:** T21
**PRD decisions:** D12 (notification delivery)

**Expected evidence files:**
- `api/src/heartbeat/notify.ts`
- `api/src/heartbeat/notify.test.ts`

- [ ] **(critical)** Notifications stored and retrievable via API
  ```bash
  cd onyx && bun test api/src/heartbeat/notify.test.ts
  # Expected: Tests pass
  ```

- [ ] SSE endpoint pushes new notifications to connected clients
  ```bash
  cd onyx && bun test api/src/heartbeat/notify.test.ts
  # Expected: Notification SSE delivery tests pass
  ```

- [ ] Priority levels (high, normal, low) present in notification payload
- [ ] Web UI notification center is the only notification sink in MVP (no Discord/Telegram)

---

## 17. Frontend

### 17a. Scaffold

**Source tasks:** T22
**PRD decisions:** D7 (web interface)

**Expected evidence files:**
- `frontend/` (SvelteKit project)

- [ ] **(critical)** Frontend dev server starts
  ```bash
  cd onyx/frontend && bun run test
  # Expected: Frontend app bootstrap/smoke tests pass
  ```

- [ ] SvelteKit + shadcn-svelte + Tailwind CSS installed
  ```bash
  cd onyx/frontend && bun run test
  # Expected: Dependency/preset checks for SvelteKit + shadcn-svelte + Tailwind pass
  ```

- [ ] **(critical)** Dark mode is default theme
  ```bash
  cd onyx/frontend && bun run test
  # Expected: Theme-default tests pass (dark mode active by default)
  ```

- [ ] Sidebar navigation with sections: Chat, Sessions, Memory, Agents, Config, Logs

- [ ] API client module can make authenticated requests
  ```bash
  cd onyx/frontend && bun run test
  # Expected: API client tests pass
  ```

- [ ] WebSocket client module for real-time streaming

### 17b. Login Page

**Source tasks:** T23
**PRD decisions:** D6 (auth), D7 (web UI)

- [ ] **(critical)** Login form submits credentials and receives session cookie
  ```bash
  cd onyx/frontend && bun run test
  # Expected: Login flow tests pass
  ```

- [ ] **(critical)** Unauthenticated access redirects to /login
- [ ] Successful login redirects to /chat

### 17c. Chat Interface

**Source tasks:** T24
**PRD decisions:** D7 (chat page), D8 (tool rendering)

- [ ] **(critical)** Messages sent and responses streamed back in real-time
- [ ] Tool call cards render with expandable input/output
- [ ] Markdown with code blocks and syntax highlighting renders correctly (marked + highlight.js)
- [ ] Code blocks have copy button
- [ ] Abort button stops generation
- [ ] Agent selector dropdown
- [ ] Session picker (new/continue)

### 17d. Sessions Page

**Source tasks:** T25

- [ ] Sessions listed with metadata (title, agent, message count, updated_at)
  ```bash
  cd onyx/frontend && bun run test
  # Expected: Session list renders
  ```

- [ ] Clicking session shows full transcript
- [ ] Filter by agent, date, status
- [ ] Delete/archive sessions

### 17e. Memory Browser

**Source tasks:** T26

- [ ] Search returns results from memory with relevance scores
- [ ] Memory files browsable and editable
  ```bash
  cd onyx/frontend && bun run test
  # Expected: Memory browse/edit persistence tests pass
  ```

- [ ] Sync status indicator visible

### 17f. Agent Config + Provider Settings

**Source tasks:** T27
**PRD decisions:** D7 (provider config page), D9 (agent config)

- [ ] Agent list shows all configured agents with edit capability
- [ ] Provider config shows connection status for each provider

- [ ] **(critical)** Provider credentials are never returned raw; UI handles references and redacted previews only
  ```bash
  cd onyx/frontend && bun run test
  # Expected: Provider credential redaction/reference handling tests pass
  ```

- [ ] Ollama endpoint configuration
- [ ] Connection testing (test provider reachability)

### 17g. Logs + System Status

**Source tasks:** T28

- [ ] Logs page shows live-updating log entries with level badges
- [ ] Filter by level (DEBUG, INFO, WARN, ERROR)
- [ ] System status shows service health (SurrealDB, MinIO, Ollama status indicators)
- [ ] Notification center shows heartbeat notifications with priority badges

---

## 18. Onboarding Wizard

**Source tasks:** T29
**PRD decisions:** D9 (agent format, workspace files)

**Expected evidence files:**
- `frontend/src/routes/onboarding/`

- [ ] **(critical)** Onboarding detects first launch (no workspace files) and redirects
  ```bash
  cd onyx/frontend && bun run test
  # Expected: First-launch redirect tests pass
  ```

- [ ] All 5 phases render with multiple-choice options
  ```bash
  cd onyx/frontend && bun run test
  # Expected: Onboarding phase rendering/selection tests pass
  ```

- [ ] Phases 1-2 required (~5 min), Phases 3-4 optional
- [ ] Multiple-choice with "other" escape hatch

- [ ] **(critical)** Generated files match selections
  ```bash
  cd onyx/frontend && bun run test
  # Expected: Onboarding output-generation tests pass
  ```

- [ ] Generated workspace files: SOUL.md, USER.md, IDENTITY.md, AGENTS.md

---

## 19. Docker Compose Deployment

**Source tasks:** T30
**PRD decisions:** D10 (deployment topology)

**Expected evidence files:**
- `onyx/docker-compose.yml`
- `onyx/Dockerfile` (multi-stage for API)
- `onyx/frontend/Dockerfile` (SvelteKit build)

### Build

- [ ] **(critical)** `docker compose build` succeeds for all services
  ```bash
  cd onyx && docker compose build
  # Expected: All images built successfully
  ```

### Services

- [ ] **(critical)** `docker compose up` starts all services and they become healthy
  ```bash
  cd onyx && docker compose up -d && docker compose ps
  # Expected: All services running/healthy
  ```

- [ ] **(evidence)** Health checks defined for all services

### Networking & Ports

- [ ] **(critical)** API accessible at port 18790
  ```bash
  cd onyx && bun test tests/integration/
  # Expected: API health/access integration tests pass
  ```

- [ ] **(critical)** Frontend accessible at port 18791
  ```bash
  cd onyx && bun run test:e2e
  # Expected: Frontend accessibility/smoke tests pass
  ```

- [ ] Shared services (SurrealDB, MinIO, Ollama) accessible via menos-network
  ```bash
  cd onyx && bun test tests/integration/
  # Expected: Network/dependency integration tests pass
  ```

- [ ] External network join to `menos-network` configured

### SearXNG

- [ ] **(evidence)** SearXNG service defined and configured

### Deployment Isolation

- [ ] **(critical)** Deployment artifacts are Onyx-owned and pattern-aligned with menos
  ```bash
  cd onyx && bun test tests/integration/
  # Expected: Deployment isolation checks pass for Onyx-owned lifecycle
  ```

- [ ] `.env.example` has all required variables with schema mirrored from menos `.env` keys (no secret values)

---

## 20. E2E Integration

**Source tasks:** T31

**Expected evidence files:**
- `onyx/tests/e2e/` (Playwright tests)
- `onyx/tests/integration/`

### E2E Tests

- [ ] **(critical)** Login -> Chat -> Message -> Streaming response works
  ```bash
  cd onyx && bun run test:e2e
  # Expected: All E2E tests pass
  ```

- [ ] Memory search via UI tested
- [ ] Session management (create, list, view, delete) tested
- [ ] Provider config page loads

### API Integration Tests

- [ ] **(critical)** Chat completions with tool calls executes full ReAct loop
  ```bash
  cd onyx && bun test tests/integration/
  # Expected: Integration tests pass
  ```

### Full Suite

- [ ] **(critical)** All `bun test` suites pass across entire project
  ```bash
  cd onyx && bun test
  # Expected: 0 failures
  ```

---

## 21. Cross-Cutting Concerns

These checks span multiple components and validate system-wide properties.

### Security Boundary (12-Factor + OWASP)

- [ ] **(critical)** No secrets in code or config files (12-factor)
  ```bash
  cd onyx && bun test api/src/security/
  # Expected: Secret-scanning/redaction boundary tests pass with no leakage
  ```

- [ ] **(critical)** Secret broker boundary enforced throughout: provider execution path resolves secrets; model/tool transcript path cannot read raw secrets
- [ ] **(critical)** Redaction gate on all output channels: logs, transcripts, tool results, stream deltas, HTTP error payloads

### Phase 1 Security Gate

- [ ] **(critical)** Mandatory non-exfiltration security gate test passes
  ```bash
  cd onyx && bun test api/src/security/ && bun test api/src/secrets/
  # Expected: Non-exfiltration gate tests pass across all output channels
  ```

### Plugin Protocol

- [ ] **(evidence)** PluginProtocol interface exists (D3)
  ```bash
  cd onyx && bun test api/src/plugins/
  # Expected: Plugin protocol contract tests pass
  ```

- [ ] Test stub plugin registered in MVP config

### menos Integration

- [ ] Internal server-side menos retrieval works (D2)
- [ ] No user-visible `menos_*` tools exposed in MVP
- [ ] Retrieved menos data treated as context input, not conversation storage

### Per-Task Model Selection

- [ ] Config supports per-task model assignment (defaultModel, heartbeatModel, cronModel, subagentModel per D4)
- [ ] Heartbeat uses heartbeatModel, not defaultModel

---

## Summary Metrics

Fill in after completing validation:

| Metric | Count |
|--------|-------|
| **Total checks** | 258 |
| **Critical checks** | 71 |
| **Negative test checks** | 4 |
| **Passed** | ___ |
| **Failed** | ___ |
| **Skipped** | ___ |

### Checks by Area

| Area | Total | Critical | Status |
|------|-------|----------|--------|
| 0. Prerequisites | 9 | 0 | ___ |
| 1. Project Structure & Build | 19 | 4 | ___ |
| 2. Shared Types & Schemas | 4 | 1 | ___ |
| 3. Configuration System | 9 | 1 | ___ |
| 4a. SurrealDB | 11 | 3 | ___ |
| 4b. MinIO | 5 | 2 | ___ |
| 5a. Auth System | 6 | 3 | ___ |
| 5b. Secret Broker | 9 | 4 | ___ |
| 6. Provider Abstraction | 14 | 3 | ___ |
| 7. Sessions | 7 | 2 | ___ |
| 8. Memory System | 14 | 4 | ___ |
| 9. Agent System | 7 | 2 | ___ |
| 10. Tool System | 20 | 6 | ___ |
| 11. Agent Runtime | 11 | 4 | ___ |
| 12. Context Assembly | 11 | 3 | ___ |
| 13. HTTP Gateway | 19 | 4 | ___ |
| 14. WebSocket Gateway | 5 | 2 | ___ |
| 15. Heartbeat Engine | 9 | 2 | ___ |
| 16. Notification System | 4 | 1 | ___ |
| 17. Frontend | 32 | 6 | ___ |
| 18. Onboarding Wizard | 6 | 2 | ___ |
| 19. Docker Compose | 10 | 5 | ___ |
| 20. E2E Integration | 6 | 3 | ___ |
| 21. Cross-Cutting Concerns | 11 | 4 | ___ |

### Critical Areas to Focus On

1. **Security boundary (Sections 5b, 21)** -- Secret broker, redaction, and non-exfiltration gate are mandatory for MVP ship
2. **Agent runtime (Section 11)** -- ReAct loop is the core execution engine; all other features depend on it
3. **Provider abstraction (Section 6)** -- Without working providers, nothing else matters
4. **HTTP gateway (Section 13)** -- Primary API surface; OpenAI compatibility is a hard requirement
5. **Docker deployment (Section 19)** -- Must work for the system to be usable at all

### PRD Decision Coverage

| Decision | Primary Sections | Verified |
|----------|-----------------|----------|
| D1: Memory | 4a, 4b, 8 | ___ |
| D2: menos integration | 21 | ___ |
| D3: Bot plugins | 21 | ___ |
| D4: LLM providers | 6, 21 | ___ |
| D5: Sessions | 4a, 7 | ___ |
| D6: API | 13, 5a | ___ |
| D7: Web UI | 14, 17 | ___ |
| D8: Tool system | 10 | ___ |
| D9: Agent format | 3, 9, 18 | ___ |
| D10: Deployment | 19 | ___ |
| D11: Runtime | 11, 12 | ___ |
| D12: Heartbeat | 15, 16 | ___ |
