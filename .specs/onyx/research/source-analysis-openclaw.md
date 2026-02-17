# OpenClaw Source Code Analysis

**Repository:** https://github.com/openclaw/openclaw
**Date:** 2026-02-16
**Codebase size:** ~6,468 files, TypeScript monorepo
**Focus:** Agent loop, memory system, skills, heartbeat/cron, providers, tools, subagents

## Executive Summary

OpenClaw is a full-featured AI assistant platform — the original project that PicoClaw, NanoClaw, and Nanobot are all derived from or inspired by. It is **orders of magnitude larger** than the other three (~430,000+ lines vs ~500-4,000 lines). The architecture delegates the core ReAct loop to an SDK (`@mariozechner/pi-coding-agent`) and wraps it with extensive resilience infrastructure.

**Key characteristics:**
- **SDK-delegated ReAct loop**: Inner loop is entirely handled by `session.prompt()` from `@mariozechner/pi-coding-agent`
- **Two-layer resilience**: Outer loop handles auth rotation, model fallback, context overflow recovery, compaction
- **Sophisticated memory**: SQLite + vector embeddings (OpenAI/Gemini/Voyage/local), hybrid search (vector + BM25), embedding cache, graceful FTS-only degradation
- **Dual proactive systems**: Heartbeat (ambient monitoring in main session) + Cron (precise scheduled jobs in main or isolated sessions)
- **53 skills**: Progressive loading with eligibility gates, installation specs, live watching
- **Multi-layer tool policy**: 7+ policy layers can block any tool
- **Subagent system**: Depth-limited spawning, cross-process registry, announce flow

---

## 1. Main Agent Loop (ReAct Implementation)

### Two-Layer Architecture

OpenClaw's agent loop is split into two distinct layers:

| Layer | Location | Responsibility |
|-------|----------|---------------|
| **Inner (ReAct)** | `@mariozechner/pi-coding-agent` SDK | message → LLM → tool execution → repeat |
| **Outer (Resilience)** | `src/agents/pi-embedded-runner/run/attempt.ts` | Auth rotation, model fallback, compaction, timeouts |

### Inner Loop (SDK-Delegated)

**File:** `src/agents/pi-embedded-runner/run/attempt.ts` (lines 997-1001)

```typescript
// The ENTIRE ReAct loop happens inside this single await
if (imageResult.images.length > 0) {
  await abortable(activeSession.prompt(effectivePrompt, { images: imageResult.images }));
} else {
  await abortable(activeSession.prompt(effectivePrompt));
}
```

The SDK's `session.prompt()`:
- Sends user message to LLM
- Receives response (text and/or tool calls)
- Executes tool calls (tools were registered at session creation)
- Feeds results back to LLM
- Repeats until LLM responds with text only, or error/abort

**No explicit max iteration limit.** The only constraints are:
- Timeout (default 10 minutes)
- Tool loop detector (warning at 10, critical at 20-30 identical calls)
- LLM deciding to stop calling tools

**No reflection prompts between rounds.** The LLM sees its own tool results naturally via conversation history.

**Tool execution is SDK-controlled.** OpenClaw only observes events — it does not control sequential vs parallel execution.

### Event-Driven Observation

**File:** `src/agents/pi-embedded-subscribe.handlers.ts` (lines 22-66)

```typescript
export function createEmbeddedPiSessionEventHandler(ctx) {
  return (evt) => {
    switch (evt.type) {
      case "message_start":           // LLM starts generating
      case "message_update":          // Streaming delta
      case "message_end":             // LLM finished one response
      case "tool_execution_start":    // Tool begins
      case "tool_execution_update":   // Tool partial output
      case "tool_execution_end":      // Tool completed
      case "agent_start":             // Agent loop started
      case "auto_compaction_start":   // SDK triggered compaction
      case "auto_compaction_end":     // Compaction finished
      case "agent_end":               // Agent loop exited
    }
  };
}
```

### Outer Resilience Loop

**File:** `src/agents/pi-embedded-runner/run.ts` (lines 443-1034)

A `while (true)` loop with retry triggers:

| Trigger | Description |
|---------|-------------|
| Context overflow + compaction | Up to 3 compaction attempts |
| Tool result truncation | Truncates oversized tool results (>30% of context or >400K chars) |
| Auth profile rotation | Rotates to next auth profile on failover errors |
| Thinking level fallback | Retries with lower thinking level if unsupported |

Exit conditions: context overflow exhausted, role ordering error, image size error, non-retryable error, successful completion, timeout.

### Tool Loop Detection

**File:** `src/agents/tool-loop-detection.ts`

Sliding window of last 30 tool calls:

| Detector | Warning (10+) | Critical (20+) | Circuit Breaker (30) |
|----------|--------------|-----------------|---------------------|
| `generic_repeat` | Same tool+args 10x | — | — |
| `known_poll_no_progress` | Polling tool with identical results 10x | 20x, blocks session | — |
| `ping_pong` | Alternating between two tool calls 10x | 20x, blocks session | — |
| `global_circuit_breaker` | — | — | Any tool 30+ no-progress repeats |

### Model Fallback

**File:** `src/agents/model-fallback.ts` (lines 265-396)

`runWithModelFallback()`:
1. Resolves list of model candidates (primary + configured fallbacks)
2. Iterates through candidates sequentially
3. On `FailoverError`, moves to next candidate
4. On context overflow errors, rethrows immediately (don't try smaller models)
5. Skips candidates whose auth profiles are all in cooldown

### Timeout and Context Window

- **Default timeout:** 600 seconds (10 minutes)
- **Context window hard minimum:** 16,000 tokens
- **Context window warning:** 32,000 tokens
- **Default context:** 200,000 tokens

---

## 2. Memory System

### Architecture

Two independent backends implementing the same `MemorySearchManager` interface:

| Backend | Class | Description |
|---------|-------|-------------|
| **builtin** | `MemoryIndexManager` | SQLite + embeddings (OpenAI/Gemini/Voyage/local) |
| **qmd** | `QmdMemoryManager` | External `qmd` CLI with its own index |

A `FallbackMemoryManager` wraps QMD and falls back to builtin if QMD fails.

### SQLite Schema

**File:** `src/memory/memory-schema.ts` (lines 1-96)

```sql
meta (key, value)                    -- Model/provider/chunking config
files (path, source, hash, mtime)    -- Tracked files
chunks (id, path, source, start_line, end_line, hash, model, text, embedding, updated_at)
embedding_cache (provider, model, provider_key, hash, embedding, dims, updated_at)
chunks_fts                           -- FTS5 full-text search
chunks_vec                           -- sqlite-vec vector similarity
```

### File Sources

| Source | Files Indexed |
|--------|--------------|
| `"memory"` | `MEMORY.md`, `memory.md`, `memory/**/*.md`, `extraPaths` |
| `"sessions"` | `*.jsonl` session transcripts |

**Disk files are source of truth.** SQLite is a derived cache. Files are hashed; unchanged files are skipped. Stale entries are deleted.

### Chunking

**File:** `src/memory/internal.ts` (lines 166-247)

- Default chunk size: 400 tokens (~1600 chars)
- Default overlap: 80 tokens (~320 chars)
- Session JSONL flattened to `"User: ..." / "Assistant: ..."` text before chunking
- Line number mappings preserved for citation

### Embedding Providers

| Provider | Default Model | Fallback |
|----------|--------------|----------|
| `openai` | `text-embedding-3-small` | — |
| `gemini` | `gemini-embedding-001` | — |
| `voyage` | `voyage-4-large` | — |
| `local` | `embeddinggemma-300m-qat-Q8_0.gguf` | — |
| `auto` | Try local → openai → gemini → voyage | FTS-only mode |

**Graceful degradation:** Works without any embedding provider (FTS-only mode), without sqlite-vec (brute-force cosine in JS), without QMD (builtin fallback).

### Hybrid Search

**File:** `src/memory/hybrid.ts` (lines 51-149)

```
search(query)
  → searchKeyword (FTS5 BM25)
  → searchVector (cosine similarity via sqlite-vec)
  → mergeHybridResults: score = 0.7 * vectorScore + 0.3 * textScore
  → optional: temporal decay (exp decay, 30-day half-life)
  → optional: MMR re-ranking (diversity via Jaccard similarity)
  → filter by minScore (0.35), limit to maxResults (6)
```

### Embedding Cache

Before calling embedding API, chunk hashes checked against `embedding_cache` table. Keyed by `(provider, model, provider_key, hash)`. LRU eviction when max entries exceeded.

### Sync Triggers

| Trigger | Description |
|---------|-------------|
| File watcher | Chokidar watches memory files |
| Search | Syncs before search if dirty |
| Session start | Syncs on new session |
| Interval | Periodic sync (disabled by default) |
| Session delta | After N bytes/messages of change |

### Atomic Reindex

Full reindex uses temp-database-then-swap pattern:
1. Create temp SQLite DB
2. Seed embedding cache from original
3. Index all files into temp DB
4. Close both, swap file paths
5. Reopen new DB

### Bootstrap / Personality Files

**File:** `src/agents/workspace.ts` (lines 23-31)

Loaded directly into system prompt (separate from memory search):

| File | Purpose |
|------|---------|
| `AGENTS.md` | Agent behavior instructions |
| `SOUL.md` | Personality/character definition |
| `TOOLS.md` | Tool usage guidelines |
| `IDENTITY.md` | Identity information |
| `USER.md` | User preferences |
| `HEARTBEAT.md` | Heartbeat configuration |
| `BOOTSTRAP.md` | General bootstrap instructions |
| `MEMORY.md` / `memory.md` | Memory (also indexed for search) |

### Key Defaults

| Setting | Default |
|---------|---------|
| Chunk tokens | 400 |
| Max results | 6 |
| Min score | 0.35 |
| Vector weight | 0.7 |
| Text weight | 0.3 |
| MMR | disabled |
| Temporal decay | disabled |
| Sources | `["memory"]` (sessions opt-in) |

---

## 3. Skills System

### Skill File Format

YAML frontmatter + Markdown content:

```yaml
---
name: github
description: "Interact with GitHub using the `gh` CLI..."
metadata:
  openclaw:
    emoji: "..."
    requires: { bins: ["gh"] }
    install: [{ id: "brew", kind: "brew", formula: "gh", bins: ["gh"] }]
---
# GitHub Skill
[Usage instructions, examples...]
```

**Key fields:** `name`, `description`, `requires` (bins/env/config), `install` (brew/node/go/uv/download), `always`, `user-invocable`, `disable-model-invocation`, `allowed-tools`

### Six Discovery Sources (ascending precedence)

| Priority | Source | Directory |
|----------|--------|-----------|
| 1 (lowest) | extra | Config `skills.load.extraDirs` |
| 2 | bundled | `<package>/skills/` |
| 3 | managed | `~/.openclaw/skills/` |
| 4 | agents-personal | `~/.agents/skills/` |
| 5 | agents-project | `<workspace>/.agents/skills/` |
| 6 (highest) | workspace | `<workspace>/skills/` |

Workspace skills with the same name as bundled skills completely replace them.

### Safety Limits

- Max candidates per root: 300
- Max skills loaded per source: 200
- Max skills in prompt: 150
- Max skills prompt chars: 30,000
- Max skill file bytes: 256KB

### Eligibility Gates

**File:** `src/agents/skills/config.ts` (lines 69-146)

Cascading checks: explicit disable → bundled allowlist → OS filter → `always: true` bypass → required binaries → any binaries → required env vars → required config paths

### Progressive Loading

Skills are **NOT lazy-loaded** like PicoClaw/Nanobot. All eligible SKILL.md files are read into memory during snapshot construction. However, limits apply:
- File size cap (256KB)
- Count limit (150 in prompt)
- Character limit (30K chars) with binary search truncation

### Live Watching

Uses `chokidar` to watch SKILL.md files. Debounced changes bump version counter, trigger snapshot rebuilds.

---

## 4. Heartbeat / Cron / Proactive Behavior

### Two Distinct Systems

| System | Purpose | Session |
|--------|---------|---------|
| **Heartbeat** | Periodic ambient awareness (inbox, calendar, monitoring) | Main session |
| **Cron** | Precise scheduled jobs | Main or isolated session |

They integrate tightly: cron can trigger heartbeat, heartbeat processes cron events.

### Heartbeat

**File:** `src/infra/heartbeat-runner.ts` (lines 437-1038)

**Execution flow:**
1. Timer fires (default 30 min interval)
2. Check active hours window
3. Check if main queue is empty (skip if busy)
4. Read `HEARTBEAT.md` — if empty (only headers/comments), skip unless triggered by cron
5. Run full agent turn with heartbeat prompt
6. Process response:
   - **HEARTBEAT_OK**: Strip token, prune transcript, restore `updatedAt`
   - **Alert content**: Deliver to target channel (deduplicated within 24h)

**Heartbeat prompt:**
```typescript
"Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. " +
"Do not infer or repeat old tasks from prior chats. " +
"If nothing needs attention, reply HEARTBEAT_OK."
```

**Critical design pattern — Transcript Pruning:**

```typescript
// When HEARTBEAT_OK, truncate transcript back to pre-heartbeat size
if (stat.size > preHeartbeatSize) {
  await fs.truncate(transcriptPath, preHeartbeatSize);
}
```

HEARTBEAT_OK turns are **completely removed from the transcript** to prevent context pollution from zero-information exchanges. The session's `updatedAt` is also restored so idle expiry works correctly.

**Wake scheduling** (`heartbeat-wake.ts`):
- Coalescing timer (250ms window)
- Priority levels: retry(0) < interval(1) < default(2) < action(3)
- Retries after 1 second if main queue is busy

### Cron

**File:** `src/cron/service/` (modular: ops, timer, jobs, store, locked)

**Schedule types:**
```typescript
type CronSchedule =
  | { kind: "at"; at: string }              // One-shot at absolute time
  | { kind: "every"; everyMs: number }      // Fixed interval
  | { kind: "cron"; expr: string; tz?: string }  // 5-field cron expression
```

**Session targets:**
- `"main"` — Injects system event text into main session queue; heartbeat picks it up
- `"isolated"` — Full agent turn in dedicated `cron:<jobId>` session

**Wake modes:**
- `"next-heartbeat"` — Wait for natural heartbeat tick
- `"now"` — Run heartbeat immediately (with busy-retry loop, 2 min timeout)

**Timer mechanism:**
- Wakes at least every 60 seconds (`MAX_TIMER_DELAY_MS`)
- Default job timeout: 10 minutes
- Jobs execute sequentially (not parallel)
- Concurrency guard: if timer fires while job running, re-arms for 60s later

**Error backoff:**
```typescript
const ERROR_BACKOFF_SCHEDULE_MS = [
  30_000,       // 1st error →  30s
  60_000,       // 2nd        →  1 min
  5 * 60_000,   // 3rd        →  5 min
  15 * 60_000,  // 4th        → 15 min
  60 * 60_000,  // 5th+       → 60 min
];
```

**Spin-loop prevention:**
- `MIN_REFIRE_GAP_MS` (2 seconds) between consecutive fires
- Schedule computation advances to next second
- Auto-disable after 3 consecutive schedule errors

**Persistence:** `jobs.json` with atomic writes (temp file + rename). Self-healing migrations on every load. Append-only JSONL run log per job (pruned at 2MB/2000 lines).

**Recovery after restart:** Clears stale `runningAtMs` markers, runs missed jobs, recomputes next-run times, re-arms timer. One-shot jobs with terminal status are NOT re-fired.

### Isolated Agent Execution

**File:** `src/cron/isolated-agent/run.ts` (~750 lines)

For `sessionTarget: "isolated"`:
1. Resolve agent config, model, workspace
2. Create per-run sub-session (`cron:<jobId>:run:<uuid>`)
3. Security: external hook content wrapped with prompt injection boundaries
4. Execute via `runEmbeddedPiAgent` with model fallback
5. Wait for descendant subagent summaries if needed
6. Deliver result or suppress if HEARTBEAT_OK

**Session reaper:** Prunes completed isolated sessions after 24 hours, runs at most every 5 minutes.

### Cron-Heartbeat Integration

- Cron `wakeMode: "now"` calls `runHeartbeatOnce` directly
- Cron `wakeMode: "next-heartbeat"` schedules for next natural tick
- Isolated job summaries posted to main session also trigger heartbeat
- Heartbeat checks for pending cron system events and processes them
- Both share the same `HEARTBEAT_OK` token and stripping logic

---

## 5. Provider System

### Model Configuration

**File:** `src/agents/models-config.ts`

Writes `models.json` to agent directory:
1. Resolve implicit providers (auto-detected from env/auth)
2. Resolve Bedrock and Copilot providers
3. Merge explicit config over implicit
4. Atomic write with 0600 permissions

### Auth Profiles

Three credential types: `ApiKeyCredential`, `TokenCredential`, `OAuthCredential`

Tracks per-agent ordering, `lastGood` profile per context, usage stats, cooldowns, failure counts. Supports round-robin rotation with cooldown-based exclusion.

### CLI Backends

Supports external CLI tools (Claude CLI, Codex CLI) as backends with model alias mapping.

---

## 6. Tool System

### Tool Assembly

**File:** `src/agents/pi-tools.ts` (lines 135-464)

Assembled from:
1. Base coding tools from SDK (read, write, edit, glob, grep)
2. Sandboxed variants when sandbox active
3. Exec/bash tool with security config
4. Process tool for background processes
5. Apply-patch tool (OpenAI-specific)
6. Channel tools from plugins
7. OpenClaw tools (browser, web, message, memory, sessions, image, TTS, cron)

### Multi-Layer Tool Policy

7+ policy layers, any can block a tool:
1. Owner-only policy
2. Profile-level policy
3. Provider-profile policy
4. Global policy + provider policy
5. Agent-level policy + provider policy
6. Group policy (channel-level)
7. Sandbox policy
8. Subagent depth policy

---

## 7. Subagent System

### Spawning

**File:** `src/agents/subagent-spawn.ts` (lines 81-322)

Guards:
- Depth limit: `callerDepth >= maxSpawnDepth` (default 1)
- Active children: `maxChildrenPerAgent` (default 5)
- Agent allowlist: target must be in `subagents.allowAgents`

Model cascade (5 levels): explicit override → agent subagent config → global subagent config → global default → runtime default.

### Registry

**File:** `src/agents/subagent-registry.ts`

In-memory `Map` with disk persistence for cross-process coordination:
- Lifecycle tracking via event stream
- Announce flow on completion (3 retries, 5 min expiry)
- Session cleanup configurable (`"delete"` or `"keep"`)
- Archive sweeper every 60 seconds
- BFS traversal for descendant counting

---

## 8. Comparison to PicoClaw / NanoClaw / Nanobot

| Feature | OpenClaw | PicoClaw | NanoClaw | Nanobot |
|---------|----------|----------|----------|---------|
| **Loop** | SDK `session.prompt()` | Custom ReAct (Go) | SDK `query()` | Custom ReAct (Python) |
| **Max iterations** | None (timeout only) | 10 | None (SDK) | 20 |
| **Reflection prompt** | None | None | None | Yes ("Reflect on results") |
| **Memory** | SQLite + vector + hybrid search | MEMORY.md + daily notes | CLAUDE.md + SDK sessions | MEMORY.md + HISTORY.md |
| **Memory search** | Hybrid (vector 0.7 + BM25 0.3) | Full file in context | Full file in context | grep on HISTORY.md |
| **Skills** | 53, all loaded with limits | XML summary + lazy load | SDK auto-discovery | XML summary + lazy load |
| **Proactive** | Heartbeat + Cron (dual system) | Heartbeat + cron | Scheduled tasks only | Heartbeat + cron |
| **Heartbeat transcript** | Pruned on HEARTBEAT_OK | Kept | N/A | Kept |
| **Providers** | SDK + auth profiles + fallback | Single | Anthropic only (SDK) | 15+ via registry |
| **Subagents** | Depth-limited, cross-process registry | Fire-and-forget | SDK agent teams | Background with announce |
| **Tool policy** | 7+ layers | None | SDK-managed | Workspace restriction |
| **Codebase** | ~430,000+ lines | ~10K lines | ~1,000 lines | ~4,000 lines |

---

## 9. Recommendations for Onyx

### ADOPT (Proven Patterns Worth Taking)

1. **Heartbeat transcript pruning** — Remove HEARTBEAT_OK turns from transcript. Prevents context pollution from zero-information exchanges. None of the other 3 projects do this.
2. **Hybrid memory search** — Vector + BM25 with weighted merge. Onyx already has SurrealDB with both capabilities from menos. OpenClaw's defaults (0.7 vector, 0.3 text, minScore 0.35, maxResults 6) are battle-tested.
3. **Embedding cache** — Avoid re-embedding unchanged content. Keyed by content hash + provider config.
4. **Dual proactive system** — Heartbeat for ambient monitoring + Cron for precise scheduling. Clean separation of concerns. Cron can trigger heartbeat wake for immediate processing.
5. **Graceful degradation** — Memory works without embeddings (FTS-only), without vector extensions (brute-force), without external tools (builtin fallback).
6. **Tool loop detection** — Sliding window pattern detection prevents infinite tool loops. More sophisticated than a simple iteration cap.
7. **Atomic reindex** — Temp-database-then-swap prevents index corruption during reindexing.

### ADAPT (Take the Concept, Simplify)

1. **Skills loading** — OpenClaw loads ALL eligible skills upfront (53 skills, 30K chars limit). For Onyx MVP with fewer skills, progressive lazy loading (PicoClaw/Nanobot style) is simpler and sufficient.
2. **Auth profiles** — OpenClaw has full OAuth, round-robin, cooldown tracking. Onyx Phase 1 needs just API keys + optional bearer token. Take the concept of profile rotation for Phase 2.
3. **Model fallback** — OpenClaw's 5-level cascade is overkill for MVP. Start with single fallback model (Nanobot-style), graduate to cascade in Phase 2.
4. **Cron error backoff** — The 30s/1m/5m/15m/60m schedule is good. But auto-disable after 3 schedule errors may be too aggressive for MVP. Start with logging.
5. **Tool policy** — 7+ layers is complexity theater for single-user MVP. Start with workspace restriction (Nanobot-style), add layers as needed.

### AVOID

1. **SDK-delegated loop** — OpenClaw delegates to `@mariozechner/pi-coding-agent`. Onyx needs to work with 4 different SDK backends (Vercel AI SDK, Claude Agent SDK, Copilot SDK, Codex SDK). A custom loop (Nanobot-style) is more portable.
2. **No max iteration limit** — OpenClaw relies on timeout + loop detection instead of an iteration cap. This is risky for cost control. Keep maxTurns (Nanobot/PicoClaw consensus).
3. **Full skill loading** — Loading 53 skills (30K chars) into every prompt is expensive. Stick with progressive lazy loading.
4. **Cross-process subagent registry** — Disk persistence for multi-process coordination is unnecessary for Onyx's single-process architecture.
5. **7-layer tool policy pipeline** — Single-user MVP doesn't need owner, profile, provider, global, agent, group, sandbox, and subagent policy layers.

---

## 10. Critical Files for Onyx Reference

### Must Read
1. `src/agents/pi-embedded-runner/run/attempt.ts` — Outer resilience loop, auth rotation, compaction
2. `src/memory/manager.ts` — Memory index manager, search, sync
3. `src/memory/hybrid.ts` — Hybrid search merge algorithm
4. `src/infra/heartbeat-runner.ts` — Heartbeat execution, transcript pruning, HEARTBEAT_OK handling
5. `src/cron/service/timer.ts` — Cron timer, job execution, error backoff
6. `src/cron/isolated-agent/run.ts` — Isolated agent execution for cron jobs
7. `src/agents/skills/workspace.ts` — Skill discovery, loading, prompt construction
8. `src/agents/tool-loop-detection.ts` — Loop detection patterns

### Can Skip
- Channel implementations (Discord, Telegram, WhatsApp — platform-specific)
- UI code (`ui/`)
- Mobile apps (`apps/android/`, `apps/ios/`)
- Provider-specific files (GitHub Copilot auth, Bedrock discovery — Onyx uses Vercel AI SDK)
- Legacy migration code

---

**End of Analysis**

Generated: 2026-02-16
Analyzed: OpenClaw (github.com/openclaw/openclaw)
Target: Onyx D11/D12 agent architecture
