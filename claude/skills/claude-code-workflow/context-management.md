# Context Management

Guidelines for managing Claude Code context efficiently - both within sessions (token hygiene) and across sessions (persistent state).

---

## Decision Guide: Which Approach?

| Scenario | Approach |
|----------|----------|
| Context feels bloated mid-session | **In-Session** |
| Need to clear and continue same task | **In-Session** |
| Exploration phase complete, moving on | **In-Session** |
| Task takes >15 min or 3+ files | **Cross-Session** |
| Interruption likely (meeting, EOD) | **Cross-Session** |
| Multiple people/instances on feature | **Cross-Session** |
| User says `/snapshot` or `/pickup` | **Cross-Session** |

---

## In-Session Context Management (Token Hygiene)

### Token Budget Guidelines

| Context Level | Action |
|---------------|--------|
| **< 20k tokens** | Ideal working range |
| **20-40k tokens** | Consider checkpointing |
| **40-60k tokens** | Checkpoint and clear soon |
| **> 60k tokens** | Clear immediately after checkpoint |

### Checkpoint Pattern

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

### When to Clear

**Clear proactively when:**
- Switching to unrelated task
- Major milestone completed
- Context feels bloated with exploration
- Response quality degrading

**Don't clear when:**
- Mid-implementation with complex state
- Debugging session with important stack traces
- Multiple interdependent changes in progress

### Efficient Context Usage

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

### Recovery After Clear

Start new session with:
```
/read .chat_planning/context.md
/read .chat_planning/tasks.md
```

Or briefly state: "Continuing from checkpoint - working on [task], last completed [milestone]."

---

## Cross-Session Context Management (Persistent State)

**Philosophy**: Document to resume work, not to create archives. Tokens aren't free. Err on side of less.

### When to Activate

1. **Task duration**: Work will take more than 15 minutes
2. **Multiple files/steps**: Work touches 3+ files OR has 3+ distinct steps
3. **Interruptions likely**: Meeting soon, end of day approaching
4. **Scope might expand**: Starting with "just a quick fix" on complex code
5. **User explicitly invokes `/snapshot` or `/pickup` commands**

### File Structure

```
project-root/
└── .session/feature/[feature-name]/
    ├── CURRENT.md    # READ FIRST - Quick resume (~150 lines max)
    ├── STATUS.md     # Terse log - Chronological entries
    └── LESSONS.md    # Bullet points - What worked/didn't
```

### CURRENT.md Structure

```markdown
# [Feature Name] - Current State

## Feature Overview
**Goal**: [What this feature accomplishes and why]

**Key Requirements**:
- [Critical constraints, dependencies]

**Design Decisions**:
- [Architectural choice made]: [Rationale]

---

## [instance:session] [Session Title]
Last: YYYY-MM-DD HH:MM

### Right Now
[One sentence describing what you're doing RIGHT NOW]

### Last 5 Done
1. [Most recent completed task]
2. [Previous completed task]

### In Progress
- [Active item 1]
- [Active item 2]

### Tests
**[Framework]**: X pass / Y fail

### Blockers
[List specific blockers OR "None"]

### Next 3
1. [Immediate next action]
2. [Then do this]
3. [After that]
```

### STATUS.md Structure

```markdown
# Status Log

---

## [instance:session] YYYY-MM-DD HH:MM - [What we did]
**User Request**: [Summarized intent]
**Discussion**: [Key decisions, trade-offs]
**Outcomes**:
- [Outcome]
**Next**: [Action]
```

### Security Rules

**Before writing session files, scan for:**
- API keys: `API_KEY=`, `sk-ant-`, `ANTHROPIC_API_KEY=`
- Passwords: `PASSWORD=`, `pwd=`, `passwd=`
- Tokens: `TOKEN=`, `Bearer`, `access_token=`
- Private keys: `-----BEGIN PRIVATE KEY-----`
- Connection strings with passwords

**Always use relative paths** in session files, never absolute paths.

### Commands

- `/snapshot` - Save current state to session files
- `/pickup` - Resume from saved session

### Workflow

**Session Start:**
1. Read CURRENT.md (< 1 min)
2. Say: "Resuming: [Right Now]. Next: [Next 3 #1]"
3. Mention blockers if any
4. Start work

**During Work:**
1. Work on task
2. Update CURRENT.md after milestones
3. Append to STATUS.md (terse!)

**Feature Complete:**
1. Mark in CURRENT.md
2. Final STATUS.md entry
3. Extract bullets to LESSONS.md
4. Archive: `mv .session/feature/[name] .session/completed/[name]`

---

## Low Context Warning Protocol

**When < 10% Remaining (~<20k tokens):**
1. Capture snapshot immediately
2. Alert user: "Context at [X%]. Recommend `/clear` soon."
3. Provide resume prompt

**When < 5% Remaining (~<10k tokens):**
1. Urgent snapshot capture
2. Strong warning: "Context critical - `/clear` now recommended."

---

## Using Both Approaches

For long-running features spanning multiple sessions:

1. **Cross-session** (`/snapshot`) at natural stopping points
2. **In-session** (checkpoint + clear) when context bloats mid-work
3. **Cross-session** (`/pickup`) to resume after clear or new session

**Cross-session** = persistent memory (survives session end)
**In-session** = working memory management (keeps current session efficient)

---

## Success Criteria

- Resume work in < 2 minutes from cold start
- CURRENT.md stays under ~100 lines
- STATUS.md entries are terse (< 50 words)
- Can walk away anytime without loss
- Token usage is efficient
