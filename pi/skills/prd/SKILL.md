---
name: prd
description: "Use to draft, refine, or review a Product Requirements Document. Not for acceptance criteria, planning, or Pi /goal prompts."
---

# PRD Workflow

## Boundary

Use `prd` only for an explicit request to draft, refine, or review a PRD. A PRD is optional and is not a prerequisite for planning or implementation. Use `planning` for standalone requirements or acceptance criteria and `pi-goal` for executable Pi goal prompts.

## Core Principle

A PRD records the product decisions needed to align problem, outcome, scope, requirements, and acceptance. Keep it decision-oriented and proportionate to the request.

## Artifact Contract

- For a new PRD artifact, use `pi/skills/workflow/templates/prd-template.md` and write `.specs/{lowercase-kebab-case-slug}/PRD.md` unless the user names another path.
- Refine an explicitly supplied PRD in place unless the user requests a new artifact.
- Keep Problem, Goals, Non-Goals, context, and rationale as natural narrative.
- Treat Requirements and Acceptance Criteria as normative. Load `planning` and preserve identifiers, defined terms, modal strength, conditions, bounds, and exceptions.
- Add users, scenarios, assumptions, risks, dependencies, alternatives, or open questions only when they affect the product decision.
- Add a `/plan-it` handoff only when requested.
- Ask one concise clarification at a time only when the answer would materially change scope, acceptance, or another product decision. Otherwise draft with explicit assumptions.

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

- Activating for an incidental mention of a PRD or for every mention of requirements.
- Making a PRD mandatory before another workflow.
- Expanding a small request into a full product process.
- Applying requirement syntax to narrative sections.
- Mixing implementation tasks into product requirements unless the implementation is an explicit constraint.
- Leaving competing material interpretations hidden in prose.
