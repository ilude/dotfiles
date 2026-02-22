---
created: 2026-02-22
completed:
---

# Team Plan: Fix Onyx Session Persistence

## Objective

Sessions are not reliably storing model responses and conversation history. Three issues: (1) HTTP path re-appends full message history on every request causing duplicates in JSONL, (2) all messages lost if `runAgent()` throws since persistence happens after, (3) no way to resume a session from the chat UI. Fix all three plus audit WS path for consistency.

## Project Context
- **Language**: TypeScript (Bun monorepo)
- **Test command**: `cd onyx && bun test`
- **Lint command**: `cd onyx && bunx @biomejs/biome check .`

## Complexity Analysis

| Task | Est. Files | Change Type | Model | Agent |
|------|-----------|-------------|-------|-------|
| Fix orchestrator persistence + tests | 2 | feature | sonnet | builder |
| Add session resume UI + continue links | 3 | feature | sonnet | builder |

## Team Members

| Name | Agent | Model | Role |
|------|-------|-------|------|
| session-backend | builder | sonnet | Fix persistence bugs in orchestrator + update tests |
| session-frontend | builder | sonnet | Add session resume to chat UI + continue links |
| session-validator | validator-heavy | sonnet | Wave validation: tests + lint |

## Execution Waves

### Wave 1 (parallel)

- **T1: Fix orchestrator persistence** [sonnet] — session-backend
  - File: `onyx/api/src/runtime/orchestrator.ts`
  - In `complete()` and `stream()`: Replace the loop that persists all input messages with logic that persists only the latest user message (use `findLast` on user-role messages)
  - In all three methods (`complete`, `stream`, `streamWs`): Move user message persistence BEFORE `runAgent()` so it survives errors
  - In `streamWs()`: Ensure persistence ordering matches the other methods (persist user message before `runAgent()`), and verify WS does not re-persist historical user messages when full history is present
  - File: `onyx/api/src/runtime/orchestrator.test.ts`
  - Add `mockRunAgentError` variable to mock module, reset in `beforeEach`
  - New test: "does not re-persist historical messages on subsequent requests" — multi-turn message array, verify only NEW user + assistant appended
  - New test: "persists user message even when runAgent throws" — set `mockRunAgentError`, verify user message still saved
  - Acceptance Criteria:
    1. [ ] `complete()` persists only 1 user message + N agent messages per call (not full history)
       - Verification: New test "does not re-persist historical messages" passes
    2. [ ] `stream()` has same fix as `complete()`
       - Verification: Existing test "persists messages after streaming" still passes with 2 messages
    3. [ ] User message persisted before `runAgent()` in all 3 methods
       - Verification: New test "persists user message even when runAgent throws" passes
    4. [ ] All existing tests still pass
       - Verification: `cd onyx && bun test api/src/runtime/orchestrator.test.ts` — 0 failures
    5. [ ] `streamWs()` is consistent with HTTP paths for duplicate-history handling (no re-persist of prior user turns)
       - Verification: Code review (or test update) confirms WS path persists only the new user turn when history is included

- **T2: Add session resume UI** [sonnet] — session-frontend
  - File: `onyx/frontend/src/routes/chat/+page.svelte`
    - Import `page` from `$app/state` and `getSession` from `$lib/api`
    - In `onMount`, read `?session=<id>` from URL. If present, call `getSession(id)` and populate `sessionId`, `sessionTitle`, `messages` (filter system msgs), `selectedAgentId`
  - File: `onyx/frontend/src/routes/sessions/+page.svelte`
    - Add "Continue" `<a>` link (`href="/chat?session={id}"`) in table row actions (line ~150), before delete button
  - File: `onyx/frontend/src/routes/sessions/[id]/+page.svelte`
    - Add "Continue conversation" link in header area
  - Acceptance Criteria:
    1. [ ] Chat page reads `?session=<id>` param on mount and loads session history
       - Verification: Code review — `page.url.searchParams.get("session")` exists in `onMount`
    2. [ ] Sessions list has "Continue" link per row that navigates to `/chat?session=<id>`
       - Verification: Code review — `<a href="/chat?session=...">` in sessions table
    3. [ ] Session detail page has "Continue conversation" link
       - Verification: Code review — link present in header of `sessions/[id]` page
    4. [ ] No lint errors introduced
       - Verification: `cd onyx && bunx @biomejs/biome check frontend/src/`

### Wave 1 Validation

- **V1: Validate wave 1** [sonnet] — session-validator, blockedBy: [T1, T2]
  - Run `cd onyx && bun test` — all tests pass
  - Run `cd onyx && bunx @biomejs/biome check .` — no lint errors
  - Review orchestrator.ts changes: verify persistence order (user msg → runAgent → agent msgs) in all 3 methods
  - Review chat page: verify session loading doesn't break new-session flow (when no `?session` param)

## Dependency Graph
Wave 1: T1, T2 (parallel) → V1
