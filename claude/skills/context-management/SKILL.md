---
name: context-management
description: Context window hygiene for long Claude Code sessions. Activate when working on complex multi-step tasks, when conversation gets slow, or when approaching context limits. Guides checkpointing, clearing, and efficient context usage.
---

# Context Management

**Auto-activate when:** Session feels slow, complex multi-step work, before major task transitions, or when explicitly managing context.

## Token Budget Guidelines

| Context Level | Action |
|---------------|--------|
| **< 20k tokens** | Ideal working range |
| **20-40k tokens** | Consider checkpointing |
| **40-60k tokens** | Checkpoint and clear soon |
| **> 60k tokens** | Clear immediately after checkpoint |

## Checkpoint Pattern

Before clearing context on complex work, save state to files:

```
.chat_planning/
  context.md    # Current understanding, decisions made
  tasks.md      # Remaining work, next steps
  blockers.md   # Open questions, issues encountered
```

**Checkpoint checklist:**
1. Document current understanding of the problem
2. List decisions made and why
3. Note any blockers or open questions
4. List remaining tasks with clear descriptions
5. Save relevant code snippets or file paths

## When to Clear

**Clear proactively when:**
- Switching to unrelated task
- Major milestone completed
- Context feels bloated with exploration
- Response quality degrading

**Don't clear when:**
- Mid-implementation with complex state
- Debugging session with important stack traces
- Multiple interdependent changes in progress

## Efficient Context Usage

**Reduce context consumption:**
- Use Task tool for exploration (keeps results in subagent)
- Avoid re-reading files unnecessarily
- Keep todo lists concise
- Prefer targeted searches over broad exploration

**Signs of context bloat:**
- Repeated file reads of same content
- Long error traces from multiple attempts
- Extensive exploration that's now irrelevant
- Many abandoned approaches still in context

## Recovery After Clear

Start new session with:
```
/read .chat_planning/context.md
/read .chat_planning/tasks.md
```

Or briefly state: "Continuing from checkpoint - working on [task], last completed [milestone]."

---

## TL;DR

Target <20k tokens. Checkpoint to `.chat_planning/` before clearing. Clear proactively at milestones, not just when forced.
