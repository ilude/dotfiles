# Nanobot Source Code Analysis

**Repository:** https://github.com/HKUDS/nanobot
**Version analyzed:** Latest as of 2026-02-16
**Total codebase size:** ~3,668 lines (core agent logic)
**Agent module size:** 2,294 lines total

## Executive Summary

Nanobot is an **ultra-lightweight personal AI assistant** inspired by OpenClaw that delivers complete agent functionality in ~4,000 lines of code — **99% smaller than Clawdbot**. It demonstrates that a production-ready agent with memory, skills, channels, and tool execution can be built with remarkable simplicity and clarity.

**Key characteristics:**
- **True ReAct loop**: Standard tool-calling with explicit iteration control (max 20)
- **Two-layer memory**: Long-term facts (MEMORY.md) + grep-searchable history (HISTORY.md)
- **Progressive skills loading**: Summary in system prompt, full content loaded on-demand via read_file
- **Provider registry pattern**: Clean abstraction for 15+ LLM providers via LiteLLM
- **MCP integration**: Stdio and HTTP transports for external tool servers
- **Multi-channel support**: Telegram, Discord, WhatsApp, Feishu, Email, Slack, QQ, DingTalk, Mochat
- **Heartbeat/proactive behavior**: Periodic HEARTBEAT.md check for scheduled tasks
- **Subagent system**: Background task execution with result announcement

---

## CRITICAL DISCOVERY

**Nanobot does NOT use Claude's interleaved chain-of-thought format.**

It uses standard OpenAI message format with a simple reflection prompt ("Reflect on the results and decide next steps") after each tool execution round. This means OpenClaw's "interleaved chain-of-thought" mentioned in the Onyx PRD is a unique architectural feature NOT present in Nanobot.

---

## 1. Main Agent Loop (ReAct Implementation)

**File:** `nanobot/agent/loop.py` (476 lines)

### Key Code Flow

```python
class AgentLoop:
    async def _run_agent_loop(self, initial_messages):
        messages = initial_messages
        iteration = 0
        final_content = None
        tools_used = []

        while iteration < self.max_iterations:  # Default: 20
            iteration += 1

            response = await self.provider.chat(
                messages=messages,
                tools=self.tools.get_definitions(),
                model=self.model,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
            )

            if response.has_tool_calls:
                # Add assistant message with tool calls
                tool_call_dicts = [
                    {"id": tc.id, "type": "function",
                     "function": {"name": tc.name, "arguments": json.dumps(tc.arguments)}}
                    for tc in response.tool_calls
                ]
                messages = self.context.add_assistant_message(
                    messages, response.content, tool_call_dicts,
                    reasoning_content=response.reasoning_content,
                )

                # Execute all tool calls sequentially
                for tool_call in response.tool_calls:
                    tools_used.append(tool_call.name)
                    result = await self.tools.execute(tool_call.name, tool_call.arguments)
                    messages = self.context.add_tool_result(
                        messages, tool_call.id, tool_call.name, result
                    )

                # Inject reflection prompt
                messages.append({"role": "user", "content": "Reflect on the results and decide next steps."})
            else:
                final_content = response.content
                break

        return final_content, tools_used
```

### Message Processing Flow

```
InboundMessage (from message bus)
    ↓
_process_message()
    ↓
1. Handle slash commands (/new, /help)
2. Check session length → trigger memory consolidation if > memory_window (50)
3. Set tool context (channel, chat_id for routing)
4. Build initial messages (system prompt + history + current message)
5. Run agent loop (tool calls + reflection)
6. Save to session (JSONL)
7. Return OutboundMessage
```

### Key Observations

- **No interleaved thinking**: Standard OpenAI message format
- **Reflection prompt**: Hardcoded "Reflect on the results and decide next steps." after each tool round
- **Iteration limit**: Hard cap at 20 (configurable via `max_iterations`)
- **Reasoning content support**: Preserves `reasoning_content` field for models like DeepSeek-R1, Kimi
- **Sequential tool execution**: Tools execute one at a time, not in parallel

---

## 2. Memory System

**File:** `nanobot/agent/memory.py` (31 lines!)

### Two-Layer Architecture

```python
class MemoryStore:
    def __init__(self, workspace):
        self.memory_dir = ensure_dir(workspace / "memory")
        self.memory_file = self.memory_dir / "MEMORY.md"    # Long-term facts
        self.history_file = self.memory_dir / "HISTORY.md"   # Append-only log

    def read_long_term(self):
        if self.memory_file.exists():
            return self.memory_file.read_text(encoding="utf-8")
        return ""

    def write_long_term(self, content):
        self.memory_file.write_text(content, encoding="utf-8")

    def append_history(self, entry):
        with open(self.history_file, "a", encoding="utf-8") as f:
            f.write(entry.rstrip() + "\n\n")

    def get_memory_context(self):
        long_term = self.read_long_term()
        return f"## Long-term Memory\n{long_term}" if long_term else ""
```

### Memory Philosophy

1. **MEMORY.md** — Active facts always in context. User preferences, project context, relationships. Updated by LLM during consolidation or explicitly via edit_file tool.
2. **HISTORY.md** — Passive grep-searchable archive. Append-only conversation summaries. NOT loaded into context automatically. Agent uses `exec` tool + grep to search.

### Consolidation Process

**File:** `nanobot/agent/loop.py` lines 363-446

**Trigger:** Session length exceeds `memory_window // 2` (default 25 messages)

```python
async def _consolidate_memory(self, session, archive_all=False):
    memory = MemoryStore(self.workspace)

    # Calculate what to consolidate
    keep_count = self.memory_window // 2
    old_messages = session.messages[session.last_consolidated:-keep_count]

    # Format conversation for LLM
    lines = []
    for m in old_messages:
        tools = f" [tools: {', '.join(m['tools_used'])}]" if m.get("tools_used") else ""
        lines.append(f"[{m.get('timestamp', '?')[:16]}] {m['role'].upper()}{tools}: {m['content']}")
    conversation = "\n".join(lines)
    current_memory = memory.read_long_term()

    # LLM-based consolidation
    prompt = f"""You are a memory consolidation agent. Process this conversation and return JSON:

1. "history_entry": 2-5 sentence summary with timestamp. Include detail for grep searchability.
2. "memory_update": Updated long-term memory. Add new facts. If nothing new, return existing unchanged.

## Current Long-term Memory
{current_memory or "(empty)"}

## Conversation to Process
{conversation}

Respond with ONLY valid JSON."""

    response = await self.provider.chat(
        messages=[
            {"role": "system", "content": "You are a memory consolidation agent. Respond only with valid JSON."},
            {"role": "user", "content": prompt},
        ],
        model=self.model,
    )

    # Parse with json_repair for leniency
    result = json_repair.loads(response.content)

    # Update files
    if entry := result.get("history_entry"):
        memory.append_history(entry)
    if update := result.get("memory_update"):
        if update != current_memory:
            memory.write_long_term(update)

    session.last_consolidated = len(session.messages) - keep_count
```

**Key Features:**
- Background execution via `asyncio.create_task()` — doesn't block response
- Incremental tracking via `session.last_consolidated`
- JSON repair library for lenient LLM output parsing
- Markdown fence stripping for LLM tendency to wrap JSON

---

## 3. Skills System (Progressive Loading)

**File:** `nanobot/agent/skills.py` (229 lines)

### Progressive Loading Strategy

1. **Always-loaded skills**: Full content in system prompt (skills with `always: true` in frontmatter)
2. **Available skills**: Only XML summary in system prompt. Agent uses `read_file` to load full content when needed.

### Skills Summary Generation

```python
def build_skills_summary(self):
    all_skills = self.list_skills(filter_unavailable=False)
    lines = ["<skills>"]
    for s in all_skills:
        name = escape_xml(s["name"])
        desc = escape_xml(self._get_skill_description(s["name"]))
        available = self._check_requirements(skill_meta)

        lines.append(f'  <skill available="{str(available).lower()}">')
        lines.append(f"    <name>{name}</name>")
        lines.append(f"    <description>{desc}</description>")
        lines.append(f"    <location>{path}</location>")
        if not available:
            missing = self._get_missing_requirements(skill_meta)
            lines.append(f"    <requires>{escape_xml(missing)}</requires>")
        lines.append(f"  </skill>")
    lines.append("</skills>")
    return "\n".join(lines)
```

### Skill Metadata Format

YAML frontmatter with JSON metadata:
```yaml
---
name: memory
description: Two-layer memory system with grep-based recall.
always: true
metadata: |
  {"nanobot": {"always": true, "requires": {"bins": [], "env": []}}}
---
# Memory
[Skill content...]
```

### Requirements Checking

```python
def _check_requirements(self, skill_meta):
    requires = skill_meta.get("requires", {})
    for b in requires.get("bins", []):
        if not shutil.which(b):
            return False
    for env in requires.get("env", []):
        if not os.environ.get(env):
            return False
    return True
```

### Built-in Skills

- `memory` — Two-layer memory system (always loaded)
- `github` — GitHub API integration
- `weather` — Weather API integration
- `tmux` — Terminal multiplexer control
- `cron` — Task scheduling
- `summarize` — Summarization patterns
- `skill-creator` — Meta-skill for creating new skills

---

## 4. Provider System (LLM Abstraction)

**File:** `nanobot/providers/registry.py` (396 lines)

### Provider Registry Pattern

Single source of truth for all LLM provider metadata:

```python
@dataclass(frozen=True)
class ProviderSpec:
    name: str                        # config field name, e.g. "dashscope"
    keywords: tuple[str, ...]        # model-name keywords for matching
    env_key: str                     # LiteLLM env var
    display_name: str = ""
    litellm_prefix: str = ""         # "dashscope" → model becomes "dashscope/{model}"
    skip_prefixes: tuple[str, ...] = ()
    env_extras: tuple[tuple[str, str], ...] = ()
    is_gateway: bool = False         # routes any model (OpenRouter, AiHubMix)
    is_local: bool = False           # local deployment (vLLM, Ollama)
    detect_by_key_prefix: str = ""   # match api_key prefix
    detect_by_base_keyword: str = "" # match substring in api_base URL
    default_api_base: str = ""
    strip_model_prefix: bool = False
    model_overrides: tuple[tuple[str, dict], ...] = ()
    is_oauth: bool = False
```

### Adding a New Provider (2 steps only)

1. Add a `ProviderSpec` to `PROVIDERS` tuple in `registry.py`
2. Add a field to `ProvidersConfig` in `config/schema.py`

No if-elif chains, no scattered config logic. Everything derives from the registry.

### Supported Providers (15+)

- **Gateways**: OpenRouter, AiHubMix, Custom (any OpenAI-compatible)
- **Direct**: Anthropic, OpenAI, DeepSeek, Gemini, Zhipu, DashScope, Moonshot, MiniMax, Groq
- **Local**: vLLM, Ollama
- **OAuth**: OpenAI Codex (ChatGPT Plus/Pro)

---

## 5. Heartbeat System (Proactive Behavior)

**File:** `nanobot/heartbeat/service.py` (131 lines)

### Architecture

```python
class HeartbeatService:
    def __init__(self, workspace, on_heartbeat=None, interval_s=1800, enabled=True):
        self.workspace = workspace
        self.on_heartbeat = on_heartbeat  # Callback to agent loop
        self.interval_s = interval_s       # Default: 30 minutes
        self.enabled = enabled
```

### Heartbeat Loop

```python
async def _run_loop(self):
    while self._running:
        await asyncio.sleep(self.interval_s)
        if self._running:
            await self._tick()

async def _tick(self):
    content = self._read_heartbeat_file()
    if _is_heartbeat_empty(content):
        return  # Skip if no tasks

    if self.on_heartbeat:
        response = await self.on_heartbeat(HEARTBEAT_PROMPT)
        if HEARTBEAT_OK_TOKEN in response.upper():
            logger.info("Heartbeat: OK (no action needed)")
```

### Heartbeat Prompt

```python
HEARTBEAT_PROMPT = """Read HEARTBEAT.md in your workspace (if it exists).
Follow any instructions or tasks listed there.
If nothing needs attention, reply with just: HEARTBEAT_OK"""
```

### Empty Detection

Skips: empty lines, headers, HTML comments, empty checkboxes. Only triggers when actionable content exists.

---

## 6. Subagent System (Background Execution)

**File:** `nanobot/agent/subagent.py` (258 lines)

### Key Differences from Main Agent

1. **No message tool**: Cannot send direct messages to users
2. **No spawn tool**: Cannot create nested subagents
3. **No conversation history**: Fresh context for each task
4. **Limited iterations**: 15 instead of 20
5. **Result announcement**: Broadcasts completion via message bus

### Spawn Flow

```python
async def spawn(self, task, label=None, origin_channel="cli", origin_chat_id="direct"):
    task_id = str(uuid.uuid4())[:8]
    bg_task = asyncio.create_task(self._run_subagent(task_id, task, label, origin))
    self._running_tasks[task_id] = bg_task
    return f"Subagent [{label}] started (id: {task_id}). I'll notify you when it completes."
```

### Result Announcement

```python
async def _announce_result(self, task_id, label, task, result, origin, status):
    announce_content = f"""[Subagent '{label}' {status_text}]
Task: {task}
Result: {result}
Summarize this naturally for the user."""

    msg = InboundMessage(
        channel="system", sender_id="subagent",
        chat_id=f"{origin['channel']}:{origin['chat_id']}",
        content=announce_content,
    )
    await self.bus.publish_inbound(msg)
```

---

## 7. Session System (Conversation Persistence)

**File:** `nanobot/session/manager.py` (180 lines)

### Session Dataclass

```python
@dataclass
class Session:
    key: str                    # channel:chat_id
    messages: list[dict] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    metadata: dict = field(default_factory=dict)
    last_consolidated: int = 0  # Consolidation progress pointer
```

### Key Design Choice: Append-Only

Messages are **never removed** from the session, only consolidated into MEMORY.md/HISTORY.md.

**Benefits:**
- **Prompt caching**: LLM providers cache prefixes, keeping history improves cache hit rate
- **Audit trail**: Full conversation always available in session file
- **Incremental consolidation**: `last_consolidated` pointer tracks progress

### JSONL Storage

Location: `~/.nanobot/sessions/{channel}_{chat_id}.jsonl`

```jsonl
{"_type": "metadata", "created_at": "...", "last_consolidated": 15}
{"role": "user", "content": "Hello!", "timestamp": "..."}
{"role": "assistant", "content": "Hi!", "tools_used": []}
```

---

## 8. Context Builder (System Prompt Assembly)

**File:** `nanobot/agent/context.py` (239 lines)

### Section Order

1. **Core identity** — Runtime info (time, platform, workspace path)
2. **Bootstrap files** — AGENTS.md, SOUL.md, USER.md, TOOLS.md, IDENTITY.md
3. **Memory** — MEMORY.md content (long-term facts)
4. **Active skills** — Full content of always-loaded skills
5. **Skills summary** — XML list of available skills

### Bootstrap Files

```python
BOOTSTRAP_FILES = ["AGENTS.md", "SOUL.md", "USER.md", "TOOLS.md", "IDENTITY.md"]
```

Auto-loaded from workspace if present. User-defined personality, rules, and context.

---

## 9. Channel System (Multi-Platform Support)

**Files:** `nanobot/channels/` (10+ implementations)

### Supported Channels

- **Telegram**, **Discord**, **WhatsApp**, **Feishu**, **DingTalk**, **Slack**, **Email**, **QQ**, **Mochat**

### Message Bus Pattern

```python
class MessageBus:
    def __init__(self):
        self._inbound = asyncio.Queue()
        self._outbound = asyncio.Queue()

    async def publish_inbound(self, msg): await self._inbound.put(msg)
    async def consume_inbound(self): return await self._inbound.get()
    async def publish_outbound(self, msg): await self._outbound.put(msg)
    async def consume_outbound(self): return await self._outbound.get()
```

Flow: `Channel → InboundMessage → Queue → AgentLoop → OutboundMessage → Queue → Channel`

---

## 10. Tool System

**File:** `nanobot/agent/tools/registry.py` (74 lines)

### Tool Registry

```python
class ToolRegistry:
    def __init__(self):
        self._tools = {}

    def register(self, tool): self._tools[tool.name] = tool
    def get_definitions(self): return [tool.to_schema() for tool in self._tools.values()]

    async def execute(self, name, params):
        tool = self._tools.get(name)
        if not tool: return f"Error: Tool '{name}' not found"
        errors = tool.validate_params(params)
        if errors: return f"Error: Invalid parameters: {'; '.join(errors)}"
        return await tool.execute(**params)
```

### Built-in Tools

- **File ops**: ReadFileTool, WriteFileTool, EditFileTool, ListDirTool
- **Shell**: ExecTool (with timeout, workspace restriction)
- **Web**: WebSearchTool (Brave), WebFetchTool (HTML→markdown)
- **Communication**: MessageTool (context-aware routing)
- **Tasks**: SpawnTool (background), CronTool (scheduling)

### Workspace Restriction Pattern

```python
allowed_dir = self.workspace if self.restrict_to_workspace else None
self.tools.register(ReadFileTool(allowed_dir=allowed_dir))
```

Single config flag restricts all file/shell operations. Production-ready sandboxing.

### MCP Integration

Supports stdio and HTTP transports for external tool servers. Auto-discovery and registration on startup.

---

## 11. Comparison to PicoClaw/NanoClaw

| Feature | Nanobot | PicoClaw | NanoClaw |
|---------|---------|----------|----------|
| **Loop** | Custom ReAct (Python) | Custom ReAct (Go) | SDK `query()` |
| **Memory** | MEMORY.md + HISTORY.md + consolidation | MEMORY.md + daily notes | CLAUDE.md + SDK sessions |
| **Skills** | XML summary + lazy load + requirements | XML summary + lazy load | SDK `.claude/skills/` |
| **Proactive** | Heartbeat + cron | Heartbeat + cron | Scheduled tasks only |
| **Providers** | 15+ via registry pattern | Single provider | Anthropic only (SDK) |
| **Channels** | 10+ (Telegram, Discord, etc.) | Multiple | WhatsApp only |
| **Subagents** | Background with announcement | Fire-and-forget | SDK agent teams |
| **Context** | Append-only + consolidation | Auto-summarize + compression | SDK PreCompact |

---

## 12. Recommendations for Onyx

### ADOPT (Direct Implementation)

1. **Provider registry pattern** — Single source of truth, zero if-elif chains. Adaptable to TypeScript.
2. **Progressive skills loading** — Context efficiency via XML summary. Requirements checking prevents confusing errors.
3. **JSONL session storage** — Human-readable, debuggable, streamable, recoverable.
4. **MCP integration** — Extensibility via external tool servers (stdio + HTTP).
5. **Workspace restriction** — Single config flag restricts all file/shell operations.
6. **Memory consolidation** — LLM-based summarization every ~25 messages. Only 31 lines of core code.

### ADAPT (Modify for Onyx Needs)

1. **Memory system** — Keep two-layer structure but add vector embeddings for semantic search on HISTORY.md.
2. **Tool execution** — Add parallel execution where dependencies allow.
3. **Subagents** — Keep background model but allow memory/skills sharing with parent.
4. **Session management** — Keep JSONL format, add cross-session reasoning layer.

### AVOID

1. **LiteLLM dependency** — Onyx uses Vercel AI SDK + direct subscription SDKs instead.
2. **Simple consolidation alone** — Need vector embeddings and hybrid search for production memory.
3. **Isolated subagent contexts** — Subagents should inherit workspace context.

---

## Conclusion

Nanobot demonstrates that a **complete, production-ready AI assistant** can be built in under 4,000 lines without sacrificing multi-platform support (10+ channels), persistent memory (two-layer with consolidation), extensibility (skills, MCP, provider registry), or proactive behavior (heartbeat).

**Primary innovation:** Ruthless simplicity. Every design choice prioritizes clarity and debuggability over abstraction.

**Most important finding for Onyx:** Nanobot does NOT use Claude's extended thinking format. It uses standard OpenAI message format with reflection prompts. OpenClaw's "interleaved chain-of-thought" is a unique feature we'd need to study from OpenClaw's actual source, not Nanobot.

---

**End of Analysis**

Generated: 2026-02-16
Analyzed: Nanobot (github.com/HKUDS/nanobot)
Target: Onyx D11/D12 agent architecture
