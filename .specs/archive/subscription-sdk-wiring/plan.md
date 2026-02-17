---
created: 2026-02-17
completed: 2026-02-17
---

# Team Plan: Subscription SDK Wiring

## Objective

Wire the three subscription SDK backends (Claude Agent, OpenAI Codex, GitHub Copilot) into Onyx's provider system. Currently all three are stubs that throw "not yet configured." The router, failover, and interface already work — only the SDK integrations and Docker plumbing are missing. Without these, the user cannot leverage their paid subscriptions through Onyx.

## Project Context

- **Language**: TypeScript / Bun
- **Working directory**: `C:/Users/Mike/.dotfiles/`
- **Test command**: `bun test`
- **Lint command**: `npx @biomejs/biome check .`
- **Current test baseline**: 398 tests, 0 failures

## SDK Summary

| SDK | Package | API Pattern | Auth | Tool Restriction |
|-----|---------|-------------|------|------------------|
| Claude Agent | `@anthropic-ai/claude-agent-sdk` | `query({ prompt, options })` → async iterable | Claude CLI auth state | `allowedTools: []`, `maxTurns: 1` |
| Codex | `@openai/codex-sdk` | `new Codex()` → `thread.run(prompt)` | Codex CLI auth state | Read-only sandbox |
| Copilot | `@github/copilot-sdk` | `CopilotClient` → `session.sendAndWait()` | Copilot CLI auth state | `excludedTools` list |

All three are agent SDKs that wrap CLI tools. We restrict them to completion-only mode (no file editing, no bash).

## Complexity Analysis

| Task | Est. Files | Change Type | Model | Agent |
|------|-----------|-------------|-------|-------|
| T0: Install SDKs + verify Bun compat | 1 | mechanical | — | lead (manual) |
| T1: cli-auth.ts utility | 1 new | mechanical | haiku | builder-light |
| T2: Claude Agent provider + test | 2 (rewrite + new test) | feature | sonnet | typescript-pro |
| T3: Codex provider + test | 2 (rewrite + new test) | feature | sonnet | typescript-pro |
| T4: Copilot provider + test | 2 (rewrite + new test) | feature | sonnet | typescript-pro |
| T5: Dockerfile + docker-compose | 2 | mechanical | haiku | builder-light |
| V1: Wave 1 validation | — | validation | sonnet | validator-heavy |
| V2: Wave 2 validation | — | validation | haiku | validator |

## Team Members

| Name | Agent | Model | Role |
|------|-------|-------|------|
| sdk-builder-1 | typescript-pro | sonnet | Claude Agent provider implementation |
| sdk-builder-2 | typescript-pro | sonnet | Codex provider implementation |
| sdk-builder-3 | typescript-pro | sonnet | Copilot provider implementation |
| sdk-builder-4 | builder-light | haiku | cli-auth utility + router singleton |
| sdk-builder-5 | builder-light | haiku | Dockerfile + docker-compose changes |
| sdk-validator-1 | validator-heavy | sonnet | Wave 1 validation |
| sdk-validator-2 | validator | haiku | Wave 2 validation |

## Execution Waves

### Wave 0 (lead — manual prerequisite)

Before spawning any builders, the lead must:

```bash
cd onyx/api && bun add @anthropic-ai/claude-agent-sdk @openai/codex-sdk @github/copilot-sdk
```

Then verify all three import cleanly under Bun:
```bash
cd onyx/api && bun -e "import('@anthropic-ai/claude-agent-sdk').then(() => console.log('claude OK')).catch(e => console.error('claude FAIL', e))"
cd onyx/api && bun -e "import('@openai/codex-sdk').then(() => console.log('codex OK')).catch(e => console.error('codex FAIL', e))"
cd onyx/api && bun -e "import('@github/copilot-sdk').then(() => console.log('copilot OK')).catch(e => console.error('copilot FAIL', e))"
```

If any SDK fails to import under Bun, stop and investigate before proceeding.

Then verify SDK API shape before implementation starts:
```bash
cd onyx/api && bun -e "import('@anthropic-ai/claude-agent-sdk').then(m => console.log('claude query', typeof m.query))"
cd onyx/api && bun -e "import('@openai/codex-sdk').then(m => console.log('codex class', typeof m.Codex))"
cd onyx/api && bun -e "import('@github/copilot-sdk').then(m => console.log('copilot client', typeof m.CopilotClient))"
```

Record confirmed method names/options/events used for T2/T3/T4 before coding.

### Wave 1 (sequential — T1 to T4)

- **T1**: cli-auth utility + router singleton [haiku] — sdk-builder-4
- **T2**: Claude Agent provider + test [sonnet] — sdk-builder-1, blockedBy: [T1]
- **T3**: Codex provider + test [sonnet] — sdk-builder-2, blockedBy: [T2]
- **T4**: Copilot provider + test [sonnet] — sdk-builder-3, blockedBy: [T3]

Sequential handoff order for builders:
- sdk-builder-4 -> sdk-builder-1 -> sdk-builder-2 -> sdk-builder-3

### Wave 1 Validation

- **V1**: Validate wave 1 [sonnet] — sdk-validator-1, blockedBy: [T1, T2, T3, T4]

### Wave 2 (sequential — 1 builder)

- **T5**: Dockerfile + docker-compose [haiku] — sdk-builder-5, blockedBy: [V1]

### Wave 2 Validation

- **V2**: Validate wave 2 [haiku] — sdk-validator-2, blockedBy: [T5]

## Dependency Graph

```
Wave 0: Lead installs SDKs
  ↓
Wave 1: T1 → T2 → T3 → T4 → V1
  ↓
Wave 2: T5 → V2
```

## Task Details & Acceptance Criteria

### T0: Install SDKs + Verify Bun Compat (Lead)

Done by lead before spawning team.

1. [ ] `bun add` all three packages succeeds
   - Verification: `cd onyx/api && bun install` exits 0
   - Expected: `api/package.json` dependencies include `@anthropic-ai/claude-agent-sdk`, `@openai/codex-sdk`, `@github/copilot-sdk`
2. [ ] All three SDKs import cleanly under Bun
   - Verification: `cd onyx/api && bun -e "import(...)"` for each
   - Expected: "OK" printed for all three
3. [ ] API shapes are confirmed before implementation
   - Verification: `cd onyx/api && bun -e` checks print callable/class exports for query/Codex/CopilotClient
   - Expected: exported API surface used in T2/T3/T4 is validated before coding

### T1: cli-auth.ts Utility + Router Singleton (sdk-builder-4)

**New files**: `api/src/providers/cli-auth.ts`, `api/src/providers/cli-auth.test.ts`
**Modify**: `api/src/providers/router.ts`

Create a shared utility for checking CLI auth state by file existence. Then update the router to cache subscription provider instances as module-level singletons (currently creates `new` on every `getProvider()` call — wasteful for CLI-based SDKs).

**Reference files**:
- `api/src/providers/router.ts` (current: creates new instances per call)
- `api/src/providers/interface.ts` (ProviderBackend interface)

1. [ ] `cli-auth.ts` exports `checkCliAuth(authPath: string): Promise<ProviderAuthStatus>`
   - Verification: `cd onyx && bun test api/src/providers/cli-auth.test.ts`
   - Expected: tests pass for existing file (authenticated=true), missing file (authenticated=false), error case
2. [ ] `ProviderAuthStatus` interface has `available`, `authenticated`, `error?` fields
   - Verification: Read `cli-auth.ts` for type definition
   - Expected: all three fields present
3. [ ] `ProviderAuthStatus` state matrix is implemented and tested
   - Verification: `cd onyx && bun test api/src/providers/cli-auth.test.ts`
   - Expected:
     - CLI unavailable => `available: false`, `authenticated: false`, `error` set
     - CLI available but auth marker missing => `available: true`, `authenticated: false`
     - Auth marker present => `available: true`, `authenticated: true`
4. [ ] Provider auth path contract is defined in `cli-auth.ts`
   - Verification: Read `cli-auth.ts` constants
   - Expected exact paths:
     - Claude: `/root/.claude/.credentials.json`
     - Codex: `/root/.config/codex/auth.json`
     - Copilot: `/root/.config/github-copilot/hosts.json`
5. [ ] Router caches subscription provider instances as module-level singletons
   - Verification: Read `router.ts` — `getProvider()` uses `??=` pattern for subscription providers
   - Expected: `ClaudeAgentProvider`, `CodexProvider`, `CopilotProvider` created at most once
6. [ ] Existing router tests still pass
   - Verification: `cd onyx && bun test api/src/providers/router.test.ts`
   - Expected: 11 tests pass, 0 failures

### T2: Claude Agent Provider + Test (sdk-builder-1)

**Rewrite**: `api/src/providers/claude-agent.ts`
**New file**: `api/src/providers/claude-agent.test.ts`

Replace the stub with a working implementation using `@anthropic-ai/claude-agent-sdk`. Follow the exact response-mapping patterns from `api/src/providers/vercel-ai.ts`.

**Reference files**:
- `api/src/providers/vercel-ai.ts` — reference implementation (response format, `makeId()`, `convertMessages()`)
- `api/src/providers/vercel-ai.test.ts` — test pattern (mock.module, test structure)
- `api/src/providers/interface.ts` — ProviderBackend interface contract

**SDK API** (from `@anthropic-ai/claude-agent-sdk`):
```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
// query({ prompt, options: { model, systemPrompt, allowedTools, maxTurns } })
// Returns: AsyncIterable of messages (filter for "result" type)
```

**Implementation rules**:
- `allowedTools: []` — no tools, pure completion
- `maxTurns: 1` — single turn, no agentic loop
- Extract system message from `messages[]`, pass via `systemPrompt` option
- Reuse `convertMessages()` behavior from `api/src/providers/vercel-ai.ts` exactly for message-to-prompt serialization
- `complete()`: collect final result text, return `ChatCompletionResponse`
- `stream()`: yield text delta messages as `ChatCompletionChunk`, end with `finish_reason: "stop"`
- `listModels()`: return `["claude-opus-4-6", "claude-sonnet-4", "claude-haiku-3-5"]`
- Usage tokens: return 0s (subscription, not per-token billing)
- Reuse `makeId()` pattern from vercel-ai.ts
- `checkAuth()` must use shared `cli-auth.ts` utility with Claude auth path constant

1. [ ] `ClaudeAgentProvider` implements `ProviderBackend` without throwing
   - Verification: `cd onyx && bun test api/src/providers/claude-agent.test.ts`
   - Expected: all tests pass
2. [ ] `complete()` returns valid `ChatCompletionResponse` with `object: "chat.completion"`, `finish_reason: "stop"`
   - Verification: test asserts response shape
   - Expected: id, object, created, model, choices, usage all present
3. [ ] `stream()` yields `ChatCompletionChunk` objects ending with `finish_reason: "stop"`
   - Verification: test collects all chunks and checks last one
   - Expected: last chunk has `finish_reason: "stop"`, earlier chunks have `null`
4. [ ] SDK called with `allowedTools: []` and `maxTurns: 1`
   - Verification: test mock verifies `query()` called with correct options
   - Expected: mock called once with options containing `allowedTools: []`, `maxTurns: 1`
5. [ ] System message extracted and passed as `systemPrompt`
   - Verification: test sends messages with system role, mock verifies systemPrompt option
   - Expected: systemPrompt matches the system message content
6. [ ] `listModels()` returns static Claude model list
   - Verification: test asserts array contents
   - Expected: contains `claude-opus-4-6`
7. [ ] Biome passes on new files
   - Verification: `cd onyx && npx @biomejs/biome check api/src/providers/claude-agent.ts api/src/providers/claude-agent.test.ts`
   - Expected: exit 0
8. [ ] `checkAuth()` uses shared auth utility
   - Verification: test mocks `checkCliAuth()` and verifies Claude auth path constant
   - Expected: shared utility called exactly once per auth check

### T3: Codex Provider + Test (sdk-builder-2)

**Rewrite**: `api/src/providers/codex.ts`
**New file**: `api/src/providers/codex.test.ts`

Replace the stub with a working implementation using `@openai/codex-sdk`.

**Reference files**: same as T2

**SDK API** (from `@openai/codex-sdk`):
```typescript
import { Codex } from "@openai/codex-sdk";
// const codex = new Codex();
// const thread = codex.startThread();
// const result = await thread.run(prompt);
// For streaming: const { events } = await thread.runStreamed(prompt);
```

**Implementation rules**:
- Lazy-init singleton `Codex` instance (reuse across requests)
- `complete()`: `startThread()` → `thread.run(prompt)` → extract text result → `ChatCompletionResponse`
- `stream()`: try `thread.runStreamed()` if available; if not, fall back to complete-then-yield-single-chunk
- `listModels()`: return `["codex-mini", "gpt-4o", "o3", "o4-mini"]`
- Handle `thread.run()` return type defensively (may be string or object)
- Reuse `convertMessages()` behavior from `api/src/providers/vercel-ai.ts` exactly for message-to-prompt serialization
- `checkAuth()` must use shared `cli-auth.ts` utility with Codex auth path constant

1. [ ] `CodexProvider` implements `ProviderBackend` without throwing
   - Verification: `cd onyx && bun test api/src/providers/codex.test.ts`
   - Expected: all tests pass
2. [ ] `complete()` returns valid `ChatCompletionResponse`
   - Verification: test asserts response shape
   - Expected: standard OpenAI-compatible response
3. [ ] `stream()` yields valid chunks ending with `finish_reason: "stop"`
   - Verification: test collects chunks
   - Expected: at least 2 chunks (content + stop)
4. [ ] Codex instance is lazily created (not on import)
   - Verification: test verifies `Codex` constructor not called until first `complete()`
   - Expected: mock constructor called exactly once across multiple calls
5. [ ] `listModels()` returns static Codex model list
   - Verification: test asserts array
   - Expected: contains `codex-mini`
6. [ ] Biome passes
   - Verification: `cd onyx && npx @biomejs/biome check api/src/providers/codex.ts api/src/providers/codex.test.ts`
   - Expected: exit 0
7. [ ] `checkAuth()` uses shared auth utility
   - Verification: test mocks `checkCliAuth()` and verifies Codex auth path constant
   - Expected: shared utility called exactly once per auth check

### T4: Copilot Provider + Test (sdk-builder-3)

**Rewrite**: `api/src/providers/copilot.ts`
**New file**: `api/src/providers/copilot.test.ts`

Replace the stub with a working implementation using `@github/copilot-sdk`. This is the most complex due to event-based streaming.

**Reference files**: same as T2

**SDK API** (from `@github/copilot-sdk`):
```typescript
import { CopilotClient } from "@github/copilot-sdk";
// const client = new CopilotClient();
// const session = await client.createSession({ model, streaming: false });
// const response = await session.sendAndWait({ prompt });
// For streaming: session.on("assistant.message_delta", (event) => ...)
```

**Implementation rules**:
- Lazy-init singleton `CopilotClient` (persistent CLI process)
- `complete()`: `createSession({ model, streaming: false })` → `sendAndWait({ prompt })` → `ChatCompletionResponse`
- `stream()`: `createSession({ model, streaming: true })`, bridge `assistant.message_delta` events to `AsyncGenerator<ChatCompletionChunk>` via push/pull queue pattern
- `excludedTools: ["Edit", "Write", "Bash", "MultiEdit"]` — disable mutation tools
- `listModels()`: return `["gpt-4.1", "gpt-4o", "claude-sonnet-4", "o3"]`
- Reuse `convertMessages()` behavior from `api/src/providers/vercel-ai.ts` exactly for message-to-prompt serialization
- `checkAuth()` must use shared `cli-auth.ts` utility with Copilot auth path constant

1. [ ] `CopilotProvider` implements `ProviderBackend` without throwing
   - Verification: `cd onyx && bun test api/src/providers/copilot.test.ts`
   - Expected: all tests pass
2. [ ] `complete()` returns valid `ChatCompletionResponse`
   - Verification: test asserts response shape
   - Expected: standard OpenAI-compatible response
3. [ ] `stream()` yields valid chunks via event bridge, ending with `finish_reason: "stop"`
   - Verification: test mocks `assistant.message_delta` events
   - Expected: chunks arrive in order, last has `finish_reason: "stop"`
4. [ ] CopilotClient is lazily created and reused
   - Verification: test verifies constructor called once
   - Expected: singleton pattern works
5. [ ] Mutation tools excluded from sessions
   - Verification: test mock verifies `createSession()` called with `excludedTools`
   - Expected: excludedTools contains `["Edit", "Write", "Bash", "MultiEdit"]`
6. [ ] `listModels()` returns static Copilot model list
   - Verification: test asserts array
   - Expected: contains `gpt-4.1`
7. [ ] Biome passes
   - Verification: `cd onyx && npx @biomejs/biome check api/src/providers/copilot.ts api/src/providers/copilot.test.ts`
   - Expected: exit 0
8. [ ] `checkAuth()` uses shared auth utility
   - Verification: test mocks `checkCliAuth()` and verifies Copilot auth path constant
   - Expected: shared utility called exactly once per auth check

### T5: Dockerfile + docker-compose (sdk-builder-5)

**Modify**: `onyx/Dockerfile`, `onyx/docker-compose.yml`

**Dockerfile changes**:
- Add Node.js installation to production stage (`apk add --no-cache nodejs npm`)
- Install three CLI packages globally (`npm install -g @anthropic-ai/claude-code @openai/codex @github/copilot-cli`)
- Keep existing multi-stage structure intact

**docker-compose.yml changes**:
- Add auth volume mounts to `onyx-api` service:
  - `claude-auth:/root/.claude`
  - `codex-auth:/root/.config/codex`
  - `copilot-auth:/root/.config/github-copilot`
- Add volume definitions to `volumes:` section

1. [ ] Dockerfile production stage installs Node.js
   - Verification: Read `onyx/Dockerfile`, confirm `apk add --no-cache nodejs npm`
   - Expected: present in production stage
2. [ ] Dockerfile installs all three CLI packages
   - Verification: Read `onyx/Dockerfile`, confirm `npm install -g` with all three packages
   - Expected exact packages: `@anthropic-ai/claude-code`, `@openai/codex`, `@github/copilot-cli`
3. [ ] docker-compose.yml has auth volume mounts on onyx-api
   - Verification: Read `onyx/docker-compose.yml`, check volumes section
   - Expected: claude-auth, codex-auth, copilot-auth mounted
4. [ ] docker-compose.yml declares named volumes
   - Verification: Read `onyx/docker-compose.yml` volumes section
   - Expected: claude-auth, codex-auth, copilot-auth defined
5. [ ] Existing Dockerfile structure preserved (multi-stage: base → install → build → production)
   - Verification: Read `onyx/Dockerfile`
   - Expected: 4 stages intact
6. [ ] `docker compose config` validates without errors
   - Verification: `cd onyx && docker compose config --quiet`
   - Expected: exit 0

### V1: Wave 1 Validation (sdk-validator-1)

1. [ ] `bun test api/src/providers/` — all provider tests pass (existing + new)
   - Verification: `cd onyx && bun test api/src/providers/`
   - Expected: 0 failures, includes claude-agent, codex, copilot, vercel-ai, router, failover tests
2. [ ] `bun test` — full suite still passes (baseline: 398+ tests, 0 failures)
   - Verification: `cd onyx && bun test`
   - Expected: 0 failures, test count increased by new test files
3. [ ] `npx @biomejs/biome check .` — strict clean run
   - Verification: `cd onyx && npx @biomejs/biome check .`
   - Expected: 0 errors, 0 warnings, exit 0
4. [ ] No stub "throw" statements remain in claude-agent.ts, codex.ts, copilot.ts
   - Verification: `cd onyx && grep -r "not yet configured" api/src/providers/`
   - Expected: no matches
5. [ ] Router singleton pattern verified
   - Verification: Read router.ts, confirm `??=` or equivalent caching
   - Expected: subscription providers instantiated at most once
6. [ ] Validator output names key provider test files checked
   - Verification: validator report includes claude-agent, codex, copilot, router, failover test files
   - Expected: explicit mention of key files in validation notes

### V2: Wave 2 Validation (sdk-validator-2)

1. [ ] Dockerfile has correct structure
   - Verification: Read `onyx/Dockerfile`
   - Expected: multi-stage with Node.js + CLI installs in production stage
2. [ ] docker-compose.yml validates
   - Verification: `cd onyx && docker compose config --quiet`
   - Expected: exit 0
3. [ ] Auth volumes correctly defined
   - Verification: Read `onyx/docker-compose.yml`
   - Expected: 3 new named volumes for CLI auth state

## Runtime Smoke Validation (Development)

After V2, run manual runtime checks with real CLI auth state mounted:

1. [ ] Deploy updated stack in development
   - Verification: `cd onyx && docker compose up -d --build`
   - Expected: onyx-api and onyx-frontend healthy
2. [ ] Claude subscription smoke test succeeds with mounted auth
   - Verification: call provider route/model using `claude-subscription/...`
   - Expected: non-error completion response, `finish_reason: "stop"`
3. [ ] Codex subscription smoke test succeeds with mounted auth
   - Verification: call provider route/model using `codex/...` or `chatgpt/...`
   - Expected: non-error completion response, `finish_reason: "stop"`
4. [ ] Copilot subscription smoke test succeeds with mounted auth
   - Verification: call provider route/model using `copilot/...`
   - Expected: non-error completion response, `finish_reason: "stop"`

## Completion Criteria (Development)

Use practical go/no-go in development: if changes look good, deploy and confirm via smoke tests.

- Required before completion:
  - T0-T5 complete
  - V1 and V2 complete
  - Runtime Smoke Validation complete
  - No "not yet configured" stubs remain in subscription providers
