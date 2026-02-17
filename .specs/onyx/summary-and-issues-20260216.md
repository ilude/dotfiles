# Onyx D11/D12 Architecture Synthesis & Open Issues

**Date:** 2026-02-16
**Sources:** PicoClaw, NanoClaw, Nanobot, OpenClaw source analyses + philosophy alignment review
**Purpose:** Work through open design questions one at a time before updating the PRD

---

## Updated Synthesis (with OpenClaw findings)

### Cross-Project Consensus (4/4 agree)

These patterns appear in all four projects. Strong signal to adopt:

| Pattern | PicoClaw | NanoClaw | Nanobot | OpenClaw |
|---------|----------|----------|---------|----------|
| Message bus (channel→queue→agent→queue→channel) | ✅ | ✅ | ✅ | ✅ |
| Bootstrap personality files (AGENTS.md, SOUL.md, USER.md) | ✅ | ✅ | ✅ | ✅ |
| HEARTBEAT.md as user-editable task list | ✅ | — | ✅ | ✅ |
| HEARTBEAT_OK sentinel for "nothing to do" | ✅ | — | ✅ | ✅ |
| Stateless heartbeat execution (no conversation history) | ✅ | — | ✅ | ✅ |
| Heartbeat reuses main agent loop (not a separate engine) | ✅ | — | ✅ | ✅ |
| Session persistence (JSONL or equivalent) | ✅ | ✅ | ✅ | ✅ |
| Sequential tool execution | ✅ | ✅ | ✅ | ✅ |
| No reflection prompt between tool rounds | ✅ | ✅ | — | ✅ |
| Cron/scheduling alongside heartbeat | ✅ | ✅ | ✅ | ✅ |

### Strong Majority (3/4 agree)

| Pattern | Who does it | Who doesn't | Notes |
|---------|------------|-------------|-------|
| Custom ReAct loop (not SDK-delegated) | PicoClaw, Nanobot, (OpenClaw wraps SDK) | NanoClaw (pure SDK) | OpenClaw delegates inner loop to SDK but wraps with resilience |
| File-based long-term memory (MEMORY.md) | PicoClaw, Nanobot, OpenClaw | NanoClaw (CLAUDE.md) | All use markdown files as memory source of truth |
| Progressive skill loading (summary + read on demand) | PicoClaw, Nanobot | NanoClaw (SDK), OpenClaw (full load) | OpenClaw loads all skills upfront but with char limits |
| Skills with YAML frontmatter | PicoClaw, Nanobot, OpenClaw | NanoClaw (SDK convention) | OpenClaw has richest metadata (requires, install, OS filter) |

### Split Decisions (2/4 or unique)

| Pattern | Who | Notes |
|---------|-----|-------|
| Reflection prompt after tool rounds | Nanobot only (1/4) | "Reflect on the results and decide next steps." |
| ToolResult duality (ForLLM/ForUser/Silent) | PicoClaw only (1/4) | Clean but no one else adopted it |
| Heartbeat transcript pruning on OK | OpenClaw only (1/4) | Removes zero-info exchanges from context |
| Dual proactive system (heartbeat + cron integrated) | OpenClaw only (1/4) | Others have heartbeat OR cron, not tightly integrated |
| Tool loop detection (sliding window) | OpenClaw only (1/4) | More sophisticated than iteration cap |
| Hybrid memory search (vector + BM25) | OpenClaw only (1/4) | Others use file-in-context or grep |
| Embedding cache | OpenClaw only (1/4) | Avoids re-embedding unchanged content |
| Memory consolidation (LLM-based) | Nanobot only (1/4) | Every ~25 messages, 31 lines of code |
| Emergency context compression | PicoClaw only (1/4) | Drop oldest 50% on overflow, retry |
| Max iteration limit on ReAct loop | PicoClaw (10), Nanobot (20) | OpenClaw + NanoClaw rely on timeout only |

---

## Recommended Implementation (Updated)

Based on all 4 source analyses + philosophy review:

### Agent Loop (D11)

**Approach:** Custom ReAct loop (works with all 4 SDK backends)

| Decision | Choice | Source | Rationale |
|----------|--------|--------|-----------|
| Loop type | Custom ReAct | Nanobot/PicoClaw consensus | Works with Vercel AI SDK, Claude Agent SDK, Copilot SDK, Codex SDK |
| Max iterations | 20 | Nanobot default | Safety net for cost control. OpenClaw has none — too risky |
| Reflection prompt | Include | Nanobot (1/4 minority) | 1 line of code, improves multi-step reasoning. Easy to remove if unhelpful |
| Tool execution | Sequential | All 4 agree | No parallel until evidence shows it's needed |
| Context overflow | Emergency compression | PicoClaw | Drop oldest 50%, retry once. Simple safety net |
| Tool loop detection | Sliding window (Phase 2) | OpenClaw | Valuable but adds complexity. Start with maxTurns, add loop detection later |
| Provider failover | Single provider + retry (Phase 1) | Philosophy review | Add fallback model in Phase 2 based on measured failure rates |

### Memory (D11)

**Approach:** MEMORY.md + HISTORY.md + SurrealDB hybrid search

| Decision | Choice | Source | Rationale |
|----------|--------|--------|-----------|
| Long-term memory | MEMORY.md (always in context) | All 4 agree | Consensus pattern |
| History | HISTORY.md (append-only, indexed) | Nanobot | Grep-searchable + SurrealDB vector/BM25 |
| Search | Hybrid (vector + BM25) | OpenClaw | Battle-tested defaults. Onyx already has SurrealDB with both |
| Search defaults | vector 0.7, text 0.3, minScore 0.35, maxResults 6 | OpenClaw | Start with these, tune based on usage |
| Consolidation | LLM-based every ~25 messages | Nanobot | 31 lines of code, proven effective |
| Embedding cache | Yes | OpenClaw | Avoids redundant API calls |
| Write-back | Session end only (MVP) | Philosophy review | Add incremental writes in Phase 2 if sessions crash |
| Degradation | FTS-only when no embeddings | OpenClaw | Works with Ollama local embeddings or no embeddings at all |

### Skills (D11)

**Approach:** Progressive lazy loading with frontmatter

| Decision | Choice | Source | Rationale |
|----------|--------|--------|-----------|
| Loading | XML summary in prompt, read_file for full | PicoClaw/Nanobot (3/4) | Context efficient. OpenClaw's full-load is overkill for MVP |
| Metadata | YAML frontmatter (name, description, requires) | Nanobot/OpenClaw | Requirements checking prevents confusing errors |
| Discovery | workspace → global → builtin | PicoClaw/Nanobot | Simple 3-level hierarchy |
| Installation | Phase 2 | OpenClaw has it | MVP skills are pre-installed |

### Heartbeat / Proactive (D12)

**Approach:** Dual system (heartbeat + cron) with transcript pruning

| Decision | Choice | Source | Rationale |
|----------|--------|--------|-----------|
| Heartbeat | HEARTBEAT.md + timer + stateless execution | PicoClaw/Nanobot/OpenClaw (3/4) | Consensus pattern |
| Transcript pruning | Remove HEARTBEAT_OK turns | OpenClaw (1/4 unique) | Prevents context pollution. Simple truncation. Worth the 10 lines of code |
| Empty detection | Skip if only headers/comments | Nanobot/OpenClaw | Avoids wasting API calls |
| Cron | Separate from heartbeat, can trigger heartbeat wake | OpenClaw | Clean separation. Cron for precise timing, heartbeat for ambient |
| Cron session | `main` (inject into heartbeat) or `isolated` (separate session) | OpenClaw/NanoClaw | Two modes covers all use cases |
| Error backoff | Exponential (30s, 1m, 5m, 15m, 60m) | OpenClaw | Prevents hammering on persistent failures |
| Config | `enabled` + `intervalMs` only (MVP) | Philosophy review | Add activeHours, quietMode in Phase 2 |
| Notifications | Web UI only (MVP) | Philosophy review | Add multi-channel routing in Phase 2 |

### ToolResult Pattern

| Decision | Choice | Source | Rationale |
|----------|--------|--------|-----------|
| ToolResult duality | Adopt ForLLM/ForUser/Silent/Async | PicoClaw (1/4 unique) | Clean pattern despite being minority. Enables silent file reads, async feedback, different formatting |

### Config (Updated)

```json5
{
  "runtime": {
    "maxTurns": 20,              // ReAct iteration limit
    "defaultTimeoutMs": 300000,  // 5 min for any operation
    "memorySearchTopK": 6        // Hybrid search results (OpenClaw default)
  },
  "heartbeat": {
    "enabled": true,
    "intervalMs": 1800000        // 30 min (all 3 heartbeat projects agree)
  },
  "memory": {
    "vectorWeight": 0.7,         // OpenClaw default
    "textWeight": 0.3,           // OpenClaw default
    "minScore": 0.35,            // OpenClaw default
    "consolidationWindow": 25    // Nanobot default (messages before consolidation)
  }
}
```

9 knobs total. Philosophy review wanted 5, but the memory search defaults are worth exposing since they're measurable and tunable.

---

## Open Issues

Work through these one at a time. Each has context, options, and a recommendation.

---

### Issue 1: Reflection Prompt — Keep or Drop?

**Context:** Only Nanobot (1/4) injects a reflection prompt after each tool round. OpenClaw, PicoClaw, and NanoClaw do not. The prompt is: `"Reflect on the results and decide next steps."`

**Arguments for keeping:**
- 1 line of code, trivially removable
- May improve multi-step reasoning quality (Nanobot claims this)
- Gives the model an explicit opportunity to plan next steps

**Arguments for dropping:**
- 3/4 projects skip it — consensus is against
- Extra user-role message per tool round increases token usage
- May slow down simple tool chains where the model already knows what to do
- OpenClaw (the most mature project) doesn't use it

**Options:**
1. **Include it** — Default on, easy to disable per-agent
2. **Skip it** — Follow the 3/4 consensus
3. **Make it configurable** — `reflectionPrompt: string | false` in agent config

**Decision:** Option 3 (configurable, default OFF). `reflectionPrompt: string | false` in agent config, defaults to `false`. Users can enable with Nanobot's text or custom prompt if desired.

---

### Issue 2: ToolResult Duality — Adopt or Skip?

**Context:** Only PicoClaw (1/4) separates tool results into ForLLM/ForUser/Silent/Async. The other 3 send the same result to both model and user.

**Arguments for adopting:**
- Enables silent file reads (user doesn't see every read_file)
- Different formatting for user vs model
- Async tool feedback (spawn returns immediately, notifies later)
- Clean abstraction

**Arguments for skipping:**
- 3/4 projects don't do this — consensus is against
- Adds interface complexity to every tool
- Web UI may want to show all tool results anyway (for transparency)

**Options:**
1. **Full duality** — Every tool returns `{ forLLM, forUser, silent, async }`
2. **Simple with optional override** — Default: same result for both. Tools can optionally return `{ forUser }` to override what the user sees
3. **Skip entirely** — Same result goes everywhere

**Decision:** Option 3 (skip for now). Same result goes everywhere. Revisit post-MVP once the system is functional. See `.specs/onyx/features/future-toolresult-duality.md` for the full design if we add it later.

---

### Issue 3: Heartbeat Transcript Pruning — Adopt?

**Context:** Only OpenClaw (1/4) removes HEARTBEAT_OK turns from the transcript. The others keep all turns.

**Arguments for:**
- Prevents context pollution from zero-information exchanges
- Heartbeat runs every 30 min — that's 48 useless turns/day in the transcript
- OpenClaw also restores `updatedAt` so idle expiry works correctly
- Simple implementation (truncate file to pre-heartbeat size)

**Arguments against:**
- Loses audit trail of heartbeat activity
- Truncation could corrupt transcript if done wrong
- 3/4 projects don't bother

**Options:**
1. **Prune on HEARTBEAT_OK** — Truncate transcript back, restore timestamps
2. **Keep but mark** — Keep turns but tag them as `heartbeat: true` for filtering
3. **Skip** — Keep all turns like PicoClaw/Nanobot

**Decision:** Heartbeat no-op responses (HEARTBEAT_OK) are logged to a separate heartbeat log for audit/observability but never enter the conversation transcript. Heartbeats that trigger actual actions (reminders, alerts, tasks) go into the conversation transcript normally like any other exchange. This avoids both context pollution and audit trail loss — cleaner than OpenClaw's truncate-after-the-fact approach since the no-op exchange never enters the transcript in the first place.

---

### Issue 4: Tool Loop Detection — When to Add?

**Context:** Only OpenClaw has sliding window loop detection (10 warning, 20 critical, 30 circuit breaker). Others rely on maxTurns.

**Arguments for Phase 1:**
- maxTurns alone can't distinguish productive loops from infinite loops
- A model calling the same tool 20 times with identical args is clearly stuck
- Cost protection (runaway loops waste API credits)

**Arguments for Phase 2:**
- maxTurns is sufficient safety net for MVP
- Loop detection adds ~100 lines of code
- Need real usage data to tune thresholds

**Options:**
1. **Phase 1** — Implement alongside maxTurns
2. **Phase 2** — Start with maxTurns only, add loop detection based on usage data
3. **Simple Phase 1** — Just detect exact-same-tool-and-args repeats (10 lines), defer pattern matching

**Decision:** Option 3. Simple exact-duplicate detection (same tool + same args) in Phase 1 (~10 lines). maxTurns as the outer safety net. Full pattern matching (ping-pong, polling detection) deferred to Phase 2 with real usage data.

---

### Issue 5: Memory Consolidation vs Full-in-Context

**Context:** Nanobot uses LLM-based consolidation every ~25 messages. PicoClaw keeps full MEMORY.md in context. OpenClaw indexes and searches. NanoClaw uses SDK session management.

**The real question:** Should MEMORY.md always be fully loaded into context, or should it be searched like HISTORY.md?

**Arguments for always-in-context:**
- 3/4 projects do this (PicoClaw, Nanobot, OpenClaw all load MEMORY.md fully)
- Active facts should always be available
- No search latency

**Arguments for search-only:**
- MEMORY.md could grow large over time
- Search is more token-efficient
- Consistent treatment of all memory

**Options:**
1. **Always in context** — MEMORY.md fully loaded. HISTORY.md searched via hybrid search.
2. **Hybrid** — MEMORY.md in context up to a size limit (e.g., 2000 tokens). If larger, search instead.
3. **Search only** — Both MEMORY.md and HISTORY.md searched.

**Decision:** OpenClaw-style memory architecture adapted for Onyx's stack. MEMORY.md always loaded in-context as working memory. All memory files (MEMORY.md + memory/*.md) stored in MinIO and indexed in SurrealDB for hybrid search (vector + BM25). Session transcripts stored as JSONL in MinIO with metadata + search index in SurrealDB. SurrealDB replaces OpenClaw's SQLite layer and enables future graph relations (person → project → decision → conversation). Aligns with D1: "Files-first in MinIO, SurrealDB as search index."

---

### Issue 6: Cron Session Modes — Main vs Isolated

**Context:** OpenClaw and NanoClaw both support two cron session modes:
- **Main** — Inject task into main session (heartbeat processes it with full context)
- **Isolated** — Fresh session, no conversation history

**Arguments for both modes:**
- Some tasks need conversation context (e.g., "summarize today's conversations")
- Some tasks should be isolated (e.g., "check weather" — no context needed, cheaper)
- OpenClaw's `wakeMode: "now"` vs `"next-heartbeat"` adds useful flexibility

**Arguments for isolated-only (simpler):**
- Main-session injection adds complexity (system event queue, heartbeat integration)
- MVP may not need context-aware scheduled tasks

**Options:**
1. **Both modes** — `sessionTarget: "main" | "isolated"` like OpenClaw
2. **Isolated only** — All cron jobs get fresh sessions
3. **Main only** — All cron jobs go through heartbeat

**Decision:** Both modes in Phase 1. Cron jobs support `sessionTarget: "main" | "isolated"` from day one — both fully functional in MVP. Task creation includes logic to pick the correct mode automatically (e.g., tasks referencing conversation context → main, self-contained tasks → isolated), with a user toggle to override. This avoids the workaround of embedding context at creation time and delivers the full scheduling experience from launch.

---

### Issue 7: Embedding Provider for Memory Search

**Context:** OpenClaw supports OpenAI, Gemini, Voyage, and local embeddings with auto-selection and FTS-only fallback. Onyx has Ollama available from menos infrastructure.

**Options:**
1. **Ollama local embeddings** — Uses existing infrastructure, no API costs, privacy
2. **Vercel AI SDK embeddings** — Whatever provider the user configured for chat
3. **Auto-select with FTS fallback** — Try Ollama first, fall back to API, fall back to FTS-only
4. **FTS-only (no embeddings)** — Simplest MVP, add embeddings Phase 2

**Decision:** Option 3. Auto-select with graceful fallback: Ollama local embeddings (preferred, already running for menos) → API embeddings via Vercel AI SDK → FTS-only (no vectors). Memory search always works regardless of embedding availability. Matches OpenClaw's proven graceful degradation pattern.

---

### Issue 8: How Should the Agent Update MEMORY.md?

**Context:** Three approaches across the projects:
- **PicoClaw/OpenClaw:** Agent uses `write_file`/`edit_file` tool directly on MEMORY.md
- **Nanobot:** LLM-based consolidation rewrites MEMORY.md automatically every ~25 messages
- **NanoClaw:** Agent edits CLAUDE.md directly via SDK tools

**The tension:** Explicit tool calls give the agent full control but rely on it remembering to update. Automatic consolidation ensures updates happen but may lose nuance.

**Options:**
1. **Explicit only** — Agent uses edit_file tool. No automatic updates.
2. **Automatic only** — Consolidation process rewrites MEMORY.md every ~25 messages.
3. **Both** — Agent can edit explicitly AND automatic consolidation runs as backup.

**Decision:** Option 3 (both). Agent can update MEMORY.md explicitly via edit_file at any time. Automatic LLM-based consolidation runs as backup every ~25 messages, extracting new facts while preserving existing content. MinIO bucket versioning enabled as the safety net — every write (explicit or consolidation) automatically creates a recoverable version. No git needed; versioning happens at the storage layer. This allows browsing/restoring any previous MEMORY.md state if hard-fought memory is lost. A future `memory_history` tool could expose version browsing to the agent or user.

---

### Issue 9: System Prompt Structure

**Context:** All 4 projects assemble system prompts from multiple sections. Need to decide Onyx's section order and what's included.

**Consensus sections (all 4 include):**
- Identity / core instructions
- Current time
- Workspace info
- Available tools
- Bootstrap files (AGENTS.md, SOUL.md, USER.md)
- Memory content

**Divergent sections:**
- Skills summary (PicoClaw/Nanobot: XML; OpenClaw: formatted text; NanoClaw: SDK)
- Messaging rules (OpenClaw: channel-specific; others: generic)
- Safety rules (OpenClaw: extensive; others: minimal)
- Reasoning format (OpenClaw: think/final tags for some providers)

**Decision:** Modular section-based system prompt, ordered for prompt caching (static first, dynamic last). Cherry-picks best sections from all 4 projects. See PROMPTS.md §6 for full recommendations.

**Section order (static → dynamic for cache optimization per Issue 12):**
1. Identity + Safety (from OpenClaw's constitution-inspired guardrails) — static, cacheable
2. Tool call style (from OpenClaw — "don't narrate routine tool calls") — static, cacheable
3. Skills summary (progressive loading: scan descriptions, read on demand) — mostly static
4. Messaging rules (channel routing, silent reply protocol from OpenClaw) — mostly static
5. Silent reply protocol (OpenClaw's token-based mechanism) — static
6. Heartbeat instructions (HEARTBEAT_OK protocol) — static
7. Bootstrap files (SOUL.md, USER.md, AGENTS.md content injected) — changes rarely
8. Tools (dynamic list of available tools) — changes per session
9. Memory (MEMORY.md content) — changes frequently
10. Session metadata (channel, chat ID, conversation summary) — changes every turn

**Cherry-picked features:**
- Internal thought tags from NanoClaw (`<internal>` for non-user content)
- External content security wrapper from OpenClaw (untrusted input boundaries)
- Scheduled task prefix from NanoClaw ("[SCHEDULED TASK - ...]")

Exact prompt text will be iterated during implementation. Structure and section list decided.

---

### Issue 10: Provider Abstraction Shape

**Context:** Onyx D4 specifies a 4-SDK abstraction layer:

| Provider Type | SDK |
|--------------|-----|
| API key providers | Vercel AI SDK |
| Claude subscription | Claude Agent SDK |
| GitHub Copilot subscription | Copilot SDK |
| OpenAI/Codex subscription | Codex SDK |

**The question:** What does the common interface look like? All 4 projects have different approaches:
- **Nanobot:** `ProviderSpec` registry with LiteLLM underneath
- **PicoClaw:** Single `Provider` interface with `Chat()` method
- **OpenClaw:** SDK delegation + auth profiles + model catalog
- **NanoClaw:** Pure Claude Agent SDK

**Options:**
1. **Thin wrapper** — Each SDK gets a thin adapter to a common `chat(messages, tools) → response` interface
2. **Nanobot-style registry** — `ProviderSpec` with metadata, but using Vercel AI SDK instead of LiteLLM
3. **Vercel AI SDK as primary, SDK adapters as secondary** — Vercel handles most providers; subscription SDKs get custom adapters

**Decision:** Option 3. Vercel AI SDK as primary provider for all API-key backends (OpenAI, Anthropic, Ollama, OpenRouter, Bedrock, etc.). Subscription SDKs (Claude Agent SDK, Copilot SDK, Codex SDK) get thin adapters conforming to the same common interface. The abstraction must support per-task model selection (per Issue 12) so different tasks (heartbeat, cron, subagents, main conversation) can route to different models/providers.

### Issue 11: SOUL/USER Onboarding Automation

**Context:** Research from `research-soul-user-setup.md` (SOUL.md standard + TELOS 10-file system) shows that all 4 reference projects use bootstrap personality files (SOUL.md, USER.md, AGENTS.md, etc.) but none automate the first-time setup. Users get blank templates.

**The question:** How should Onyx handle first-time identity/personality setup?

**Research findings:**
- SOUL.md: 30-80 lines optimal, 6 sections (name, role, personality, rules, tools, handoffs)
- TELOS: 10-file system (MISSION, GOALS, PROJECTS, BELIEFS, MODELS, STRATEGIES, NARRATIVES, LEARNED, CHALLENGES, IDEAS)
- Anti-patterns: Empty templates, requiring all fields, >10 minute setup

**Options:**
1. **Manual templates only** — Ship default SOUL.md/USER.md, user edits manually (what all 4 projects do today)
2. **Conversational wizard** — First-launch asks 5-8 questions, generates structured markdown, user reviews and confirms
3. **Hybrid SOUL + selective TELOS** — Single SOUL.md for agent identity + USER/ directory with 3 required files (MISSION, GOALS, BELIEFS) + optional expansion files

**Decision:** Option 3 (hybrid) with Option 2's conversational wizard. 5-phase onboarding flow generating SOUL.md, USER.md, IDENTITY.md, and AGENTS.md. Key design decisions:

- **Multiple-choice over open-ended** — Every question where users might blank offers concrete selectable options with an "other" escape hatch. Prevents decision paralysis.
- **Selections map directly to rules** — Each checkbox generates a specific SOUL.md behavioral rule (e.g., selecting "Sycophancy" annoyance → "No filler praise. State corrections directly."). No interpretation gap.
- **Progressive disclosure** — Phase 1-2 required (~5 min), Phase 3-4 optional (~10 min). Users can always come back later.
- **Conversational follow-ups** — Not a form. Interesting answers trigger deeper questions (soulcraft pattern).
- **4 output files** — SOUL.md (agent personality + behavioral rules), USER.md (user context + preferences), IDENTITY.md (agent name + vibe), AGENTS.md (security boundaries + permissions).
- **Always editable** — Show file paths after generation, encourage manual editing.

Full onboarding flow with all questions, options, and rule mappings documented in `research-soul-setup-prompts.md` §10.

### Issue 12: Model Routing & Cost Optimization

**Context:** [Kevin Simback's article](https://x.com/KSimback/status/2023362295166873743) documents how OpenClaw's default config burns money by sending everything (heartbeats, cron, subagents, simple lookups) to the primary frontier model. A well-configured multi-model setup can reduce costs 80-90%.

**Cost compounders identified:**
- System prompt re-injection (3K-14K tokens) on every API call
- Context accumulation (mature sessions hit 200K+ tokens)
- Heartbeat overhead (48 full-context calls/day at 30-min intervals on Opus = $100+/month)
- Cron jobs with fresh full-context sessions (96 triggers/day at 15-min = $10-20/day on Opus)

**The question:** Should Onyx include model routing from Phase 1, or add it later?

**Strategies from the article:**
1. **Per-task model assignment** — OpenClaw supports this natively via config + skills. Route heartbeats/cron → cheap model, coding/reasoning → frontier
2. **ClawRouter-style local classifier** — Score query complexity (length, code presence, reasoning markers, multi-step intent) and route to cheapest capable model
3. **Prompt caching alignment** — Design system prompt with cacheable static sections; align heartbeat interval to cache TTL (55 min for Anthropic extended cache → 90% discount on system context)
4. **Local models via Ollama** — Zero marginal cost for high-volume, low-complexity tasks (Qwen 3 32B competitive with Sonnet 3.5)

**Options:**
1. **Phase 1: Simple per-task defaults** — Config specifies `heartbeatModel`, `cronModel`, `subagentModel`, `defaultModel`. No runtime classification. User picks models for each role.
2. **Phase 1: Per-task defaults + Phase 2: Smart routing** — Start with Option 1, add complexity-based routing later
3. **Phase 1: Full routing from day one** — Build a lightweight classifier that scores prompts and routes automatically

**Cross-cutting concerns:**
- Issue 7 (Embedding Provider): Ollama already planned for embeddings; extend to routine inference
- Issue 9 (System Prompt Structure): Design prompt sections to maximize cache hits (static identity/safety/tools first, dynamic memory/session last)
- Issue 10 (Provider Abstraction): The 4-SDK abstraction must support per-task model selection, not just per-provider

**Decision:** Option 2. Phase 1 ships simple per-task model defaults — config knobs for `heartbeatModel`, `cronModel`, `subagentModel`, `defaultModel`. User assigns models to roles, no runtime classification. This covers the biggest cost win (heartbeats + cron on cheap models) with zero complexity. Phase 2 adds a lightweight complexity classifier for automatic routing. System prompt already designed static-first for cache optimization (Issue 9), and provider abstraction already supports per-task model selection (Issue 10).

---

## Summary of Recommendations

| Issue | Recommendation | Phase |
|-------|---------------|-------|
| 1. Reflection prompt | **DECIDED** — Configurable, default OFF | Phase 1 |
| 2. ToolResult duality | **DECIDED** — Skip for now, revisit post-MVP | Future |
| 3. Transcript pruning | **DECIDED** — No-op heartbeats logged separately, never in transcript | Phase 1 |
| 4. Tool loop detection | **DECIDED** — Simple duplicate detection Phase 1, patterns Phase 2 | Phase 1 / Phase 2 |
| 5. Memory architecture | **DECIDED** — OpenClaw-style: MEMORY.md in-context + SurrealDB hybrid search index | Phase 1 |
| 6. Cron session modes | **DECIDED** — Both main + isolated in Phase 1 with auto-selection | Phase 1 |
| 7. Embedding provider | **DECIDED** — Auto-select: Ollama → API → FTS-only fallback | Phase 1 |
| 8. MEMORY.md updates | **DECIDED** — Both explicit + auto consolidation, MinIO versioning as safety net | Phase 1 |
| 9. System prompt structure | **DECIDED** — 10-section modular prompt, static-first for caching | Phase 1 |
| 10. Provider abstraction | **DECIDED** — Vercel AI SDK primary + subscription adapters | Phase 1 |
| 11. SOUL/USER onboarding | **DECIDED** — Hybrid SOUL + selective TELOS with multi-choice conversational wizard | Phase 1 |
| 12. Model routing & cost | **DECIDED** — Per-task model config knobs Phase 1, smart routing Phase 2 | Phase 1 / Phase 2 |

---

## Files Referenced

- `.specs/onyx/research/source-analysis-picoclaw.md`
- `.specs/onyx/research/source-analysis-nanoclaw.md`
- `.specs/onyx/research/source-analysis-nanobot.md`
- `.specs/onyx/research/source-analysis-openclaw.md`
- `.specs/onyx/research/philosophy-alignment-review.md`
- `.specs/onyx/research/research-soul-user-setup.md`
- `.specs/onyx/research/PROMPTS.md`
- `.specs/onyx/prd.md` (D11, D12)
