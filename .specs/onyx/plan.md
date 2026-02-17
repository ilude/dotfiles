---
created: 2026-02-16
completed:
---

# Team Plan: Onyx MVP (Phase 1)

## Objective

Build the complete Onyx Phase 1 MVP — a personal AI assistant platform with TypeScript/Bun backend (Hono), SvelteKit frontend, 4-SDK provider abstraction, hybrid memory (MinIO + SurrealDB), ReAct agent runtime, heartbeat engine, and Docker Compose deployment. All 12 architectural decisions (D1-D12) from the PRD are implemented.

## Project Context

- **Language**: TypeScript (Bun runtime)
- **Frontend**: SvelteKit + shadcn-svelte + Tailwind CSS
- **Test command**: `bun test` (API), `bun run test` (frontend), `bun run test:e2e` (Playwright)
- **Lint command**: `npx @biomejs/biome check`
- **PRD**: `.specs/onyx/prd.md` (12 decided architectural decisions, D1-D12)
- **Working Context**: `.specs/onyx/CLAUDE.md`
- **Target directory**: Separate `onyx` repository, imported into this repo as a git submodule after initial bootstrap commit

## Security Implementation Baseline (OWASP + 12-Factor)

- **12-factor config boundary**: keep deploy-varying non-secret config in env vars; do not store credentials in code or committed config files.
- **Secret broker boundary**: `onyx.json` stores only secret references/metadata, never raw provider credentials.
- **Least privilege by component**: provider execution path can resolve secret references; model/tool transcript path cannot read raw secrets.
- **Injection path control**: inject secrets at runtime from broker into provider call context only; do not pass secrets through model prompts, tool inputs, or tool outputs.
- **Redaction gate**: all logs/transcripts/tool results pass through secret-redaction middleware before persistence/streaming.
- **Lifecycle controls**: secret metadata supports rotation/revocation/expiry; startup fails fast if required refs cannot be resolved.
- **Auditability**: emit tamper-resistant audit events for secret resolve attempts, denials, rotations, and failures.

References:
- 12-Factor App, Config: https://12factor.net/config
- OWASP Secrets Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
- OWASP LLM Prompt Injection Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html

## Complexity Analysis

| Task | Est. Files | Change Type | Model | Agent |
|------|-----------|-------------|-------|-------|
| T1: Monorepo scaffold | 8-10 | architecture | opus | builder-heavy |
| T2: Shared types + Zod schemas | 2-3 | feature | sonnet | builder |
| T3: Config system (onyx.json) | 3-4 | feature | sonnet | builder |
| T4: SurrealDB client + migrations | 4-5 | feature | sonnet | builder |
| T5: MinIO client + bucket setup | 3-4 | feature | sonnet | builder |
| T6: Auth system | 4-5 | feature | sonnet | builder |
| T6b: Secret broker + redaction boundary | 5-7 | security architecture | opus | builder-heavy |
| T7: Provider abstraction (Vercel AI SDK) | 5-6 | architecture | opus | builder-heavy |
| T8: Session manager | 4-5 | feature | sonnet | builder |
| T9: Memory system (files + hybrid search) | 6-8 | architecture | opus | builder-heavy |
| T10: Agent definition loader | 3-4 | feature | sonnet | builder |
| T11: Tool system framework | 5-6 | feature | sonnet | builder |
| T12: Memory tools | 3-4 | feature | sonnet | builder |
| T13: Web tools (SearXNG + fetch) | 3-4 | feature | sonnet | builder |
| T14: FS + runtime tools | 3-4 | feature | sonnet | builder |
| T15: Session + schedule tools | 3-4 | feature | sonnet | builder |
| T16: ReAct agent runtime | 6-8 | architecture | opus | builder-heavy |
| T17: Context assembly + token budgets | 4-5 | feature | sonnet | builder |
| T18: Hono HTTP gateway (OpenAI-compatible) | 5-6 | feature | sonnet | builder |
| T19: WebSocket gateway | 4-5 | feature | sonnet | builder |
| T20: Heartbeat engine | 5-6 | feature | sonnet | builder |
| T21: Notification system (web UI center) | 3-4 | feature | sonnet | builder |
| T22: Frontend scaffold (SvelteKit + shadcn) | 8-10 | architecture | opus | builder-heavy |
| T23: Login page + auth flow | 3-4 | feature | sonnet | builder |
| T24: Chat interface (streaming + tools) | 5-6 | feature | sonnet | builder |
| T25: Sessions page | 3-4 | feature | sonnet | builder |
| T26: Memory browser | 3-4 | feature | sonnet | builder |
| T27: Agent config + provider settings | 4-5 | feature | sonnet | builder |
| T28: Logs + system status | 3-4 | feature | sonnet | builder |
| T29: First-time onboarding wizard | 5-6 | feature | sonnet | builder |
| T30: Docker Compose + deployment config | 4-5 | feature | sonnet | builder |
| T31: E2E integration tests | 4-5 | feature | sonnet | builder |

## Team Members

| Name | Agent | Model | Role |
|------|-------|-------|------|
| onyx-scaffold | builder-heavy | opus | Monorepo scaffold + architectural foundations |
| onyx-types | builder | sonnet | Shared types + Zod schemas |
| onyx-infra-1 | builder | sonnet | Config + SurrealDB client |
| onyx-infra-2 | builder | sonnet | MinIO client + auth |
| onyx-security | builder-heavy | opus | Secret broker, redaction, and secret audit boundary |
| onyx-provider | builder-heavy | opus | Provider abstraction layer |
| onyx-core-1 | builder | sonnet | Sessions + agent loader |
| onyx-core-2 | builder-heavy | opus | Memory system (hybrid search) |
| onyx-tools-1 | builder | sonnet | Tool framework + memory tools |
| onyx-tools-2 | builder | sonnet | Web + FS + runtime + session + schedule tools |
| onyx-runtime | builder-heavy | opus | ReAct loop + context assembly |
| onyx-gateway | builder | sonnet | HTTP + WebSocket gateway |
| onyx-heartbeat | builder | sonnet | Heartbeat engine + notifications |
| onyx-frontend | builder-heavy | opus | SvelteKit scaffold + chat UI |
| onyx-pages | builder | sonnet | Frontend pages (sessions, memory, config, logs) |
| onyx-onboard | builder | sonnet | Onboarding wizard |
| onyx-deploy | builder | sonnet | Docker Compose + deployment |
| onyx-e2e | builder | sonnet | E2E integration tests |
| onyx-validator-1 | validator-heavy | sonnet | Wave validation (waves 1-4) |
| onyx-validator-2 | validator-heavy | sonnet | Wave validation (waves 5-8) |
| onyx-validator-3 | validator-heavy | sonnet | Wave validation (waves 9-10) |

## Execution Waves

### Wave 1: Project Foundation (parallel)

- **T1**: Monorepo scaffold [opus] — builder-heavy
  - Create `onyx/` directory with Bun workspace monorepo: root `package.json`, `tsconfig.json`, `biome.json`
  - `api/` package: `package.json`, `tsconfig.json`, `src/index.ts` (Hono hello world)
  - `frontend/` package: SvelteKit init stub (placeholder, full setup in Wave 7)
  - `shared/` package: `package.json`, `tsconfig.json`
  - Root `Dockerfile` (multi-stage for api), `docker-compose.yml` (stub services)
  - `.env.example`, `.gitignore`
  - Acceptance Criteria:
    1. [ ] `cd onyx && bun install` succeeds with zero errors
       - Verification: `cd onyx && bun install && echo "OK"`
       - Expected: Clean install, "OK" printed
    2. [ ] `cd onyx/api && bun run src/index.ts` starts Hono server on port 18790
       - Verification: Start server, `curl -s http://localhost:18790/health | jq .status`
       - Expected: `"ok"`
    3. [ ] Bun workspace resolves `@onyx/shared` from api and frontend packages
       - Verification: `cd onyx/api && bun run -e "import '@onyx/shared'; console.log('OK')"`
       - Expected: "OK" printed
    4. [ ] `biome check` passes on all files
       - Verification: `cd onyx && npx @biomejs/biome check .`
       - Expected: Exit 0, no errors

- **T2**: Shared types + Zod schemas [sonnet] — builder
  - `shared/src/types.ts`: Core types (Message, Session, Agent, Provider, Tool, MemoryFile, etc.)
  - `shared/src/schemas.ts`: Zod schemas for API request/response validation
  - `shared/src/index.ts`: Re-exports
  - Types must match PRD definitions (D5 session schema, D6 API format, D9 agent config)
  - Acceptance Criteria:
    1. [ ] All types from PRD decisions D1, D5, D6, D8, D9 are defined
       - Verification: `grep -c 'export type\|export interface' onyx/shared/src/types.ts`
       - Expected: >= 15 type/interface exports
    2. [ ] Zod schemas validate OpenAI-compatible chat completion request/response
       - Verification: `cd onyx && bun test shared/`
       - Expected: All tests pass
    3. [ ] Package exports work from api and frontend
       - Verification: `cd onyx/api && bun run -e "import { ChatCompletionRequest } from '@onyx/shared'; console.log('OK')"`
       - Expected: "OK"

### Wave 1 Validation

- **V1**: Validate Wave 1 [sonnet] — validator-heavy, blockedBy: [T1, T2]
  - Verify monorepo structure, workspace resolution, type exports, biome passes

### Wave 2: Infrastructure Clients (parallel)

- **T3**: Config system [sonnet] — builder, blockedBy: [V1]
  - `api/src/config.ts`: Load and validate `onyx.json` (Zod schema from shared)
  - Support `~/.config/onyx/onyx.json` path with XDG fallback
  - Default config with sensible defaults for all D9/D11/D12 settings
  - Environment variable overrides for Docker (ONYX_PORT, SURREAL_URL, MINIO_URL, etc.)
  - Acceptance Criteria:
    1. [ ] Config loads from `~/.config/onyx/onyx.json` with Zod validation
       - Verification: `cd onyx && bun test api/src/config.test.ts`
       - Expected: All tests pass (valid config, invalid config rejection, defaults)
    2. [ ] Environment variables override config file values
       - Verification: Test with `ONYX_PORT=9999` env var, verify port override
       - Expected: Port resolves to 9999
    3. [ ] Missing config file creates default config
       - Verification: Test with non-existent path, verify defaults are applied
       - Expected: Default config object returned

- **T4**: SurrealDB client + migrations [sonnet] — builder, blockedBy: [V1]
  - `api/src/db/client.ts`: SurrealDB connection wrapper (surrealdb.js)
  - `api/src/db/migrations/`: Migration files for all schemas from PRD (D1 memory, D5 session)
  - `api/src/db/migrate.ts`: Migration runner (run at startup)
  - Connection to namespace `onyx` (separate from menos)
  - Acceptance Criteria:
    1. [ ] Client connects to SurrealDB and runs migrations
       - Verification: `cd onyx && bun test api/src/db/`
       - Expected: All tests pass (connection, migration, schema verification)
    2. [ ] All tables from D1 + D5 are created (memory_file, memory_chunk, memory_meta, session)
       - Verification: Query `INFO FOR DB` after migration
       - Expected: All 4 tables exist with correct fields
    3. [ ] Migrations are idempotent (safe to re-run)
       - Verification: Run migrate twice, verify no errors
       - Expected: Clean exit both times

- **T5**: MinIO client + bucket setup [sonnet] — builder, blockedBy: [V1]
  - `api/src/storage/minio.ts`: MinIO client wrapper (minio-js)
  - Bucket creation: `onyx-memory`, `onyx-sessions` (with versioning on memory bucket per D1)
  - File operations: put, get, list, delete for memory files and session JSONL
  - Acceptance Criteria:
    1. [ ] Client creates buckets on startup if they don't exist
       - Verification: `cd onyx && bun test api/src/storage/`
       - Expected: All tests pass
    2. [ ] `onyx-memory` bucket has versioning enabled (per D1)
       - Verification: Check bucket versioning status after setup
       - Expected: Versioning is "Enabled"
    3. [ ] CRUD operations work for both memory and session files
       - Verification: Test put/get/list/delete operations
       - Expected: All operations succeed

- **T6**: Auth system [sonnet] — builder, blockedBy: [V1]
  - `api/src/auth/`: Password hashing (argon2id), session cookie, bearer token validation
  - `api/src/auth/password.ts`: Hash/verify with argon2
  - `api/src/auth/session.ts`: Cookie-based sessions (HttpOnly, Secure)
  - `api/src/auth/middleware.ts`: Hono middleware for cookie + bearer token auth
  - Login endpoint: `POST /v1/auth/login`
  - Acceptance Criteria:
    1. [ ] Password hashing with argon2id works
       - Verification: `cd onyx && bun test api/src/auth/`
       - Expected: Hash + verify tests pass
    2. [ ] Auth middleware accepts valid session cookie OR bearer token
       - Verification: Test both auth methods
       - Expected: Both methods authenticate successfully
    3. [ ] Invalid credentials return 401
       - Verification: Test with wrong password and invalid token
       - Expected: 401 Unauthorized

- **T6b**: Secret broker + credential isolation boundary [opus] — builder-heavy, blockedBy: [V1]
  - `api/src/secrets/broker.ts`: SecretBroker interface + provider-backed implementation (env/file/manager adapter)
  - `api/src/secrets/ref.ts`: SecretRef schema (`provider`, `key`, `version`, `scope`) and validation
  - `api/src/secrets/resolve.ts`: Server-side secret resolve path used by provider adapters only
  - `api/src/security/redact.ts`: Central redaction middleware for logs, tool results, session transcripts, and HTTP error payloads
  - `api/src/security/audit.ts`: Security audit events for secret access (allow/deny/fail/rotate)
  - `api/src/providers/*`: Replace direct key reads with SecretRef resolution
  - Acceptance Criteria:
    1. [ ] `onyx.json` persists only secret references, never raw provider credentials
       - Verification: `cd onyx && bun test api/src/secrets/ref.test.ts`
       - Expected: Validation rejects plaintext secret fields and accepts reference-only config
    2. [ ] Provider backends can execute with broker-resolved secrets while model/tool payloads never contain raw credentials
       - Verification: `cd onyx && bun test api/src/secrets/isolation.test.ts`
       - Expected: Requests succeed; tests confirm prompts/tool payloads/log events contain no secret values
    3. [ ] Redaction middleware scrubs known key/token patterns from logs/tool results/transcripts before persistence
       - Verification: `cd onyx && bun test api/src/security/redact.test.ts`
       - Expected: Secret canary strings are redacted in all output channels
    4. [ ] Startup fails fast when required secret references cannot be resolved
       - Verification: `cd onyx && bun test api/src/secrets/startup.test.ts`
       - Expected: Deterministic startup error with unresolved ref diagnostics
    5. [ ] Secret access emits auditable events with allow/deny outcomes
       - Verification: `cd onyx && bun test api/src/security/audit.test.ts`
       - Expected: Audit stream contains timestamped secret-access records without raw secret content

### Wave 2 Validation

- **V2**: Validate Wave 2 [sonnet] — validator-heavy, blockedBy: [T3, T4, T5, T6, T6b]
  - Verify all infrastructure clients connect, migrations run, auth works, and secret isolation boundary is enforced

### Wave 3: Provider + Core Modules (parallel)

- **T7**: Provider abstraction layer [opus] — builder-heavy, blockedBy: [V2]
  - `api/src/providers/`: Full 4-SDK abstraction per D4
  - `api/src/providers/interface.ts`: Unified `ProviderBackend` interface (complete, stream, listModels)
  - `api/src/providers/vercel-ai.ts`: Vercel AI SDK backend (covers API-key/credential providers)
  - `api/src/providers/claude-agent.ts`: Claude subscription backend (OAuth/device/session integration for MVP)
  - `api/src/providers/codex.ts`: OpenAI Codex subscription backend (OAuth/device/session integration for MVP)
  - `api/src/providers/copilot.ts`: GitHub Copilot subscription backend (OAuth/device/session integration for MVP)
  - `api/src/providers/router.ts`: Model prefix routing per D4 (claude-subscription/, codex/, copilot/, fallback to Vercel AI)
  - `api/src/providers/failover.ts`: Retry + fallback logic per D11
  - Acceptance Criteria:
    1. [ ] Vercel AI SDK provider completes a chat request (mock or real Ollama)
       - Verification: `cd onyx && bun test api/src/providers/`
       - Expected: All tests pass, including streaming
    2. [ ] Router dispatches to correct backend based on model prefix
       - Verification: Test routing for `claude-subscription/`, `codex/`, `copilot/`, `openrouter/`, `ollama/` prefixes
       - Expected: Each prefix resolves to correct backend
    3. [ ] Failover retries N times then falls back to configured fallback model
       - Verification: Test with mock provider that returns 529
       - Expected: Retries per config, then switches to fallback
    4. [ ] Claude/Codex/Copilot subscription backends can authenticate and complete at least one non-streaming and one streaming request each
       - Verification: `cd onyx && bun test api/src/providers/subscription/`
       - Expected: Per-backend integration tests pass for auth bootstrap + completion + streaming

- **T8**: Session manager [sonnet] — builder, blockedBy: [V2]
  - `api/src/sessions/manager.ts`: Full SessionManager per D5
  - JSONL append to MinIO (`onyx-sessions/{agent_id}/{session_id}.jsonl`)
  - SurrealDB metadata (create, update, list, search sessions)
  - Message format matching D5 JSONL spec
  - Acceptance Criteria:
    1. [ ] Create session writes metadata to SurrealDB and creates JSONL file in MinIO
       - Verification: `cd onyx && bun test api/src/sessions/`
       - Expected: All tests pass
    2. [ ] Append message adds to JSONL and updates SurrealDB metadata (message_count, updated_at)
       - Verification: Append 3 messages, verify JSONL has 3 lines and metadata matches
       - Expected: Consistent data
    3. [ ] List sessions returns sorted by updated_at
       - Verification: Create 3 sessions with different timestamps, list
       - Expected: Sorted descending by updated_at

- **T9**: Memory system [opus] — builder-heavy, blockedBy: [V2]
  - `api/src/memory/`: Full memory system per D1
  - `api/src/memory/files.ts`: MinIO file operations for memory files
  - `api/src/memory/indexer.ts`: Chunk files (~400 tokens, 80 overlap), embed via Ollama, upsert SurrealDB
  - `api/src/memory/search.ts`: Hybrid search (vector + BM25 with weighted RRF)
  - `api/src/memory/sync.ts`: Checksum-based change detection, re-chunk on change
  - `api/src/memory/embeddings.ts`: Ollama embeddings with graceful fallback (Ollama → API → FTS-only)
  - Acceptance Criteria:
    1. [ ] File sync detects changed files and re-indexes
       - Verification: `cd onyx && bun test api/src/memory/`
       - Expected: Sync tests pass (create file → index, modify file → re-index, delete file → remove chunks)
    2. [ ] Hybrid search returns results from both vector and BM25
       - Verification: Index a test document, search by semantic query and by exact keyword
       - Expected: Both search paths return relevant results
    3. [ ] Embedding fallback works: Ollama → API → FTS-only
       - Verification: Test with Ollama unavailable, verify FTS-only still works
       - Expected: Search returns BM25 results even without embeddings
    4. [ ] MEMORY.md is always loaded fully (not just searched)
       - Verification: Verify MEMORY.md content is returned in full alongside search results
       - Expected: Full MEMORY.md content available

- **T10**: Agent definition loader [sonnet] — builder, blockedBy: [V2]
  - `api/src/agents/loader.ts`: Load agent configs from onyx.json + workspace markdown files
  - `api/src/agents/workspace.ts`: Read SOUL.md, USER.md, IDENTITY.md, AGENTS.md, TOOLS.md, HEARTBEAT.md, MEMORY.md
  - `api/src/agents/router.ts`: Binding-based agent routing per D11
  - Acceptance Criteria:
    1. [ ] Loads agent list from onyx.json and reads workspace markdown files
       - Verification: `cd onyx && bun test api/src/agents/`
       - Expected: All tests pass
    2. [ ] Routing resolves correct agent from channel + metadata
       - Verification: Test with multiple bindings, verify first-match-wins
       - Expected: Correct agent ID returned for each scenario
    3. [ ] Missing workspace files handled gracefully (empty defaults)
       - Verification: Load agent with missing SOUL.md
       - Expected: No error, empty string used

### Wave 3 Validation

- **V3**: Validate Wave 3 [sonnet] — validator-heavy, blockedBy: [T7, T8, T9, T10]
  - Verify provider routing, session lifecycle, memory indexing + search, agent loading

### Wave 4: Tool System (parallel)

- **T11**: Tool system framework [sonnet] — builder, blockedBy: [V3]
  - `api/src/tools/registry.ts`: Tool registry with OpenAI function calling format
  - `api/src/tools/executor.ts`: Sequential execution, timeout, error handling per D11
  - `api/src/tools/types.ts`: ToolDefinition, ToolResult interfaces
  - `api/src/tools/loop-detect.ts`: Simple exact-duplicate detection per D11 MVP
  - `api/src/tools/sanitize.ts`: ToolResult sanitization/redaction hook before LLM/UI emission
  - Acceptance Criteria:
    1. [ ] Registry registers and looks up tools by name
       - Verification: `cd onyx && bun test api/src/tools/`
       - Expected: All tests pass
    2. [ ] Executor handles tool timeout (returns timeout error as tool result)
       - Verification: Test with slow mock tool exceeding timeout
       - Expected: Timeout error returned, not thrown
    3. [ ] Loop detection catches same tool+args called consecutively
       - Verification: Call same tool 3 times with same args
       - Expected: Third call blocked with loop detection error
    4. [ ] Tool results are sanitized before they reach transcript or stream output
       - Verification: Inject canary secret-like strings in mock tool output
       - Expected: Output is redacted in stored transcript and streamed payload

- **T12**: Memory tools [sonnet] — builder, blockedBy: [V3]
  - `api/src/tools/memory/`: `memory_search`, `memory_write`, `memory_read` tools
  - Wire to memory system from T9
  - Acceptance Criteria:
    1. [ ] `memory_search` tool returns hybrid search results
       - Verification: `cd onyx && bun test api/src/tools/memory/`
       - Expected: Tests pass, results match expected format
    2. [ ] `memory_write` tool writes to MinIO and triggers re-index
       - Verification: Write via tool, verify file in MinIO and chunks in SurrealDB
       - Expected: File persisted and indexed
    3. [ ] `memory_read` tool returns file content from MinIO
       - Verification: Read a known file via tool
       - Expected: Content matches

- **T13**: Web tools [sonnet] — builder, blockedBy: [V3]
  - `api/src/tools/web/`: `web_search` (SearXNG), `web_fetch` (HTTP GET + HTML → text)
  - SearXNG client with result parsing
  - Acceptance Criteria:
    1. [ ] `web_search` calls SearXNG and returns parsed results
       - Verification: `cd onyx && bun test api/src/tools/web/`
       - Expected: Tests pass with mock SearXNG responses
    2. [ ] `web_fetch` fetches URL and converts HTML to text
       - Verification: Fetch a test URL, verify text extraction
       - Expected: Clean text returned

- **T14**: FS + runtime tools [sonnet] — builder, blockedBy: [V3]
  - `api/src/tools/fs/`: `read`, `write`, `edit` file tools
  - `api/src/tools/runtime/`: `runtime_exec` (subprocess), `runtime_process` (process management)
  - Acceptance Criteria:
    1. [ ] FS tools read/write/edit files correctly
       - Verification: `cd onyx && bun test api/src/tools/fs/`
       - Expected: All tests pass
    2. [ ] `runtime_exec` executes command and returns stdout/stderr
       - Verification: Execute `echo "hello"` via tool
       - Expected: stdout contains "hello"
    3. [ ] `runtime_exec` respects timeout
       - Verification: Execute `sleep 10` with 1s timeout
       - Expected: Timeout error returned

- **T15**: Session + schedule tools [sonnet] — builder, blockedBy: [V3]
  - `api/src/tools/sessions/`: `sessions_list`, `sessions_history`, `sessions_send`
  - `api/src/tools/schedule/`: `schedule`, `list_jobs`, `cancel_job` (cron-based)
  - Acceptance Criteria:
    1. [ ] Session tools interact with session manager correctly
       - Verification: `cd onyx && bun test api/src/tools/sessions/`
       - Expected: All tests pass
    2. [ ] Schedule tool creates cron jobs that persist
       - Verification: Create a job, list jobs, verify it appears
       - Expected: Job listed with correct schedule
    3. [ ] Cancel job removes scheduled task
       - Verification: Create then cancel, verify removed
       - Expected: Job no longer in list

### Wave 4 Validation

- **V4**: Validate Wave 4 [sonnet] — validator-heavy, blockedBy: [T11, T12, T13, T14, T15]
  - Verify all tool groups register, execute, handle errors, and loop detection works

### Wave 5: Agent Runtime + Gateway (parallel)

- **T16**: ReAct agent runtime [opus] — builder-heavy, blockedBy: [V4]
  - `api/src/agents/runtime.ts`: Full ReAct loop per D11
  - Streaming LLM calls with tool call parsing
  - Tool execution → result append → re-call loop
  - Max turns enforcement, timeout handling
  - Provider failover integration
  - Memory write-back (daily log append at turn end)
  - Abort/cancel handling
  - Acceptance Criteria:
    1. [ ] Simple message (no tools) streams response to completion
       - Verification: `cd onyx && bun test api/src/agents/runtime.test.ts`
       - Expected: All tests pass
    2. [ ] Tool call loop: LLM requests tool → execute → append result → re-call → final response
       - Verification: Test with mock provider that returns tool_call then text
       - Expected: Full loop executes, final text response returned
    3. [ ] Max turns enforcement stops runaway loops
       - Verification: Set maxTurns=3, mock provider that always returns tool_calls
       - Expected: Stops after 3 iterations with warning
    4. [ ] Abort cancels in-flight streaming
       - Verification: Send abort during streaming, verify partial response saved
       - Expected: finish_reason is "abort"

- **T17**: Context assembly + token budgets [sonnet] — builder, blockedBy: [V4]
  - `api/src/agents/context.ts`: 10-section system prompt assembly per D11
  - Token budget enforcement (30/15/45/10 split)
  - MEMORY.md always loaded fully
  - Conversation history trimming (oldest first, tool pairs kept atomic)
  - Acceptance Criteria:
    1. [ ] System prompt assembled from all 10 sections in correct order
       - Verification: `cd onyx && bun test api/src/agents/context.test.ts`
       - Expected: All tests pass, sections in order
    2. [ ] Token budget enforcement trims history when exceeded
       - Verification: Test with large conversation history exceeding budget
       - Expected: Oldest messages trimmed, tool call pairs kept together
    3. [ ] MEMORY.md content always included regardless of budget pressure
       - Verification: Test with maxed-out system prompt budget
       - Expected: MEMORY.md still present in memory segment

- **T18**: Hono HTTP gateway [sonnet] — builder, blockedBy: [V4]
  - `api/src/gateway/http.ts`: All REST endpoints per D6
  - OpenAI-compatible `/v1/chat/completions` (non-streaming + SSE streaming)
  - `/v1/models`, `/health`, session endpoints, memory endpoints, agent endpoints
  - Auth middleware integration
  - `x-onyx-*` header handling (agent-id, session-id, include-memory)
  - `x-onyx-*` body field rejection
  - Acceptance Criteria:
    1. [ ] `POST /v1/chat/completions` returns OpenAI-compatible response
       - Verification: `curl -s -X POST http://localhost:18790/v1/chat/completions -H 'Content-Type: application/json' -d '{"model":"ollama/llama3","messages":[{"role":"user","content":"hi"}]}' | jq .choices[0].message.role`
       - Expected: `"assistant"`
    2. [ ] SSE streaming works with `"stream": true`
       - Verification: Test streaming endpoint, verify `data:` chunks followed by `data: [DONE]`
       - Expected: Valid SSE stream
    3. [ ] Auth required on all endpoints except /health
       - Verification: Call /v1/models without auth
       - Expected: 401 Unauthorized
    4. [ ] `x-onyx-*` in request body returns 400
       - Verification: Send body with `x-onyx-agent-id` field
       - Expected: 400 Bad Request

- **T19**: WebSocket gateway [sonnet] — builder, blockedBy: [V4]
  - `api/src/gateway/websocket.ts`: WebSocket handler per D7
  - Message types: chat.send, chat.abort, sessions.list, memory.search
  - Response types: chat.delta, chat.tool_call, chat.done
  - Auth via cookie or token in connection params
  - Acceptance Criteria:
    1. [ ] WebSocket connection established with valid auth
       - Verification: `cd onyx && bun test api/src/gateway/websocket.test.ts`
       - Expected: Connection accepted
    2. [ ] `chat.send` triggers agent runtime and streams deltas back
       - Verification: Send chat.send, collect all messages until chat.done
       - Expected: Receive delta messages + done
    3. [ ] `chat.abort` stops in-flight generation
       - Verification: Send chat.send then immediately chat.abort
       - Expected: Receive chat.done with abort finish_reason

### Wave 5 Validation

- **V5**: Validate Wave 5 [sonnet] — validator-heavy, blockedBy: [T16, T17, T18, T19]
  - Verify ReAct loop, context assembly, HTTP + WebSocket gateways, end-to-end message flow

### Wave 6: Heartbeat + Notifications (parallel)

- **T20**: Heartbeat engine [sonnet] — builder, blockedBy: [V5]
  - `api/src/heartbeat/engine.ts`: Cron scheduler per D12
  - Tick dispatch to agent runtime with HEARTBEAT.md system prompt
  - No-op heartbeat transcript filtering (HEARTBEAT_OK → audit log only)
  - Cron session modes (main vs isolated) with auto-selection
  - Acceptance Criteria:
    1. [ ] Heartbeat tick fires on schedule and invokes agent runtime
       - Verification: `cd onyx && bun test api/src/heartbeat/`
       - Expected: All tests pass
    2. [ ] No-op heartbeats logged to audit log, not conversation transcript
       - Verification: Trigger heartbeat that returns HEARTBEAT_OK, verify session not polluted
       - Expected: Audit log has entry, session transcript unchanged
    3. [ ] Cron session modes work (isolated creates fresh session, main uses existing)
       - Verification: Test both modes
       - Expected: Isolated mode has empty history, main mode has existing history

- **T21**: Notification system [sonnet] — builder, blockedBy: [V5]
  - `api/src/heartbeat/notify.ts`: Notification routing per D12
  - Web UI notification center (in-memory store with SSE push to frontend)
  - Priority levels (high, normal, low)
  - Acceptance Criteria:
    1. [ ] Notifications stored and retrievable via API
       - Verification: `cd onyx && bun test api/src/heartbeat/notify.test.ts`
       - Expected: Tests pass
    2. [ ] SSE endpoint pushes new notifications to connected clients
       - Verification: Connect to SSE, trigger notification, verify received
       - Expected: Notification received via SSE within 1 second
    3. [ ] Priority levels respected in notification payload
       - Verification: Create notifications with each priority, verify field present
       - Expected: Priority field matches

### Wave 6 Validation

- **V6**: Validate Wave 6 [sonnet] — validator-heavy, blockedBy: [T20, T21]
  - Verify heartbeat scheduling, notification delivery, transcript isolation

### Wave 7: Frontend Foundation (parallel)

- **T22**: Frontend scaffold [opus] — builder-heavy, blockedBy: [V5]
  - `frontend/`: Full SvelteKit project with shadcn-svelte + Tailwind CSS
  - Layout with sidebar navigation (Chat, Sessions, Memory, Agents, Config, Logs)
  - Dark mode by default (per user preference: "light mode is a war crime")
  - API client module for backend communication
  - WebSocket client for real-time streaming
  - Acceptance Criteria:
    1. [ ] `cd onyx/frontend && bun run dev` starts dev server
       - Verification: Start server, verify page loads at localhost:5173
       - Expected: SvelteKit app renders with sidebar
    2. [ ] shadcn-svelte components installed and rendering
       - Verification: Check for bits-ui in dependencies, verify a shadcn component renders
       - Expected: Component visible
    3. [ ] Dark mode is default theme
       - Verification: Check root element has dark class/attribute
       - Expected: Dark theme active by default
    4. [ ] API client module can make authenticated requests
       - Verification: `cd onyx/frontend && bun run test`
       - Expected: API client tests pass

- **T23**: Login page + auth flow [sonnet] — builder, blockedBy: [V5]
  - `frontend/src/routes/login/`: Login form with password input
  - Session cookie handling (HttpOnly set by server)
  - Redirect to /chat after login, redirect to /login if unauthenticated
  - Acceptance Criteria:
    1. [ ] Login form submits credentials and receives session cookie
       - Verification: `cd onyx/frontend && bun run test`
       - Expected: Login flow tests pass
    2. [ ] Unauthenticated access redirects to /login
       - Verification: Navigate to /chat without auth
       - Expected: Redirected to /login
    3. [ ] Successful login redirects to /chat
       - Verification: Login with valid credentials
       - Expected: Redirected to /chat

### Wave 7 Validation

- **V7**: Validate Wave 7 [sonnet] — validator-heavy, blockedBy: [T22, T23]
  - Verify frontend builds, login flow works, dark mode active

### Wave 8: Frontend Pages (parallel)

- **T24**: Chat interface [sonnet] — builder, blockedBy: [V7]
  - `frontend/src/routes/chat/`: Message input, streaming response display, tool call cards
  - Agent selector dropdown, session picker
  - Markdown rendering (marked + DOMPurify + highlight.js)
  - Stop/abort button
  - WebSocket-based streaming
  - Acceptance Criteria:
    1. [ ] Messages sent and responses streamed back in real-time
       - Verification: Manual test or Playwright
       - Expected: User types message, assistant response streams in
    2. [ ] Tool call cards render with expandable input/output
       - Verification: Trigger a tool call, verify card renders
       - Expected: Collapsible card with tool name, input, output
    3. [ ] Markdown with code blocks and syntax highlighting renders correctly
       - Verification: Send message that triggers code block response
       - Expected: Code highlighted with copy button
    4. [ ] Abort button stops generation
       - Verification: Click abort during streaming
       - Expected: Streaming stops, partial response preserved

- **T25**: Sessions page [sonnet] — builder, blockedBy: [V7]
  - `frontend/src/routes/sessions/`: Session list with metadata
  - Filter by agent, date, status
  - Click to view full transcript
  - Delete/archive sessions
  - Acceptance Criteria:
    1. [ ] Sessions listed with metadata (title, agent, message count, updated_at)
       - Verification: `cd onyx/frontend && bun run test`
       - Expected: Session list renders
    2. [ ] Clicking session shows full transcript
       - Verification: Click a session, verify messages displayed
       - Expected: All messages shown in order

- **T26**: Memory browser [sonnet] — builder, blockedBy: [V7]
  - `frontend/src/routes/memory/`: Search interface, file browser, edit capability
  - Hybrid search (vector + keyword) from frontend
  - View/edit memory files (MEMORY.md, daily logs)
  - Sync status indicator
  - Acceptance Criteria:
    1. [ ] Search returns results from memory
       - Verification: Search for a known term, verify results
       - Expected: Results displayed with relevance scores
    2. [ ] Memory files browsable and editable
       - Verification: Navigate to a memory file, edit content, save
       - Expected: Changes persisted to MinIO

- **T27**: Agent config + provider settings [sonnet] — builder, blockedBy: [V7]
  - `frontend/src/routes/agents/`: Agent list, view/edit prompts, enable/disable
  - `frontend/src/routes/config/`: Provider configuration page per D7
  - SecretRef management (create/update/test reference), redacted display only, Ollama endpoint config
  - Connection testing (test provider reachability)
  - Acceptance Criteria:
    1. [ ] Agent list shows all configured agents with edit capability
       - Verification: Navigate to agents page, verify agents listed
       - Expected: Agents displayed with edit buttons
    2. [ ] Provider config shows connection status for each provider
       - Verification: Navigate to config page
       - Expected: Providers listed with status indicators
    3. [ ] Provider credentials are never returned raw; UI handles references and redacted previews only
       - Verification: Configure provider credential, inspect API/UI payloads
       - Expected: Secret value never appears in response payloads or persisted UI state

- **T28**: Logs + system status [sonnet] — builder, blockedBy: [V7]
  - `frontend/src/routes/logs/`: Live log tail with level filter (DEBUG, INFO, WARN, ERROR)
  - System status page: health checks, connected services, menos status
  - Notification center (dropdown showing heartbeat notifications)
  - Acceptance Criteria:
    1. [ ] Logs page shows live-updating log entries
       - Verification: Navigate to logs, verify entries appear
       - Expected: Log entries rendered with level badges
    2. [ ] System status shows service health
       - Verification: Navigate to status page
       - Expected: SurrealDB, MinIO, Ollama status indicators shown
    3. [ ] Notification center shows heartbeat notifications with priority badges
       - Verification: Trigger a notification, check notification dropdown
       - Expected: Notification visible with priority level

### Wave 8 Validation

- **V8**: Validate Wave 8 [sonnet] — validator-heavy, blockedBy: [T24, T25, T26, T27, T28]
  - Verify all frontend pages render, API integration works, chat streaming functional

### Wave 9: Onboarding + Deployment (parallel)

- **T29**: First-time onboarding wizard [sonnet] — builder, blockedBy: [V8]
  - `frontend/src/routes/onboarding/`: 5-phase conversational wizard per D9
  - Phase 1-2 required (~5 min), Phase 3-4 optional
  - Multiple-choice with "other" escape hatch
  - Generates SOUL.md, USER.md, IDENTITY.md, AGENTS.md workspace files
  - Acceptance Criteria:
    1. [ ] Onboarding detects first launch (no workspace files) and redirects
       - Verification: Remove workspace files, navigate to /chat
       - Expected: Redirected to /onboarding
    2. [ ] All 5 phases render with multiple-choice options
       - Verification: Step through all phases
       - Expected: Each phase shows questions with selectable options
    3. [ ] Generated files match selections (e.g., "sycophancy" annoyance → specific SOUL.md rule)
       - Verification: Complete wizard, read generated SOUL.md
       - Expected: Selected preferences reflected as rules

- **T30**: Docker Compose + deployment config [sonnet] — builder, blockedBy: [V6]
  - `onyx/docker-compose.yml`: Full service definitions per D10 (separate Onyx compose project)
  - `onyx/Dockerfile`: Multi-stage build for API (Bun)
  - `onyx/frontend/Dockerfile`: SvelteKit build
  - External network join to `menos-network` for shared services
  - SearXNG service configuration
  - `.env.example` with all required variables
  - `menos/infra/ansible/` extensions: additive Onyx deploy tasks/vars preserving existing menos deployment flow
  - Acceptance Criteria:
    1. [ ] `docker compose build` succeeds for all services
       - Verification: `cd onyx && docker compose build`
       - Expected: All images built successfully
    2. [ ] `docker compose up` starts all services and they become healthy
       - Verification: `docker compose up -d && docker compose ps`
       - Expected: All services running/healthy
    3. [ ] API accessible at port 18790, frontend at 18791
       - Verification: `curl -s http://localhost:18790/health && curl -s http://localhost:18791`
       - Expected: Both respond
    4. [ ] Shared services (SurrealDB, MinIO, Ollama) accessible via menos-network
       - Verification: Verify onyx-api can reach SurrealDB on menos-network
       - Expected: Connection successful
    5. [ ] Ansible deployment remains additive with independent Onyx lifecycle
       - Verification: run Ansible in check mode for Onyx tasks and verify menos services are untouched
       - Expected: Onyx deploy/update actions are isolated from menos service restart/rollback path

### Wave 9 Validation

- **V9**: Validate Wave 9 [sonnet] — validator-heavy, blockedBy: [T29, T30]
  - Verify onboarding flow, Docker Compose stack, service connectivity

### Wave 10: Integration Testing

- **T31**: E2E integration tests [sonnet] — builder, blockedBy: [V9]
  - `onyx/tests/e2e/`: Playwright tests for critical flows
  - Test: Login → Chat → Send message → Receive streaming response
  - Test: Memory search via UI
  - Test: Session management (create, list, view, delete)
  - Test: Provider config page loads
  - API integration tests: Full ReAct loop with mock provider
  - Acceptance Criteria:
    1. [ ] E2E: Login → Chat → Message → Streaming response works
       - Verification: `cd onyx && bun run test:e2e`
       - Expected: All E2E tests pass
    2. [ ] API integration: Chat completions with tool calls executes full ReAct loop
       - Verification: `cd onyx && bun test tests/integration/`
       - Expected: Integration tests pass
    3. [ ] All `bun test` suites pass across entire project
       - Verification: `cd onyx && bun test`
       - Expected: 0 failures

### Wave 10 Validation

- **V10**: Validate Wave 10 [sonnet] — validator-heavy, blockedBy: [T31]
  - Final validation: all tests pass, Docker stack works, E2E flows functional

## Dependency Graph

```
Wave 1:  T1, T2 (parallel) → V1
Wave 2:  T3, T4, T5, T6, T6b (parallel) → V2
Wave 3:  T7, T8, T9, T10 (parallel) → V3
Wave 4:  T11, T12, T13, T14, T15 (parallel) → V4
Wave 5:  T16, T17, T18, T19 (parallel) → V5
Wave 6:  T20, T21 (parallel) → V6
         ↓ (V6 unblocks T30)
Wave 7:  T22, T23 (parallel) → V7
Wave 8:  T24, T25, T26, T27, T28 (parallel) → V8
Wave 9:  T29 (needs V8), T30 (needs V6) → V9
Wave 10: T31 → V10
```

Note: T30 (Docker Compose) is unblocked by V6 (not V8), allowing it to start earlier while frontend pages are still being built.
