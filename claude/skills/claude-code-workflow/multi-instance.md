# Multi-Instance Verification

Use separate Claude contexts to verify your own work. Prevents blind spots from accumulated context.

---

## The Problem

A single Claude session accumulates context and assumptions. By the end of a long implementation:
- You've seen the code evolve and may miss issues obvious to fresh eyes
- Assumptions made early become invisible
- Edge cases discussed hours ago may be forgotten
- "It works for me" bias from testing in accumulated context

## The Solution

Use a **separate Claude context** to review work done in the first context.

```
Context A (Writer)          Context B (Reviewer)
─────────────────           ──────────────────
Implements feature    →     Reviews cold
Knows all history           Sees only final state
May have blind spots        Fresh perspective
```

---

## When to Use

| Situation | Recommendation |
|-----------|----------------|
| Quick bug fix | Skip - overkill |
| New feature (1-2 files) | Optional |
| Significant feature (3+ files) | Recommended |
| Architecture change | Required |
| Security-sensitive code | Required |
| Before major release | Required |

---

## How to Do It

### Option 1: New Terminal Session
```bash
# After completing work in first session
cd /project
claude  # Fresh context, no history
```

Then ask: "Review the recent changes in [files]. Look for bugs, edge cases, and issues."

### Option 2: /clear in Same Session
```
/clear
```
Then: "I just implemented [feature]. Review [files] for issues."

### Option 3: Adversarial Review Prompt

In the fresh context, use an adversarial prompt:

```
Review this code as a skeptical senior engineer. Find:
1. Bugs and logic errors
2. Missing edge cases
3. Security issues
4. Performance problems
5. Violations of project conventions

Be critical. Don't assume it works correctly.
```

---

## What the Reviewer Should Check

- [ ] Does it actually solve the stated problem?
- [ ] Are there unhandled edge cases?
- [ ] Does it match existing code patterns?
- [ ] Are there any obvious bugs?
- [ ] Is error handling complete?
- [ ] Are there security concerns?
- [ ] Will it break existing functionality?

---

## Multi-Instance Session Tracking

When multiple Claude instances work on the same feature simultaneously, use tagged sections in session files.

### Instance/Session ID Detection

```bash
# Instance ID (which IDE window)
INSTANCE_ID=$(cat ~/.claude/ide/$CLAUDE_CODE_SSE_PORT.lock 2>/dev/null | python -c "import json, sys; print(json.load(sys.stdin)['authToken'][:8])" 2>/dev/null || echo "unknown")

# Session ID (which conversation)
SESSION_ID=$(ls -lt ~/.claude/debug/*.txt 2>/dev/null | head -1 | awk '{print $9}' | xargs basename 2>/dev/null | cut -d. -f1 | cut -c1-8 || echo "unknown")
```

**Combined Tag**: `[$INSTANCE_ID:$SESSION_ID]` (e.g., `[5d72a497:888cf413]`)

### File Format with Multiple Instances

**CURRENT.md** (shared Feature Overview + separate sections per instance):
```markdown
# [Feature Name] - Current State

## Feature Overview
**Goal**: High-level description

---

## [5d72a497:888cf413] Frontend Queue
Last: 2025-11-13 23:30

### Right Now
Working on queueing multiple questions

---

## [a08428d4:3e5380bd] Transcripts
Last: 2025-11-13 23:28

### Right Now
Adding timestamp support to archive format
```

**STATUS.md** (tagged entries):
```markdown
## [5d72:888c] 2025-11-13 23:30 - Queue system
**User Request**: Enable submitting multiple questions
**Outcomes**:
- Frontend can queue multiple questions
**Next**: Test concurrent requests
```

**LESSONS.md** - No instance tags (shared learnings across all instances)

---

## Anti-Patterns

**Don't:**
- Use same session and just ask "is this good?" (context bias)
- Skip verification because "it's a small change" (small changes break things)
- Only verify happy path (edge cases matter)
- Trust verification from context that wrote the code

**Do:**
- Start fresh context for review
- Provide minimal context to reviewer (just the files/changes)
- Ask specific, adversarial questions
- Act on feedback before committing

---

## TL;DR

Fresh eyes catch what tired eyes miss. Use a separate Claude context to review significant work. The reviewer should see only the code, not your journey to write it.
