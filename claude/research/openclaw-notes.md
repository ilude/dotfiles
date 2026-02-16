# OpenClaw: Docker + Graph/Vector DB Memory

## What Is OpenClaw

- Open-source personal AI assistant by Peter Steinberger (150k+ GitHub stars)
- Runs locally, connects to WhatsApp, Telegram, Slack, Discord, Teams, etc.
- GitHub: https://github.com/openclaw/openclaw
- Docs: https://docs.openclaw.ai/

## Default Memory (Built-in)

Plain Markdown files backed by SQLite — no external DB required.

- **Daily logs**: `memory/YYYY-MM-DD.md` — append-only, auto-loaded at session start
- **Long-term**: `MEMORY.md` — curated facts, preferences, decisions
- **Vector search**: Hybrid BM25 (30%) + cosine similarity (70%) via SQLite FTS5 + `sqlite-vec`
- **Embedding providers** (auto-selected priority): Local GGUF > OpenAI > Gemini > Voyage
- **Index storage**: Per-agent SQLite at `~/.openclaw/memory/<agentId>.sqlite`
- **Chunking**: ~400-token chunks, 80-token overlap, ~700 char snippet cap

Limitations: No relational reasoning, no cross-agent knowledge sharing.

## Docker Installation

```bash
# Quick start
./docker-setup.sh

# Manual
docker build -t openclaw:local -f Dockerfile .
docker compose run --rm openclaw-cli onboard
docker compose up -d openclaw-gateway
```

**Key env vars**:
- `OPENCLAW_DOCKER_APT_PACKAGES` — extra system packages
- `OPENCLAW_EXTRA_MOUNTS` — additional bind mounts (e.g., `/host:/container:ro`)
- `OPENCLAW_HOME_VOLUME` — named volume for `/home/node` persistence

**Volumes**: Config at `~/.openclaw/`, workspace at `~/openclaw/workspace`
**Dashboard**: `http://127.0.0.1:18789/`

---

## Memory Enhancement Options

### Option 1: Graphiti + Neo4j (Recommended for Graph + Vector)

Three-layer memory system for multi-agent setups.

| Layer | What | Backend |
|-------|------|---------|
| 1. Private files | Per-agent `memory/` with vector search | SQLite/QMD |
| 2. Shared files | Symlinked reference docs (user profile, agent roster) | Filesystem |
| 3. Knowledge graph | Temporal facts with cross-agent search | Neo4j + Graphiti |

**Repo**: https://github.com/clawdbrunner/openclaw-graphiti-memory

**docker-compose.yml** (`~/services/graphiti/`):

```yaml
services:
  graphiti:
    image: zepai/graphiti:latest
    ports: ["8001:8000"]
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}

  neo4j:
    image: neo4j:5.26.0
    ports: ["7474:7474", "7687:7687"]
    environment:
      - NEO4J_AUTH=neo4j/graphiti_memory_2026
      - NEO4J_PLUGINS=["apoc"]
    volumes:
      - neo4j_data:/data
      - neo4j_logs:/logs
```

**Setup**:

```bash
export OPENAI_API_KEY="sk-..."
docker compose up -d
```

**OpenClaw config** (`~/.openclaw/openclaw.json`):

```json
{
  "memorySearch": {
    "enabled": true,
    "sources": ["memory", "sessions"],
    "provider": "gemini",
    "model": "gemini-embedding-001",
    "sync": {
      "onSessionStart": true,
      "watch": true
    }
  }
}
```

**Key scripts** (copy to `_shared/bin/`):
- `graphiti-search.sh` — query knowledge graph
- `graphiti-log.sh` — write facts to agent's group
- `graphiti-context.sh` — retrieve task context

**Graphiti API endpoints**:
- `POST /messages` — ingest conversation data with entity extraction
- `POST /search` — query temporal facts with natural language
- `GET /healthcheck` — service status

**Cost**: ~$1/month for 20-agent setup (OpenAI only during ingestion, searches are free Neo4j queries)

**Pros**: Temporal reasoning, cross-agent knowledge, relationship traversal
**Cons**: Requires OpenAI API key, more infrastructure

---

### Option 2: Cognee Plugin (Simpler Graph + Vector)

Single-container knowledge graph extraction engine.

**Repo/Docs**: https://www.cognee.ai/blog/integrations/what-is-openclaw-ai-and-how-we-give-it-memory-with-cognee

**Docker**:

```bash
docker run -d -p 8000:8000 \
  -e LLM_API_KEY=$OPENAI_API_KEY \
  -e ENABLE_BACKEND_ACCESS_CONTROL=false \
  cognee/cognee:latest
```

**Install plugin**:

```bash
openclaw plugins install @cognee/cognee-openclaw
```

**Config** (`~/.openclaw/config.yaml`):

```yaml
plugins:
  entries:
    memory-cognee:
      enabled: true
      config:
        baseUrl: "http://localhost:8000"
        searchType: "GRAPH_COMPLETION"
        autoRecall: true
        autoIndex: true
```

**CLI commands**: `openclaw cognee index`, `openclaw cognee status`

**Pros**: Single container, `GRAPH_COMPLETION` traverses relationships, auto-syncs
**Cons**: Less control than raw Neo4j, still needs OpenAI key

---

### Option 3: Mem0 (Vector-First, Optional Graph)

Drop-in persistent memory with minimal config.

**Docs**: https://mem0.ai/blog/mem0-memory-for-openclaw

- Open-source mode: bring your own embedder (Ollama, OpenAI), vector store (Qdrant, in-memory), LLM
- Qdrant: `docker run -p 6333:6333 qdrant/qdrant`

**Pros**: Fastest setup, works with local models (Ollama), no OpenAI required
**Cons**: Weaker relationship reasoning than graph-based options

---

### Option 4: ClawRAG + ChromaDB (Document RAG)

**Repo**: https://github.com/2dogsandanerd/ClawRag

Combines Docling document processing with ChromaDB vector storage.

**Pros**: Good for PDFs/docs, ChromaDB is lightweight
**Cons**: No graph layer, pure vector similarity

---

## Native Memory Configuration Reference

### Embedding Providers

| Provider | Model | Key Source |
|----------|-------|-----------|
| Local | GGUF via node-llama-cpp (~0.6 GB) | No key needed |
| OpenAI | `text-embedding-3-small` | Auth profiles or env |
| Gemini | `gemini-embedding-001` | `GEMINI_API_KEY` |
| Voyage | configurable | `VOYAGE_API_KEY` |
| Custom | OpenAI-compatible | `remote.baseUrl` + `remote.apiKey` |

### QMD Backend (Experimental)

Local-first sidecar combining BM25 + vectors + reranking. Enable with `memory.backend = "qmd"`.

- Runs locally via Bun + node-llama-cpp
- XDG isolation per agent: `~/.openclaw/agents/<agentId>/qmd/`
- Periodic maintenance: `qmd update` + `qmd embed` on boot + 5 min interval
- OS support: macOS, Linux (Windows via WSL2 only)

### Hybrid Search Tuning

```json
{
  "query": {
    "hybrid": {
      "enabled": true,
      "vectorWeight": 0.7,
      "textWeight": 0.3,
      "candidateMultiplier": 4
    }
  }
}
```

### Memory Flush (Auto-Save Before Context Compaction)

```json
{
  "softThresholdTokens": 4000,
  "reserveTokensFloor": 20000,
  "enabled": true
}
```

## Decision Matrix

| Feature | Graphiti+Neo4j | Cognee | Mem0 | ClawRAG |
|---------|---------------|--------|------|---------|
| Graph DB | Neo4j | Built-in | Optional | No |
| Vector DB | SQLite-vec | Built-in | Qdrant | ChromaDB |
| Temporal reasoning | Yes | Partial | No | No |
| Cross-agent search | Yes | No | No | No |
| Local-only (no API key) | No | No | Yes (Ollama) | Yes |
| Setup complexity | Medium | Low | Low | Low |
| Containers needed | 2 (Graphiti + Neo4j) | 1 | 1 (Qdrant) | 1 |

## Sources

- [OpenClaw GitHub](https://github.com/openclaw/openclaw)
- [OpenClaw Docker Docs](https://docs.openclaw.ai/install/docker)
- [OpenClaw Memory Docs](https://docs.openclaw.ai/concepts/memory)
- [openclaw-graphiti-memory](https://github.com/clawdbrunner/openclaw-graphiti-memory)
- [Graphiti Config Reference (DeepWiki)](https://deepwiki.com/clawdbrunner/openclaw-graphiti-memory/7-configuration-reference)
- [Cognee + OpenClaw](https://www.cognee.ai/blog/integrations/what-is-openclaw-ai-and-how-we-give-it-memory-with-cognee)
- [Mem0 for OpenClaw](https://mem0.ai/blog/mem0-memory-for-openclaw)
- [ClawRAG (ChromaDB)](https://github.com/2dogsandanerd/ClawRag)
- [Simon Willison - OpenClaw Docker](https://til.simonwillison.net/llms/openclaw-docker)
- [Memory Architecture Explained (Medium)](https://medium.com/@shivam.agarwal.in/agentic-ai-openclaw-moltbot-clawdbots-memory-architecture-explained-61c3b9697488)
