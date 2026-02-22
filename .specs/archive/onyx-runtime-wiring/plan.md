---
created: 2026-02-22
completed: 2026-02-22
---

# Team Plan: Wire Up Onyx Runtime + Fix Backend Gaps

## Objective

Make Onyx chat functional end-to-end and fix all gaps where the frontend UI exposes features that the backend doesn't serve. The backend infrastructure is ~80% built (runtime, sessions, memory, tools, heartbeat, notifications) but 0% integrated — everything needs to be connected through an adapter layer in `api/src/index.ts`.

## Project Context
- **Language**: TypeScript (Bun)
- **Test command**: `make test` (bun test for API + shared, vitest for frontend)
- **Lint command**: `npx @biomejs/biome check .`
- **Key constraint**: Onyx `.env` uses menos naming (`SURREALDB_URL`) but Onyx code expects different names (`SURREAL_URL`). The adapter or env setup must reconcile this.

## Complexity Analysis

| Task | Est. Files | Change Type | Model | Agent |
|------|-----------|-------------|-------|-------|
| T1: Create runtime adapter | 2-3 | architecture | opus | builder-heavy |
| T2: Wire adapter + routes into index.ts | 1 | feature | sonnet | builder |
| T3: Fix env var mismatch + add Onyx env vars | 1-2 | mechanical | haiku | builder-light |
| T4: Register notification routes | 1 | mechanical | haiku | builder-light |
| T5: Populate tool registry | 1-2 | feature | sonnet | builder |
| T6: Start heartbeat engine on init | 1-2 | feature | sonnet | builder |

## Team Members

| Name | Agent | Model | Role |
|------|-------|-------|------|
| onyx-adapter | builder-heavy | opus | Build RuntimeInterface + WSRuntimeInterface adapter |
| onyx-wiring | builder | sonnet | Wire adapter into index.ts, register routes, populate tools, start heartbeat |
| onyx-env | builder-light | haiku | Fix env var naming, add Onyx-specific vars to .env |
| onyx-validator | validator-heavy | sonnet | Validate each wave |

## Execution Waves

### Wave 1 (parallel — no dependencies)

- **T1: Create runtime adapter** [opus] — builder-heavy
  Create `api/src/runtime-adapter.ts` implementing both `RuntimeInterface` (for HTTP gateway) and `WSRuntimeInterface` (for WebSocket gateway). The adapter must:
  1. Accept db (Surreal), storage (StorageClient), config (OnyxConfig), registry (ToolRegistry), sessionManager (SessionManager) as constructor params
  2. Implement `stream()` for HTTP: resolve agent → assemble system prompt from workspace files → load session history → call `runAgent()` → yield `ChatCompletionChunk` from deltas → store messages in session
  3. Implement `complete()` for HTTP: same as stream but collect all chunks into a single response
  4. Implement WS `stream()`: takes (message, model, agentId, sessionId, signal, callbacks) → creates/gets session → assembles prompt → calls `runAgent()` with callbacks → stores messages → returns {session_id, finish_reason, usage}
  5. Implement `listSessions()`, `getSession()`, `deleteSession()` delegating to SessionManager
  6. Implement `searchMemory()` delegating to `api/src/memory/search.ts`
  7. Implement `listMemoryFiles()`, `readMemoryFile()` delegating to `api/src/memory/files.ts`
  8. System prompt assembly: concatenate workspace files (IDENTITY.md, SOUL.md, USER.md, AGENTS.md, TOOLS.md) with section headers; optionally include MEMORY.md content
  9. Agent resolution: use `getAgent(agentId)` or `getDefaultAgent()` from `api/src/agents/loader.ts`
  10. For new sessions, auto-generate a title from the first user message (first 50 chars)

  **Key interfaces to implement** (from `api/src/gateway/http.ts` lines 18-41 and `api/src/gateway/websocket.ts` lines 6-17):
  ```typescript
  // HTTP RuntimeInterface
  complete(messages, model, agentId?, sessionId?): Promise<ChatCompletionResponse>
  stream(messages, model, agentId?, sessionId?, signal?): AsyncGenerator<ChatCompletionChunk>
  listSessions(agentId?): Promise<Session[]>
  getSession(sessionId): Promise<Session & { history: Message[] }>
  deleteSession(sessionId): Promise<void>
  searchMemory(query, agentId?): Promise<MemorySearchResult[]>
  listMemoryFiles(agentId?): Promise<string[]>
  readMemoryFile(path, agentId?): Promise<string>

  // WS WSRuntimeInterface
  stream(message, model, agentId, sessionId, signal, callbacks): Promise<{session_id, finish_reason, usage?}>
  listSessions(agentId?): Promise<Session[]>
  searchMemory(query, agentId?): Promise<MemorySearchResult[]>
  ```

  **Acceptance Criteria:**
  1. [ ] File `api/src/runtime-adapter.ts` exists and exports a class implementing both interfaces
     - Verification: `bun build api/src/runtime-adapter.ts` compiles without type errors
  2. [ ] WS stream method calls `runAgent()` from `api/src/agents/runtime.ts`
     - Verification: grep for `runAgent` in the adapter file
  3. [ ] Session methods delegate to `SessionManager`
     - Verification: grep for `sessionManager` in the adapter file
  4. [ ] Memory methods delegate to existing memory module
     - Verification: grep for `searchMemory\|listMemoryFiles\|readMemoryFile` in the adapter
  5. [ ] System prompt is assembled from workspace files
     - Verification: grep for `readWorkspaceFile\|readAllWorkspaceFiles` in the adapter

- **T3: Fix env var mismatch + add Onyx env vars** [haiku] — builder-light
  The `.env` file uses menos naming (`SURREALDB_URL`, `SURREALDB_USER`, `SURREALDB_PASSWORD`, `MINIO_URL`) but Onyx's `db/client.ts` expects `SURREAL_URL`, `SURREAL_USER`, `SURREAL_PASS`, and `storage/minio.ts` expects `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`.

  Add an Onyx-specific section to `.env` with the correct variable names pointing to the same remote server:
  ```
  # Onyx-specific overrides
  SURREAL_URL=ws://192.168.16.241:8080
  SURREAL_NS=onyx
  SURREAL_DB=onyx
  SURREAL_USER=root
  SURREAL_PASS=4NGiUGhuSMGX5sReKgTu1dCZjhY3IkcI
  MINIO_ENDPOINT=192.168.16.241:9000
  ```
  Note: `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY` are already set. Onyx uses its own SurrealDB namespace (`onyx`) separate from menos.

  **Acceptance Criteria:**
  1. [ ] `.env` contains `SURREAL_URL`, `SURREAL_NS`, `SURREAL_DB`, `SURREAL_USER`, `SURREAL_PASS`
     - Verification: `grep SURREAL_ onyx/.env`
  2. [ ] `.env` contains `MINIO_ENDPOINT`
     - Verification: `grep MINIO_ENDPOINT onyx/.env`
  3. [ ] Variables point to 192.168.16.241 with correct ports
     - Verification: visual inspection of values

### Wave 1 Validation
- **V1: Validate wave 1** [sonnet] — validator-heavy, blockedBy: [T1, T3]
  - TypeScript compiles: `cd onyx && npx tsc --noEmit`
  - Adapter file exists and implements both interfaces
  - Env vars are present and correctly named
  - Existing tests still pass: `cd onyx && bun test`

### Wave 2 (parallel — depends on V1)

- **T2: Wire adapter + routes into index.ts** [sonnet] — builder, blockedBy: [V1]
  Modify `api/src/index.ts` to:
  1. Import and call `connectDb()` from `db/client.ts`
  2. Import and call `initStorage()` from `storage/minio.ts`
  3. Create `SessionManager` with db + storage
  4. Create populated `ToolRegistry` (see T5 — can be done in same file or a factory)
  5. Create the runtime adapter with all dependencies
  6. Pass runtime to `createHttpGateway(runtime)` and `createWebSocketHandler(wsRuntime)`
  7. Import and register `createNotificationRoutes()` on the app
  8. Wrap initialization in async startup (db connect, storage init, adapter create) before server starts

  The current `index.ts` is 31 lines. The new version should follow this pattern:
  ```typescript
  await bootstrapAuth();
  const db = await connectDb();
  const storage = await initStorage();
  const sessionManager = new SessionManager(db, storage);
  const registry = buildToolRegistry(db, storage, sessionManager);
  const runtime = new OnyxRuntime(db, storage, config, registry, sessionManager);
  // ... pass to gateways
  ```

  **Acceptance Criteria:**
  1. [ ] `createHttpGateway(runtime)` is called with a runtime argument
     - Verification: `grep 'createHttpGateway(' onyx/api/src/index.ts` shows non-empty parens
  2. [ ] `createWebSocketHandler(runtime)` is called with a runtime argument
     - Verification: `grep 'createWebSocketHandler(' onyx/api/src/index.ts` shows non-empty parens
  3. [ ] `connectDb()` is called before server starts
     - Verification: `grep 'connectDb' onyx/api/src/index.ts`
  4. [ ] `initStorage()` is called before server starts
     - Verification: `grep 'initStorage' onyx/api/src/index.ts`
  5. [ ] Notification routes are registered
     - Verification: `grep 'createNotificationRoutes' onyx/api/src/index.ts`

- **T5: Populate tool registry** [sonnet] — builder, blockedBy: [V1]
  Create `api/src/tools/build-registry.ts` that exports a `buildToolRegistry(db, storage, sessionManager, embeddingConfig?)` function. It must:
  1. Create a `ToolRegistry` instance
  2. Register `fsTools` (fs/index.ts)
  3. Register `createMemoryTools(db, storage, embeddingConfig)` (memory/index.ts)
  4. Register `webTools` (web/index.ts)
  5. Register `makeSessionTools(sessionManager)` (sessions/index.ts)
  6. Register `runtimeTools` (runtime/index.ts)
  7. Register `scheduleTools` (schedule/index.ts)
  8. Return the populated registry

  **Acceptance Criteria:**
  1. [ ] `api/src/tools/build-registry.ts` exists
     - Verification: file exists
  2. [ ] All 6 tool groups are registered (fs, memory, web, sessions, runtime, schedule)
     - Verification: grep for all 6 imports in the file
  3. [ ] Function accepts db, storage, sessionManager params for tools that need them
     - Verification: `grep 'db.*storage.*sessionManager' onyx/api/src/tools/build-registry.ts`
  4. [ ] Existing tool tests pass: `cd onyx && bun test api/src/tools/`
     - Verification: run the command

- **T4: Register notification routes** [haiku] — builder-light, blockedBy: [V1]
  This is absorbed into T2 (single line addition). **SKIP — merged into T2.**

- **T6: Start heartbeat engine on init** [sonnet] — builder, blockedBy: [V1]
  In `api/src/index.ts` (or a separate init module), after the runtime adapter is created:
  1. Import heartbeat engine from `api/src/heartbeat/engine.ts`
  2. Instantiate with config, runtime reference, and notification store
  3. Call `engine.start()`
  4. Handle graceful shutdown on process exit

  Read `api/src/heartbeat/engine.ts` first to understand its constructor/start API.

  **Acceptance Criteria:**
  1. [ ] Heartbeat engine is imported and started in index.ts or init module
     - Verification: `grep -r 'heartbeat\|HeartbeatEngine\|engine.start' onyx/api/src/index.ts`
  2. [ ] Existing heartbeat tests pass: `cd onyx && bun test api/src/heartbeat/`
     - Verification: run the command

## Dependency Graph
```
Wave 1: T1 (adapter), T3 (env) → V1
Wave 2: T2 (wire index.ts), T5 (tool registry), T6 (heartbeat) → V2
```

## Notes

- T4 merged into T2 since it's a single import+route line
- Subscription SDK providers (claude-agent, codex, copilot) are stubs — out of scope for this plan. Vercel AI providers (ollama, openai, anthropic, openrouter) work and are sufficient for MVP
- Memory indexing (auto-index on workspace write) is a follow-up task, not blocking chat
- Token budget enforcement is not implemented in `runAgent()` — follow-up task
