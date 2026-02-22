---
created: 2026-02-22
completed: 2026-02-22
---

# Team Plan: Onyx Unit Test Coverage Gaps

## Objective

Address all unit testing gaps identified in the Onyx audit. The codebase has strong coverage of infrastructure (providers, auth, heartbeat, gateway) but significant gaps in: the runtime orchestrator (335 LOC, zero tests), all 18 individual tool implementations, memory subsystem I/O (embeddings + files), auth/session, and frontend WebSocket + form actions.

## Project Context
- **Language**: TypeScript (Bun runtime)
- **Test command**: `bun test` (API + shared), `cd frontend && bun run test` (frontend/vitest)
- **Lint command**: `npx @biomejs/biome check .`
- **Working directory**: `~/.dotfiles/onyx`
- **Test pattern**: Colocated `*.test.ts` files next to source
- **Existing test style**: `describe`/`it` blocks with `expect`, mocked dependencies via `mock.module()` (Bun) or `vi.mock()` (vitest frontend)

## Complexity Analysis

| Task | Est. Files | Change Type | Model | Agent |
|------|-----------|-------------|-------|-------|
| T1: Orchestrator tests | 1 new test | architecture | opus | builder-heavy |
| T2: All tool implementation tests | 6 new/expanded tests | feature | sonnet | builder |
| T3: Infrastructure tests (memory I/O + auth/session) | 3 new tests | feature | sonnet | builder |
| T4: Frontend tests (WS + form actions) | 3 new/expanded tests | feature | sonnet | builder |

## Team Members

| Name | Agent | Model | Role |
|------|-------|-------|------|
| test-orchestrator | builder-heavy | opus | T1: Orchestrator test suite |
| test-tools | builder | sonnet | T2: Tool implementation tests |
| test-infra | builder | sonnet | T3: Memory I/O + auth/session tests |
| test-frontend | builder | sonnet | T4: Frontend WS + form action tests |
| test-validator | validator-heavy | sonnet | Wave validation |

## Execution Waves

### Wave 1 (parallel)

All 4 tasks are independent — different source files, different test files, no shared state.

- **T1: Runtime orchestrator test suite** [opus] — builder-heavy
  - File: `api/src/runtime/orchestrator.test.ts` (new)
  - Source: `api/src/runtime/orchestrator.ts` (335 LOC)
  - Must test: `complete()`, `stream()`, `streamWs()`, agent resolution, session creation/continuation, message persistence, abort handling, error propagation
  - Mock: providers (ProviderBackend), session manager, agent loader, tool executor
  - Acceptance Criteria:
    1. [ ] `api/src/runtime/orchestrator.test.ts` exists with 200+ LOC
       - Verification: `wc -l api/src/runtime/orchestrator.test.ts`
       - Expected: 200+ lines
    2. [ ] Tests cover complete(), stream(), and streamWs() methods
       - Verification: `grep -c 'describe\|it(' api/src/runtime/orchestrator.test.ts`
       - Expected: 10+ test cases
    3. [ ] Tests cover error paths (provider failure, missing agent, abort signal)
       - Verification: `grep -c 'error\|abort\|fail\|throw\|reject' api/src/runtime/orchestrator.test.ts`
       - Expected: 3+ error test cases
    4. [ ] `bun test api/src/runtime/orchestrator.test.ts` passes with 0 failures
       - Verification: `bun test api/src/runtime/orchestrator.test.ts`
       - Expected: All tests pass

- **T2: Tool implementation tests** [sonnet] — builder
  - Expand existing thin test files and add missing ones for all 18 tool implementations
  - Files to create/expand:
    - `api/src/tools/fs/fs.test.ts` — expand to cover read.ts, write.ts, edit.ts individually
    - `api/src/tools/web/web.test.ts` — expand to cover fetch.ts, search.ts individually
    - `api/src/tools/memory/memory.test.ts` — expand to cover read.ts, search.ts, write.ts individually
    - `api/src/tools/sessions/sessions.test.ts` — expand to cover send.ts, list.ts, history.ts individually
    - `api/src/tools/schedule/schedule.test.ts` — expand to cover cancel.ts, list.ts individually
    - `api/src/tools/runtime/runtime.test.ts` — expand to cover exec.ts edge cases (timeout, large output)
  - Must test: happy path + error cases (missing file, network error, permission denied, timeout, empty results)
  - Mock: MinIO client, SurrealDB client, fetch, child_process
  - Acceptance Criteria:
    1. [ ] Each tool group test file covers all individual tool implementations
       - Verification: `for f in fs web memory sessions schedule runtime; do echo "==$f=="; grep -c 'it(' api/src/tools/$f/*.test.ts; done`
       - Expected: Each group has 4+ test cases
    2. [ ] Error/edge cases tested for each tool group
       - Verification: `grep -c 'error\|fail\|throw\|timeout\|missing\|not found' api/src/tools/*/test*.ts api/src/tools/*/*.test.ts`
       - Expected: 10+ error test cases total
    3. [ ] `bun test api/src/tools/` passes with 0 failures
       - Verification: `bun test api/src/tools/`
       - Expected: All tests pass, no regressions to existing tests

- **T3: Infrastructure tests (memory I/O + auth/session)** [sonnet] — builder
  - Files to create:
    - `api/src/memory/embeddings.test.ts` — test Ollama call, fallback to FTS-only on network error, response parsing
    - `api/src/memory/files.test.ts` — test MinIO read/write/list/delete, error handling, key construction
    - `api/src/auth/session.test.ts` — test cookie creation, token validation, edge cases (missing/invalid token)
  - Mock: fetch (for Ollama), MinIO client, config
  - Acceptance Criteria:
    1. [ ] `api/src/memory/embeddings.test.ts` exists and covers Ollama call + FTS fallback
       - Verification: `grep -c 'it(' api/src/memory/embeddings.test.ts`
       - Expected: 4+ test cases (success, network error, timeout, malformed response)
    2. [ ] `api/src/memory/files.test.ts` exists and covers CRUD operations
       - Verification: `grep -c 'it(' api/src/memory/files.test.ts`
       - Expected: 4+ test cases (read, write, list, delete + error cases)
    3. [ ] `api/src/auth/session.test.ts` exists and covers cookie/token validation
       - Verification: `grep -c 'it(' api/src/auth/session.test.ts`
       - Expected: 3+ test cases
    4. [ ] `bun test api/src/memory/embeddings.test.ts api/src/memory/files.test.ts api/src/auth/session.test.ts` passes
       - Verification: run the above
       - Expected: All tests pass

- **T4: Frontend tests** [sonnet] — builder
  - Files to create/expand:
    - `frontend/src/lib/ws.test.ts` — expand from 8 LOC to 100+ LOC covering reconnection, message routing, error handling, connection state
    - `frontend/src/routes/login/login.test.ts` — test form validation, successful login, error states
    - `frontend/src/routes/change-password/change-password.test.ts` — test password validation, current password verification, success/error
  - Uses vitest (not bun test) — run via `cd frontend && bun run test`
  - Mock: fetch, SvelteKit form actions
  - Acceptance Criteria:
    1. [ ] `frontend/src/lib/ws.test.ts` has 100+ LOC with reconnection and error tests
       - Verification: `wc -l frontend/src/lib/ws.test.ts`
       - Expected: 100+ lines
    2. [ ] Login and change-password test files exist
       - Verification: `ls frontend/src/routes/login/*.test.ts frontend/src/routes/change-password/*.test.ts`
       - Expected: Both files exist
    3. [ ] `cd frontend && bun run test` passes with 0 new failures
       - Verification: run the above
       - Expected: All new tests pass (pre-existing api.test.ts failures in URL matching are known/accepted)

### Wave 1 Validation
- **V1**: Validate wave 1 [sonnet] — validator-heavy, blockedBy: [T1, T2, T3, T4]
  - Run full test suite: `cd ~/.dotfiles/onyx && bun test && cd frontend && bun run test`
  - Run lint: `cd ~/.dotfiles/onyx && npx @biomejs/biome check .`
  - Verify no regressions: compare test count before/after
  - Check test quality: ensure tests aren't trivially passing (no empty test bodies, no `expect(true).toBe(true)`)
  - Acceptance Criteria:
    1. [ ] `bun test` passes (API + shared)
    2. [ ] `cd frontend && bun run test` passes (no new failures beyond pre-existing api.test.ts URL issues)
    3. [ ] Biome lint passes with no new warnings
    4. [ ] No trivial/empty test bodies (`grep -r 'expect(true)' api/src/ frontend/src/` returns nothing)

## Dependency Graph
Wave 1: T1, T2, T3, T4 (parallel) → V1

## Notes
- All builders should read existing test files in their area first to match style/patterns
- Use `mock.module()` for Bun test mocking (API), `vi.mock()` for vitest (frontend)
- Existing pre-known test failures in `frontend/src/lib/api.test.ts` (7 URL matching tests) — these are pre-existing and not in scope
