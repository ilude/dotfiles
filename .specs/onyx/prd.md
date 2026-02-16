# Onyx - Personal AI Assistant Platform

**Status**: Planning / Research Phase
**Stack**: Python 3.12+, uv, FastAPI, SurrealDB, MinIO, Docker
**Relationship**: Sibling service to menos, shares infrastructure

---

## Vision

OpenClaw-inspired personal AI assistant with:
- Plugin architecture for Discord/Telegram bots
- Graph + vector memory using SurrealDB
- Multi-provider LLM support (Anthropic, OpenAI, Ollama, multi-provider via LiteLLM)
- Integration with menos content vault

**MVP Focus**: Personal assistant (single user) first, expand to multi-user/team later.

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

```
1. Agent writes to MinIO (memory_write tool)
2. File watcher detects change (or sync on session start)
3. Compare checksum → skip if unchanged
4. Chunk markdown (~400 tokens, 80 overlap)
5. Embed via Ollama
6. Upsert chunks in SurrealDB
7. Delete stale chunks for changed files
```

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

-- Merge with weighted RRF (done in Python)
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

```python
# Example: searching menos for relevant content
async def search_menos_content(query: str, limit: int = 5):
    """Query menos API for YouTube transcripts, notes, etc."""
    response = await http_client.get(
        f"{MENOS_URL}/api/v1/content/search",
        params={"q": query, "limit": limit},
        headers=sign_request(...)  # ed25519
    )
    return response.json()
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

```python
from abc import ABC, abstractmethod
from typing import AsyncIterator

class PluginProtocol(ABC):
    """Base interface for all channel plugins."""
    
    @property
    @abstractmethod
    def name(self) -> str:
        """Plugin identifier (e.g., 'discord', 'telegram')."""
        ...
    
    @abstractmethod
    async def start(self) -> None:
        """Start the plugin (connect to service)."""
        ...
    
    @abstractmethod
    async def stop(self) -> None:
        """Graceful shutdown."""
        ...
    
    @abstractmethod
    async def send_message(self, channel_id: str, content: str) -> None:
        """Send a message to a channel."""
        ...
    
    @abstractmethod
    def incoming_messages(self) -> AsyncIterator[IncomingMessage]:
        """Stream of incoming messages from the platform."""
        ...
```

#### Plugin Manifest (YAML)

```yaml
# plugins/discord/manifest.yaml
name: discord
version: "0.1.0"
description: Discord bot integration
entry_point: onyx.plugins.discord:DiscordPlugin

dependencies:
  - discord.py>=2.5.0

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

```python
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

**Decision**: Claude Agent SDK + LiteLLM dual backend

#### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Onyx Provider Interface                     │
│                                                                 │
│  class ProviderProtocol:                                        │
│      async def complete(messages, model, **kwargs) -> Response  │
│      async def stream(messages, model, **kwargs) -> AsyncIter   │
│                                                                 │
└───────────────────────┬─────────────────────────────────────────┘
                        │
          ┌─────────────┴─────────────┐
          │                           │
          ▼                           ▼
┌─────────────────────┐    ┌─────────────────────┐
│   Claude Agent SDK  │    │      LiteLLM        │
│                     │    │                     │
│ - Claude Pro/Max    │    │ - AWS Bedrock       │
│   subscription      │    │ - OpenRouter        │
│   (via bundled CLI) │    │ - GitHub Copilot    │
│                     │    │ - ChatGPT Plus/Pro  │
│                     │    │ - Ollama            │
│                     │    │ - OpenAI API        │
│                     │    │ - Anthropic API     │
│                     │    │ - Google Vertex     │
│                     │    │ - Azure OpenAI      │
│                     │    │ - 100+ more         │
└─────────────────────┘    └─────────────────────┘
```

#### Provider Selection Logic

```python
def get_provider(model: str) -> ProviderProtocol:
    """Route to appropriate backend based on model prefix."""
    if model.startswith("claude-subscription/"):
        # Uses Claude Code CLI auth (~/.claude.json OAuth tokens)
        return ClaudeAgentSDKProvider()
    else:
        # Everything else via LiteLLM
        # bedrock/..., openrouter/..., ollama/..., github_copilot/..., etc.
        return LiteLLMProvider()
```

#### Supported Providers

| Provider | Model Prefix | Auth Method |
|----------|--------------|-------------|
| **Claude Subscription** | `claude-subscription/` | OAuth via Claude Code CLI |
| AWS Bedrock | `bedrock/` | AWS credentials |
| OpenRouter | `openrouter/` | API key |
| GitHub Copilot | `github_copilot/` | OAuth (LiteLLM device flow) |
| ChatGPT Plus/Pro | `chatgpt/` | OAuth (LiteLLM device flow) |
| Ollama | `ollama/` | Local (OpenAI-compatible API) |
| OpenAI API | `openai/` or default | API key |
| Anthropic API | `anthropic/` | API key |
| Google Vertex | `vertex_ai/` | GCP credentials |
| Azure OpenAI | `azure/` | Azure credentials |

#### Why Two Backends?

1. **Claude Agent SDK** provides subscription access to Claude Pro/Max
   - Uses bundled Claude Code CLI
   - Reads OAuth tokens from `~/.claude.json`
   - Only way to use Claude subscription programmatically

2. **LiteLLM** handles everything else
   - 100+ providers with unified interface
   - OAuth flows for GitHub Copilot and ChatGPT subscriptions
   - Battle-tested, maintained

#### Dependencies

```toml
[project.dependencies]
claude-agent-sdk = ">=0.1.0"
litellm = ">=1.50.0"
```

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

```python
class SessionManager:
    async def create_session(self, agent_id: str) -> Session:
        """Create new session, initialize empty JSONL in MinIO."""
        
    async def append_message(self, session_id: str, message: Message) -> None:
        """Append to JSONL, update metadata in SurrealDB."""
        
    async def get_messages(self, session_id: str, limit: int = None) -> list[Message]:
        """Stream JSONL from MinIO, optionally limit to last N."""
        
    async def list_sessions(self, agent_id: str) -> list[SessionMeta]:
        """Query SurrealDB for session metadata."""
        
    async def search_sessions(self, query: str) -> list[SessionMeta]:
        """Full-text search across session content (requires indexing)."""
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
- LiteLLM, LangChain, etc. can use Onyx as a backend
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

```python
# Standard OpenAI format
POST /v1/chat/completions
{
    "model": "claude-subscription/claude-sonnet-4-20250514",  # or "ollama/llama3", etc.
    "messages": [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello!"}
    ],
    "stream": true,
    "temperature": 0.7,
    
    # Onyx extensions (optional)
    "x-onyx-agent-id": "main",           # Route to specific agent
    "x-onyx-session-id": "abc123",       # Continue existing session
    "x-onyx-include-memory": true        # Include memory context
}
```

#### Chat Completions Response

```python
# Standard OpenAI format
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
    
    # Onyx extensions
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

```python
# Bearer token (API key style)
Authorization: Bearer onyx_sk_abc123

# Or basic auth
Authorization: Basic base64(user:pass)
```

#### Agent Routing

```python
# Option 1: In model field (OpenClaw style)
"model": "onyx:research-agent"

# Option 2: Header
"x-onyx-agent-id": "research-agent"

# Option 3: Default to "main" agent
```

#### FastAPI Implementation Sketch

```python
from fastapi import FastAPI, Header
from fastapi.responses import StreamingResponse

app = FastAPI()

@app.post("/v1/chat/completions")
async def chat_completions(
    request: ChatCompletionRequest,
    authorization: str = Header(...),
    x_onyx_agent_id: str = Header("main"),
    x_onyx_session_id: str = Header(None),
):
    # Validate auth
    # Get or create session
    # Route to provider (Claude Agent SDK or LiteLLM)
    # Stream response
    
    if request.stream:
        return StreamingResponse(
            stream_response(request),
            media_type="text/event-stream"
        )
    return await complete_response(request)
```

---

### D7: Web Interface - DECIDED

**Decision**: Browser-based Control UI (OpenClaw-style) with provider configuration

#### Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Framework | **Vite + React** | Fast dev, good ecosystem, familiar |
| Styling | **Tailwind CSS** | Utility-first, consistent with modern UIs |
| State | **Zustand** or React Query | Simple, minimal boilerplate |
| WebSocket | Native WebSocket | Real-time streaming |
| Bundling | Static files served by FastAPI | Single deployment |

*Note: OpenClaw uses Lit (web components). React is more familiar and has broader ecosystem support.*

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
│  LiteLLM Providers                                              │
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
│  │ GitHub Copilot                           [Authenticate]  │   │
│  │ Status: Not authenticated                                │   │
│  │ [Start OAuth Flow]                                       │   │
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

Provider credentials stored in:
- `~/.config/onyx/config.json` (file-based, like OpenClaw)
- Or SurrealDB `onyx.config` table (encrypted at rest)

```json
{
  "providers": {
    "openrouter": {
      "api_key": "sk-or-..."
    },
    "bedrock": {
      "aws_access_key_id": "...",
      "aws_secret_access_key": "...",
      "aws_region": "us-east-1"
    },
    "ollama": {
      "base_url": "http://localhost:11434"
    }
  },
  "default_model": "claude-subscription/claude-sonnet-4-20250514"
}
```

#### Security

- Auth required for all UI access (token or password)
- Credentials encrypted at rest
- API keys displayed as redacted (`sk-or-...xxx`)
- Localhost auto-approved, remote requires pairing

---

### D9: Tool System - DECIDED

**Decision**: Built-in tool groups + custom tools + APScheduler for cron

#### Tool Categories

| Group | Tools | MVP? |
|-------|-------|------|
| `memory` | `memory_search`, `memory_write`, `memory_get` | Yes |
| `sessions` | `sessions_list`, `sessions_history`, `sessions_send` | Yes |
| `web` | `web_search`, `web_fetch` | Yes |
| `fs` | `read`, `write`, `edit` | Yes |
| `runtime` | `exec`, `process` | Yes |
| `schedule` | `schedule`, `list_jobs`, `cancel_job` | Yes |
| `menos` | `menos_search`, `menos_ingest` | Yes |
| `model_routing` | `select_model`, `route_task` | Yes |
| `mermaid` | `render_mermaid` | Yes |
| `git` | `git_commit`, `git_push`, `git_pull`, `git_status` | Yes |
| `docker` | `docker_ps`, `docker_logs`, `docker_stats`, `docker_exec` | Yes |

#### Web Search: SearXNG

```yaml
# docker-compose.yml addition
searxng:
  image: searxng/searxng:latest
  ports:
    - "8888:8080"
  environment:
    - SEARXNG_BASE_URL=http://localhost:8888
    - SEARXNG_SECRET=changeme
  volumes:
    - searxng_config:/etc/searxng
```

```python
# Tool implementation
async def web_search(query: str, limit: int = 10):
    """Search using local SearXNG instance."""
    response = await http_client.get(
        "http://searxng:8080/search",
        params={"q": query, "format": "json", "engines": "google,bing"}
    )
    return response.json()["results"]
```

#### Scheduling: APScheduler

```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

scheduler = AsyncIOScheduler()

# Cron-style job
scheduler.add_job(
    run_heartbeat,
    CronTrigger.from_crontab("0 9 * * *"),  # 9 AM daily
    args=[agent_id],
    id=f"heartbeat_{agent_id}"
)

# Interval job
scheduler.add_job(
    sync_memory_index,
    "interval",
    minutes=5,
    id="memory_sync"
)

# One-time job
scheduler.add_job(
    cleanup_sessions,
    "date",
    run_date=datetime(2026, 3, 1, 0, 0),
    id="session_cleanup"
)
```

#### Model Routing Tool

```python
async def select_model(task: str, context: dict) -> str:
    """Route task to best model based on complexity."""
    
    # Simple heuristics
    if any(kw in task.lower() for kw in ["quick", "simple", "what is"]):
        return "ollama/llama3"  # Fast, local
    
    if any(kw in task.lower() for kw in ["debug", "complex", "architect"]):
        return "claude-subscription/claude-opus-4-20250514"  # Best reasoning
    
    # Default to mid-tier
    return "openrouter/anthropic/claude-sonnet-4"
```

#### Mermaid Rendering Tool

```python
async def render_mermaid(diagram: str) -> str:
    """Render mermaid diagram to SVG/PNG."""
    import mermaid
    
    # Use mermaid-js directly or a simple HTTP API
    async with aiohttp.ClientSession() as session:
        async with session.post(
            "http://mermaid-render:8080/render",
            json={"code": diagram, "format": "svg"}
        ) as resp:
            return await resp.text()
```

```dockerfile
# Separate render service
FROM node:20
WORKDIR /app
RUN npm install @mermaid-js/mermaid-cli
CMD ["node", "index.js"]
```

#### Git Tool

```python
class GitTool:
    async def commit(self, message: str, files: list[str] = None) -> str:
        """Stage and commit files."""
        # Use git CLI
        result = await run(["git", "add", *(files or ["."])])
        result = await run(["git", "commit", "-m", message])
        return result.stdout
    
    async def push(self, remote: str = "origin", branch: str = None) -> str:
        """Push to remote."""
        cmd = ["git", "push", remote]
        if branch:
            cmd.append(branch)
        return (await run(cmd)).stdout
    
    async def status(self) -> str:
        """Get git status."""
        return (await run(["git", "status", "--porcelain"])).stdout
```

#### Docker Tool

```python
class DockerTool:
    """Docker in Docker support."""
    
    async def ps(self, all: bool = False) -> list[dict]:
        """List containers."""
        result = await run([
            "docker", "ps", 
            "--format", "{{json .}}"
        ] + (["-a"] if all else []))
        return [json.loads(line) for line in result.stdout.splitlines()]
    
    async def logs(self, container: str, tail: int = 100) -> str:
        """Get container logs."""
        return (await run([
            "docker", "logs", "--tail", str(tail), container
        ])).stdout
    
    async def exec(self, container: str, command: list[str]) -> str:
        """Execute command in container."""
        return (await run([
            "docker", "exec", container, *command
        ])).stdout
    
    async def stats(self, container: str = None) -> list[dict]:
        """Get container stats."""
        cmd = ["docker", "stats", "--no-stream", "--format", "{{json .}}"]
        if container:
            cmd.append(container)
        result = await run(cmd)
        return [json.loads(line) for line in result.stdout.splitlines() if line]
```

**Docker in Docker Setup**:
```dockerfile
# Onyx Dockerfile
FROM python:3.12-slim

# Install Docker CLI
RUN apt-get update && apt-get install -y \
    docker.io \
    && rm -rf /var/lib/apt/lists/*

# Mount Docker socket (for DinD)
# Or use Docker-in-Docker: docker:dind as sidecar
```

```yaml
# docker-compose.yml
services:
  onyx:
    image: onyx:latest
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - DOCKER_HOST=unix:///var/run/docker.sock

  # Or DinD sidecar
  # docker-dind:
  #   image: docker:dind
  #   privileged: true
```

#### Tool Definition Schema

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

#### UI Display: Markdown + Mermaid

The web interface will render:
- Markdown messages with syntax highlighting
- Mermaid diagrams inline (using `mermaid.js` in browser)
- Tool call cards with expandable input/output
- Code blocks with copy button

```typescript
// React component for rendering
import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: true });

function MessageContent({ content }) {
  return (
    <div className="prose">
      <ReactMarkdown>{content}</ReactMarkdown>
      <MermaidChart>{diagramCode}</MermaidChart>
    </div>
  );
}
```

---

### D8: Agent Definition Format - DECIDED

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
      mode: "token",
      token: "${ONYX_GATEWAY_TOKEN}"
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

#### Workspace File Templates

**AGENTS.md** (operating instructions):
```markdown
# Operating Instructions

## Core Behaviors
- Always search memory before answering questions about past conversations
- Write important facts to daily memory log
- Be concise but thorough

## Tool Usage
- Use memory_search before claiming "I don't remember"
- Cite sources when using web_search results

## Boundaries
- Never execute shell commands without explicit approval
- Don't access files outside the workspace
```

**SOUL.md** (persona):
```markdown
# Persona

You are a helpful personal assistant with expertise in software development.

## Tone
- Professional but friendly
- Direct and concise
- Admit uncertainty rather than guessing

## Boundaries  
- Don't pretend to have emotions
- Don't make promises about capabilities you don't have
```

**USER.md** (user profile):
```markdown
# User Profile

Name: Mike
Timezone: America/New_York
Preferred communication: Direct, minimal small talk

## Interests
- Software development (Python, TypeScript)
- DevOps and infrastructure
- AI/ML tooling

## Work Context
- Senior engineer
- Uses Claude Code daily
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
| Sandbox config | ✓ | TBD | Future |

#### Differences from OpenClaw

1. **Config location**: `~/.config/onyx/` (XDG) vs `~/.openclaw/`
2. **Model prefixes**: `claude-subscription/`, `openrouter/`, `ollama/` vs `anthropic/`, `openai/`
3. **Providers section**: Onyx-specific for API keys, OAuth status
4. **Channels**: Onyx uses plugin architecture, not built-in channels
5. **Storage**: Onyx uses MinIO + SurrealDB, OpenClaw uses filesystem + SQLite

#### Migration Path (OpenClaw → Onyx)

```python
def migrate_openclaw_config(openclaw_path: str) -> dict:
    """Convert OpenClaw config to Onyx format."""
    with open(openclaw_path) as f:
        config = json5.load(f)
    
    # Copy compatible fields
    onyx_config = {
        "agents": config.get("agents", {}),
        "bindings": config.get("bindings", []),
    }
    
    # Remap model prefixes
    for agent in onyx_config["agents"].get("list", []):
        if model := agent.get("model"):
            agent["model"] = remap_model_prefix(model)
    
    return onyx_config
```

---

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         ONYX GATEWAY                            │
│                    (FastAPI + WebSocket)                        │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Core Modules:                                            │  │
│  │  ├── gateway/          # WebSocket + HTTP endpoints       │  │
│  │  ├── agents/           # Agent runtime, tool execution    │  │
│  │  ├── memory/           # Vector search, graph queries     │  │
│  │  ├── providers/        # LLM provider registry            │  │
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
├── pyproject.toml
├── Dockerfile
├── docker-compose.yml
├── src/
│   └── onyx/
│       ├── __init__.py
│       ├── main.py              # FastAPI app entry
│       ├── config.py            # Settings (Pydantic)
│       ├── gateway/
│       │   ├── __init__.py
│       │   ├── websocket.py     # WS connection handler
│       │   └── http.py          # REST endpoints
│       ├── agents/
│       │   ├── __init__.py
│       │   ├── runtime.py       # Agent execution loop
│       │   ├── tools/           # Built-in tools
│       │   └── context.py       # Session context
│       ├── memory/
│       │   ├── __init__.py
│       │   ├── vector.py        # Vector search
│       │   ├── graph.py         # Graph queries
│       │   └── hybrid.py        # Combined search
│       ├── providers/
│       │   ├── __init__.py
│       │   ├── registry.py      # Provider abstraction
│       │   ├── anthropic.py
│       │   ├── openai.py
│       │   └── ollama.py
│       ├── plugins/
│       │   ├── __init__.py
│       │   ├── loader.py        # Plugin discovery
│       │   ├── hooks.py         # Lifecycle hooks
│       │   └── manifest.py      # Plugin config schema
│       └── sessions/
│           ├── __init__.py
│           └── manager.py       # Session state
├── plugins/
│   ├── discord/
│   │   ├── manifest.yaml
│   │   └── bot.py
│   └── telegram/
│       ├── manifest.yaml
│       └── bot.py
└── tests/
```

---

## Dependencies (Initial)

```toml
[project]
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.34.0",
    "websockets>=14.0",
    "pydantic>=2.10.0",
    "pydantic-settings>=2.7.0",
    "surrealdb>=0.4.0",
    "minio>=7.2.0",
    "anthropic>=0.40.0",
    "openai>=1.58.0",
    "ollama>=0.4.0",
    "httpx>=0.28.0",
]

[project.optional-dependencies]
discord = ["discord.py>=2.5.0"]
telegram = ["python-telegram-bot>=21.0"]
```

---

## Next Steps

1. **Answer open questions above**
2. Design SurrealDB schema for memory system
3. Define plugin manifest format
4. Scaffold project structure with uv
5. Implement core gateway (FastAPI + WS)
6. Add first plugin (CLI for testing)

---

## Scratchpad

<!-- Use this section for notes, decisions, and working through problems -->

### Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-16 | Sibling to menos, not extension | Keep services focused, share infrastructure |
| 2026-02-16 | Plugin architecture for bots | Allows bots to run separately, better scaling |
| 2026-02-16 | SurrealDB + MinIO (match menos) | Reuse existing infrastructure knowledge |
| 2026-02-16 | Personal assistant MVP first | Reduce scope, validate architecture |
| 2026-02-16 | Files-first in MinIO, SurrealDB as index | Match OpenClaw philosophy: files are truth, DB is derived. Human-editable, portable, git-friendly |
| 2026-02-16 | Shared infra with menos, separate namespaces | Same SurrealDB/MinIO/Ollama, Onyx queries menos for RAG, conversations stay in Onyx |
| 2026-02-16 | In-process plugins for MVP | Simpler deployment, interfaces designed for future extraction to separate services |
| 2026-02-16 | Claude Agent SDK + LiteLLM | SDK for Claude subscription, LiteLLM for everything else (Bedrock, OpenRouter, Copilot, ChatGPT, Ollama, etc.) |
| 2026-02-16 | MinIO for session logs + SurrealDB metadata | JSONL files scale to any length, metadata enables fast queries |
| 2026-02-16 | OpenAI-compatible HTTP API | Drop-in replacement, works with existing tools/libraries |
| 2026-02-16 | Browser Control UI (React + Vite) | Chat, sessions, memory, agents, provider config, logs |
| 2026-02-16 | OpenClaw-compatible agent format | JSON config + workspace markdown files, enables migration |
| 2026-02-16 | Comprehensive tool system | Memory, sessions, web (SearXNG), FS, runtime, schedule (APScheduler), menos, model routing, mermaid, git, docker |

### Research Links

- [OpenClaw GitHub](https://github.com/openclaw/openclaw)
- [nanobot](https://github.com/HKUDS/nanobot) - Python reference implementation
- [FemtoBot](https://github.com/rocopolas/FemtoBot) - Ollama + ChromaDB patterns
- [ClawRAG](https://github.com/2dogsandanerd/ClawRag) - Hybrid search implementation
- [Graphiti Memory](https://github.com/clawdbrunner/openclaw-graphiti-memory) - Three-layer architecture
