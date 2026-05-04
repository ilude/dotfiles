---
name: brainstorming
description: Generate multiple approaches before implementing. Activate when facing design decisions, architectural choices, or problems with multiple valid solutions. Prevents premature commitment to first idea.
---

# Brainstorming

**Auto-activate when:** Facing design decisions, multiple valid approaches exist, architectural choices, or when the first solution feels too obvious.

## The Problem

First idea bias:
1. Problem presented
2. First solution comes to mind
3. Implement immediately
4. Discover issues late
5. Refactor or live with suboptimal choice

## The Solution

Generate **3+ approaches** before implementing any of them.

```
Problem
   ↓
┌──────────────────────────────────────┐
│  Approach A    Approach B    Approach C  │
│  (obvious)     (alternative) (creative)  │
└──────────────────────────────────────┘
   ↓
Compare trade-offs
   ↓
Choose with evidence
   ↓
Implement
```

## The Process

### 1. State the Problem Clearly

Before solutions, define:
- What exactly needs to be solved?
- What are the constraints?
- What does success look like?

### 2. Generate Multiple Approaches

Force yourself to list at least 3 options:

```markdown
## Approaches

### A: [Obvious/First-thought approach]
- How it works: ...
- Pros: ...
- Cons: ...

### B: [Alternative approach]
- How it works: ...
- Pros: ...
- Cons: ...

### C: [Creative/unconventional approach]
- How it works: ...
- Pros: ...
- Cons: ...
```

### 3. Compare Trade-offs

Score each option against the criteria *independently* before deciding the recommendation. Order the final presentation by independent assessment, not by the order options came to mind. This guards against first-idea anchoring.

| Criteria | A | B | C |
|----------|---|---|---|
| Complexity | | | |
| Performance | | | |
| Maintainability | | | |
| Matches existing patterns | | | |
| Time to implement | | | |

### 4. Choose with Reasoning

Document why you chose the approach:
- "Choosing B because [specific reasons]"
- "Rejected A because [specific reasons]"
- "C was interesting but [why not now]"

## When to Brainstorm

| Situation | Brainstorm? |
|-----------|-------------|
| Bug fix with obvious cause | No |
| New feature architecture | Yes |
| Performance optimization | Yes |
| Refactoring approach | Yes |
| API design | Yes |
| Simple CRUD endpoint | No |
| Security implementation | Yes |
| User-proposed cause hypothesis ("I think it's X") | Yes -- see [debugging.md](../analysis-workflow/debugging.md) |

## Brainstorming Prompts

When stuck generating alternatives:

- "What if we did the opposite?"
- "How would [library X] solve this?"
- "What's the laziest solution?"
- "What if we had unlimited time?"
- "What would break if we did nothing?"
- "How did similar projects solve this?"

## Trend Bias Check

Before recommending an industry-popular pattern (microservices, GraphQL, NoSQL, event-driven, monorepo, etc.), name one specific scenario in this project's context where the opposite choice would be correct. If you cannot, the recommendation is trend-driven, not context-driven.

## Example

**Problem:** Need to cache API responses

**Approaches:**

| Approach | Description | Pros | Cons |
|----------|-------------|------|------|
| A: In-memory dict | Simple dictionary cache | Fast, simple | Lost on restart, no size limit |
| B: Redis | External cache server | Persistent, shared | Extra dependency, complexity |
| C: File-based | Cache to disk | Persistent, simple | Slow, disk space |
| D: HTTP caching | Let browser/CDN handle it | No code, standard | Less control |

**Decision:** Start with A (in-memory), add B (Redis) if we need persistence or sharing.

## Anti-Patterns

**Don't:**
- Generate fake alternatives just to check the box
- Spend hours on trivial decisions
- Let analysis paralysis prevent action
- Ignore the obvious solution because it's obvious
- Propose a "best of both" solution without verifying the tradeoff is real. If you cannot name a specific cost the compromise pays, pick a side instead.

**Do:**
- Time-box brainstorming (5-15 min)
- Actually consider each option
- Document reasoning for future reference
- Choose and commit

---

## TL;DR

Generate 3+ approaches before implementing. Compare trade-offs explicitly. Choose with documented reasoning. Time-box to avoid paralysis.
