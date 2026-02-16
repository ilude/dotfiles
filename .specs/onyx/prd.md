# Onyx - Personal AI Assistant Platform

**Status**: Planning / Research Phase
**Stack**: TypeScript, Bun, SvelteKit, SurrealDB, MinIO, Docker
**Relationship**: Sibling service to menos, shares infrastructure

---

## Vision

OpenClaw-inspired personal AI assistant with:
- Plugin architecture for Discord/Telegram bots
- Graph + vector memory using SurrealDB
- Multi-provider LLM support (Anthropic, OpenAI, Ollama, multi-provider via 4-SDK abstraction)
- Integration with menos content vault

**MVP Focus**: Personal assistant (single user) first, expand to multi-user/team later.

### Why Not Just Use OpenClaw?

OpenClaw's concept is right — always-on personal AI assistant with memory, plugins, and multi-platform support. But the implementation has friction:

- **Model subscription configuration** is overly difficult — getting it working with available subscriptions was painful
- **brew-centric extensibility** — plugin ecosystem and tooling assumes macOS with Homebrew
- **Not Docker/Linux friendly** — designed for local macOS development, not containerized Linux deployment
- **SQLite limitations** — we already run SurrealDB + MinIO for menos; no reason to add SQLite

Onyx keeps OpenClaw's philosophy (files-first memory, workspace markdown, plugin architecture) but rebuilds it in TypeScript on infrastructure we already operate.

### Architecture at a Glance

Bun/Hono API server with SvelteKit frontend. Shares SurrealDB, MinIO, and Ollama with menos (separate namespaces/buckets). SearXNG provides web search. Bot plugins (Discord, Telegram) are post-MVP.

```
  SvelteKit UI ──► Hono API ──┬── SurrealDB (search index + metadata)
                               ├── MinIO (memory files + session logs)
                               ├── Ollama (embeddings + local LLM)
                               ├── SearXNG (web search)
                               └── LLM Providers (Vercel AI SDK + subscription SDKs)
```

---

## Research Summary

### Repos Analyzed

| Project | Language | Key Insight |
|---------|----------|-------------|
| **OpenClaw** | TypeScript | Gateway architecture, session management, plugin hooks |
| **openclaw-graphiti-memory** | Shell/Python | Three-layer memory (private files, shared files, knowledge graph) |
| **nanobot** (19.7k stars) | Python | Provider Registry pattern, ~4k lines, MCP support, uv tooling |
| **FemtoBot** | Python | Ollama-first, ChromaDB RAG, modular services |
| **ClawRAG** | Python | Docling + ChromaDB, hybrid search (RRF), circuit breaker pattern |
| **nanoclaw** | TypeScript | Container isolation, skills-over-features philosophy |
| **mimiclaw** | C | Two-layer config pattern (build-time + runtime) |

### Key Architectural Decisions from Research

1. **Gateway Pattern**: Single WebSocket server owns all connections
2. **Plugin/Skills System**: Manifest-based registration with lifecycle hooks
3. **Provider Registry**: Clean abstraction for LLM providers (from nanobot)
4. **Hybrid Memory**: Vector + keyword (BM25) + graph traversal
5. **Group-Based Namespacing**: Isolate agent memories while allowing cross-search
6. **Circuit Breaker**: Resilient connections to external services
7. **Session Isolation**: Per-chat context with pruning strategies

---

## Decisions

### D1: Memory Architecture - DECIDED

**Decision**: Files-first in MinIO, SurrealDB as search index (replaces SQLite)

Following OpenClaw's philosophy: **files are truth, database is derived index**.

#### Storage Layout

```
MinIO bucket: onyx-memory/
├── {agent_id}/
│   ├── MEMORY.md                    # Long-term curated facts
│   └── daily/
│       ├── 2026-02-15.md            # Daily logs (append-only)
│       └── 2026-02-16.md
└── _shared/                         # Cross-agent reference docs (optional)
    ├── user-profile.md
    └── agent-roster.md
```

#### SurrealDB Schema (Search Index)

```surql
-- Tracks indexed files
DEFINE TABLE memory_file SCHEMAFULL;
DEFINE FIELD agent_id ON memory_file TYPE string;
DEFINE FIELD path ON memory_file TYPE string;          -- MinIO object key
DEFINE FIELD checksum ON memory_file TYPE string;      -- For change detection
DEFINE FIELD indexed_at ON memory_file TYPE datetime;
DEFINE FIELD source ON memory_file TYPE string;        -- "memory" | "daily" | "shared"
DEFINE INDEX idx_file_agent ON memory_file FIELDS agent_id;

-- Chunked text with embeddings
DEFINE TABLE memory_chunk SCHEMAFULL;
DEFINE FIELD file ON memory_chunk TYPE record<memory_file>;
DEFINE FIELD agent_id ON memory_chunk TYPE string;
DEFINE FIELD content ON memory_chunk TYPE string;
DEFINE FIELD start_line ON memory_chunk TYPE int;
DEFINE FIELD end_line ON memory_chunk TYPE int;
DEFINE FIELD embedding ON memory_chunk TYPE array<float, 1024>;  -- Ollama nomic-embed-text
DEFINE FIELD source ON memory_chunk TYPE string;
DEFINE INDEX idx_chunk_embedding ON memory_chunk FIELDS embedding MTREE DIMENSION 1024;
DEFINE INDEX idx_chunk_agent ON memory_chunk FIELDS agent_id;

-- Provider fingerprint (triggers reindex if changed)
DEFINE TABLE memory_meta SCHEMAFULL;
DEFINE FIELD agent_id ON memory_meta TYPE string;
DEFINE FIELD provider ON memory_meta TYPE string;
DEFINE FIELD model ON memory_meta TYPE string;
DEFINE FIELD chunk_size ON memory_meta TYPE int;
DEFINE FIELD chunk_overlap ON memory_meta TYPE int;
```

#### Sync Flow

On file change (or session start), compare checksums, re-chunk changed files (~400 tokens, 80 overlap), embed via Ollama, and upsert into SurrealDB. Stale chunks are deleted automatically.

#### Hybrid Search (Vector + Full-Text)

```surql
-- Semantic search (70% weight)
LET $vec_results = SELECT *,
    vector::similarity::cosine(embedding, $query_vec) AS score
FROM memory_chunk
WHERE agent_id = $agent_id
ORDER BY score DESC
LIMIT 20;

-- Full-text search (30% weight)
LET $fts_results = SELECT *,
    search::score(1) AS score
FROM memory_chunk
WHERE content @1@ $keywords
  AND agent_id = $agent_id
ORDER BY score DESC
LIMIT 20;

-- Merge with weighted RRF (done in TypeScript)
```

---

### D2: menos Integration Scope - DECIDED

**Decision**: Shared infrastructure, Onyx can query menos, conversations stay in Onyx

#### Shared Infrastructure

| Resource | Setup |
|----------|-------|
| **SurrealDB** | Same instance, namespace `onyx` (menos uses `menos`) |
| **MinIO** | Same instance, bucket `onyx-memory` (menos uses `menos-content`) |
| **Ollama** | Same instance, shared embeddings |
| **Auth** | Reuse ed25519 signing from menos |

#### Integration Points

```
┌─────────────────────────────────────────────────────────────┐
│                    SHARED INFRASTRUCTURE                    │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐               │
│  │ SurrealDB │  │   MinIO   │  │  Ollama   │               │
│  │           │  │           │  │           │               │
│  │ ns:menos  │  │ menos-*   │  │ nomic-    │               │
│  │ ns:onyx   │  │ onyx-*    │  │ embed-text│               │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘               │
│        │              │              │                      │
└────────┼──────────────┼──────────────┼──────────────────────┘
         │              │              │
    ┌────┴────┐    ┌────┴────┐    ┌────┴────┐
    │         │    │         │    │         │
┌───▼───┐ ┌───▼───┐│         │    │         │
│ menos │ │ onyx  ││         │    │         │
│       │ │       │◄─────────┘    │         │
│       │ │       │◄──────────────┘         │
│       ◄─┤       │  (Onyx queries menos    │
│       │ │       │   for RAG content)      │
└───────┘ └───────┘                         │
```

#### Onyx → menos Queries

Onyx can search menos content for RAG context:

```typescript
// Example: searching menos for relevant content
async function searchMenosContent(query: string, limit = 5) {
  const response = await fetch(
    `${MENOS_URL}/api/v1/content/search?q=${query}&limit=${limit}`,
    { headers: signRequest(...) }  // ed25519
  );
  return response.json();
}
```

Use cases:
- "What did that video say about Docker networking?"
- "Find my notes about Terraform modules"
- "Summarize the transcript from last week's video"

#### Conversations Stay in Onyx

Conversation history stored in Onyx's own namespace:
- `onyx-memory/` bucket in MinIO for memory files
- `onyx` namespace in SurrealDB for session metadata + search index
- NOT stored as menos content items (avoids circular dependency)

---

### D3: Bot Plugin Architecture - DECIDED

**Decision**: In-process plugins for MVP, interfaces designed for future extraction

#### Plugin Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      ONYX PROCESS                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   Plugin Manager                     │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌────────┐  │   │
│  │  │ Discord │  │Telegram │  │   CLI   │  │ WebChat│  │   │
│  │  │ Plugin  │  │ Plugin  │  │ Plugin  │  │ Plugin │  │   │
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └───┬────┘  │   │
│  │       │            │            │           │        │   │
│  │       └────────────┴─────┬──────┴───────────┘        │   │
│  │                          ▼                           │   │
│  │              ┌───────────────────┐                   │   │
│  │              │   Plugin Protocol │                   │   │
│  │              │   (async interface)│                   │   │
│  │              └─────────┬─────────┘                   │   │
│  └────────────────────────┼─────────────────────────────┘   │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Onyx Core                         │   │
│  │  (agents, memory, sessions, providers)               │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

#### Plugin Interface (Abstract)

```typescript
interface PluginProtocol {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(channelId: string, content: string): Promise<void>;
  incomingMessages(): AsyncIterableIterator<IncomingMessage>;
}
```

#### Plugin Manifest (YAML)

```yaml
# plugins/discord/manifest.yaml
name: discord
version: "0.1.0"
description: Discord bot integration
entry_point: ./plugins/discord/bot.ts

dependencies:
  - discord.js>=14.0.0

config_schema:
  token:
    type: string
    required: true
    env: DISCORD_BOT_TOKEN
  guild_ids:
    type: array
    items: string
    required: false

hooks:
  - on_message
  - on_ready
```

#### Plugin Loading

```yaml
# Plugins loaded at startup from config
plugins:
  enabled:
    - discord
    - telegram
  discord:
    token: ${DISCORD_BOT_TOKEN}
  telegram:
    token: ${TELEGRAM_BOT_TOKEN}
```

#### Future Extraction Path

The `PluginProtocol` interface is designed so plugins can later be:
1. Extracted to separate processes communicating via REST/gRPC
2. Converted to WebSocket clients connecting to Onyx gateway
3. Run as separate containers with shared message queue

No core changes needed - just swap the in-process plugin for a client stub.

---

### D4: LLM Provider Strategy - DECIDED

**Decision**: Four-SDK TypeScript abstraction layer (no LiteLLM)

#### Why No LiteLLM?

All key providers now have official TypeScript SDKs. A custom abstraction layer unifies them behind a single interface, eliminating the need for LiteLLM (Python) or its proxy.

#### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│              Onyx Provider Abstraction Layer                     │
│                                                                 │
│  Unified interface:                                             │
│    complete(messages, model, opts) → Response                   │
│    stream(messages, model, opts) → AsyncIterator                │
│    listModels() → Model[]                                       │
│                                                                 │
└──────────┬──────────────┬──────────────┬──────────────┬────────┘
           │              │              │              │
           ▼              ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Claude Agent │ │   OpenAI     │ │   GitHub     │ │  Vercel AI   │
│     SDK      │ │  Codex SDK   │ │ Copilot SDK  │ │     SDK      │
│              │ │              │ │              │ │              │
│ Claude Sub   │ │ ChatGPT Sub  │ │ Copilot Sub  │ │ OpenAI  key  │
│ (Pro/Max)    │ │ (Plus/Pro)   │ │ (OAuth)      │ │ Anthropic key│
│              │ │              │ │              │ │ Bedrock      │
│              │ │              │ │              │ │ Ollama       │
│              │ │              │ │              │ │ OpenRouter   │
│              │ │              │ │              │ │ Google       │
│              │ │              │ │              │ │ Azure        │
│              │ │              │ │              │ │ Groq, etc.   │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

#### Provider Routing

```typescript
function getProvider(model: string): ProviderBackend {
  if (model.startsWith("claude-subscription/"))
    return new ClaudeAgentProvider();    // @anthropic-ai/claude-agent-sdk
  if (model.startsWith("codex/") || model.startsWith("chatgpt/"))
    return new OpenAICodexProvider();    // @openai/codex-sdk
  if (model.startsWith("copilot/"))
    return new CopilotProvider();        // @github/copilot-sdk
  // Everything else via Vercel AI SDK
  return new VercelAIProvider();         // ai + @ai-sdk/*
}
```

#### Supported Providers

| Provider | SDK | Auth Method | Model Prefix |
|----------|-----|-------------|-------------|
| **Claude Subscription** (Pro/Max) | `@anthropic-ai/claude-agent-sdk` | OAuth | `claude-subscription/` |
| **OpenAI/Codex Subscription** (ChatGPT Plus/Pro) | `@openai/codex-sdk` | OAuth device flow | `codex/`, `chatgpt/` |
| **GitHub Copilot** | `@github/copilot-sdk` | OAuth device flow | `copilot/` |
| AWS Bedrock | `@ai-sdk/amazon-bedrock` | AWS credentials | `bedrock/` |
| OpenAI (API key) | `@ai-sdk/openai` | API key | `openai/` |
| Anthropic (API key) | `@ai-sdk/anthropic` | API key | `anthropic/` |
| Ollama | `ollama-ai-provider` | Local endpoint | `ollama/` |
| OpenRouter | `@openrouter/ai-sdk-provider` | API key | `openrouter/` |
| Google Vertex | `@ai-sdk/google-vertex` | GCP credentials | `vertex/` |
| Azure OpenAI | `@ai-sdk/azure` | Azure credentials | `azure/` |

#### Why Four Backends?

1. **Claude Agent SDK** — Only official way to use Claude Pro/Max subscription programmatically
2. **OpenAI Codex SDK** — Only official way to use ChatGPT Plus/Pro subscription (OAuth device flow)
3. **GitHub Copilot SDK** — Only official way to use Copilot subscription (OAuth device flow)
4. **Vercel AI SDK** — Handles all API-key and credential-based providers with a unified interface (20+ official providers, community providers for Ollama/OpenRouter)

---

### D5: Session Persistence - DECIDED

**Decision**: MinIO for message logs + SurrealDB for metadata

#### Storage Layout

```
MinIO bucket: onyx-sessions/
└── {agent_id}/
    └── {session_id}.jsonl      # Full message log (append-only)

SurrealDB namespace: onyx
└── session table               # Metadata + index
```

#### SurrealDB Schema

```surql
DEFINE TABLE session SCHEMAFULL;
DEFINE FIELD id ON session TYPE string;
DEFINE FIELD agent_id ON session TYPE string;
DEFINE FIELD title ON session TYPE option<string>;        -- Auto-generated or user-set
DEFINE FIELD created_at ON session TYPE datetime;
DEFINE FIELD updated_at ON session TYPE datetime;
DEFINE FIELD message_count ON session TYPE int;
DEFINE FIELD token_count ON session TYPE int;             -- Approximate
DEFINE FIELD last_message_preview ON session TYPE string; -- First 100 chars
DEFINE FIELD minio_path ON session TYPE string;           -- Path to JSONL file
DEFINE FIELD status ON session TYPE string;               -- "active" | "archived"
DEFINE INDEX idx_session_agent ON session FIELDS agent_id;
DEFINE INDEX idx_session_updated ON session FIELDS updated_at;
```

#### JSONL Message Format

```jsonl
{"ts":"2026-02-16T10:30:00Z","role":"user","content":"Hello"}
{"ts":"2026-02-16T10:30:01Z","role":"assistant","content":"Hi! How can I help?"}
{"ts":"2026-02-16T10:30:15Z","role":"user","content":"What's the weather?"}
{"ts":"2026-02-16T10:30:17Z","role":"assistant","content":"I don't have...","tool_calls":[...]}
```

#### Operations

```typescript
class SessionManager {
  async createSession(agentId: string): Promise<Session> { ... }
  async appendMessage(sessionId: string, message: Message): Promise<void> { ... }
  async getMessages(sessionId: string, limit?: number): Promise<Message[]> { ... }
  async listSessions(agentId: string): Promise<SessionMeta[]> { ... }
  async searchSessions(query: string): Promise<SessionMeta[]> { ... }
}
```

#### Benefits

- **Scales to any conversation length** - JSONL files can grow indefinitely
- **Append-only writes** - Fast, no read-modify-write
- **Metadata queries are fast** - SurrealDB handles filtering/sorting
- **Easy export** - Download JSONL file for any session
- **Matches memory architecture** - Files in MinIO, index in SurrealDB

---

### D6: API Design - DECIDED

**Decision**: OpenAI-compatible HTTP API as primary interface

#### Why OpenAI-Compatible?

- Drop-in replacement for any OpenAI client
- Works with existing tools, libraries, UIs
- LangChain, Vercel AI SDK, etc. can use Onyx as a backend
- Simple, well-documented standard

#### Endpoints

```
POST /v1/chat/completions     # Main chat endpoint (OpenAI-compatible)
GET  /v1/models               # List available models/agents
GET  /health                  # Health check

# Onyx-specific extensions
GET  /v1/sessions             # List sessions
GET  /v1/sessions/{id}        # Get session details
DELETE /v1/sessions/{id}      # Delete session

GET  /v1/memory/search        # Search memory
POST /v1/memory               # Write to memory

GET  /v1/agents               # List agents
GET  /v1/agents/{id}          # Get agent config
```

#### Chat Completions Request

```json
// Standard OpenAI format
// POST /v1/chat/completions
{
    "model": "claude-subscription/claude-sonnet-4-20250514",
    "messages": [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello!"}
    ],
    "stream": true,
    "temperature": 0.7,

    // Onyx extensions (optional)
    "x-onyx-agent-id": "main",
    "x-onyx-session-id": "abc123",
    "x-onyx-include-memory": true
}
```

#### Chat Completions Response

```json
// Standard OpenAI format
{
    "id": "chatcmpl-abc123",
    "object": "chat.completion",
    "created": 1708099200,
    "model": "claude-subscription/claude-sonnet-4-20250514",
    "choices": [{
        "index": 0,
        "message": {
            "role": "assistant",
            "content": "Hello! How can I help you today?"
        },
        "finish_reason": "stop"
    }],
    "usage": {
        "prompt_tokens": 12,
        "completion_tokens": 9,
        "total_tokens": 21
    },

    // Onyx extensions
    "x-onyx-session-id": "abc123"
}
```

#### Streaming (SSE)

```
POST /v1/chat/completions
{"stream": true, ...}

Response:
data: {"id":"chatcmpl-abc123","choices":[{"delta":{"content":"Hello"}}]}
data: {"id":"chatcmpl-abc123","choices":[{"delta":{"content":"!"}}]}
data: {"id":"chatcmpl-abc123","choices":[{"delta":{},"finish_reason":"stop"}]}
data: [DONE]
```

#### Authentication

**MVP**: Password login → session cookie. Single user, password configured in `onyx.json` (hashed).

- Web UI: Login form, server sets `HttpOnly` secure session cookie
- API clients: `Authorization: Bearer onyx_sk_<token>` (static API key for programmatic access)
- Both methods coexist — cookie for browser, bearer token for scripts/plugins

**Future (Phase 3)**: Add WebAuthn/passkey support for passwordless login.

```
# Browser (cookie-based, set after login)
Cookie: onyx_session=<signed-session-id>

# API clients (static token)
Authorization: Bearer onyx_sk_abc123
```

#### Agent Routing

```
# Option 1: In model field (OpenClaw style)
"model": "onyx:research-agent"

# Option 2: Header
"x-onyx-agent-id": "research-agent"

# Option 3: Default to "main" agent
```

*Implemented as Hono routes in `api/src/gateway/http.ts`.*

---

### D7: Web Interface - DECIDED

**Decision**: Browser-based Control UI (OpenClaw-style) with provider configuration

#### Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Framework | **SvelteKit** | Less boilerplate than React, built-in routing/SSR, excellent DX |
| UI Components | **shadcn-svelte** | Accessible, composable components with Tailwind styling |
| Styling | **Tailwind CSS** | Utility-first, consistent with shadcn-svelte |
| State | SvelteKit stores + server load | Built-in reactivity, no extra state library needed |
| WebSocket | Native WebSocket | Real-time streaming |
| Bundling | Static adapter or Node adapter | SvelteKit builds to static or server-rendered |

*Note: OpenClaw uses Lit (web components). SvelteKit offers less boilerplate than React, built-in routing, and excellent performance. shadcn-svelte provides the same accessible component patterns as shadcn/ui.*

#### UI Sections

```
┌─────────────────────────────────────────────────────────────────┐
│  ONYX CONTROL UI                              [Settings] [Docs] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────┐  ┌──────────────────────────────────────────────┐  │
│  │ Chat    │  │                                              │  │
│  │ Sessions│  │            MAIN CONTENT AREA                 │  │
│  │ Memory  │  │                                              │  │
│  │ Agents  │  │  - Chat interface (default)                  │  │
│  │ Config  │  │  - Session list/details                      │  │
│  │ Logs    │  │  - Memory search/browse                      │  │
│  │         │  │  - Agent configuration                       │  │
│  └─────────┘  │  - Provider settings                         │  │
│               │  - System logs                               │  │
│               │                                              │  │
│               └──────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Pages/Features

**1. Chat (Default)**
- Message input with streaming responses
- Agent selector dropdown
- Session picker (new/continue)
- Tool call visualization (collapsible cards)
- Stop/abort button

**2. Sessions**
- List all sessions with metadata
- Filter by agent, date, status
- Click to view full transcript
- Delete/archive sessions

**3. Memory**
- Search memory (vector + keyword)
- Browse memory files (daily logs, MEMORY.md)
- View/edit memory files
- Sync status indicator

**4. Agents**
- List configured agents
- View/edit agent prompts
- Enable/disable agents
- Create new agents

**5. Config (Provider Settings) - KEY DIFFERENTIATOR**
```
┌─────────────────────────────────────────────────────────────────┐
│  PROVIDER CONFIGURATION                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Claude Subscription                              [Connected ✓] │
│  └─ Uses Claude Code CLI auth (~/.claude.json)                  │
│     Status: Authenticated as mike@example.com                   │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Subscription Providers                                         │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ OpenAI/Codex (ChatGPT Plus/Pro)        [Authenticate]   │   │
│  │ Status: Not authenticated                               │   │
│  │ [Start OAuth Device Flow]                               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ GitHub Copilot                         [Authenticate]   │   │
│  │ Status: Not authenticated                               │   │
│  │ [Start OAuth Device Flow]                               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  API Key / Credential Providers (Vercel AI SDK)                 │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ AWS Bedrock                              [Configure]     │   │
│  │ Status: Not configured                                   │   │
│  │ ○ AWS_ACCESS_KEY_ID: _______________                     │   │
│  │ ○ AWS_SECRET_ACCESS_KEY: _______________                 │   │
│  │ ○ AWS_REGION: us-east-1                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ OpenRouter                               [Connected ✓]   │   │
│  │ API Key: sk-or-...redacted...                            │   │
│  │ [Edit] [Test Connection]                                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Ollama                                   [Connected ✓]   │   │
│  │ URL: http://localhost:11434                              │   │
│  │ Models: llama3, nomic-embed-text, mistral                │   │
│  │ [Refresh Models]                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [+ Add Provider]                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**6. Logs**
- Live tail of application logs
- Filter by level (DEBUG, INFO, WARN, ERROR)
- Search/export

**7. System Status**
- Health check results
- Connected services (SurrealDB, MinIO, Ollama)
- menos integration status

#### WebSocket Protocol (for real-time)

```typescript
// Client -> Server
{ "type": "chat.send", "data": { "message": "Hello", "agent": "main" } }
{ "type": "chat.abort", "data": { "sessionId": "abc123" } }
{ "type": "sessions.list" }
{ "type": "memory.search", "data": { "query": "docker networking" } }

// Server -> Client
{ "type": "chat.delta", "data": { "content": "Hello", "sessionId": "abc123" } }
{ "type": "chat.tool_call", "data": { "tool": "memory_search", "input": {...} } }
{ "type": "chat.done", "data": { "sessionId": "abc123", "usage": {...} } }
{ "type": "sessions.list.result", "data": [...] }
```

#### Config Storage

All configuration lives in `~/.config/onyx/onyx.json` (see D9). Sensitive fields (API keys, password hash) are encrypted in place using a master key derived from the gateway password. The web UI config page reads/writes this file.

#### Security

- Authentication: see D6 (password + session cookie for UI, bearer token for API)
- Provider credentials encrypted at rest
- API keys displayed as redacted (`sk-or-...xxx`) in the config UI

---

### D8: Tool System - DECIDED

**Decision**: Built-in tool groups + custom tools + cron scheduling

#### Tool Categories

| Group | Tools | MVP? |
|-------|-------|------|
| `memory` | `memory_search`, `memory_write`, `memory_get` | **Yes** |
| `sessions` | `sessions_list`, `sessions_history`, `sessions_send` | **Yes** |
| `web` | `web_search`, `web_fetch` | **Yes** |
| `fs` | `read`, `write`, `edit` | **Yes** |
| `runtime` | `exec`, `process` | **Yes** |
| `schedule` | `schedule`, `list_jobs`, `cancel_job` | **Yes** |
| `menos` | `menos_search`, `menos_ingest` | Post-MVP |
| `model_routing` | `select_model`, `route_task` | Post-MVP |
| `mermaid` | `render_mermaid` | Post-MVP |
| `git` | `git_commit`, `git_push`, `git_pull`, `git_status` | Post-MVP |
| `docker` | `docker_ps`, `docker_logs`, `docker_stats`, `docker_exec` | Post-MVP |

#### Tool Definition Schema

Tools follow OpenAI function calling format:

```json
{
  "name": "memory_search",
  "description": "Search memory for relevant context",
  "parameters": {
    "type": "object",
    "properties": {
      "query": {"type": "string", "description": "Search query"},
      "agent_id": {"type": "string", "description": "Agent to search"},
      "limit": {"type": "integer", "default": 5}
    },
    "required": ["query"]
  }
}
```

#### Infrastructure Dependencies

- **SearXNG**: Self-hosted meta-search engine for `web_search` tool (see D10 service map)
- **Docker socket**: Required for post-MVP `docker` tools (mount `/var/run/docker.sock`)

#### UI Rendering

The web interface renders assistant responses with:
- Markdown with syntax highlighting (`marked` + `highlight.js`)
- Mermaid diagrams inline (`mermaid.js` in browser)
- Tool call cards with expandable input/output
- Code blocks with copy button

---

### D10: Deployment Topology - DECIDED

**Decision**: Single Docker Compose stack, shared network, host-mounted volumes for development

#### Service Map

| Service | Image | Port | Volumes | Notes |
|---------|-------|------|---------|-------|
| **onyx-api** | `onyx:local` (Dockerfile) | `18790` | Source mount (dev), Docker socket | Hono HTTP + WebSocket |
| **onyx-frontend** | `onyx-frontend:local` (Dockerfile) | `5173` (dev) / `18791` (prod) | Source mount (dev) | SvelteKit, proxies API calls to onyx-api |
| **surrealdb** | `surrealdb/surrealdb:v2` | `8000` | `surrealdb_data:/data` | Shared with menos (separate namespaces) |
| **minio** | `minio/minio:latest` | `9000` / `9001` (console) | `minio_data:/data` | Shared with menos (separate buckets) |
| **ollama** | `ollama/ollama:latest` | `11434` | `ollama_models:/root/.ollama` | Shared with menos |
| **searxng** | `searxng/searxng:latest` | `8888` | `searxng_config:/etc/searxng` | Onyx-only, web search tool |

#### Networking

- All services on a shared `onyx-net` bridge network
- menos services join the same network for shared SurrealDB/MinIO/Ollama access
- Only onyx-api, onyx-frontend, and minio console expose host ports

#### Shared vs. Onyx-Only

| Resource | Shared with menos? |
|----------|--------------------|
| SurrealDB | Yes — namespace `onyx` vs `menos` |
| MinIO | Yes — bucket `onyx-memory`, `onyx-sessions` vs `menos-content` |
| Ollama | Yes — same models |
| SearXNG | No — Onyx only |

---

### D9: Agent Definition Format - DECIDED

**Decision**: OpenClaw-compatible format (JSON config + workspace markdown files)

#### Why OpenClaw-Compatible?

- Potential config migration between systems
- Familiar pattern for OpenClaw users
- Markdown files are human-editable and git-friendly
- Clear separation: config (JSON) vs. instructions (markdown)

#### Agent Config (`~/.config/onyx/onyx.json`)

```json5
{
  // Agent definitions
  agents: {
    list: [
      {
        id: "main",
        name: "Main Assistant",
        default: true,
        workspace: "~/.config/onyx/workspace",
        model: "claude-subscription/claude-sonnet-4-20250514",

        // Tool restrictions (optional)
        tools: {
          allow: ["memory_read", "memory_write", "web_search"],
          deny: ["shell_exec"]
        }
      },
      {
        id: "research",
        name: "Research Agent",
        workspace: "~/.config/onyx/workspace-research",
        model: "openrouter/anthropic/claude-opus-4",

        // Per-agent overrides
        temperature: 0.3,
        maxTokens: 8192
      }
    ]
  },

  // Channel -> Agent routing
  bindings: [
    { agentId: "main", match: { channel: "discord" } },
    { agentId: "research", match: { channel: "telegram" } },
    // Route specific Discord guild to research agent
    {
      agentId: "research",
      match: { channel: "discord", guildId: "123456789" }
    }
  ],

  // Provider configuration (Onyx-specific, not in OpenClaw)
  providers: {
    "claude-subscription": {
      // Uses Claude Code CLI auth
    },
    "openrouter": {
      apiKey: "${OPENROUTER_API_KEY}"
    },
    "ollama": {
      baseUrl: "http://localhost:11434"
    }
  },

  // Gateway settings
  gateway: {
    port: 18790,  // Different from OpenClaw's 18789
    auth: {
      password_hash: "$argon2id$...",   // Hashed password for web UI login
      api_key: "onyx_sk_..."            // Static bearer token for API clients
    }
  }
}
```

#### Workspace Files (per agent)

```
~/.config/onyx/workspace/           # Main agent workspace
├── AGENTS.md                       # Operating instructions, rules
├── SOUL.md                         # Persona, tone, boundaries
├── USER.md                         # User profile
├── IDENTITY.md                     # Agent name/vibe
├── TOOLS.md                        # Tool usage guidance
├── MEMORY.md                       # Curated long-term memory
├── memory/
│   ├── 2026-02-15.md              # Daily logs
│   └── 2026-02-16.md
└── skills/                         # Agent-specific skills
    └── code-review.md

~/.config/onyx/workspace-research/  # Research agent workspace
├── AGENTS.md
├── SOUL.md
└── ...
```

#### OpenClaw Compatibility Matrix

| Feature | OpenClaw | Onyx | Compatible? |
|---------|----------|------|-------------|
| `agents.list[]` | ✓ | ✓ | Yes |
| `agents.list[].id` | ✓ | ✓ | Yes |
| `agents.list[].workspace` | ✓ | ✓ | Yes |
| `agents.list[].model` | ✓ | ✓ | Yes (prefix differs) |
| `agents.list[].tools` | ✓ | ✓ | Yes |
| `bindings[]` | ✓ | ✓ | Yes |
| `AGENTS.md` | ✓ | ✓ | Yes |
| `SOUL.md` | ✓ | ✓ | Yes |
| `USER.md` | ✓ | ✓ | Yes |
| `IDENTITY.md` | ✓ | ✓ | Yes |
| `TOOLS.md` | ✓ | ✓ | Yes |
| `memory/YYYY-MM-DD.md` | ✓ | ✓ | Yes |
| `MEMORY.md` | ✓ | ✓ | Yes |
| `skills/` | ✓ | ✓ | Yes |
| `channels.*` | ✓ | Plugins | Different (Onyx uses plugins) |
| `providers.*` | ✗ | ✓ | Onyx extension |
| Sandbox config | ✓ | Phase 3 | Tool execution isolation — see [OpenClaw sandboxing docs](https://docs.openclaw.ai/gateway/sandboxing) |

#### Differences from OpenClaw

1. **Config location**: `~/.config/onyx/` (XDG) vs `~/.openclaw/`
2. **Model prefixes**: `claude-subscription/`, `openrouter/`, `ollama/` vs `anthropic/`, `openai/`
3. **Providers section**: Onyx-specific for API keys, OAuth status
4. **Channels**: Onyx uses plugin architecture, not built-in channels
5. **Storage**: Onyx uses MinIO + SurrealDB, OpenClaw uses filesystem + SQLite

---

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         ONYX GATEWAY                            │
│                     (Bun + WebSocket)                           │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Core Modules (TypeScript/Bun):                           │  │
│  │  ├── gateway/          # WebSocket + HTTP endpoints       │  │
│  │  ├── agents/           # Agent runtime, tool execution    │  │
│  │  ├── memory/           # Vector search, hybrid queries    │  │
│  │  ├── providers/        # 4-SDK provider abstraction       │  │
│  │  ├── plugins/          # Plugin loader, hooks             │  │
│  │  └── sessions/         # Conversation state management    │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
        │              │              │              │
        ▼              ▼              ▼              ▼
┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐
│ SurrealDB │  │   MinIO   │  │  Ollama   │  │  menos    │
│ (memory)  │  │  (blobs)  │  │(embeddings│  │ (content) │
│           │  │           │  │   + LLM)  │  │           │
└───────────┘  └───────────┘  └───────────┘  └───────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         PLUGINS                                 │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐    │
│  │ Discord   │  │ Telegram  │  │   CLI     │  │  WebChat  │    │
│  │  Plugin   │  │  Plugin   │  │  Plugin   │  │  Plugin   │    │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## File Structure (Proposed)

```
onyx/
├── package.json
├── bun.lock
├── tsconfig.json
├── Dockerfile
├── docker-compose.yml
├── frontend/                    # SvelteKit app
│   ├── package.json
│   ├── svelte.config.js
│   ├── src/
│   │   ├── app.html
│   │   ├── app.css
│   │   ├── lib/
│   │   │   ├── components/      # Svelte components (shadcn-svelte)
│   │   │   ├── stores/          # Svelte stores
│   │   │   └── api.ts           # API client
│   │   └── routes/
│   │       ├── +layout.svelte
│   │       ├── +page.svelte
│   │       ├── chat/[[id]]/     # Chat interface
│   │       ├── sessions/        # Session management
│   │       ├── memory/          # Memory browser
│   │       ├── agents/          # Agent config
│   │       ├── config/          # Provider settings
│   │       └── login/           # Auth
│   └── static/
├── api/                         # Backend API (Bun)
│   ├── package.json
│   ├── src/
│   │   ├── index.ts             # Entry point
│   │   ├── config.ts            # Settings
│   │   ├── gateway/
│   │   │   ├── websocket.ts     # WS connection handler
│   │   │   └── http.ts          # REST endpoints
│   │   ├── agents/
│   │   │   ├── runtime.ts       # Agent execution loop
│   │   │   ├── tools/           # Built-in tools
│   │   │   └── context.ts       # Session context
│   │   ├── memory/
│   │   │   ├── vector.ts        # Vector search
│   │   │   └── hybrid.ts        # Combined search (vector + BM25)
│   │   ├── providers/
│   │   │   ├── abstraction.ts   # Unified provider interface
│   │   │   ├── claude-agent.ts  # Claude subscription
│   │   │   ├── codex.ts         # OpenAI/Codex subscription
│   │   │   ├── copilot.ts       # GitHub Copilot subscription
│   │   │   └── vercel-ai.ts     # API key providers
│   │   ├── plugins/
│   │   │   ├── loader.ts        # Plugin discovery
│   │   │   ├── hooks.ts         # Lifecycle hooks
│   │   │   └── manifest.ts      # Plugin config schema
│   │   └── sessions/
│   │       └── manager.ts       # Session state
│   └── tests/
├── plugins/
│   ├── discord/
│   │   ├── manifest.yaml
│   │   └── bot.ts
│   └── telegram/
│       ├── manifest.yaml
│       └── bot.ts
└── shared/                      # Shared types between frontend + API
    ├── types.ts
    └── schemas.ts               # Zod schemas (shared validation)
```

---

## Dependencies

### API (Bun)

| Package | Purpose |
|---------|---------|
| `hono` | HTTP framework + WebSocket |
| `zod` | Schema validation |
| `surrealdb` | Database client |
| `minio` | Object storage client |
| `ai` | Vercel AI SDK core |
| `@ai-sdk/openai` | OpenAI provider (API key) |
| `@ai-sdk/anthropic` | Anthropic provider (API key) |
| `@ai-sdk/amazon-bedrock` | AWS Bedrock provider |
| `ollama-ai-provider` | Ollama provider |
| `@openrouter/ai-sdk-provider` | OpenRouter provider |
| `@anthropic-ai/claude-agent-sdk` | Claude subscription (Phase 2) |
| `@openai/codex-sdk` | OpenAI/Codex subscription (Phase 2) |
| `@github/copilot-sdk` | GitHub Copilot subscription (Phase 2) |

### Frontend (SvelteKit)

| Package | Purpose |
|---------|---------|
| `@sveltejs/kit` | Framework |
| `svelte` | UI library |
| `tailwindcss` | Styling |
| `bits-ui` | Component primitives (shadcn-svelte) |
| `marked` | Markdown rendering |
| `dompurify` | HTML sanitization |
| `highlight.js` | Code syntax highlighting |
| `vitest` | Unit testing |

*shadcn-svelte uses bits-ui as its component primitive library. marked + DOMPurify + highlight.js for chat message rendering (matching agent-spike and slash-ski patterns).*

#### Frontend Documentation (LLM-Friendly)

| Library | Resource | URL |
|---------|----------|-----|
| **Svelte + SvelteKit + CLI** | Full docs | [svelte.dev/llms-full.txt](https://svelte.dev/llms-full.txt) |
| | Medium (compressed) | [svelte.dev/llms-medium.txt](https://svelte.dev/llms-medium.txt) |
| | Small (minimal) | [svelte.dev/llms-small.txt](https://svelte.dev/llms-small.txt) |
| | SvelteKit only | [svelte.dev/docs/kit/llms.txt](https://svelte.dev/docs/kit/llms.txt) |
| | Svelte only | [svelte.dev/docs/svelte/llms.txt](https://svelte.dev/docs/svelte/llms.txt) |
| | CLI Tailwind integration | [svelte.dev/docs/cli/tailwind/llms.txt](https://svelte.dev/docs/cli/tailwind/llms.txt) |
| | Docs hub (all variants) | [svelte.dev/docs/llms](https://svelte.dev/docs/llms) |
| **shadcn-svelte** | llms.txt (40+ components) | [shadcn-svelte.com/llms.txt](https://www.shadcn-svelte.com/llms.txt) |
| | SvelteKit install guide | [shadcn-svelte.com/docs/installation/sveltekit](https://www.shadcn-svelte.com/docs/installation/sveltekit) |
| | Full docs | [shadcn-svelte.com/docs](https://www.shadcn-svelte.com/docs) |
| **Tailwind CSS** | No official llms.txt | [PR rejected](https://github.com/tailwindlabs/tailwindcss.com/pull/2388) — docs at [tailwindcss.com/docs](https://tailwindcss.com/docs) |
| | Community scraper | [jsr.io/@jurajstefanic/docs2llms](https://jsr.io/@jurajstefanic/docs2llms) |

#### Reference Repos

| Repo | Stack | Relevance |
|------|-------|-----------|
| [ilude/agent-spike](https://github.com/ilude/agent-spike) | SvelteKit + Svelte 5 + Vite, marked + DOMPurify + highlight.js, CodeMirror, D3, Vitest + Playwright | Chat UI patterns, SSE streaming, vault/studio editing |
| [slash-ski](https://github.com/Ministry-of-Downhill-Redistribution/slash-ski) | SvelteKit + Svelte 5 + Tailwind 4 + Bun, marked + DOMPurify, Lucia auth, Prisma, Vitest | Tailwind integration patterns, auth, testing setup |

---

## Roadmap

### Phase 1: MVP — Personal Assistant via Web UI

Single-user assistant accessible through a browser. No bot plugins yet.

| Deliverable | Details |
|-------------|---------|
| **Project scaffold** | Bun monorepo, Docker Compose (Onyx + SurrealDB + MinIO + Ollama + SearXNG) |
| **Provider abstraction** | Vercel AI SDK backend first (Ollama + API key providers). Subscription SDKs deferred until official releases stabilize |
| **OpenAI-compatible API** | `/v1/chat/completions`, `/v1/models`, `/health` via Hono |
| **Session management** | JSONL in MinIO, metadata in SurrealDB |
| **Memory system** | Files-first in MinIO, hybrid search (vector + BM25) in SurrealDB, Ollama embeddings |
| **MVP tools** | `memory` (search/write/get), `sessions` (list/history), `web` (SearXNG search/fetch), `fs` (read/write/edit), `runtime` (exec), `schedule` (cron jobs) |
| **Agent definitions** | OpenClaw-compatible JSON config + workspace markdown files |
| **Web UI** | SvelteKit + shadcn-svelte: chat, sessions, memory browser, agent config, provider settings |
| **Auth** | Bearer token (single user, configured in `onyx.json`) |

### Phase 2: Integrations & Multi-Platform

| Deliverable | Details |
|-------------|---------|
| **Bot plugins** | Discord, Telegram (in-process, PluginProtocol interface) |
| **menos integration** | `menos_search`, `menos_ingest` tools |
| **Subscription providers** | Claude Agent SDK, OpenAI Codex SDK, GitHub Copilot SDK (when SDKs mature) |
| **Additional tools** | `model_routing`, `mermaid`, `git`, `docker` |
| **CLI plugin** | Terminal-based chat interface |

### Phase 3: Future

| Deliverable | Details |
|-------------|---------|
| **Multi-user** | User accounts, per-user agents and memory |
| **Sandbox isolation** | Isolate tool execution (shell, fs, browser) in Docker containers per agent/session. Per-agent sandbox config, workspace access control, bind mounts. Required for multi-user and remote access. Reference: [OpenClaw sandboxing](https://docs.openclaw.ai/gateway/sandboxing), [multi-agent sandbox config](https://openclawcn.com/en/docs/multi-agent-sandbox-tools/) |
| **Plugin extraction** | Move plugins to separate processes (REST/gRPC/WebSocket) |
| **Passkey auth** | WebAuthn/passkey support for passwordless login |
| **MCP support** | Model Context Protocol for external tool servers |

---

## Conventions

### Testing

| Layer | Framework | Command | Scope |
|-------|-----------|---------|-------|
| **API unit/integration** | `bun test` (built-in) | `bun test` | Providers, memory, sessions, tools |
| **Frontend unit** | Vitest | `bun run test` (in `frontend/`) | Components, stores, API client |
| **E2E** | Playwright | `bun run test:e2e` | Chat flow, session management, provider config |

- API tests live in `api/tests/`, mirroring `api/src/` structure
- Frontend tests live alongside components (`*.test.ts`)
- E2E tests in `frontend/e2e/`
- Use `bun test --watch` during development

---

## Scratchpad

<!-- Use this section for notes, decisions, and working through problems -->

### Decision Summary

| ID | Decision | One-liner |
|----|----------|-----------|
| D1 | Memory Architecture | Files-first in MinIO, SurrealDB as search index |
| D2 | menos Integration | Shared infra, Onyx queries menos, conversations stay in Onyx |
| D3 | Bot Plugin Architecture | In-process plugins for MVP, interfaces for future extraction |
| D4 | LLM Provider Strategy | 4-SDK TypeScript abstraction (no LiteLLM) |
| D5 | Session Persistence | JSONL in MinIO + metadata in SurrealDB |
| D6 | API Design | OpenAI-compatible HTTP API |
| D7 | Web Interface | SvelteKit + shadcn-svelte control UI |
| D8 | Tool System | Built-in tool groups + custom tools + cron scheduling |
| D9 | Agent Definition Format | OpenClaw-compatible JSON config + workspace markdown |
| D10 | Deployment Topology | Single Docker Compose stack, shared network |

### Research Links

- **[OpenClaw Research Notes](openclaw-notes.md)** - Local research: Docker setup, memory architecture, enhancement options (Graphiti, Cognee, Mem0, ClawRAG), hybrid search tuning, decision matrix
- [OpenClaw GitHub](https://github.com/openclaw/openclaw)
- [nanobot](https://github.com/HKUDS/nanobot) - Python reference implementation
- [FemtoBot](https://github.com/rocopolas/FemtoBot) - Ollama + ChromaDB patterns
- [ClawRAG](https://github.com/2dogsandanerd/ClawRag) - Hybrid search implementation
- [Graphiti Memory](https://github.com/clawdbrunner/openclaw-graphiti-memory) - Three-layer architecture
