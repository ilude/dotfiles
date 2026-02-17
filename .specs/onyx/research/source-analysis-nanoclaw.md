# NanoClaw Source Code Analysis

**Repository:** https://github.com/gavrielc/nanoclaw  
**Date:** 2026-02-16  
**Focus:** Agent loop, memory system, skills, proactive behavior

## Architecture Overview

NanoClaw is a personal WhatsApp assistant built on Claude Agent SDK.
Small, understandable (~1000 LOC), container-isolated, single process.


### Technology Stack

| Component | Technology |
|-----------|-----------|
| WhatsApp Connection | @whiskeysockets/baileys |
| Message Storage | SQLite (better-sqlite3) |
| Container Runtime | Apple Container (macOS) / Docker (Linux) |
| Agent Framework | @anthropic-ai/claude-agent-sdk (0.2.29) |
| Browser Automation | agent-browser + Chromium |
| IPC | Filesystem-based (JSON files) |

## 1. Main Agent Loop

### Host Process (src/index.ts)

Runs on macOS/Linux host:
- ensureContainerSystemRunning() - Starts Apple Container system
- initDatabase() - SQLite migrations
- whatsapp.connect() - Baileys connection
- Start subsystems: scheduler (60s), IPC watcher, message loop (2s)

### Agent Runner (container/agent-runner/src/index.ts)

Runs inside containers:
1. Read stdin: ContainerInput JSON with prompt, sessionId, secrets
2. Query loop: await SDK query({ prompt: MessageStream, resume: sessionId })
3. Emit results via stdout markers
4. Wait for IPC messages or _close sentinel
5. Exit gracefully on _close

**ReAct Loop:** Provided by SDK query() function, not custom implementation.

**Key Innovation:** Messages can be piped into active containers via IPC files.
Host writes to /workspace/ipc/input/*.json, container polls and pushes into MessageStream.
Session continues without restart.

## 2. Memory System

### Hierarchical File-based Memory

| Level | Location | Purpose |
|-------|----------|---------|
| Global | groups/CLAUDE.md | Shared preferences (main edits, others read-only) |
| Group | groups/{name}/CLAUDE.md | Group-specific memory |
| Files | groups/{name}/*.md | Notes, research |
| Conversations | groups/{name}/conversations/ | Archived transcripts |

### Session Continuity (SDK-managed)

- Session IDs stored in SQLite per group
- Transcripts: data/sessions/{group}/.claude/ (JSONL)
- Mounted as /home/node/.claude/ in containers
- SDK resume: sessionId continues conversation
- PreCompact hook archives full transcript before compaction

### Skills Loading

Skills synced from container/skills/ to .claude/skills/ on every spawn:
- agent-browser/SKILL.md - Browser automation
- SDK auto-discovers from .claude/skills/

## 3. Tools and Skills

### SDK Built-in Tools

Bash (safe in container), Read/Write/Edit, WebSearch, Task, TeamCreate, etc.

### MCP Server: nanoclaw (stdio-based)

Tools: send_message, schedule_task, list_tasks, pause_task, resume_task, cancel_task, register_group

**IPC Protocol:**
1. Agent calls MCP tool
2. Server writes JSON to /workspace/ipc/messages/ or /workspace/ipc/tasks/
3. Host polls every 500ms, processes and deletes files

### Container Skills

agent-browser: CLI that wraps Chromium, installed in container.
Gated by allowed-tools: Bash(agent-browser:*)

## 4. Proactive Behavior

**No heartbeat.** Purely reactive (message-driven) + scheduled tasks.

### Task Scheduler

Polls SQLite every 60s for due tasks. Enqueues via GroupQueue.

**Context modes:**
- group: Task runs with conversation history (uses session ID)
- isolated: Fresh session, no history (faster, cheaper)

**Task behavior:**
- Prefix prompt with [SCHEDULED TASK - ...]
- Output sent to WhatsApp via sendMessage
- Can call send_message MCP tool for immediate delivery
- Can wrap output in <internal> tags to suppress auto-send

### No Autonomous Proactive Behavior

No background monitoring, no self-initiated actions.
All proactive behavior explicitly scheduled by user.

## 5. Container Isolation

### Volume Mounts

Main group:
- /workspace/project → project_root (RW)
- /workspace/group → groups/main/ (RW)

Non-main groups:
- /workspace/group → groups/{name}/ (RW)
- /workspace/global → groups/global/ (RO)

All groups:
- /home/node/.claude → data/sessions/{group}/.claude/ (RW)
- /workspace/ipc → data/ipc/{group}/ (RW)
- /app/src → container/agent-runner/src/ (RO, bypasses build cache)

### Security Features

1. Non-root user (node, uid 1000)
2. Mount allowlist (tamper-proof)
3. Per-group IPC namespaces
4. Secrets via stdin (never mounted)
5. Bash secret stripping (PreToolUse hook removes API keys)

### Timeout Handling

- Hard timeout: CONTAINER_TIMEOUT (default 30min)
- Grace period: >= IDLE_TIMEOUT + 30s for _close sentinel
- Activity detection: Resets on OUTPUT markers, not stderr

## 6. Key Patterns for Onyx

1. **SDK vs Custom Loop:** Claude Agent SDK is production-ready
2. **Container Isolation:** Mount security pattern (allowlist, non-root, per-group IPC)
3. **Piped Messages:** IPC input enables stateful conversations without restarts
4. **Idle Timeout + Graceful Shutdown:** _close sentinel preserves session state
5. **Context Modes:** group vs isolated balances continuity vs cost
6. **Conversation Archiving:** PreCompact hook ensures no history loss
7. **Skills as Code:** .claude/skills/ synced from host cleaner than APIs
8. **MCP via Stdio:** Simpler than HTTP, inheritable by subagents
9. **Streaming with Markers:** Sentinel markers (---OUTPUT_START---) robust parsing
10. **Single Process:** Despite containers, orchestrator is one Node process

## 7. Critical Files for Onyx

### Must Read
1. container/agent-runner/src/index.ts - Agent loop, IPC polling, session resume
2. src/container-runner.ts - Volume mounts, security, streaming output
3. src/group-queue.ts - Concurrency control, stdin piping
4. src/task-scheduler.ts - Scheduled task execution
5. container/agent-runner/src/ipc-mcp-stdio.ts - MCP server pattern

### Can Skip
- src/channels/whatsapp.ts - WhatsApp-specific
- src/db.ts - SQLite schema (Onyx may differ)

## 8. Code Paths

### Message Flow
```
whatsapp.ts:onMessage()
  → db.ts:storeMessage()
  → index.ts:startMessageLoop()
  → index.ts:processGroupMessages()
  → container-runner.ts:runContainerAgent()
  → agent-runner/index.ts:main()
  → SDK query()
  → ipc-mcp-stdio.ts (MCP tools)
  → ipc.ts:processIpcMessage()
  → whatsapp.ts:sendMessage()
```

### Piped Message Flow
```
WhatsApp message arrives
  → group-queue.ts:sendMessage() writes IPC file
  → agent-runner/index.ts:drainIpcInput()
  → MessageStream.push(text)
  → SDK query() receives message in active session
```

### Scheduled Task Flow
```
task-scheduler.ts:startSchedulerLoop()
  → db.ts:getDueTasks()
  → task-scheduler.ts:runTask()
  → container-runner.ts:runContainerAgent(isScheduledTask: true)
  → agent-runner/index.ts:main()
  → SDK query()
  → task-scheduler.ts:onOutput() → sendMessage()
  → db.ts:logTaskRun(), updateTaskAfterRun()
```

## 9. Comparison to PicoClaw/Nanobot

| Feature | NanoClaw | PicoClaw | Nanobot |
|---------|----------|----------|---------|
| Loop | SDK query() | Custom ReAct | Custom ReAct |
| Memory | CLAUDE.md + SDK sessions | context.json | context.json |
| Skills | SDK .claude/skills/ | Custom registry | N/A |
| Proactive | Scheduled tasks only | None | None |
| Container | Apple Container/Docker | N/A | N/A |
| IPC | Filesystem (JSON) | N/A | N/A |
| Session | SDK (JSONL) | None | None |

**Advantages:** Mature SDK, session continuity, container isolation, agent swarms
**Tradeoffs:** Heavier runtime, slower cold start, SDK dependency

---

**End of Analysis**
