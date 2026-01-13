---
name: multi-claude-verification
description: Use separate Claude contexts to verify your own work. Activate when completing significant implementations, before major commits, or when quality assurance is critical. Prevents blind spots from accumulated context.
---

# Multi-Claude Verification

**Auto-activate when:** Completing significant features, before important commits, after complex refactoring, or when high confidence is required.

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

## When to Use

| Situation | Recommendation |
|-----------|----------------|
| Quick bug fix | Skip - overkill |
| New feature (1-2 files) | Optional |
| Significant feature (3+ files) | Recommended |
| Architecture change | Required |
| Security-sensitive code | Required |
| Before major release | Required |

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

## What the Reviewer Should Check

- [ ] Does it actually solve the stated problem?
- [ ] Are there unhandled edge cases?
- [ ] Does it match existing code patterns?
- [ ] Are there any obvious bugs?
- [ ] Is error handling complete?
- [ ] Are there security concerns?
- [ ] Will it break existing functionality?

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
