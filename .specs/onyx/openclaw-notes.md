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

## Related Projects & Clones

| Repo | Description |
|------|-------------|
| [qwibitai/nanoclaw](https://github.com/qwibitai/nanoclaw) | |
| [memovai/mimiclaw](https://github.com/memovai/mimiclaw) | |
| [rocopolas/FemtoBot](https://github.com/rocopolas/FemtoBot) | |
| [HKUDS/nanobot](https://github.com/HKUDS/nanobot) | |
| [openclaw/openclaw](https://github.com/openclaw/openclaw) | Main project |

### YouTube

- [I Built My Own Clawdbot (It's ACTUALLY Safe)](https://www.youtube.com/watch?v=zeJ4whgLELE) — menos: `ryjkp7sppzrqiomtttqc`
- [I build OpenClaw REPLICA inside Claude Code (CHEAP & SECURE)](https://www.youtube.com/watch?v=jGuzXshuFrQ) — menos: `nwiz158wkr0s1l3etdh0`

---

## Research: Sipeed PicoClaw
<!-- Research added by /dig-into on 2026-02-16 -->

### Quick Summary
- **What**: Ultra-lightweight AI assistant framework written in Go, designed to run on resource-constrained hardware with <10MB RAM footprint
- **Why it matters**: Brings AI agent capabilities to $10 embedded devices (99% cheaper than Mac mini, 99% smaller memory footprint than OpenClaw)
- **Key insight**: 95% AI-generated codebase through self-bootstrapping, demonstrating edge intelligence paradigm for decentralized autonomous systems

### Overview and Context

[PicoClaw](https://github.com/sipeed/picoclaw) is an ultra-lightweight personal AI assistant framework developed by [Sipeed](https://github.com/sipeed) and written in Go. Launched on [February 9, 2026](https://www.cnx-software.com/2026/02/10/picoclaw-ultra-lightweight-personal-ai-assistant-run-on-just-10mb-of-ram/), the project was built in a single day and hit [12,000 GitHub stars within one week](https://github.com/sipeed/picoclaw), demonstrating exceptional community interest.

PicoClaw is explicitly positioned as an [OpenClaw alternative for edge computing](https://circuitdigest.com/news/an-openclaw-alternative-built-to-run-within-10-mb-of-ram), targeting deployment on minimal hardware rather than desktop-class systems. The project is inspired by [nanobot](https://news.ycombinator.com/item?id=46897737) and represents the "extreme frontier of optimization effort" [[Evolution of OpenClaw, PicoClaw & Nanobot](https://sterlites.com/blog/picoclaw-paradigm-edge-intelligence)].

**Important**: PicoClaw is [in early development and may have unresolved network security issues](https://github.com/sipeed/picoclaw). The developers explicitly warn against deploying to production environments before the v1.0 release [[GitHub README](https://github.com/sipeed/picoclaw/blob/main/README.md)].

### Hardware and Specifications

| Specification | Value | Comparison |
|--------------|-------|------------|
| **RAM Footprint** | <10MB (recent builds: 10-20MB) | 99% smaller than OpenClaw (>1GB) [[CNX Software](https://www.cnx-software.com/2026/02/10/picoclaw-ultra-lightweight-personal-ai-assistant-run-on-just-10mb-of-ram/)] |
| **Startup Time** | <1 second on 0.6GHz single-core | 400-500x faster than OpenClaw (>500s) [[PicoClaw.net](https://picoclaw.net/)] |
| **Hardware Cost** | $10-15 boards (LicheeRV-Nano) | 98% cheaper than Mac mini [[GitHub](https://github.com/sipeed/picoclaw)] |
| **CPU Minimum** | 0.6GHz single-core | Runs on Raspberry Pi Zero (512MB), LicheeRV-Nano [[Sipeed X/Twitter](https://x.com/SipeedIO/status/2021155649267122646)] |

**Supported Platforms:**
- **Architectures**: x86_64, ARM64, RISC-V [[GitHub](https://github.com/sipeed/picoclaw)]
- **Recommended devices**: LicheeRV-Nano E/W ($9.90), NanoKVM ($30-50), MaixCAM2, Raspberry Pi Zero/4/5, Orange Pi, Banana Pi [[PicoClaw FAQ](https://picoclaw.club/picoclaw-faq.html)]
- **Operating systems**: Linux (primary), macOS, Windows (via precompiled binaries) [[DeepWiki Installation](https://deepwiki.com/sipeed/picoclaw/2.1-installation-and-building)]

### Software Architecture

**Language and Build:**
- Written in [Go 1.21+](https://github.com/sipeed/picoclaw) with MIT license
- Single self-contained binary across all architectures (typically ~8MB) [[PicoClaw.net](https://picoclaw.net/)]
- [95% AI-generated core through self-bootstrapping](https://medium.com/@ishank.iandroid/picoclaw-the-10-ai-agent-that-changed-my-edge-computing-game-5c2c0c6badfb), with human-in-the-loop refinement

**Core Components:**
```
picoclaw/
├── cmd/picoclaw/          # CLI entry point
├── pkg/                   # Core packages (agent engine, tools, session mgmt)
├── config/                # Configuration templates
├── workspace/             # Default workspace layout (sessions, memory, cron)
├── skills/                # Reusable knowledge packages
├── doc/                   # Documentation
├── Dockerfile             # Container deployment
└── docker-compose.yml     # Multi-service orchestration
```
[[GitHub Repository](https://github.com/sipeed/picoclaw)]

**LLM Provider Support:**
- OpenRouter, Zhipu (GLM), Anthropic (Claude), OpenAI, Google Gemini
- Configured via `~/.picoclaw/config.json` with API keys [[PicoClaw.ai Docs](https://picoclaw.ai/docs)]
- Cloud API delegation for reasoning, local orchestration [[Hacker News Discussion](https://news.ycombinator.com/item?id=47004845)]

**Web Search Integration:**
- Brave Search API (2,000 free queries/month)
- DuckDuckGo (built-in fallback, no API key required)
[[DeepWiki Config](https://deepwiki.com/erha2025/picoclaw/2-installation-and-setup)]

**Messaging Platform Integrations:**
- Telegram, Discord, WhatsApp, QQ, DingTalk, LINE, Feishu (7 channels total)
- Gateway mode for multi-channel bot operation
- Automatic voice transcription (Telegram)
[[GitHub Issues](https://github.com/sipeed/picoclaw/issues/31)]

### How It Works

**Operational Flow:**
1. **Message Reception**: User sends message via CLI, gateway (Telegram/Discord), or HTTP API
2. **Agent Processing**: PicoClaw core loop (receive → think → respond → use tools)
3. **Tool Execution**: Structured function calls for filesystem, web search, messaging, scheduling
4. **LLM Reasoning**: Cloud API delegation to configured provider (GLM/GPT/Claude)
5. **Response**: Output via originating channel with session persistence

**Key Capabilities:**
- **Session Management**: JSONL-based conversation persistence in `~/.picoclaw/workspace/sessions/`
- **Long-term Memory**: Persistent state across restarts [[GitHub](https://github.com/sipeed/picoclaw)]
- **Scheduling**: Built-in cron tool for recurring tasks, jobs stored in `workspace/cron/` [[PicoClaw.ai](https://picoclaw.ai/docs)]
- **Sandboxing**: Restricts file access and command execution to workspace by default [[Sterlites Blog](https://sterlites.com/blog/picoclaw-paradigm-edge-intelligence)]

**Deployment Modes:**
- **Agent Mode**: One-shot CLI execution or interactive REPL
- **Gateway Mode**: Long-running multi-channel bot service (`picoclaw gateway`)
- **Docker Compose**: Containerized deployment with profile-based service selection
[[DeepWiki Docker Deployment](https://deepwiki.com/erha2025/picoclaw/2.2-docker-deployment)]

### Trade-offs and Considerations

**Pros:**
- **Extreme efficiency**: Runs on hardware 98% cheaper and 99% smaller than alternatives [[PicoClaw vs OpenClaw](http://openclawpulse.com/picoclaw-vs-openclaw/)]
- **Lightning startup**: 400x faster boot time enables near-instant interactive use
- **Cross-platform**: Single binary across RISC-V, ARM, x86 without runtime dependencies
- **Edge-first**: Designed for IoT, homelab, and embedded deployments [[CNX Software](https://www.cnx-software.com/2026/02/10/picoclaw-ultra-lightweight-personal-ai-assistant-run-on-just-10mb-of-ram/)]
- **Community momentum**: 12K stars in one week, active development [[GitHub](https://github.com/sipeed/picoclaw)]

**Cons:**
- **Minimal ecosystem**: No browser control, multi-agent orchestration, plugin marketplace (vs. OpenClaw) [[PicoClaw vs OpenClaw](http://openclawpulse.com/picoclaw-vs-openclaw/)]
- **Early security concerns**: [Unresolved network security issues](https://github.com/sipeed/picoclaw), pre-v1.0 stability warnings
- **Basic memory system**: Simple logging vs. OpenClaw's vector search/compaction [[Comparison](https://circuitdigest.com/news/an-openclaw-alternative-built-to-run-within-10-mb-of-ram)]
- **Cloud dependency**: Requires API keys for LLM reasoning (no local inference) [[Config Docs](https://picoclaw.ai/docs)]
- **Limited tooling**: Core loop only — no email, calendar, smart home integrations [[PicoClaw vs OpenClaw](http://openclawpulse.com/picoclaw-vs-openclaw/)]

**Comparison with Alternatives:**

| Framework | Language | RAM | Startup | Binary Size | Use Case |
|-----------|----------|-----|---------|-------------|----------|
| **OpenClaw** | TypeScript | >1GB | >500s | ~28MB | Full agent framework, desktop workflows |
| **Nanobot** | Python | >100MB | >30s | — | Research platform, flexibility |
| **PicoClaw** | Go | <10MB | <1s | ~8MB | Edge computing, embedded Linux |
| **ZeroClaw** | Rust | <5MB | <10ms | 3.4MB | Security-first, ultra-minimal [[Cloudron Forum](https://forum.cloudron.io/topic/15080/zeroclaw-rust-based-alternative-to-openclaw-picoclaw-nanobot-agentzero)] |

### Practical Implementation Guidance

**Installation (Docker Compose - Recommended):**
```bash
# Clone repository
git clone https://github.com/sipeed/picoclaw.git
cd picoclaw

# Configure API keys
cp config/config.example.json config/config.json
# Edit config.json: add LLM provider keys, optional Brave Search key

# Build and start gateway mode
docker compose --profile gateway up -d

# Check logs
docker compose logs -f picoclaw-gateway
```
[[DeepWiki Docker](https://deepwiki.com/erha2025/picoclaw/2.2-docker-deployment)]

**Installation (Binary):**
```bash
# Download precompiled binary for your platform
# RISCV64 Linux / ARM64 Linux / AMD64 Linux / AMD64 Windows
wget https://github.com/sipeed/picoclaw/releases/latest/download/picoclaw-linux-amd64

# Configure
mkdir -p ~/.picoclaw
cp config.example.json ~/.picoclaw/config.json
# Edit ~/.picoclaw/config.json with API keys

# Run interactive mode
./picoclaw-linux-amd64

# Or one-shot command
./picoclaw-linux-amd64 -m "What is 2+2?"
```
[[Installation Guide](https://deepwiki.com/sipeed/picoclaw/2.1-installation-and-building)]

**Configuration Essentials:**
- **LLM Provider**: At minimum, set one of `OPENROUTER_API_KEY`, `GLM_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` in `config.json`
- **Web Search** (optional): `BRAVE_SEARCH_API_KEY` for 2,000 free monthly queries
- **Messaging Bots** (optional): Configure `telegram.token`, `discord.token`, etc. for gateway mode
[[Config Reference](https://picoclaw.ai/docs)]

**Key Code Patterns:**
```json
// config.json structure
{
  "llm": {
    "provider": "openrouter",
    "apiKey": "sk-...",
    "model": "anthropic/claude-3.5-sonnet"
  },
  "search": {
    "provider": "brave",
    "apiKey": "BSA..."
  },
  "channels": {
    "telegram": {
      "enabled": true,
      "token": "123456:ABC-DEF..."
    }
  }
}
```

**Workspace Structure:**
```
~/.picoclaw/
├── config.json          # Main configuration
├── workspace/
│   ├── sessions/        # Conversation history (JSONL)
│   ├── memory/          # Persistent state
│   └── cron/            # Scheduled tasks
└── agents/              # Agent-specific data
```

### Common Pitfalls and Anti-Patterns

**Security Issues:**
- ❌ **DON'T deploy to production before v1.0**: [Unresolved network security issues](https://github.com/sipeed/picoclaw) explicitly documented
- ❌ **DON'T expose gateway publicly without auth**: PicoClaw inherits [OpenClaw-class security risks](https://www.darkreading.com/application-security/openclaw-insecurities-safe-usage-difficult) (exposed dashboards, credential leaks)
- ✅ **DO run behind VPN/firewall**: Limit access to trusted networks only
- ✅ **DO use minimal API key permissions**: Scope provider keys to least privilege

**Configuration Errors:**
- ❌ **Missing API keys**: PicoClaw cannot function without at least one LLM provider configured
- ❌ **Wrong architecture binary**: Ensure downloaded binary matches your platform (RISC-V vs ARM vs x86)
- ✅ **Validate config before deployment**: Test with `picoclaw -m "test"` before running gateway mode

**Resource Constraints:**
- ❌ **Assuming <10MB always**: Recent merges increased footprint to 10-20MB [[GitHub](https://github.com/sipeed/picoclaw)]
- ✅ **Budget 64MB+ RAM for comfort**: Minimum is 10MB, but recommended is 64MB+ for stability

**Community Feedback:**
- Limited real-world deployment reports as of Feb 2026 (early adoption phase)
- Hacker News discussion shows [minimal production usage feedback](https://news.ycombinator.com/item?id=47004845) yet
- Most excitement around potential vs. proven deployments

### Related Projects and Further Reading

**Lightweight AI Assistant Alternatives:**
- [ZeroClaw](https://github.com/zeroclaw-labs/zeroclaw) (Rust, <5MB RAM, <10ms startup) — Security-focused with strict sandboxing [[Cloudron Forum](https://forum.cloudron.io/topic/15080/zeroclaw-rust-based-alternative-to-openclaw-picoclaw-nanobot-agentzero)]
- [Nanobot](https://news.ycombinator.com/item?id=46897737) (Python, 4,000 lines, 99% smaller than OpenClaw) — HKUDS research project
- [MicroClaw](https://github.com/microclaw/microclaw) (Rust) — Chat-focused agent inspired by nanoclaw

**Full-Featured Alternatives:**
- [OpenClaw](https://github.com/openclaw/openclaw) (TypeScript) — Full agent framework with browser control, multi-agent orchestration
- [AgentZero](https://github.com/frdel/agent-zero) — Python framework with extensible tool system

**Hardware Resources:**
- [Sipeed LicheeRV-Nano](https://wiki.sipeed.com/hardware/en/lichee/RV_Nano/2_unbox.html) — $9.90 RISC-V board, primary PicoClaw target
- [Sipeed NanoKVM](https://news.ycombinator.com/item?id=41602937) — $30-50 RISC-V KVM-over-IP device
- [Raspberry Pi Zero W](https://www.raspberrypi.com/products/raspberry-pi-zero-w/) — $15 ARM board with WiFi

**Technical Deep Dives:**
- [Evolution of OpenClaw, PicoClaw & Nanobot Systems](https://sterlites.com/blog/picoclaw-paradigm-edge-intelligence) — Architectural philosophy and edge intelligence paradigm
- [PicoClaw: The $10 AI Agent That Changed My Edge Computing Game](https://medium.com/@ishank.iandroid/picoclaw-the-10-ai-agent-that-changed-my-edge-computing-game-5c2c0c6badfb) — First-person deployment experience
- [PicoClaw vs OpenClaw: A $10 Board Against a $600 Mac Mini](http://openclawpulse.com/picoclaw-vs-openclaw/) — Feature comparison

### Sources

#### Academic & Technical Documentation
- [GitHub - sipeed/picoclaw](https://github.com/sipeed/picoclaw) — Official repository, README, code structure
- [Evolution of OpenClaw, PicoClaw & Nanobot Systems | Sterlites](https://sterlites.com/blog/picoclaw-paradigm-edge-intelligence) — Architectural philosophy, edge intelligence paradigm, self-bootstrapping analysis
- [PicoClaw Documentation](https://picoclaw.ai/docs) — Official docs (configuration, tools, deployment)
- [Installation and Building | DeepWiki](https://deepwiki.com/sipeed/picoclaw/2.1-installation-and-building) — Build instructions, binary downloads
- [Docker Deployment | DeepWiki](https://deepwiki.com/erha2025/picoclaw/2.2-docker-deployment) — Container setup, compose profiles

#### Technical Articles
- [PicoClaw ultra-lightweight personal AI Assistant runs on just 10MB of RAM - CNX Software](https://www.cnx-software.com/2026/02/10/picoclaw-ultra-lightweight-personal-ai-assistant-run-on-just-10mb-of-ram/) — Hardware specs, deployment options, launch coverage
- [An OpenClaw Alternative Built to Run Within 10 MB of RAM | Circuit Digest](https://circuitdigest.com/news/an-openclaw-alternative-built-to-run-within-10-mb-of-ram) — Comparison with OpenClaw, memory reduction analysis
- [PicoClaw vs OpenClaw: A $10 Board Against a $600 Mac Mini](http://openclawpulse.com/picoclaw-vs-openclaw/) — Feature matrix, use case differentiation
- [Ditch the Mac Mini: PicoClaw and ZeroClaw Run OpenClaw on $10 Boards](https://www.hardware-corner.net/openclaw-whithout-mac-mini-202633412/) — Cost analysis, alternative frameworks
- [PicoClaw: The $10 AI Agent That Changed My Edge Computing Game | Medium](https://medium.com/@ishank.iandroid/picoclaw-the-10-ai-agent-that-changed-my-edge-computing-game-5c2c0c6badfb) — Self-bootstrapping details, deployment experience

#### Code & Implementations
- [picoclaw/README.md at main](https://github.com/sipeed/picoclaw/blob/main/README.md) — Quick start, features, architecture
- [GitHub - Sunwood-ai-labs/picoclaw-docker](https://github.com/Sunwood-ai-labs/picoclaw-docker) — Docker-specific fork
- [PicoClaw Releases](https://github.com/sipeed/picoclaw/releases) — Binary downloads, changelogs
- [picoclaw/skills](https://github.com/sipeed/picoclaw/tree/main/skills) — Reusable knowledge packages

#### Community
- [Show HN: PicoClaw 10MB OpenClaw alternative | Hacker News](https://news.ycombinator.com/item?id=47004845) — Launch discussion, comparison with OpenClaw
- [PicoClaw: Ultra-Efficient AI Assistant in Go | Hacker News](https://news.ycombinator.com/item?id=46976268) — Technical discussion
- [Sipeed on X/Twitter](https://x.com/SipeedIO/status/2021155649267122646) — 500 stars in 15 hours announcement
- [ZeroClaw 🦀 — Rust alternative discussion | Cloudron Forum](https://forum.cloudron.io/topic/15080/zeroclaw-rust-based-alternative-to-openclaw-picoclaw-nanobot-agentzero) — Comparison with Rust alternative
- [Nanobot: Ultra-Lightweight Alternative to OpenClaw | Hacker News](https://news.ycombinator.com/item?id=46897737) — Python predecessor discussion

### Follow-up Questions
1. **Local inference support**: Can PicoClaw integrate with Ollama or llama.cpp for fully offline operation without API keys?
2. **Memory system evolution**: Are there plans to add vector search/semantic memory similar to OpenClaw's SQLite-vec approach?
3. **Security audit timeline**: What's the roadmap to v1.0 and resolution of network security issues?
4. **Tool extensibility**: How does PicoClaw's plugin/tool system compare to OpenClaw's skill marketplace? Can existing OpenClaw skills be ported?
5. **Multi-agent orchestration**: Is there a path toward PicoClaw-based agent swarms or hierarchical coordination for edge deployments?

---

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
