# Onyx vs Nanobot: Architecture Comparison

**Generated**: 2026-02-16
**Purpose**: Evaluate architectural lessons from Nanobot for Onyx development

## Executive Summary

Nanobot demonstrates that a 4,000-line Python codebase can deliver full-featured AI agent capabilities with 0.8s startup, 45MB memory footprint, and MCP-native architecture. Onyx should adopt Nanobot's provider registry pattern, workspace sandboxing strategy, and Docker deployment approach while maintaining its TypeScript/Bun stack decision and files-first memory philosophy. The key divergence: Onyx prioritizes OpenClaw config compatibility and SurrealDB hybrid search, while Nanobot prioritizes extreme minimalism and MCP-centric tool integration.

## Architecture Overview

| Dimension | Onyx (PRD) | Nanobot | Notes |
|-----------|-----------|---------|-------|
| **Language/Runtime** | TypeScript, Bun | Python 3.11+ | Onyx: unified frontend/backend lang. Nanobot: ~3,668 core lines |
| **Philosophy** | OpenClaw-compatible, infrastructure reuse | Unix philosophy, MCP-centric host | Onyx: OpenClaw config compat. Nanobot: minimal, readable research code |
| **Codebase Size** | TBD (targeting <10k lines) | ~4,000 lines (99% smaller than OpenClaw) | Nanobot proves minimal viability |
| **Startup Time** | Target: <2s | 0.8s | Nanobot sets aggressive benchmark |
| **Memory Footprint** | Target: <100MB (excluding LLM) | 45MB (191MB total) | Nanobot validates lightweight approach |
| **Storage Backend** | SurrealDB + MinIO | Filesystem + config.json | Onyx: shared infra with menos. Nanobot: zero-setup |
| **Memory System** | Files-first (MinIO), hybrid vector+BM25 search (SurrealDB) | Long-term + short-term, interleaved CoT, filesystem | Onyx: explicit hybrid search. Nanobot: simpler in-process |
| **LLM Providers** | 4-SDK abstraction (Vercel AI SDK + 3 subscription SDKs) | 11 providers via Provider Registry pattern | Both: multi-provider. Nanobot's registry = 2-step add, no if-elif chains |
| **Communication** | Plugins (Discord, Telegram post-MVP) | 8 platforms (Telegram, Discord, WhatsApp, Feishu, etc.) | Nanobot ships more channels in MVP |
| **API Design** | OpenAI-compatible HTTP API (Hono) | Gateway WebSocket + MCP | Onyx: REST-first. Nanobot: WebSocket + MCP-native |
| **Tool System** | Built-in groups (memory, sessions, web, fs, runtime, schedule) | File ops, shell, web search, meta-capabilities | Similar scope. Nanobot: MCP wrapper approach |
| **Config Format** | OpenClaw-compatible JSON (`~/.config/onyx/onyx.json`) | `~/.nanobot/config.json` | Onyx: explicit OpenClaw migration path. Nanobot: simpler schema |
| **Workspace Model** | Agent workspace dirs (AGENTS.md, SOUL.md, MEMORY.md, etc.) | Agent workspace dirs (similar) | Both adopt workspace-per-agent pattern |
| **Security** | Phase 3 sandbox isolation (Docker containers per agent/session) | `restrictToWorkspace: true` (filesystem sandbox) | Nanobot ships sandboxing in MVP. Onyx defers to Phase 3 |
| **Deployment** | Docker Compose stack (Onyx + SurrealDB + MinIO + Ollama + SearXNG) | Single Docker image, volume mounts | Onyx: shared infra. Nanobot: self-contained |
| **Web UI** | SvelteKit + shadcn-svelte (dashboard + provider config) | None (CLI-first) | Onyx: browser-first control UI. Nanobot: terminal UX |
| **Session Persistence** | JSONL in MinIO + metadata in SurrealDB | Filesystem | Onyx: object storage + indexed metadata. Nanobot: simpler local files |
| **Extensibility** | Plugin interfaces (PluginProtocol), post-MVP extraction | Plugin SDK (Channel, Tool, LLMProvider APIs), v0.3-v0.4 stabilization | Both: plugin architecture. Nanobot: earlier SDK release |
| **Testing** | bun test (API), Vitest (frontend), Playwright (E2E) | TBD (not documented in research) | Onyx: explicit test strategy |
| **Dependencies** | Hono, Zod, SurrealDB, MinIO, Ollama, ai (Vercel AI SDK), subscription SDKs | MCP, WebSocket libs, Provider Registry | Onyx: heavier stack. Nanobot: minimal deps |
| **Licensing** | TBD | MIT | Nanobot: fully open source |

## Key Similarities

### 1. Workspace-Per-Agent Model
Both adopt files-as-truth agent workspace pattern:
- **Onyx**: `~/.config/onyx/workspace/` with `AGENTS.md`, `SOUL.md`, `MEMORY.md`, `USER.md`, `IDENTITY.md`, `TOOLS.md`, `skills/`, `memory/YYYY-MM-DD.md` (PRD D9)
- **Nanobot**: Similar workspace structure with memory files and agent-specific directories (Research doc: "Memory System", "Configuration Management")

**Why it matters**: Both recognize markdown files as human-editable, git-friendly, and auditable truth sources.

### 2. Multi-Provider LLM Support
Both abstract away provider differences:
- **Onyx**: 4-SDK abstraction layer unifying subscription SDKs (Claude Agent SDK, Codex SDK, Copilot SDK) + Vercel AI SDK (PRD D4)
- **Nanobot**: Provider Registry pattern supporting 11 providers (OpenRouter, Anthropic, OpenAI, DeepSeek, Groq, Gemini, MiniMax, Qwen, Moonshot, Zhipu, vLLM) (Research: "Multi-Provider Architecture")

**Why it matters**: Both avoid vendor lock-in and enable users to route tasks to optimal models.

### 3. Tool System Philosophy
Both provide filesystem, shell, web search, and meta-capabilities:
- **Onyx**: `memory`, `sessions`, `web`, `fs`, `runtime`, `schedule` tool groups (PRD D8)
- **Nanobot**: File operations, shell execution, web search, meta-capabilities (Research: "Core Capabilities")

**Why it matters**: Both enable agents to perform practical workflows, not just chat.

### 4. Research-Ready Design Goals
- **Onyx**: Targets readable codebase, fewer moving parts than OpenClaw (PRD: "Why Not Just Use OpenClaw?")
- **Nanobot**: ~4,000 lines, clean code for researchers modifying memory/planning algorithms (Research: "Core Design Philosophy")

**Why it matters**: Both prioritize auditability and modification over feature maximalism.

### 5. Docker Deployment
Both ship Docker images for reproducible deployment:
- **Onyx**: Docker Compose with SurrealDB, MinIO, Ollama, SearXNG (PRD D10)
- **Nanobot**: `cgr.dev/chainguard/wolfi-base` with `/data` volume, port 8080 (Research: "Docker Deployment")

**Why it matters**: Both avoid "works on my machine" issues.

## Key Differences

### 1. Core Philosophy: Infrastructure Reuse vs Minimalism
- **Onyx**: Rebuilds OpenClaw on existing menos infrastructure (SurrealDB, MinIO, Ollama already running). Shares namespaces/buckets. Goal: avoid adding SQLite when better infra exists. (PRD D2)
- **Nanobot**: Zero-dependency philosophy. Single binary with filesystem storage. 191MB total footprint runs on Raspberry Pi or $10 ARM boards. (Research: "Resource Efficiency")

**Trade-off**: Onyx assumes infrastructure already deployed (menos users). Nanobot assumes bare metal / minimal VPS.

### 2. Memory Architecture: Hybrid Search vs Filesystem
- **Onyx**: Files-first in MinIO (truth), SurrealDB as search index (derived). Explicit hybrid vector+BM25 with weighted RRF merging. Embedding dimension policy, full-text index requirements, sync flow. (PRD D1)
- **Nanobot**: Long-term + short-term memory, interleaved chain-of-thought, filesystem-backed. No explicit vector search spec. (Research: "Memory System")

**Trade-off**: Onyx: more complex but scales to large memory corpora. Nanobot: simpler but relies on LLM context window for retrieval.

### 3. API Design: REST vs WebSocket+MCP
- **Onyx**: OpenAI-compatible HTTP API (`POST /v1/chat/completions`, `GET /v1/models`) via Hono. Streaming via SSE. Extensions for sessions, memory, agents. (PRD D6)
- **Nanobot**: Gateway WebSocket, full MCP host. Exposes agents as MCP servers. (Research: "Model Context Protocol Integration")

**Trade-off**: Onyx: drop-in OpenAI replacement, REST client compatibility. Nanobot: MCP-native tooling, bidirectional streaming.

### 4. UI Strategy: Browser vs CLI
- **Onyx**: SvelteKit + shadcn-svelte control UI (chat, sessions, memory browser, agent config, provider settings). Provider config page with OAuth status, API key management. (PRD D7)
- **Nanobot**: CLI-first (`nanobot agent`), no built-in web UI. (Research: "Installation and Setup")

**Trade-off**: Onyx: friendlier for non-technical users. Nanobot: faster for terminal power users.

### 5. Security: MVP Sandbox vs Phase 3
- **Onyx**: Runtime tools (`runtime.exec`) in MVP without sandbox. Sandbox isolation (Docker containers per agent/session) deferred to Phase 3. Accepted risk: single-user, self-hosted only. (PRD D8, Phase 3)
- **Nanobot**: `restrictToWorkspace: true` ships in MVP (v0.1.3.post7), sandboxes all tools to workspace directory. (Research: "Security Configuration")

**Trade-off**: Nanobot ships safer MVP. Onyx prioritizes feature velocity, accepts restricted deployment scope.

### 6. Provider Strategy: Subscription SDKs vs API Keys
- **Onyx**: Phase 1 = Vercel AI SDK (API keys). Phase 2 adds subscription SDKs (Claude Agent SDK, Codex SDK, Copilot SDK) with OAuth device flows. Docker auth state mounts required. (PRD D4)
- **Nanobot**: API key providers only. 11 providers, no subscription SDK strategy documented. (Research: "Multi-Provider Architecture")

**Trade-off**: Onyx: more auth complexity, broader provider support (subscription + API key). Nanobot: simpler, API key only.

### 7. Deployment Topology: Shared Stack vs Self-Contained
- **Onyx**: Onyx API + Onyx Frontend + SurrealDB + MinIO + Ollama + SearXNG in one `docker-compose.yml`. Shared network with menos. (PRD D10)
- **Nanobot**: Single Docker image with volume mounts (`~/.nanobot:/root/.nanobot`). No external dependencies. (Research: "Docker Deployment")

**Trade-off**: Onyx: assumes infrastructure already running for menos. Nanobot: standalone, portable.

### 8. Codebase Language: TypeScript vs Python
- **Onyx**: TypeScript/Bun for frontend (SvelteKit) + backend (Hono). Shared types, unified language. (PRD: "MAJOR PIVOT: Python → TypeScript/Bun")
- **Nanobot**: Python 3.11+. (Research: "Technical Stack")

**Trade-off**: Onyx: single-language stack simplicity. Nanobot: Python ecosystem for research (numpy, pandas, transformers).

## Recommendations for Onyx

### Adopt

#### 1. Provider Registry Pattern (High Priority)
**What**: Nanobot's Provider Registry pattern eliminates if-elif chains for adding LLM providers. Two-step process: (1) implement provider interface, (2) register in `registry.py`. No code changes elsewhere. (Research: "Multi-Provider Architecture", "Adding Custom Providers")

**How to apply**:
- Create `api/src/providers/registry.ts` as single source of truth for provider mapping
- Define `ProviderBackend` interface (equivalent to Nanobot's `LLMProvider` base class)
- Providers register themselves via `registerProvider(name, factory)` function
- Router uses `getProvider(model: string)` which queries registry, eliminating hardcoded model prefix logic

**Rationale**: Onyx PRD D4 already shows model prefix routing (`claude-subscription/`, `codex/`, `copilot/`, `ollama/`, etc.). Registry pattern makes this extensible without modifying core routing code.

**Reference**: PRD D4 `getProvider(model: string)` function is candidate for registry refactor.

#### 2. Workspace Sandboxing (`restrictToWorkspace: true`) in MVP (High Priority)
**What**: Nanobot ships filesystem sandbox in MVP (v0.1.3.post7): when enabled, all file/shell tools restricted to workspace directory. Production deployments set `"restrictToWorkspace": true` in config. (Research: "Security Configuration")

**How to apply**:
- Add `restrictToWorkspace: boolean` field to `onyx.json` agent config (PRD D9)
- Tool execution layer checks flag before allowing filesystem/shell operations
- If enabled, reject any path outside `${agent.workspace}/`
- Document as recommended for any non-localhost deployment

**Rationale**: PRD D8 accepts MVP risk of unrestricted `runtime.exec` for "single-user, self-hosted only". Nanobot proves lightweight sandboxing is achievable in MVP without full Docker container isolation. Reduces attack surface for Phase 1 deployments.

**Reference**: PRD D8 MVP Risk Acceptance section, Phase 3 sandbox isolation. Nanobot shows simpler path exists.

#### 3. Docker Volume Mount Strategy (Medium Priority)
**What**: Nanobot Docker image uses `/data` volume for persistence (session state, config, workflow files). Clear separation: ephemeral container code, persistent user data. (Research: "Docker Deployment")

**How to apply**:
- Onyx API container mounts `~/.config/onyx:/app/config` (agent definitions, `onyx.json`)
- MinIO/SurrealDB data volumes remain separate (already planned in PRD D10)
- Provider auth state mounts: `~/.config/onyx/auth:/app/auth` (PRD D4 Docker Auth State requirements)
- Document required mounts in `docker-compose.yml` and startup validation

**Rationale**: PRD D4 already requires "explicit mount points for provider auth state". Nanobot's `/data` volume pattern is proven, simple, matches Onyx needs.

**Reference**: PRD D10 service map, PRD D4 Docker Auth State section.

#### 4. Fast Startup Target (<1s for core, <2s total) (Medium Priority)
**What**: Nanobot achieves 0.8s startup (excluding LLM inference) via minimal dependencies, lazy loading, no heavy framework imports. (Research: "Resource Efficiency")

**How to apply**:
- Lazy-load provider SDKs (don't import all 4 backends at startup, import on first use)
- Defer SvelteKit frontend startup until API is healthy
- Use Bun's fast startup (already faster than Node.js)
- Measure startup time in CI, fail if >2s

**Rationale**: Developer experience + production restarts. Onyx targets "fewer moving parts than OpenClaw". Fast startup validates minimalism.

**Reference**: PRD "Why Not Just Use OpenClaw?" (complexity reduction), Nanobot benchmark sets aggressive goal.

#### 5. CLI Plugin for Terminal Users (Phase 2 Priority)
**What**: Nanobot is CLI-first (`nanobot agent`), no web UI. Terminal UX is fast for power users. (Research: "Installation and Setup", "UI Strategy")

**How to apply**:
- Phase 2: Implement CLI plugin using `PluginProtocol` interface (PRD D3)
- Interactive terminal session with readline/prompt
- Streams assistant responses to stdout
- Tool calls rendered as structured output (JSON or formatted text)
- Use same backend API as web UI (`/v1/chat/completions`)

**Rationale**: PRD Phase 2 already includes "CLI plugin". Nanobot validates demand for terminal-first workflows. Onyx web UI is primary, but CLI is zero-cost addition via plugin system.

**Reference**: PRD D3 Plugin Interface, PRD Phase 2 roadmap.

### Consider

#### 6. MCP Support (Phase 3, Evaluate Trade-offs)
**What**: Nanobot is "built entirely around Model Context Protocol (MCP)", functions as full MCP host with conversational memory, autonomous reasoning. Exposes agents as MCP servers. (Research: "Core Design Philosophy", "Model Context Protocol Integration")

**How to apply**:
- Phase 3: Add MCP server interface to Onyx agents
- Agents expose tools, prompts, sampling via MCP protocol
- External MCP clients can connect to Onyx agents
- Onyx can consume external MCP servers as tool providers

**Trade-offs**:
- **Pros**: Interoperability with MCP ecosystem (Claude Desktop, Zed, other MCP clients). Standardized tool protocol. Nanobot community validation.
- **Cons**: Onyx is already OpenAI-compatible (PRD D6). Two API surfaces (OpenAI HTTP + MCP) increases complexity. MCP adoption still maturing (Feb 2026).
- **Timing**: PRD Phase 3 already lists "MCP support". Nanobot's MCP-centric success suggests prioritizing earlier (Phase 2) if OpenAI API proves limiting.

**Recommendation**: Prototype MCP interface in Phase 2 as optional backend. If community requests MCP access, promote to Phase 2. Otherwise defer to Phase 3.

**Reference**: PRD Phase 3 roadmap, PRD D6 (OpenAI-compatible API is primary).

#### 7. Interleaved Chain-of-Thought Memory (Phase 2 Research)
**What**: Nanobot redesigned memory system with "interleaved chain-of-thought for smarter multi-step reasoning". (Research: "Memory System")

**How to apply**:
- Research Nanobot's memory implementation (source code at `nanobot/memory/`)
- Prototype interleaved CoT pattern: LLM reasoning steps interspersed with memory queries
- Example: Agent searches memory → reasons about results → searches again with refined query → reasons → final answer
- Compare to Onyx's hybrid vector+BM25 single-shot search (PRD D1)

**Trade-offs**:
- **Pros**: Potentially more accurate retrieval for complex queries. Mirrors human "search → refine → search" workflow.
- **Cons**: More LLM calls = higher latency + cost. Onyx hybrid search already weighted (70% vector, 30% BM25). Diminishing returns?
- **Timing**: Phase 2 memory enhancements, not MVP.

**Recommendation**: Benchmark Nanobot's CoT memory pattern against Onyx hybrid search on same corpus. Adopt if demonstrably better on Onyx use cases (personal knowledge base, conversation history).

**Reference**: PRD D1 Hybrid Search section, Nanobot research "Memory System".

#### 8. Plugin SDK Stabilization Strategy (Phase 2)
**What**: Nanobot roadmap includes versioned plugin interfaces (Channel, Tool, LLMProvider APIs) with migration guides for breaking changes. Estimated v0.3-v0.4 for stable SDK. (Research: "Plugin System", "Early Stage Maturity")

**How to apply**:
- Phase 2: Freeze `PluginProtocol` interface (PRD D3) as v1.0
- Semantic versioning: breaking changes require major version bump
- Plugin manifest includes `api_version: "1.0"` field
- Onyx core checks plugin API version, rejects incompatible plugins
- Publish migration guide for each breaking change

**Trade-offs**:
- **Pros**: Plugin ecosystem stability. Third-party developers can build without fear of breakage. Nanobot learned this lesson early.
- **Cons**: Interface lock-in. Harder to evolve core abstractions. Requires careful upfront design.
- **Timing**: Phase 2 when bot plugins ship (Discord, Telegram). MVP plugins are in-process, versioning less critical.

**Recommendation**: Document `PluginProtocol` interface stability guarantees in Phase 2. Adopt semantic versioning for plugin API. Learn from Nanobot's v0.3-v0.4 timeline (shipped plugin SDK ~2 weeks post-launch).

**Reference**: PRD D3 Plugin Architecture, PRD Phase 2 bot plugins.

#### 9. Crowdfunding / Sustainability Model (Post-MVP)
**What**: Nanobot raised $7,500 via bags.app crowdfunding despite MIT license. Community financially supports open-source development. (Research: "Related Projects and Further Reading")

**How to apply**:
- Post-MVP: Add "Sponsor" section to README with links to GitHub Sponsors, Ko-fi, or similar
- Transparent roadmap with community-voted priorities
- Acknowledge sponsors in release notes
- MIT license ensures free/open, sponsorship funds maintainer time

**Trade-offs**:
- **Pros**: Sustainable open-source funding. Aligns incentives (community funds features they want). Nanobot validation.
- **Cons**: Requires marketing effort. No guarantees of income. Potential pressure from sponsors.
- **Timing**: Post-MVP when user base exists.

**Recommendation**: If Onyx gains traction (>1k GitHub stars), explore sponsorship. Nanobot proves community will fund quality open-source AI tooling.

**Reference**: Nanobot research "Follow-up Questions" #10.

### Avoid

#### 10. Filesystem-Only Storage (Avoid, Keep SurrealDB+MinIO)
**What**: Nanobot uses filesystem storage (`~/.nanobot/config.json`, workspace files). No database. (Research: "Software Architecture")

**Why avoid**: Onyx PRD D1 explicitly chooses files-first in MinIO + SurrealDB search index for:
- **Hybrid vector+BM25 search**: SurrealDB `MTREE` + full-text index. Filesystem can't do this.
- **Scalability**: Onyx targets large memory corpora (years of daily logs). SurrealDB indexes scale better than filesystem scan.
- **Infrastructure reuse**: SurrealDB + MinIO already running for menos. Zero marginal cost.
- **Object storage benefits**: MinIO handles replication, versioning, lifecycle policies. Filesystem doesn't.

**Reference**: PRD D1 Memory Architecture, PRD D2 menos Integration.

#### 11. Python Rewrite (Avoid, Keep TypeScript/Bun)
**What**: Nanobot is Python 3.11+. ~3,668 lines. (Research: "Technical Stack")

**Why avoid**: Onyx PRD explicitly pivoted from Python/FastAPI to TypeScript/Bun (2026-02-16) for:
- **Unified language**: SvelteKit (frontend) + Hono (backend) both TypeScript. Shared types (`shared/types.ts`, PRD file structure). No context switching.
- **Official subscription SDKs**: Claude Agent SDK, Codex SDK, Copilot SDK all have official TypeScript packages. Python equivalents don't exist or are unofficial.
- **Bun performance**: Faster startup than Node.js, matches Nanobot's 0.8s goal. Python startup is comparable but Bun has better TypeScript DX.
- **Ecosystem**: Vercel AI SDK (TypeScript-native) unifies 20+ providers. LiteLLM (Python) no longer needed.

**Reference**: PRD "MAJOR PIVOT: Python → TypeScript/Bun", PRD D4 Provider Strategy, CLAUDE.md context.

#### 12. CLI-Only UX (Avoid, Keep Web UI Priority)
**What**: Nanobot is CLI-first, no built-in web UI. (Research: "UI Strategy")

**Why avoid**: Onyx PRD D7 explicitly chooses SvelteKit web UI as primary interface for:
- **Provider configuration**: OAuth device flows (Claude subscription, Codex, Copilot) require browser-based auth. CLI can't easily handle OAuth redirects.
- **Memory/session browser**: Visualizing memory search results, session transcripts, agent logs is better in rich UI than terminal.
- **Non-technical users**: Web UI lowers barrier. Onyx targets personal assistant (non-developer use cases), not just research.
- **OpenClaw inspiration**: OpenClaw has Lit web components control UI. Onyx follows this pattern.

**Recommendation**: CLI plugin in Phase 2 for power users (as suggested in "Adopt" section), but web UI remains primary.

**Reference**: PRD D7 Web Interface, PRD "Why Not Just Use OpenClaw?", PRD Phase 2 CLI plugin.

#### 13. No Hybrid Search (Avoid, Keep Vector+BM25)
**What**: Nanobot memory system doesn't specify explicit vector+BM25 hybrid search. Relies on long-term/short-term memory + LLM context. (Research: "Memory System")

**Why avoid**: Onyx PRD D1 explicitly designs hybrid search for:
- **Semantic + keyword coverage**: Vector search finds conceptually similar memories, BM25 finds exact keyword matches. Complementary.
- **Weighted RRF merging**: 70% vector, 30% BM25 weights tuned for personal memory (from ClawRAG research). Better than pure vector.
- **Embedding dimension policy**: Deterministic reindex when model changes. Avoids stale embeddings.
- **SurrealDB capabilities**: `MTREE` index + full-text index in single query. Why not use it?

**Recommendation**: Keep PRD D1 hybrid search. Nanobot's simpler approach works for small memory corpora, but Onyx targets years of daily logs.

**Reference**: PRD D1 Memory Architecture, PRD "Research Summary" (ClawRAG hybrid search).

## Sources

### Onyx PRD
- `C:\Users\Mike\.dotfiles\.specs\onyx\prd.md` — Comprehensive PRD with 10 architectural decisions (D1-D10), roadmap, research summary, file structure, dependencies.
- Sections referenced: D1 (Memory), D2 (menos integration), D3 (Bot plugins), D4 (LLM providers), D6 (API design), D7 (Web UI), D8 (Tool system), D9 (Agent format), D10 (Deployment), "MAJOR PIVOT: Python → TypeScript/Bun", "Why Not Just Use OpenClaw?", Phase 1/2/3 roadmap.

### Nanobot Research
- `C:\Users\Mike\.dotfiles\.specs\nanobot\research-20260216-143000.md` — Deep research on HKUDS/nanobot (19.7k stars, ~4,000 lines Python, 0.8s startup, MCP-centric architecture).
- Sections referenced: "Core Design Philosophy", "Technical Stack", "Multi-Provider Architecture", "Plugin System", "Memory System", "Model Context Protocol Integration", "Docker Deployment", "Security Configuration", "Trade-offs and Considerations", "Common Pitfalls and Anti-Patterns".
- Key sources: GitHub Repository (https://github.com/HKUDS/nanobot), DeepWiki documentation, Analytics Vidhya tutorial, Nanobot vs OpenClaw comparison (juliangoldie.com), SuperPrompt Blog (OpenClaw alternatives).

### Cross-References
- **Provider Registry Pattern**: Nanobot research "Multi-Provider Architecture" + "Adding Custom Providers" → Onyx PRD D4 provider routing function.
- **Workspace Sandboxing**: Nanobot research "Security Configuration" (`restrictToWorkspace: true`) → Onyx PRD D8 MVP Risk Acceptance, Phase 3 sandbox isolation.
- **Docker Deployment**: Nanobot research "Docker Deployment" (`/data` volume) → Onyx PRD D10 service map, PRD D4 Docker Auth State.
- **Memory Architecture**: Nanobot research "Memory System" (long-term + short-term + CoT) → Onyx PRD D1 hybrid vector+BM25 search.
- **MCP Support**: Nanobot research "Model Context Protocol Integration" (full MCP host) → Onyx PRD Phase 3 roadmap.
- **CLI UX**: Nanobot research "Installation and Setup" (CLI-first) → Onyx PRD D7 (web UI primary), Phase 2 CLI plugin.
- **Startup Performance**: Nanobot research "Resource Efficiency" (0.8s startup, 45MB memory) → Onyx "Fast Startup Target" recommendation.
