# PicoClaw Source Code Analysis

**Repository:** https://github.com/sipeed/picoclaw
**Date:** 2026-02-16
**Focus:** Agent loop, memory system, skills, heartbeat, proactive behavior

## Executive Summary

PicoClaw is an ultra-lightweight AI assistant written in Go, inspired by Nanobot, refactored from the ground up. Targets <10MB RAM on $10 hardware (RISC-V, ARM, x86). Custom ReAct loop (not SDK-based), file-based memory, markdown skills with lazy loading, and a heartbeat system for proactive behavior.

**Key characteristics:**
- **Custom ReAct loop**: Hand-rolled in `pkg/agent/loop.go`, max 10 iterations
- **ToolResult duality**: Separate `ForLLM` and `ForUser` payloads per tool call
- **File-based memory**: MEMORY.md (long-term) + daily notes (YYYYMM/YYYYMMDD.md)
- **Lazy skill loading**: XML summary in system prompt, `read_file` for full content
- **Heartbeat service**: HEARTBEAT.md-driven proactive checks (30min default)
- **Message bus architecture**: Decoupled channels from agent via pub/sub
- **Emergency context compression**: Drop oldest 50% on context limit errors
- **Subagent system**: Fire-and-forget async + synchronous execution

---

## 1. Main Agent Loop (ReAct Implementation)

### AgentLoop Struct
**File**: `pkg/agent/loop.go`

Core fields:
```go
type AgentLoop struct {
    provider      Provider        // LLM provider interface
    tools         *ToolRegistry   // Registered tools
    sessions      *SessionManager // Conversation history
    memory        *MemoryStore    // MEMORY.md + daily notes
    skillsLoader  *SkillsLoader   // Lazy-loaded skills
    bus           *MessageBus     // Inbound/outbound routing
    contextWindow int             // Max tokens (model-dependent)
    maxIterations int             // Default: 10
    summarizing   sync.Map        // Prevent concurrent summarization
}
```

### Message Processing Flow

```
bus.ConsumeInbound() → processMessage()
  ↓
1. Parse channel + chatID from message
2. updateToolContexts(channel, chatID)
3. Build messages: system prompt + session history + user message
4. runAgentLoop() [core ReAct loop]
5. Save response to session
6. maybeSummarize() [if >20 msgs or >75% context]
7. bus.PublishOutbound() response
```

### Core ReAct Loop
**File**: `pkg/agent/loop.go`, `runLLMIteration()`

```go
func (al *AgentLoop) runAgentLoop(ctx, opts) (string, error) {
    messages := al.contextBuilder.BuildMessages(history, systemPrompt, userMessage)

    for iteration := 0; iteration < al.maxIterations; iteration++ {
        response, err := al.provider.Chat(ctx, messages, tools)

        if err != nil && isContextError(err) {
            // Emergency compression: drop oldest 50%
            al.forceCompression(sessionKey)
            messages = al.contextBuilder.BuildMessages(newHistory, ...)
            continue  // Retry with compressed context
        }

        if len(response.ToolCalls) == 0 {
            return response.Content, nil  // Done - text response
        }

        // Execute each tool call sequentially
        for _, toolCall := range response.ToolCalls {
            result := al.tools.Execute(ctx, toolCall.Name, toolCall.Args)

            // ToolResult duality: send ForUser immediately, feed ForLLM to model
            if !result.Silent && result.ForUser != "" {
                al.bus.PublishOutbound(result.ForUser)
            }

            messages = append(messages, Message{
                Role: "tool", Content: result.ForLLM,
            })
        }
    }
}
```

**Key design decisions:**
- Max 10 iterations (not 20 like Nanobot)
- Sequential tool execution (no parallel)
- Emergency compression retry on context overflow
- No reflection prompt between tool rounds (unlike Nanobot)

---

## 2. Memory System

### MemoryStore
**File**: `pkg/agent/memory.go`

Two-layer file-based memory:

| Layer | Location | Purpose |
|-------|----------|---------|
| Long-term | `workspace/memory/MEMORY.md` | Active facts, always in context |
| Daily notes | `workspace/memory/YYYYMM/YYYYMMDD.md` | Daily append-only journal |

### Memory Loading into Context
**File**: `pkg/agent/context.go`

```go
// Load long-term memory
memoryContent := memory.ReadLongTerm()  // MEMORY.md

// Load last 3 daily notes
dailyNotes := memory.GetRecentDailyNotes(3)

// Inject into system prompt
parts = append(parts, fmt.Sprintf("## Long-term Memory\n%s", memoryContent))
parts = append(parts, fmt.Sprintf("## Recent Daily Notes\n%s", dailyNotes))
```

**No consolidation process** — unlike Nanobot's LLM-based consolidation. Memory updates are done explicitly by the LLM via `write_file` tool on MEMORY.md or `append_file` on daily notes.

**Trade-off**: Simpler but memory can grow stale. No automatic summarization.

---

## 3. Skills System

### Skills Loader
**File**: `pkg/skills/loader.go`

#### Search Order (lines 182-208)
1. **Workspace**: `workspace/skills/{name}/SKILL.md`
2. **Global**: `~/.picoclaw/skills/{name}/SKILL.md`
3. **Builtin**: `{binary_dir}/skills/{name}/SKILL.md`

#### Skill Metadata
Supports YAML frontmatter:
```markdown
---
name: github
description: GitHub integration for issues and PRs
---

# GitHub Skill
Use this skill to...
```

#### Integration with System Prompt
**File**: `pkg/agent/context.go` (lines 121-129)

```go
skillsSummary := cb.skillsLoader.BuildSkillsSummary()
if skillsSummary != "" {
    parts = append(parts, fmt.Sprintf(`# Skills

The following skills extend your capabilities. To use a skill, read its SKILL.md file using the read_file tool.

%s`, skillsSummary))
}
```

**Design**: Skills shown as XML summary in system prompt. Agent must explicitly `read_file` for full content. Prevents context pollution.

---

## 4. Heartbeat / Proactive Behavior

### Heartbeat Service
**File**: `pkg/heartbeat/service.go`

#### Architecture (lines 34-44)
```go
type HeartbeatService struct {
    workspace string
    bus       *bus.MessageBus
    state     *state.Manager
    handler   HeartbeatHandler
    interval  time.Duration  // Default: 30min, min: 5min
    enabled   bool
    stopChan  chan struct{}
}
```

#### Execution Flow (lines 125-216)

1. **Ticker fires** (runLoop, line 126)
2. **Read HEARTBEAT.md** (buildPrompt, lines 219-248)
3. **Build prompt** with current time + file content
4. **Get last channel** from state manager
5. **Call handler** (agent processes without session history)
6. **Handle result**:
   - If "HEARTBEAT_OK" → Silent (no notification)
   - If Async → Subagent started
   - If ForUser → Send to last active channel

#### HEARTBEAT.md Template
```markdown
# Heartbeat Check List

## Instructions
- Execute ALL tasks listed below
- For complex tasks, use spawn tool (async)
- After spawning, CONTINUE to remaining tasks
- Only respond HEARTBEAT_OK when all done

---

Add your heartbeat tasks below:
```

#### Integration with Main Loop
**File**: `cmd/picoclaw/main.go` (lines 567-589)

```go
heartbeatService.SetHandler(func(prompt, channel, chatID string) *ToolResult {
    response, err := agentLoop.ProcessHeartbeat(ctx, prompt, channel, chatID)
    if err != nil {
        return tools.ErrorResult(...)
    }
    if response == "HEARTBEAT_OK" {
        return tools.SilentResult("Heartbeat OK")
    }
    return tools.SilentResult(response)
})
```

**ProcessHeartbeat** runs `runAgentLoop` with `NoHistory: true` — stateless, no context accumulation.

---

## 5. Subagent System

### Spawn Tool
**File**: `pkg/tools/spawn.go`

```go
type SpawnTool struct {
    manager       *SubagentManager
    originChannel string
    originChatID  string
    callback      AsyncCallback
}
```

#### Execution Flow
```go
func (t *SpawnTool) Execute(ctx, args) *ToolResult {
    task := args["task"].(string)
    label := args["label"].(string)
    result, err := t.manager.Spawn(ctx, task, label, t.originChannel, t.originChatID, t.callback)
    return AsyncResult(result)  // Returns immediately
}
```

#### Subagent Characteristics

1. **Same tools as main agent** EXCEPT spawn/subagent (prevents recursion)
2. **No session history** — stateless execution
3. **Can use message tool** — send updates directly to user
4. **Results via bus** — system messages forwarded by main agent
5. **Fire-and-forget** — no coordination with main agent

---

## 6. Context Window Management

### Token Estimation
**File**: `pkg/agent/loop.go` (lines 973-980)

```go
func (al *AgentLoop) estimateTokens(messages []Message) int {
    totalChars := 0
    for _, m := range messages {
        totalChars += utf8.RuneCountInString(m.Content)
    }
    return totalChars * 2 / 5  // 2.5 chars per token heuristic
}
```

### Auto-Summarization Trigger
```go
tokenEstimate := al.estimateTokens(newHistory)
threshold := al.contextWindow * 75 / 100

if len(newHistory) > 20 || tokenEstimate > threshold {
    go al.summarizeSession(sessionKey)
}
```

### Summarization Process
1. Keep last 4 messages for continuity
2. Skip oversized messages (>50% context window)
3. If >10 messages, split into 2 parts and summarize separately
4. Merge summaries with LLM call
5. Store summary in session, truncate history to last 4

### Emergency Compression
Triggered on LLM context error (lines 462-583):

```go
for retry := 0; retry <= maxRetries; retry++ {
    response, err := al.provider.Chat(ctx, messages, ...)
    if err == nil { break }

    if isContextError && retry < maxRetries {
        al.forceCompression(sessionKey)
        messages = al.contextBuilder.BuildMessages(newHistory, ...)
        continue
    }
    break
}
```

**forceCompression**: Drop oldest 50% of conversation, inject system note about compression.

---

## 7. ToolResult Duality Pattern

**File**: `pkg/tools/result.go`

```go
type ToolResult struct {
    ForLLM  string  // Fed back to model as tool result
    ForUser string  // Sent immediately to user channel
    Silent  bool    // Suppress user notification
    IsError bool    // Error indicator
    Async   bool    // Tool started background work
}
```

**File**: `pkg/agent/loop.go` (lines 668-679)

```go
// Send ForUser immediately to channel
if !toolResult.Silent && toolResult.ForUser != "" {
    al.bus.PublishOutbound(...)
}

// Feed ForLLM to model for next iteration
toolResultMsg := Message{
    Role:    "tool",
    Content: toolResult.ForLLM,
}
```

**Why this matters for Onyx**: Clean separation of what the LLM sees vs what the user sees. Enables:
- Silent file operations (user doesn't need to see every read_file)
- Async tool feedback (spawn returns immediately, notifies later)
- Custom user formatting (tool can format differently for user vs LLM)

---

## 8. System Prompt Structure

**File**: `pkg/agent/context.go`, `BuildSystemPrompt()`

```markdown
# picoclaw

You are picoclaw, a helpful AI assistant.

## Current Time
2026-02-16 17:35 (Sunday)

## Workspace
Your workspace is at: /home/user/.picoclaw/workspace
- Memory: .../memory/MEMORY.md
- Daily Notes: .../memory/YYYYMM/YYYYMMDD.md
- Skills: .../skills/{skill-name}/SKILL.md

## Available Tools
[tool list]

---
[Bootstrap files: AGENTS.md, SOUL.md, USER.md, IDENTITY.md]
---

# Skills
<skills>
  <skill>
    <name>github</name>
    <description>GitHub integration</description>
  </skill>
</skills>

---

# Memory
## Long-term Memory
[MEMORY.md content]

## Recent Daily Notes
[Last 3 days]
```

### Bootstrap Files
```go
bootstrapFiles := []string{
    "AGENTS.md",    // Agent personality
    "SOUL.md",      // Core values
    "USER.md",      // User preferences
    "IDENTITY.md",  // Agent identity
}
```

Auto-loaded into system prompt if present in workspace.

---

## 9. Key Design Patterns

### Pattern 1: Message Bus Decoupling
```
Channel (Telegram/Discord/CLI) → publishes → InboundMessage → MessageBus
                                                                    ↓
                                                              AgentLoop.Run()
                                                                    ↓
                                                              OutboundMessage → MessageBus → Channel
```
Decouples agent logic from channel implementations.

### Pattern 2: Session Keys
Format: `{channel}:{chatID}`
- `telegram:123456` — User conversation
- `cli:default` — CLI interactive mode
- `heartbeat` — Proactive checks (no history)
- `system` — Internal messages from subagents

### Pattern 3: ContextualTool Interface
```go
type ContextualTool interface {
    Tool
    SetContext(channel, chatID string)
}
```
Tools that need to know the current channel/chat (e.g., message tool).

### Pattern 4: Internal Channel Filtering
Internal channels (cli, system, subagent) skip: last channel recording, user notifications, proactive messages.

### Pattern 5: Shared Tool Loop (DRY)
```go
func RunToolLoop(ctx, config, messages, channel, chatID) (*ToolLoopResult, error)
```
Used by both main agent and subagents. Consistent behavior, easy to test.

---

## 10. Cron/Scheduling System

**File**: `pkg/cron/cron.go`

Full cron service with JSON file persistence:

```go
type CronService struct {
    storePath string
    store     *CronStore
    onJob     JobHandler
    gronx     *gronx.Gronx  // Cron expression parser
}
```

**Schedule types**: `at` (one-time), `every` (interval), `cron` (cron expression)

- 1-second tick loop checking for due jobs
- Atomic file persistence (JSON)
- Job execution outside lock (prevents blocking)
- One-time tasks auto-delete after run

---

## 11. Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│ EXTERNAL WORLD (Telegram, Discord, CLI, Heartbeat)  │
└──────────────────────┬──────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ MESSAGE BUS (InboundQueue / OutboundQueue)           │
└──────────────────────┬──────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ AGENT LOOP (pkg/agent/loop.go)                       │
│  1. ConsumeInbound → processMessage                  │
│  2. Build context (system + history + memory)        │
│  3. runLLMIteration [MAX 10 iterations]              │
│     ├─ LLM Chat() with tools                        │
│     ├─ Execute tool calls (ForUser → bus, ForLLM →  │
│     │  messages)                                     │
│     └─ Break if no tool calls                        │
│  4. Save to session                                  │
│  5. maybeSummarize (>20 msgs or >75% context)       │
│  6. PublishOutbound response                         │
├─────────────┬──────────────┬────────────────────────┤
│ TOOL        │ CONTEXT      │ SESSION MANAGER         │
│ REGISTRY    │ BUILDER      │ (JSON atomic writes)    │
│             │ (bootstrap,  │                         │
│             │  memory,     │                         │
│             │  skills)     │                         │
├─────────────┴──────────────┴────────────────────────┤
│ HEARTBEAT SERVICE                                    │
│  Timer → Read HEARTBEAT.md → ProcessHeartbeat       │
│  (NoHistory: true, stateless)                       │
├──────────────────────────────────────────────────────┤
│ SUBAGENT SYSTEM (Fire-and-Forget)                    │
│  SpawnTool → SubagentManager.Spawn()                │
│  → go runTask() → RunToolLoop() → PublishInbound()  │
└──────────────────────────────────────────────────────┘
```

---

## 12. Comparison to NanoClaw/Nanobot

| Feature | PicoClaw | NanoClaw | Nanobot |
|---------|----------|----------|---------|
| **Loop** | Custom ReAct (Go) | SDK `query()` | Custom ReAct (Python) |
| **Memory** | MEMORY.md + daily notes | CLAUDE.md + SDK sessions | MEMORY.md + HISTORY.md |
| **Skills** | XML summary + lazy load | SDK `.claude/skills/` | XML summary + lazy load |
| **Proactive** | Heartbeat + cron | Scheduled tasks only | Heartbeat + cron |
| **Container** | N/A (single binary) | Apple Container/Docker | N/A (Python process) |
| **Session** | JSON atomic writes | SDK (JSONL) | JSONL files |
| **ToolResult** | ForLLM/ForUser/Silent/Async | SDK-managed | Simple string |
| **Context mgmt** | Auto-summarize + emergency compression | SDK PreCompact | Append-only + consolidation |

---

## 13. Recommendations for Onyx

### ADOPT
1. **ToolResult duality** (ForLLM + ForUser + Silent + Async) — clean streaming feedback
2. **Heartbeat service** — proactive routines via HEARTBEAT.md, stateless execution
3. **Lazy skill loading** — XML summary prevents context pollution
4. **Bootstrap files** (AGENTS.md, SOUL.md, USER.md) — per-workspace personality
5. **Emergency compression** — robust context recovery with auto-retry
6. **Message bus decoupling** — clean channel abstraction
7. **Internal channel filtering** — prevent debug spam

### IMPROVE
1. **Memory retrieval** — PicoClaw injects all memory; add vector search for Onyx
2. **Subagent coordination** — fire-and-forget → add team protocols
3. **Planning phase** — pure ReAct → add reflection between tool rounds
4. **Tool parallelization** — sequential → parallel execution where possible
5. **Token estimation** — 2.5 chars/token heuristic → proper tokenizer

### AVOID
1. **No tool validation** — security risk for production
2. **Crude token estimation** — use proper tokenizer
3. **Flat sessions** — need conversation threading
4. **File-based only memory** — consider DB for production scale

---

## 14. Critical Files for Onyx

### Must Read
1. `pkg/agent/loop.go` — Core ReAct loop, context retry, summarization
2. `pkg/agent/context.go` — System prompt assembly, bootstrap files, skills integration
3. `pkg/agent/memory.go` — Two-layer memory system
4. `pkg/heartbeat/service.go` — Heartbeat architecture and execution
5. `pkg/tools/base.go` — Tool/ContextualTool/AsyncTool interfaces
6. `pkg/tools/spawn.go` — Subagent system
7. `pkg/cron/cron.go` — Scheduling service
8. `cmd/picoclaw/main.go` — Wiring it all together

### Can Skip
- Channel implementations (Telegram, Discord — platform-specific)
- Hardware tools (I2C, SPI — PicoClaw-specific for IoT boards)
- README translations

---

**End of Analysis**

Generated: 2026-02-16
Analyzed: PicoClaw (github.com/sipeed/picoclaw)
Target: Onyx D11/D12 agent architecture
