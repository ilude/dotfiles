---
name: planning
description: "Requirements and acceptance-criteria planning. Use for requirements, user stories, acceptance criteria, verification criteria, or turning vague requests into testable outcomes. Not for PRD artifact drafting (/prd) or Pi /goal prompt writing."
---

# Planning

**Auto-activate when:** defining requirements, acceptance criteria, success metrics, user stories, verification plans, or converting an ambiguous request into testable scope.

## Boundary

| Need | Use |
| --- | --- |
| Acceptance criteria, constraints, verification | `planning` |
| Product requirements document artifact | `prd` |
| Long-running Pi `/goal` prompt | `pi-goal` |
| Implementation philosophy or architecture tradeoffs | `development-philosophy` |

## Core Principle

A plan is useful only when it makes completion falsifiable. Write outcomes that can be checked by inspection, tests, commands, or user acceptance.

## Practical Steps

1. Restate the outcome in one sentence.
2. List scope boundaries: in scope, out of scope, assumptions.
3. Convert vague language into observable behavior.
4. Add acceptance criteria using `Given/When/Then` or concise bullets.
5. Define verification: exact command, review check, or manual scenario.
6. Call out blockers that would change the plan.

## Acceptance Criteria Pattern

```markdown
## Acceptance Criteria
- Given <state>, when <action>, then <observable result>.
- <File/API/command> handles <case> without <failure>.
- Validation: <exact command or inspection step>.
```

## Anti-Patterns

- Writing tasks without a definition of done.
- Treating implementation details as requirements.
- Adding PRD sections when the user only needs acceptance criteria.
- Claiming validation without a concrete check.

## Quick Reference

Good criteria are specific, observable, bounded, and verifiable. If a reviewer cannot tell whether it passed, rewrite it.
