# Onyx vs PicoClaw: Architecture Comparison

## Executive Summary

PicoClaw represents the extreme edge of optimization in personal AI assistants: <10MB RAM, <1s startup, single Go binary targeting $10 embedded hardware. Onyx takes the opposite path: full-featured TypeScript/Bun platform with rich storage (SurrealDB/MinIO), hybrid memory search, and multi-provider LLM support. While PicoClaw proves edge viability through aggressive minimalism (95% AI-generated, cloud-delegated reasoning), Onyx should learn its deployment simplicity (single binary, Docker Compose profiles) and ruthless scope control, while avoiding the cloud dependency and minimal tooling that limits PicoClaw's usefulness for power users.

## Architecture Overview

| Dimension | Onyx (PRD) | PicoClaw | Notes |
|-----------|-----------|----------|-------|
| **Language/Runtime** | TypeScript, Bun (Node.js alternative) | Go 1.21+ | Onyx: multi-paradigm scripting, JIT. PicoClaw: compiled binary, static linking |
| **Binary Size** | Not specified (likely >50MB with node_modules) | ~8MB self-contained | PicoClaw optimized for distribution |
| **RAM Footprint** | Not specified (likely >100MB) | <10MB (recent: 10-20MB) | 10-20x difference |
| **Startup Time** | Not specified (likely >5s) | <1s on 0.6GHz single-core | Critical for edge/IoT use cases |
| **Target Hardware** | Desktop/server (Linux Docker) | $10-15 boards (RISC-V, ARM, x86) | Onyx: homelab/VPS. PicoClaw: Raspberry Pi Zero, LicheeRV-Nano |
| **Deployment** | Docker Compose (multi-container) | Single binary OR Docker Compose | PicoClaw offers both; Onyx is container-only |
| **Architecture** | Monolith (Hono API + SvelteKit frontend) | Single binary CLI/gateway | Onyx separates concerns; PicoClaw merges |
| **Extensibility** | Plugin interfaces (Phase 2: Discord/Telegram) | Built-in messaging channels (7 total) | PicoClaw ships integrations; Onyx defers |
| **Memory System** | Files-first in MinIO, hybrid vector + BM25 in SurrealDB | Simple JSONL logging in `~/.picoclaw/workspace/sessions/` | Onyx: advanced search. PicoClaw: basic persistence |
| **LLM Integration** | 4-SDK abstraction (Vercel AI SDK + 3 subscription SDKs) | API delegation (OpenRouter, GLM, Claude, GPT, Gemini) | Both support multi-provider; Onyx has local option (Ollama) |
| **Web Search** | SearXNG (self-hosted meta-search) | Brave Search API (2K free/month) + DuckDuckGo fallback | PicoClaw: zero-config web search. Onyx: requires service |
| **Scheduling** | TBD (node-cron, BullMQ) | Built-in cron tool, jobs in `workspace/cron/` | PicoClaw ships scheduling; Onyx must choose library |
| **Storage** | SurrealDB (graph DB) + MinIO (S3-compatible) | Filesystem (JSONL) | Onyx: queryable storage. PicoClaw: portable files |
| **Web UI** | SvelteKit + shadcn-svelte + Tailwind CSS | None documented (CLI/gateway focus) | Onyx: browser control panel. PicoClaw: headless agent |
| **Auth** | Phase 1: Bearer token. Phase 2: Password + cookie. Phase 3: WebAuthn | Not documented (pre-v1.0 security warnings) | Onyx: explicit roadmap. PicoClaw: TBD |
| **Sandbox** | Phase 3 (references OpenClaw sandboxing) | Restricts file/command access to workspace by default | PicoClaw ships basic sandboxing; Onyx defers |
| **Tool Ecosystem** | MVP: memory, sessions, web, fs, runtime, schedule. Post-MVP: git, docker, mermaid, menos | Minimal: web search, fs, messaging, scheduling | Onyx: rich planned tooling. PicoClaw: core loop only |
| **Open Ecosystem** | Open research (OpenClaw, nanobot, FemtoBot, ClawRAG) | Part of OpenClaw/nanobot/ZeroClaw family | Shared philosophical lineage |

## Key Similarities

1. **OpenClaw-Inspired Architecture**: Both explicitly reference OpenClaw as design inspiration and maintain OpenClaw-compatible concepts (workspace markdown files, agent definitions, session persistence).

2. **Multi-Channel Vision**: Both plan multi-platform messaging support (Discord, Telegram, etc.), though PicoClaw ships 7 channels immediately while Onyx defers to Phase 2.

3. **Files-First Memory**: Both treat files as source of truth. Onyx: MinIO + SurrealDB index. PicoClaw: JSONL in `~/.picoclaw/workspace/`. Same philosophy, different scale.

4. **Cloud LLM Delegation**: Both support API-based reasoning (OpenRouter, Claude, GPT). PicoClaw requires it; Onyx offers local fallback (Ollama).

5. **Scheduling Built-In**: Both include task scheduling (cron-style). PicoClaw ships it; Onyx must implement.

6. **Docker Compose Support**: Both offer Docker deployment with profile-based service selection.

7. **Session Persistence**: Both store conversations. Onyx: MinIO JSONL + SurrealDB metadata. PicoClaw: filesystem JSONL.

8. **Workspace Model**: Both use `~/.config/<project>/workspace/` for agent state and memory files.

## Key Differences

### 1. **Deployment Complexity vs. Feature Depth**

- **PicoClaw**: Single 8MB binary, zero dependencies, runs on $10 hardware. Trade-off: minimal tooling, cloud-dependent reasoning, basic memory.
- **Onyx**: Multi-container stack (API, frontend, SurrealDB, MinIO, Ollama, SearXNG). Trade-off: requires Docker infrastructure, higher resource usage.

**Why it matters**: PicoClaw optimizes for edge deployment and ease of distribution. Onyx optimizes for rich feature set and self-hosted control.

### 2. **Storage Architecture**

- **PicoClaw**: Filesystem-only (JSONL). Portable, debuggable, no DB dependencies.
- **Onyx**: SurrealDB (graph DB) + MinIO (S3). Hybrid vector + BM25 search, semantic memory, structured queries.

**Why it matters**: PicoClaw sacrifices searchability for simplicity. Onyx invests in infrastructure for advanced memory retrieval.

### 3. **Language Trade-offs**

- **PicoClaw (Go)**: Static binary, cross-compilation, <1s startup, 95% AI-generated core (self-bootstrapping).
- **Onyx (TypeScript/Bun)**: Shared types across frontend/backend, rich ecosystem, slower startup.

**Why it matters**: Go enables PicoClaw's edge deployment. TypeScript enables Onyx's full-stack cohesion.

### 4. **Local vs. Cloud Reasoning**

- **PicoClaw**: Requires API keys (OpenRouter/GLM/Claude/GPT). Cannot run fully offline.
- **Onyx**: Supports Ollama for local inference. No cloud dependency if user configures local models.

**Why it matters**: Onyx enables fully air-gapped deployments. PicoClaw assumes internet connectivity.

### 5. **Web Interface**

- **PicoClaw**: CLI/gateway only. No documented web UI.
- **Onyx**: SvelteKit control panel (chat, sessions, memory browser, agent config, provider settings).

**Why it matters**: Onyx targets desktop users needing visual management. PicoClaw targets headless/embedded use cases.

### 6. **Security Maturity**

- **PicoClaw**: Pre-v1.0 with [explicit security warnings](https://github.com/sipeed/picoclaw). Not production-ready.
- **Onyx**: Auth roadmap (Phase 1: token, Phase 2: password, Phase 3: WebAuthn). Sandbox deferred to Phase 3.

**Why it matters**: Both are early-stage; neither production-hardened. PicoClaw's warnings are more explicit.

### 7. **Memory System Sophistication**

- **PicoClaw**: Simple logging. No vector search, no semantic retrieval.
- **Onyx**: Hybrid vector (Ollama embeddings) + BM25 full-text search. Weighted RRF merging.

**Why it matters**: Onyx targets power users needing semantic memory ("what did that video say about Docker?"). PicoClaw targets simple automation.

### 8. **Ecosystem Ambition**

- **PicoClaw**: Core loop only. No email, calendar, smart home integrations planned.
- **Onyx**: Rich post-MVP tooling: git, docker, mermaid, menos content vault integration, model routing.

**Why it matters**: Different scope. PicoClaw is a minimal agent. Onyx is a personal AI platform.

## Recommendations for Onyx

### Adopt

#### 1. **Single Binary Distribution (Optional Build Target)**

**What PicoClaw does**: Compiles to 8MB self-contained binary. No runtime dependencies. Works on RISC-V, ARM, x86 with `go build`.

**How Onyx could apply**:
- Use Bun's `bun build --compile` to create standalone executables for Onyx API server.
- Package SvelteKit frontend as static assets inside binary OR serve via CDN.
- Document binary deployment as alternative to Docker for single-machine installs.

**PRD section reference**: D10 (Deployment Topology). Add "Binary distribution (optional)" to Phase 2.

**Rationale**: Onyx currently requires Docker + 6 services. A single binary would lower barrier for homelab users without Kubernetes/Compose experience.

**Implementation note**: Bun 1.0+ supports `bun build --compile`. Test with embedded SQLite for users who don't need SurrealDB scale.

---

#### 2. **Docker Compose Profiles for Deployment Modes**

**What PicoClaw does**: Uses `docker compose --profile gateway` to selectively start agent mode vs. gateway mode vs. specific integrations [[DeepWiki](https://deepwiki.com/erha2025/picoclaw/2.2-docker-deployment)].

**How Onyx should apply**:
```yaml
# docker-compose.yml
services:
  onyx-api:
    profiles: ["core", "gateway"]
  onyx-frontend:
    profiles: ["core", "web"]
  surrealdb:
    profiles: ["core", "gateway", "web"]
  searxng:
    profiles: ["web", "gateway"]  # Not needed for API-only
  discord-bot:
    profiles: ["discord"]
  telegram-bot:
    profiles: ["telegram"]

# Usage:
# docker compose --profile web up       # UI only
# docker compose --profile gateway up   # Bots only
# docker compose --profile core up      # Minimal (API + DB)
```

**PRD section reference**: D10 (Deployment Topology). Add profile strategy to service map.

**Rationale**: Onyx plans 6 core services + 2 bot plugins (Phase 2). Users shouldn't run all 8 if they only need web UI. Profiles enable a la carte deployment.

**Concrete action**: Define `core`, `web`, `gateway`, `discord`, `telegram` profiles in `docker-compose.yml`.

---

#### 3. **Built-in Web Search with Zero-Config Fallback**

**What PicoClaw does**: DuckDuckGo search works out-of-box (no API key). Brave Search is optional upgrade for better results (2K free queries/month) [[Config Docs](https://picoclaw.ai/docs)].

**How Onyx should apply**:
- Keep SearXNG as recommended self-hosted option (privacy, no rate limits).
- Add DuckDuckGo HTML scraper as fallback if SearXNG is down/unconfigured.
- Document Brave Search API key as optional in Phase 1 config.

**PRD section reference**: D8 (Tool System). Update `web_search` tool to support 3 backends: SearXNG (primary), Brave (optional), DuckDuckGo (fallback).

**Rationale**: Onyx currently requires SearXNG deployment (adds service dependency). Zero-config fallback improves first-run experience.

**Implementation note**: Use `duckduckgo-search` npm package for scraper. Respect `robots.txt`.

---

#### 4. **Workspace-Scoped Filesystem Sandboxing (MVP)**

**What PicoClaw does**: Restricts file access and command execution to `~/.picoclaw/workspace/` by default [[Sterlites Blog](https://sterlites.com/blog/picoclaw-paradigm-edge-intelligence)].

**How Onyx should apply**:
- Add `workspace_root` to agent config (defaults to `~/.config/onyx/workspace-{agent_id}/`).
- Filesystem tools (`read`, `write`, `edit`) validate paths against `workspace_root` before execution.
- Runtime tool (`exec`) chdir's to workspace before executing commands.
- Document opt-out via `tools.allow_global_fs: true` for advanced users.

**PRD section reference**: D8 (Tool System). Add "Workspace sandboxing (MVP)" to MVP Risk Acceptance section. Update D9 (Agent Definition Format) with `workspace_root` config field.

**Rationale**: PRD defers sandboxing to Phase 3, accepting risk for single-user. Workspace-scoped FS restriction is lightweight and prevents accidental system damage without full container isolation.

**Implementation note**: Path validation pattern:
```typescript
function validatePath(path: string, workspaceRoot: string): boolean {
  const resolved = path.resolve(path);
  return resolved.startsWith(workspaceRoot);
}
```

---

#### 5. **Configuration as Single File with Environment Variable Substitution**

**What PicoClaw does**: Single `~/.picoclaw/config.json` with `${ENV_VAR}` substitution for secrets [[Config Example](https://picoclaw.ai/docs)].

**How Onyx already does this**: `~/.config/onyx/onyx.json` with `${OPENROUTER_API_KEY}` pattern (PRD D9).

**Recommendation**: Adopt PicoClaw's explicit config validation on startup:
- Parse config.json on `onyx` process start.
- Fail fast with clear error if required fields missing (e.g., "No LLM provider configured. Set OPENROUTER_API_KEY or configure Ollama.").
- Log loaded config (with secrets redacted) at INFO level for debugging.

**PRD section reference**: D9 (Agent Definition Format). Add "Config validation" to gateway startup flow.

**Rationale**: Onyx PRD doesn't specify startup validation behavior. PicoClaw's fail-fast pattern prevents silent misconfigurations.

---

#### 6. **JSONL Session Format (Already Adopted)**

**What PicoClaw does**: Stores conversations as `~/.picoclaw/workspace/sessions/{id}.jsonl` [[GitHub](https://github.com/sipeed/picoclaw)].

**What Onyx does**: Identical pattern — MinIO `onyx-sessions/{agent_id}/{session_id}.jsonl` (PRD D5).

**Recommendation**: Adopt PicoClaw's append-only guarantees:
- Use MinIO `putObject()` with `append: true` semantics (or manual line append via read-modify-write with ETag concurrency control).
- Never rewrite entire JSONL file; only append new lines.
- Document JSONL line format in PRD (already done, matches PicoClaw's `{"ts":"...","role":"...","content":"..."}` pattern).

**PRD section reference**: D5 (Session Persistence). Confirm append-only semantics.

**Rationale**: Append-only prevents race conditions and enables streaming reads. Already aligned; explicit documentation ensures implementation matches.

---

### Consider

#### 1. **95% AI-Generated Core (Development Methodology)**

**What PicoClaw did**: Built in a single day via self-bootstrapping — LLM generates code, human reviews, iterates [[Medium](https://medium.com/@ishank.iandroid/picoclaw-the-10-ai-agent-that-changed-my-edge-computing-game-5c2c0c6badfb)].

**Trade-offs for Onyx**:
- **Pro**: Fast prototyping, especially for boilerplate (API routes, DB schemas, tool definitions).
- **Con**: Generated code may lack context on Onyx's specific constraints (menos integration, hybrid search, 4-SDK abstraction).
- **Con**: Over-reliance on generation can produce inconsistent patterns if prompts aren't carefully architected.

**Recommendation**: Use for scaffolding (e.g., "generate SvelteKit routes for session management") but human-write critical paths (provider abstraction, memory hybrid search). Document which modules are generated in PRD or CLAUDE.md.

**PRD section reference**: Add "Development Methodology" section under Conventions.

**Specific use case**: Generate shadcn-svelte component wrappers and Hono route stubs. Human-write core logic.

---

#### 2. **Ollama as Optional (Cloud-First LLM Strategy)**

**What PicoClaw does**: No local inference. Requires API keys for all reasoning [[Hacker News](https://news.ycombinator.com/item?id=47004845)].

**What Onyx does**: Supports Ollama for embeddings (nomic-embed-text) and optional local LLM (PRD D4: Vercel AI SDK includes `ollama-ai-provider`).

**Trade-offs**:
- **PicoClaw approach**: Simplifies deployment (no Ollama service), reduces RAM/CPU usage on edge devices, ensures consistent quality (cloud models better than local llama3 on 512MB).
- **Onyx approach**: Enables fully offline operation, no per-request API costs, privacy for sensitive data.

**Recommendation**: Keep Ollama in MVP (already planned), but add "Cloud-only deployment mode" as optional config:
```json
{
  "providers": {
    "ollama": {
      "enabled": false  // Disables Ollama service requirement
    },
    "embeddings": {
      "provider": "openai",  // Use OpenAI text-embedding-3-small instead
      "model": "text-embedding-3-small"
    }
  }
}
```

**PRD section reference**: D4 (LLM Provider Strategy), D10 (Deployment Topology). Add cloud-only mode to service map.

**Rationale**: Some users (VPS deployments, ARM homelab) may prefer cloud embeddings to reduce local compute. Optional removal of Ollama service makes Onyx lighter.

---

#### 3. **CLI-First Interface (Defer Web UI)**

**What PicoClaw does**: Ships CLI as primary interface. No web UI documented [[GitHub](https://github.com/sipeed/picoclaw)].

**What Onyx plans**: Web UI (SvelteKit) is Phase 1 MVP. CLI plugin is Phase 2 (PRD D3, Roadmap).

**Trade-offs**:
- **PicoClaw approach**: Faster MVP (no frontend complexity), better for headless/server use, SSH-friendly.
- **Onyx approach**: Better UX for desktop users, visual config for providers, session browsing.

**Recommendation**: Flip order only if Web UI development stalls. CLI-first gets core working faster, but PRD's target user ("personal assistant for desktop Linux user with Docker") likely needs visual interface. **Keep current plan** (Web UI Phase 1, CLI Phase 2).

**Alternative**: Deliver minimal CLI in Phase 1 alongside Web UI (like OpenClaw's `openclaw chat`). Allows testing agent logic before frontend is polished.

**PRD section reference**: Roadmap Phase 1. Add "(MVP CLI optional)" to deliverable list.

---

#### 4. **Minimal Memory System (Simplicity Over Semantic Search)**

**What PicoClaw does**: No vector search, no embeddings. Pure JSONL logging [[Comparison](https://circuitdigest.com/news/an-openclaw-alternative-built-to-run-within-10-mb-of-ram)].

**What Onyx plans**: Hybrid vector + BM25 search in SurrealDB, Ollama embeddings, chunking/indexing pipeline (PRD D1).

**Trade-offs**:
- **PicoClaw approach**: Zero embedding overhead, instant writes, readable logs.
- **Onyx approach**: Semantic retrieval ("what did that video say?"), context relevance scoring.

**Recommendation**: Keep Onyx's hybrid search (core differentiator vs. PicoClaw), but add "Archive mode" for old sessions:
- After 30 days (configurable), stop indexing session to SurrealDB.
- Keep JSONL in MinIO for export/grep.
- Reduces vector index bloat for low-value old chats.

**PRD section reference**: D1 (Memory Architecture), D5 (Session Persistence). Add "Session archival policy" to sync flow.

**Rationale**: Onyx's memory system is a strength, not a weakness. But archival prevents unbounded index growth like PicoClaw's append-only model naturally provides.

---

#### 5. **Pre-v1.0 Security Warnings (Explicit Risk Communication)**

**What PicoClaw does**: [GitHub README](https://github.com/sipeed/picoclaw) explicitly warns: "unresolved network security issues, do not deploy to production before v1.0."

**What Onyx does**: PRD D8 has "MVP Risk Acceptance: Runtime Tools" but doesn't document public-facing security posture.

**Recommendation**: Add security disclaimer to Onyx README (when created):
```markdown
## Security Notice
Onyx MVP (Phase 1) is **not production-ready**:
- Bearer token auth is static (no rotation)
- Runtime `exec` tool has no sandboxing (single-user only)
- No rate limiting or abuse prevention
- Deployment behind VPN/firewall recommended

Phase 2 adds password auth + session cookies. Phase 3 adds sandboxing.
```

**PRD section reference**: Add "Security Posture" section to Conventions or Roadmap intro.

**Rationale**: PicoClaw's explicit warnings set user expectations. Onyx should be equally transparent about MVP limitations.

---

### Avoid

#### 1. **Single Binary as Primary Deployment (Without Docker Alternative)**

**What PicoClaw does**: Distributes primarily as standalone binary. Docker Compose is alternative, not default [[Installation Guide](https://deepwiki.com/sipeed/picoclaw/2.1-installation-and-building)].

**Why Onyx should avoid**: Onyx has 6 services (API, frontend, SurrealDB, MinIO, Ollama, SearXNG). Bundling into single binary is infeasible without:
- Embedding all databases (replaces SurrealDB → SQLite, MinIO → filesystem).
- Removing Ollama (cloud-only embeddings).
- Serving SvelteKit statically (no SSR).

**This eliminates Onyx's core differentiators** (graph DB, S3 storage, local LLM, rich UI).

**Recommendation**: Docker Compose remains primary. Binary distribution is optional convenience for "Onyx Lite" users who sacrifice features for simplicity.

**PRD section reference**: D10 (Deployment Topology). Confirm Docker Compose as canonical deployment.

---

#### 2. **Cloud-Dependent Reasoning (No Local LLM Fallback)**

**What PicoClaw does**: Cannot run without API keys. No offline mode [[Hacker News](https://news.ycombinator.com/item?id=47004845)].

**Why Onyx should avoid**: PRD targets self-hosted users who value privacy and control. Requiring internet + API keys contradicts "self-hosted content vault" positioning (menos integration, air-gapped deployments).

**Recommendation**: Keep Ollama as first-class provider (already planned in D4 via Vercel AI SDK's `ollama-ai-provider`).

**PRD section reference**: D4 (LLM Provider Strategy). Confirm Ollama is Phase 1 MVP, not Phase 2.

**Rationale**: Onyx's target user runs menos (SurrealDB/MinIO/Ollama already deployed). Reusing Ollama is zero marginal cost.

---

#### 3. **Filesystem-Only Storage (No Database)**

**What PicoClaw does**: All state in `~/.picoclaw/workspace/` as JSONL/markdown files [[GitHub](https://github.com/sipeed/picoclaw)].

**Why Onyx should avoid**: PRD explicitly requires hybrid search (vector + BM25), semantic memory retrieval, and structured queries. Filesystem cannot support:
- Cosine similarity search over embeddings.
- Full-text BM25 scoring.
- Metadata filtering (agent_id, date range, source).

**Recommendation**: Keep SurrealDB + MinIO architecture (PRD D1). Filesystem works for PicoClaw's simple logging, not Onyx's semantic search.

**PRD section reference**: D1 (Memory Architecture). Reaffirm files-first (MinIO) + derived index (SurrealDB) pattern.

**Rationale**: Database overhead is justified by query capabilities. PicoClaw's no-DB approach is correct for <10MB footprint, wrong for Onyx's feature set.

---

#### 4. **95% AI-Generated Core (Without Human Architecture Review)**

**What PicoClaw did**: Self-bootstrapping in single day. 95% generated, human-in-the-loop refinement [[Medium](https://medium.com/@ishank.iandroid/picoclaw-the-10-ai-agent-that-changed-my-edge-computing-game-5c2c0c6badfb)].

**Why Onyx should avoid as blanket strategy**: PicoClaw's scope is simple (CLI agent with JSONL logging). Onyx has complex integration requirements:
- 4-SDK provider abstraction (3 OAuth flows + Vercel AI SDK).
- Hybrid search with weighted RRF merging.
- MinIO + SurrealDB coordination (file checksums, reindexing).
- menos API auth (ed25519 signing).

**Fully generated code will miss these cross-cutting concerns** without explicit prompts encoding PRD decisions.

**Recommendation**: Use generation for isolated modules (routes, schemas, components). Human-architect interfaces (ProviderBackend abstraction, HybridSearchManager, SessionManager). Document architecture decisions in code comments to guide future generation.

**PRD section reference**: Add "AI-Assisted Development Guidelines" to Conventions.

**Specific approach**:
```typescript
// api/src/providers/abstraction.ts
// ARCHITECTURE: 4-SDK abstraction layer (PRD D4)
// DO NOT generate without understanding subscription OAuth vs. API key flows
export interface ProviderBackend {
  complete(messages: Message[], model: string): Promise<Response>;
  stream(messages: Message[], model: string): AsyncIterator<Delta>;
  listModels(): Promise<Model[]>;
}
```

---

#### 5. **Pre-v1.0 Deployment Without Security Hardening**

**What PicoClaw warns against**: [Explicit security warnings](https://github.com/sipeed/picoclaw) — do not deploy before v1.0.

**Why Onyx should avoid**: Same risk. PRD's MVP has:
- Static bearer token (no rotation).
- Runtime `exec` tool (arbitrary command execution).
- No rate limiting.
- Docker socket access (post-MVP docker tools, PRD D8).

**Recommendation**: Document deployment constraints in README (see "Consider #5" above). Add startup warning log:
```typescript
if (config.tools.runtime.enabled) {
  logger.warn("Runtime exec tool enabled. Single-user deployments only. Do not expose publicly.");
}
```

**PRD section reference**: D8 (Tool System). Add startup validation to MVP Risk Acceptance.

**Rationale**: Learn from PicoClaw's transparency. Security warnings prevent misuse.

---

#### 6. **Minimal Tool Ecosystem (Core Loop Only)**

**What PicoClaw ships**: Web search, fs, messaging, scheduling. No git, docker, email, calendar, smart home [[PicoClaw vs OpenClaw](http://openclawpulse.com/picoclaw-vs-openclaw/)].

**Why Onyx should avoid this scope**: PRD targets power users who need:
- Git tools (commit, push, pull, status) — post-MVP but planned (D8).
- Docker tools (ps, logs, exec) — homelab management (post-MVP, D8).
- menos integration (content search, video ingestion) — Phase 2 (D2).
- Model routing (select best provider for task) — post-MVP (D8).

**Recommendation**: Keep rich tooling roadmap. Onyx's differentiation is **platform depth**, not edge minimalism.

**PRD section reference**: D8 (Tool System). Confirm post-MVP tools remain in scope.

**Rationale**: PicoClaw's minimalism is correct for edge. Onyx targets desktop/homelab users who want full automation platform.

---

#### 7. **No Web UI (CLI/Gateway Only)**

**What PicoClaw ships**: CLI and gateway mode. No web interface documented [[GitHub](https://github.com/sipeed/picoclaw)].

**Why Onyx should avoid**: PRD's target user ("personal assistant for desktop Linux user") needs:
- Visual provider configuration (OAuth flows, API key entry).
- Session browsing (search, filter, export).
- Memory search UI (hybrid search results, file browser).
- Agent config editor (workspace paths, tool permissions).

**CLI-only would require users to edit JSON by hand** (poor UX for OAuth setup, session management).

**Recommendation**: Keep SvelteKit UI as Phase 1 MVP (PRD D7, Roadmap). CLI as Phase 2 convenience, not replacement.

**PRD section reference**: D7 (Web Interface). Reaffirm browser-based control UI as MVP.

**Rationale**: PicoClaw's headless design fits edge use cases (SSH access, embedded Linux). Onyx targets richer desktop use cases needing visual config.

---

## Sources

### Onyx PRD
- **D1 (Memory Architecture)** — Files-first in MinIO, SurrealDB as search index, hybrid vector + BM25, chunking/embedding pipeline
- **D2 (menos Integration)** — Shared infrastructure, Onyx queries menos, conversations stay in Onyx
- **D3 (Bot Plugin Architecture)** — Plugin interfaces in MVP, in-process Discord/Telegram plugins Phase 2
- **D4 (LLM Provider Strategy)** — 4-SDK TypeScript abstraction (Vercel AI SDK + 3 subscription SDKs), no LiteLLM
- **D5 (Session Persistence)** — MinIO JSONL + SurrealDB metadata, append-only writes
- **D6 (API Design)** — OpenAI-compatible HTTP API, Hono routes
- **D7 (Web Interface)** — SvelteKit + shadcn-svelte control UI, provider settings page, session browser
- **D8 (Tool System)** — MVP tools (memory, sessions, web, fs, runtime, schedule), post-MVP (git, docker, mermaid, menos, model routing)
- **D9 (Agent Definition Format)** — OpenClaw-compatible JSON config + workspace markdown files
- **D10 (Deployment Topology)** — Docker Compose stack (6 services), shared network with menos

### PicoClaw Research
- **GitHub Repository** — [sipeed/picoclaw](https://github.com/sipeed/picoclaw) — MIT license, Go 1.21+, 8MB binary, <10MB RAM
- **CNX Software** — [Ultra-lightweight personal AI Assistant runs on 10MB RAM](https://www.cnx-software.com/2026/02/10/picoclaw-ultra-lightweight-personal-ai-assistant-run-on-just-10mb-of-ram/) — Hardware specs, startup time, cost comparison
- **Circuit Digest** — [OpenClaw Alternative Built to Run Within 10 MB RAM](https://circuitdigest.com/news/an-openclaw-alternative-built-to-run-within-10-mb-of-ram) — Memory system comparison, edge computing positioning
- **Sterlites Blog** — [Evolution of OpenClaw, PicoClaw & Nanobot](https://sterlites.com/blog/picoclaw-paradigm-edge-intelligence) — Architectural philosophy, self-bootstrapping (95% AI-generated), workspace sandboxing
- **Medium (Ishank)** — [PicoClaw: The $10 AI Agent That Changed My Edge Computing Game](https://medium.com/@ishank.iandroid/picoclaw-the-10-ai-agent-that-changed-my-edge-computing-game-5c2c0c6badfb) — Development methodology, single-day build, deployment experience
- **DeepWiki Installation** — [Installation and Building](https://deepwiki.com/sipeed/picoclaw/2.1-installation-and-building) — Binary downloads, config setup, API key requirements
- **DeepWiki Docker** — [Docker Deployment](https://deepwiki.com/erha2025/picoclaw/2.2-docker-deployment) — Compose profiles, gateway mode, service selection
- **PicoClaw.ai Docs** — [Official Documentation](https://picoclaw.ai/docs) — LLM provider config, web search integration, scheduling system
- **PicoClaw vs OpenClaw** — [Feature Comparison](http://openclawpulse.com/picoclaw-vs-openclaw/) — Tool ecosystem comparison, use case differentiation
- **Hacker News** — [Show HN: PicoClaw](https://news.ycombinator.com/item?id=47004845) — Community discussion, cloud dependency concerns
- **Cloudron Forum** — [ZeroClaw Discussion](https://forum.cloudron.io/topic/15080/zeroclaw-rust-based-alternative-to-openclaw-picoclaw-nanobot-agentzero) — Alternative frameworks comparison (ZeroClaw, nanobot)

### Key Architectural References
1. **Single binary distribution** — PicoClaw's 8MB Go binary vs. Onyx's Docker Compose stack
2. **Docker Compose profiles** — PicoClaw's `--profile gateway` pattern for selective service startup
3. **Zero-config web search** — DuckDuckGo fallback vs. Onyx's SearXNG service requirement
4. **Workspace sandboxing** — PicoClaw's default FS restriction vs. Onyx's Phase 3 container isolation
5. **Config validation** — PicoClaw's fail-fast on missing API keys vs. Onyx's unspecified startup behavior
6. **JSONL session format** — Both use append-only conversation logs (aligned design)
7. **Security warnings** — PicoClaw's explicit pre-v1.0 warnings vs. Onyx's MVP risk acceptance
8. **Cloud-dependent reasoning** — PicoClaw requires API keys, Onyx supports Ollama for offline
9. **Filesystem-only storage** — PicoClaw's no-DB approach vs. Onyx's SurrealDB/MinIO architecture
10. **Minimal tool ecosystem** — PicoClaw's core loop vs. Onyx's rich post-MVP tooling roadmap
