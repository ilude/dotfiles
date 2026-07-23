---
name: prd
description: "PRD artifact workflow. Use when the user invokes /prd-it or explicitly asks to draft, refine, or review a Product Requirements Document. Not for ordinary acceptance criteria, planning, or Pi /goal prompts."
---

# PRD Workflow

## Boundary

Use `prd` only when the deliverable is a PRD. Use `planning` for lightweight requirements/acceptance criteria and `pi-goal` for executable Pi goal prompts.

## Core Principle

A PRD aligns product intent, constraints, and acceptance criteria before execution. Keep it decision-oriented, not a dump of implementation ideas.

## Practical Steps

1. Define the problem and desired outcome.
2. Separate goals and non-goals.
3. Define requirements and acceptance criteria.
4. Add users, scenarios, assumptions, risks, dependencies, or open questions only when requested or needed by the product decision.
5. Add planning or review handoffs only when requested.
6. Ask one concise clarification question only when a missing fact changes the PRD.

## Minimal PRD Shape

```markdown
# PRD: <title>
## Problem
## Goals
## Non-Goals
## Requirements
## Acceptance Criteria
```

## Anti-Patterns

- Activating for every mention of "requirements".
- Expanding a small request into a full product process.
- Mixing implementation plan with product requirements unless requested.
- Leaving open questions that block acceptance criteria.
- Defining migration success without parity expectations.
- Requiring custom implementation when an existing library or platform capability would satisfy the product need.
