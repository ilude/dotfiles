---
name: prd
description: "PRD artifact workflow. Use when the user invokes /prd-it or explicitly asks to draft, refine, or review a Product Requirements Document. Not for ordinary acceptance criteria, planning, or Pi /goal prompts."
---

# PRD Workflow

**Auto-activate when:** creating, refining, or reviewing a PRD/product requirements document artifact.

## Boundary

Use `prd` only when the deliverable is a PRD. Use `planning` for lightweight requirements/acceptance criteria and `pi-goal` for executable Pi goal prompts.

## Core Principle

A PRD aligns product intent, constraints, and acceptance criteria before execution. Keep it decision-oriented, not a dump of implementation ideas.

## Practical Steps

1. Identify the target user, problem, and desired outcome.
2. Separate goals, non-goals, assumptions, and open questions.
3. Define user stories or scenarios only where they clarify behavior.
4. Add acceptance criteria and verification hooks.
5. Capture rollout, risks, and dependencies when they affect delivery.
6. Ask one concise clarification question only when a missing fact changes the PRD.

## Minimal PRD Shape

```markdown
# PRD: <title>
## Problem
## Goals
## Non-Goals
## Users / Scenarios
## Requirements
## Acceptance Criteria
## Risks / Dependencies
## Open Questions
```

## Anti-Patterns

- Activating for every mention of "requirements".
- Expanding a small request into a full product process.
- Mixing implementation plan with product requirements unless requested.
- Leaving open questions that block acceptance criteria.

## Quick Reference

PRD = product artifact. Planning = requirements method. Pi goal = executable agent objective.
