---
name: brainstorming
description: Generate multiple approaches before implementing. Activate when facing design decisions, architectural choices, or problems with multiple valid solutions. Prevents premature commitment to first idea.
---

# Brainstorming

**Auto-activate when:** a real design or architecture choice has multiple viable approaches whose trade-offs could change the outcome.

## Boundary

`pi/AGENTS.md` Development Philosophy owns implementation strategy. Use this skill only to compare genuine alternatives, not to manufacture options for obvious fixes.

## Process

1. State the problem, constraints, and success signal.
2. Identify viable approaches without a fixed count.
3. Compare concrete costs, risks, and fit with existing patterns.
4. Recommend one approach and explain the decisive evidence.
5. Implement the selected approach only when implementation was requested; otherwise report the recommendation.

## Anti-Patterns

- Fake alternatives created to satisfy a format.
- Analysis that delays an obvious, reversible fix.
- Trend-driven recommendations without project evidence.
- Compromise designs whose added cost cannot be named.
