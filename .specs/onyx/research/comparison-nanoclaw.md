# Onyx vs NanoClaw: Architecture Comparison

## Executive Summary

NanoClaw demonstrates that production-ready AI assistants can be built with radical simplicity (~2000 lines) by focusing on a minimal, auditible core extended through AI-native "skills." Its key insight is that **container-level isolation provides better security than application-level permissions**, while its WhatsApp-only focus and SQLite/filesystem storage enable a single-process architecture. Onyx should adopt NanoClaw's container isolation strategy and skills-based extensibility model, but will necessarily be more complex due to multi-provider support, hybrid search requirements, and Linux-first Docker deployment.

## Architecture Overview

| Dimension | Onyx (PRD) | NanoClaw | Notes |
|-----------|-----------|----------|-------|
| **Philosophy** | Feature-rich personal assistant with comprehensive tooling | Minimal core (~500 lines) extended via AI-native skills | NanoClaw rejects generality; Onyx accepts complexity for broader capability |
| **Language/Runtime** | TypeScript + Bun (backend), SvelteKit (frontend) | TypeScript + Node.js 20+ | Both TypeScript; Bun vs Node.js performance/compatibility trade-offs |
| **Lines of Code** | TBD (likely 10k+ for MVP) | ~2000 lines total (500 core) | NanoClaw's simplicity depends on single-platform, single-LLM constraint |
| **LLM Integration** | 4-SDK abstraction (Vercel AI SDK + 3 subscription SDKs) | Claude Agent SDK only | Onyx multi-provider = necessary complexity |
| **Communication** | Phase 2: Discord, Telegram plugins; Phase 1: Web UI only | WhatsApp only (Baileys library) | NanoClaw's single-channel focus enables simplicity |
| **Memory** | Files-first in MinIO, SurrealDB hybrid search (vector+BM25) | SQLite + per-group `CLAUDE.md` files | Onyx's hybrid search requires more infrastructure; NanoClaw's flat-file model is simpler |
| **State Management** | MinIO (JSONL session logs) + SurrealDB (metadata) | SQLite (queue, tasks) + filesystem (`CLAUDE.md`) | NanoClaw's SQLite-only approach is self-contained; Onyx needs object storage for scale |
| **Security Model** | Phase 3: Container isolation (Docker); Phase 1: trusted single-user | **Container-per-group isolation** (Apple Container/Docker) from day 1 | **KEY DIFFERENCE**: NanoClaw ships container isolation in MVP; Onyx defers to Phase 3 |
| **Deployment** | Docker Compose stack (SurrealDB, MinIO, Ollama, SearXNG) | Single-process + SQLite, optional system service | NanoClaw's minimal dependencies enable single-binary distribution |
| **Developer Experience** | Traditional config files (`onyx.json`) + workspace markdown | **Skills-based**: `.claude/skills/` teach Claude Code how to transform your fork | NanoClaw's AI-native extensibility is revolutionary |
| **Performance** | Not yet measured; multi-service overhead expected | Lightweight on macOS (Apple Container), heavier on Linux (Docker) | Onyx accepts multi-service latency for richer features |
| **Platform Support** | Linux-first (Docker), Windows/macOS via WSL/Docker | macOS (Apple Container) + Linux (Docker); macOS-optimized | Opposite platform priorities |
| **Extensibility Model** | Plugin manifests + PluginProtocol interface (Phase 2) | Skills teach AI to modify codebase (no plugin system) | NanoClaw treats the codebase itself as the extension point |

## Key Similarities

### 1. Files-First Memory Philosophy
Both systems treat **files as the source of truth**:
- **Onyx (D1)**: MinIO stores memory files, SurrealDB indexes them for search
- **NanoClaw**: Per-group `CLAUDE.md` files, SQLite for queue management only

Both avoid treating the database as the primary storage layer.

### 2. OpenClaw-Compatible Agent Format
- **Onyx (D9)**: OpenClaw-compatible JSON config + workspace markdown (`AGENTS.md`, `SOUL.md`, `USER.md`, `MEMORY.md`)
- **NanoClaw**: Uses `CLAUDE.md` per group (simpler than OpenClaw's multi-file workspace)

Both enable potential config migration between systems.

### 3. TypeScript-First Architecture
Both chose TypeScript for:
- Type safety across agent runtime
- Strong ecosystem for WebSocket/HTTP (Hono for Onyx, Baileys for NanoClaw)
- Compatibility with official LLM SDKs

### 4. Scheduled Task Support
- **Onyx (D8)**: Cron scheduling tool group in MVP
- **NanoClaw**: SQLite-backed task scheduler with cron expressions

Both recognize that AI assistants need time-based automation.

### 5. Rejection of OpenClaw's Complexity
Both projects cite OpenClaw's friction points:
- **Onyx PRD**: "Model subscription configuration overly difficult," "brew-centric extensibility," "not Docker/Linux friendly"
- **NanoClaw**: "52+ modules, 45+ dependencies" vs "500 lines you can understand in 8 minutes"

## Key Differences

### 1. Security Model (CRITICAL)
| Aspect | Onyx | NanoClaw |
|--------|------|----------|
| **MVP Security** | Trusted single-user; `runtime.exec` in MVP | Container-per-group isolation from day 1 |
| **Isolation Scope** | Phase 3: Docker containers per agent/session | **Immediate**: Apple Container (macOS) or Docker (Linux) |
| **Threat Model** | "Accepted only for self-hosted, single-user" | Multi-group chats assume untrusted users |
| **Credential Exposure** | TBD in Phase 3 | `CLAUDE_CODE_OAUTH_TOKEN` + `ANTHROPIC_API_KEY` exposed to containers (acknowledged risk) |
| **Mount Control** | Phase 3: bind mounts per agent/session | **Immediate**: External allowlist at `~/.config/nanoclaw/mount-allowlist.json` |

**Onyx's Risk**: Deferring container isolation to Phase 3 means MVP ships without NanoClaw's key security innovation. If Onyx remains "self-hosted single-user forever," this is acceptable. If multi-user is the real goal, container isolation should move to Phase 1.

### 2. Provider Abstraction Complexity
| Aspect | Onyx | NanoClaw |
|--------|------|----------|
| **Provider Count** | 4 SDKs (Vercel AI SDK, Claude Agent SDK, Codex SDK, Copilot SDK) | Claude Agent SDK only |
| **Model Routing** | Custom abstraction layer with prefix-based routing (`claude-subscription/`, `openai/`, `ollama/`, etc.) | No routing needed |
| **Auth Methods** | OAuth device flow (3 providers) + API keys (8+ providers) | Single Claude API key |
| **Complexity Trade-off** | Necessary for multi-provider goal | Intentionally avoided for auditability |

**Impact**: Onyx's provider abstraction will likely be 500+ lines on its own, equal to NanoClaw's entire core.

### 3. Communication Architecture
| Aspect | Onyx | NanoClaw |
|--------|------|----------|
| **Phase 1** | Web UI only (SvelteKit + shadcn-svelte) | WhatsApp only (Baileys library) |
| **Phase 2** | Discord + Telegram plugins (PluginProtocol interface) | Skills-based addition (no plugin system) |
| **Plugin Model** | Manifest-based with lifecycle hooks | No plugins; skills teach AI to modify codebase |

**Trade-off**: Onyx's plugin system is traditional software architecture (good for static analysis, versioning). NanoClaw's skills are radical but depend on AI to apply transformations correctly.

### 4. Storage Architecture
| Layer | Onyx | NanoClaw |
|-------|------|----------|
| **Memory** | MinIO (files) + SurrealDB (hybrid search) | Filesystem (`groups/{name}/CLAUDE.md`) |
| **Sessions** | MinIO (JSONL logs) + SurrealDB (metadata) | SQLite (queue, tasks) + filesystem |
| **Search** | Hybrid vector + BM25 (SurrealDB MTREE + full-text index) | No vector search; full context window |
| **Dependencies** | SurrealDB + MinIO + Ollama (embeddings) | SQLite only (zero external services for storage) |

**Complexity**: NanoClaw's flat-file + SQLite model is self-contained. Onyx's hybrid search requires standing up SurrealDB + MinIO + Ollama, adding operational overhead.

### 5. Deployment Topology
| Aspect | Onyx | NanoClaw |
|--------|------|----------|
| **Services** | 5-6 containers (onyx-api, onyx-frontend, surrealdb, minio, ollama, searxng) | Single process + SQLite |
| **Orchestration** | Docker Compose | Optional system service (macOS launchd, Linux systemd) |
| **Shared Infra** | Reuses menos infrastructure (SurrealDB, MinIO, Ollama) | No shared services |
| **Port Management** | Multiple exposed ports (18790 API, 5173/18791 frontend, 9000/9001 MinIO console) | Single process, no external ports besides WhatsApp WebSocket |

**Trade-off**: Onyx's multi-service model enables richer features (web search, hybrid search, object storage) but increases setup complexity. NanoClaw's single-process model is easier to deploy but limits capability.

### 6. Developer Experience (Extensibility)
| Aspect | Onyx | NanoClaw |
|--------|------|----------|
| **Extension Model** | Traditional: Plugin manifests, TypeScript modules, PluginProtocol interface | **Revolutionary**: Skills (`.claude/skills/`) teach Claude Code how to modify your fork |
| **Adding a Feature** | Write TypeScript code, define manifest, register plugin | Write a skill file that instructs AI how to transform the codebase |
| **Community Contributions** | Pull requests with code changes | Pull requests with skill instructions (no code changes to core) |
| **Maintenance Burden** | Maintainer merges features into core | Maintainer curates skill library; users apply skills to their forks |

**NanoClaw's Innovation**: Skills are AI-native extensibility. Example: "Add Telegram support" doesn't require a Telegram plugin in core—just a skill file that teaches Claude Code which dependencies to install, how to modify I/O routing, and how to configure credentials.

**Onyx's Constraint**: Multi-provider abstraction + hybrid search + plugin system likely require traditional code architecture. Skills could augment (e.g., "add a new tool"), but core features are too complex for AI-generated transformations.

### 7. Agent Swarms
| Aspect | Onyx | NanoClaw |
|--------|------|----------|
| **Support** | Not explicitly planned (could use Vercel AI SDK's multi-agent primitives) | **Native**: Claude Agent SDK supports swarms; each sub-agent runs in isolated container |
| **Use Cases** | Not documented | Research teams (web search + analysis + synthesis), dev workflows (review + test + docs) |

**Gap**: NanoClaw's Agent Swarms are a Phase 2+ feature for Onyx, if at all.

## Recommendations for Onyx

### Adopt

#### 1. **Container Isolation for Runtime Tools (Phase 1, not Phase 3)**
**From**: NanoClaw's container-per-group model with mount allowlists

**Why**: Onyx's D8 states "runtime.exec is intentionally included in MVP before sandbox isolation" but acknowledges "internet-exposed or multi-user deployment with runtime.exec enabled is out of MVP security posture." NanoClaw proves that container isolation is achievable in a lightweight first release.

**How to Apply**:
- Move D10 (Deployment) container isolation from Phase 3 to Phase 1
- Per-agent container spawning (like NanoClaw's per-group containers)
- Mount allowlist at `~/.config/onyx/mount-allowlist.json` (copy NanoClaw's blocklist patterns: `.ssh`, `.gnupg`, `.aws`, `credentials`, `.env`, `id_rsa`)
- Agent runtime tools (`fs.read`, `fs.write`, `runtime.exec`) execute inside ephemeral containers, not the main Onyx process
- Accept the added complexity (container orchestration in MVP) for better security posture

**Trade-off**: Adds ~200-300 lines for container spawning + IPC (based on NanoClaw's `container-runner.ts`), but removes "single-user only" constraint from MVP.

**PRD Sections**: D8 (MVP Risk Acceptance), Phase 3 (Sandbox isolation)

#### 2. **Skills-Based Extensibility for Non-Core Features**
**From**: NanoClaw's `.claude/skills/` model

**Why**: Onyx will have a stable core (provider abstraction, memory, sessions, web UI) but many optional enhancements (additional tools, menos integration, git/docker tools). Skills enable community contributions without bloating the core.

**How to Apply**:
- Create `onyx/.claude/skills/` directory structure
- Document core extension points (tool registration, plugin manifest format, agent workspace customization)
- For Phase 2+ features (menos integration, git/docker tools, mermaid rendering), ship skills instead of code
- Example skill: `/skills/add-menos-tools/SKILL.md` teaches Claude Code how to add `menos_search` and `menos_ingest` tools

**What NOT to Use Skills For**:
- Core MVP features (provider abstraction, memory, sessions, API, web UI)
- Security-critical code (auth, container spawning, credential encryption)
- Complex multi-file refactors (hybrid search, plugin protocol)

**PRD Sections**: Phase 2 (Integrations), D8 (Tool System - post-MVP tools)

#### 3. **Per-Agent Memory Isolation (Already Planned, Validate Implementation)**
**From**: NanoClaw's per-group `CLAUDE.md` files with isolated filesystem mounts

**Why**: Onyx D9 defines per-agent workspaces (`~/.config/onyx/workspace`, `~/.config/onyx/workspace-research`) but doesn't specify isolation guarantees. NanoClaw's model ensures agents cannot read each other's memory even if compromised.

**How to Apply**:
- Confirm that agent A's memory files in MinIO (`onyx-memory/{agent_id}/`) are not accessible to agent B's runtime context
- If using container isolation (Recommendation #1), each agent's container mounts only its own `{agent_id}/` prefix
- Add validation in `SessionManager` (D5) to reject cross-agent memory reads unless explicitly allowed via config

**PRD Sections**: D1 (Memory Architecture), D9 (Agent Definition Format)

#### 4. **Filesystem-Based IPC for Container Communication**
**From**: NanoClaw's `ipc.ts` (filesystem-based inter-process communication)

**Why**: If Onyx adopts container isolation (#1), agents need a way to return results to the main gateway process. NanoClaw uses filesystem IPC (agents write to shared mount, gateway polls).

**How to Apply**:
- Create shared IPC mount at `/tmp/onyx-ipc` (or similar)
- Agent containers write results to `/tmp/onyx-ipc/{session_id}/response.jsonl`
- Gateway polls for completion, reads results, cleans up IPC files
- Alternative: Unix domain sockets (more complex but avoids polling)

**Trade-off**: Filesystem IPC is simple but requires polling. Sockets are faster but harder to debug.

**PRD Sections**: D5 (Session Persistence), Phase 3 (Sandbox isolation) — now Phase 1 if following Recommendation #1

#### 5. **Explicit Token Budget Tracking (MVP)**
**From**: NanoClaw's documented token consumption issues ("Burned 7M tokens in 45 minutes")

**Why**: NanoClaw users reported runaway token costs due to full-context uploads. Onyx should learn from this and implement budget controls early.

**How to Apply**:
- Add `usage: { prompt_tokens, completion_tokens, total_tokens }` tracking to all provider responses (D4)
- Store token counts in SurrealDB `session` table (D5 already defines `token_count` field)
- Add UI in web interface (D7) showing per-session token usage + daily/monthly totals
- Warn users when session context exceeds configurable threshold (e.g., 50k tokens)

**PRD Sections**: D5 (Session Persistence - `token_count` field), D7 (Web Interface - Config page)

### Consider

#### 6. **SQLite as Alternative to SurrealDB for MVP**
**From**: NanoClaw's SQLite-only storage

**Why**: Onyx's D1 memory architecture requires SurrealDB for hybrid search (vector MTREE + full-text index). But if hybrid search is more complex than anticipated, SQLite with extensions (sqlite-vss for vector search, FTS5 for full-text) could simplify MVP.

**Trade-offs**:
- **Pro**: Single-file database, zero external services, easier deployment
- **Con**: Less mature vector search (sqlite-vss is experimental), no distributed capabilities for future multi-user
- **Con**: Onyx already shares SurrealDB with menos (D2), so adding SQLite duplicates infrastructure

**Decision Point**: If SurrealDB's JavaScript client is immature or hybrid search proves difficult, revisit this. Otherwise, proceed with SurrealDB as planned.

**PRD Sections**: D1 (Memory Architecture), D2 (menos Integration)

#### 7. **Apple Container Support (macOS Development)**
**From**: NanoClaw's macOS-first design with Apple Container

**Why**: Onyx PRD states "Not Docker/Linux friendly" as an OpenClaw criticism and chooses Linux-first. But if developers run macOS, supporting Apple Container (lightweight Linux VMs optimized for Apple Silicon) would improve DX.

**Trade-offs**:
- **Pro**: Faster startup than Docker on macOS, lower memory overhead
- **Con**: Adds platform-specific code (Apple Container vs Docker runtime detection)
- **Con**: Onyx's Linux-first goal means Docker must work well anyway

**Decision Point**: If primary developer(s) use macOS and container performance is poor, add Apple Container as an optional runtime alongside Docker. Otherwise, skip.

**PRD Sections**: D10 (Deployment Topology)

#### 8. **Simplified Memory Model (Flat Files, No Hybrid Search)**
**From**: NanoClaw's `CLAUDE.md` per group (no embeddings, no vector search)

**Why**: Onyx D1 defines hybrid vector + BM25 search with Ollama embeddings. This requires:
- Embedding model management (1024-d nomic-embed-text)
- Chunking strategy (400 tokens, 80 overlap)
- Full-text index configuration
- Reindexing on embedding model change

NanoClaw avoids all this by sending full `CLAUDE.md` in every request.

**Trade-offs**:
- **Pro (NanoClaw's model)**: Drastically simpler, no embedding dependencies, no index staleness
- **Con (NanoClaw's model)**: Context window limits scale (100k tokens ≈ 400kb of memory), high token costs for long conversations
- **Pro (Onyx's model)**: Scales to unlimited memory, retrieval is cost-efficient
- **Con (Onyx's model)**: Complex infrastructure, embedding drift risk, reindexing overhead

**Decision Point**: If MVP users will have <50kb of memory per agent, flat files are viable. If memory grows beyond 100k tokens, hybrid search is necessary.

**Recommendation**: Proceed with hybrid search as planned (D1), but document flat-file fallback as a "simple mode" for future consideration.

**PRD Sections**: D1 (Memory Architecture)

#### 9. **Unified Frontend + API Service (Single Container)**
**From**: NanoClaw's single-process architecture

**Why**: Onyx D10 is marked "OPEN" — separate onyx-api + onyx-frontend services vs unified serving. NanoClaw proves single-process is viable.

**Trade-offs**:
- **Pro (unified)**: Simpler deployment, single container, no inter-service networking
- **Con (unified)**: SvelteKit server-side rendering in same process as Hono API (potential architectural friction)
- **Pro (separate)**: Clean separation of concerns, frontend can scale independently, matches agent-spike reference repo
- **Con (separate)**: More containers to manage, additional network hops

**Recommendation**: Start with separate services (matches agent-spike reference, clear boundaries). If deployment complexity is painful, unify in Phase 2.

**PRD Sections**: D10 (Deployment Topology)

### Avoid

#### 10. **WhatsApp as Primary Interface**
**From**: NanoClaw's Baileys-based WhatsApp integration

**Why**: Onyx PRD explicitly chooses web UI first (D7), bot plugins in Phase 2 (D3). WhatsApp via Baileys introduces:
- **Legal risk**: Unofficial API, violates WhatsApp ToS, ban risk
- **Maintenance burden**: Baileys tracks WhatsApp's undocumented WebSocket protocol; breaks frequently
- **Deployment friction**: QR code scanning + pairing code auth in headless Docker environment

**Better Alternative**: Official bot platforms (Discord, Telegram) with documented APIs and sanctioned automation.

**PRD Sections**: D3 (Bot Plugin Architecture - Discord/Telegram in Phase 2), D7 (Web Interface - primary MVP interface)

#### 11. **Single-LLM Lock-In**
**From**: NanoClaw's Claude-only design

**Why**: Onyx D4 explicitly targets multi-provider support (4-SDK abstraction). Single-LLM lock-in creates:
- **Vendor risk**: Anthropic API downtime = complete outage
- **Cost risk**: No ability to route to cheaper models (Ollama local) or alternative providers (OpenRouter fallback)
- **Feature loss**: OpenAI's function calling, Bedrock's Claude access, Ollama's offline operation

**Cost Example**: NanoClaw users "burned 7M tokens in 45 minutes" at $3 input / $15 output = $21-$105 (depending on input/output ratio). Onyx's ability to route to Ollama (free) or OpenRouter ($0.20/1M) provides cost control.

**PRD Sections**: D4 (LLM Provider Strategy - 4-SDK abstraction is core goal)

#### 12. **Skills-Only Extensibility (No Plugin System)**
**From**: NanoClaw's rejection of plugin manifests

**Why**: Onyx D3 defines PluginProtocol interface with manifest-based plugins. This is appropriate because:
- **Type safety**: Plugin interfaces are statically analyzable (vs AI-generated transformations)
- **Versioning**: Manifest declares dependencies, compatibility (skills have no version contract)
- **Phase 3 extraction**: Plugins can move to separate processes (REST/gRPC); skills cannot

**When to Use Skills (per Recommendation #2)**: Non-core features, optional tools, community enhancements.

**When NOT to Use Skills**: Security-critical code, core abstractions (provider layer, memory, sessions), architectural boundaries (plugin protocol).

**PRD Sections**: D3 (Bot Plugin Architecture)

#### 13. **No Vector Search (Full-Context Every Request)**
**From**: NanoClaw's full `CLAUDE.md` upload per request

**Why**: Onyx D1 explicitly designs for unlimited memory scale via hybrid search. NanoClaw's model:
- **Fails at scale**: Claude's 200k context window ≈ 800kb text; long-term memories exceed this
- **Wastes tokens**: Sending full context every request is expensive (NanoClaw users burned 7M tokens in 45 minutes)
- **Lacks precision**: Full-context retrieval is all-or-nothing; hybrid search retrieves top-k relevant chunks

**Onyx's Model**: Hybrid vector + BM25 search retrieves 5-20 most relevant chunks (not full memory), reducing token costs while scaling to unlimited memory.

**PRD Sections**: D1 (Memory Architecture - hybrid search)

#### 14. **Implicit Tool Access (No Tool Restriction System)**
**From**: NanoClaw's container-level isolation as sole access control

**Why**: Onyx D9 defines per-agent tool restrictions (`tools.allow`, `tools.deny`). NanoClaw has no tool-level permissions—container isolation is the only boundary.

**Risk**: A compromised agent in NanoClaw can execute arbitrary code within its container, access mounted directories, and call external APIs (limited only by container capabilities). Onyx's tool restrictions add defense-in-depth:
- Research agent: Allow `web_search`, `memory_read`; Deny `shell_exec`, `fs_write`
- Admin agent: Full tool access

**Even with container isolation (Recommendation #1), tool restrictions are useful** for limiting accidental damage (e.g., prevent agent from deleting files when only read access is needed).

**PRD Sections**: D9 (Agent Definition Format - `tools.allow` / `tools.deny`)

## Sources

### Onyx PRD
- **D1 (Memory Architecture)**: Lines 73-168 — Files-first in MinIO, SurrealDB hybrid search
- **D2 (menos Integration)**: Lines 172-235 — Shared infrastructure, query-only integration
- **D3 (Bot Plugin Architecture)**: Lines 239-329 — Plugin interfaces MVP, Discord/Telegram Phase 2
- **D4 (LLM Provider Strategy)**: Lines 333-416 — 4-SDK abstraction layer
- **D5 (Session Persistence)**: Lines 420-479 — MinIO JSONL + SurrealDB metadata
- **D6 (API Design)**: Lines 483-607 — OpenAI-compatible HTTP API
- **D7 (Web Interface)**: Lines 611-775 — SvelteKit + shadcn-svelte, provider config UI
- **D8 (Tool System)**: Lines 779-837 — Built-in tool groups, MVP runtime tools risk acceptance
- **D9 (Agent Definition Format)**: Lines 841-1006 — OpenClaw-compatible JSON + workspace markdown
- **D10 (Deployment Topology)**: Lines 841-873 — Open decision on service split

### NanoClaw Research
- **Architecture Philosophy**: Lines 49-52 — "AI-native software," one LLM/platform/DB/machine
- **File Structure**: Lines 68-92 — 4 source files, ~2000 lines total
- **Security Model**: Lines 140-162 — Container isolation, mount allowlist, trust tiers
- **Skills-Based Extensibility**: Lines 223-248 — `.claude/skills/` teach Claude Code transformations
- **Cost Implications**: Lines 165-174 — Token consumption issues ("7M tokens in 45 minutes")
- **Trade-offs**: Lines 189-198 — Simplicity vs generality comparison table
- **Agent Swarms**: Lines 130-137 — Native support via Claude Agent SDK

### Cross-Cutting Analysis
- **Container Isolation**: NanoClaw lines 140-162, Onyx D8 (MVP Risk Acceptance) + Phase 3 (Sandbox isolation)
- **Token Budget**: NanoClaw lines 165-174, Onyx D5 (`token_count` field)
- **Provider Abstraction**: NanoClaw lines 59-64 (Claude only), Onyx D4 (4-SDK abstraction)
- **Memory Scale**: NanoClaw lines 68-92 (flat files), Onyx D1 (hybrid search)
