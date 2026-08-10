---
name: planning
description: "Requirements, user stories, acceptance/verification criteria, or testable outcomes. Not for PRD drafting (/prd) or Pi /goal prompts."
---

# Planning

## Boundary

| Need | Use |
| --- | --- |
| Requirements, acceptance criteria, constraints, verification | `planning` |
| Product requirements document artifact | `prd` |
| Long-running Pi `/goal` prompt | `pi-goal` |
| Implementation philosophy or architecture tradeoffs | `development-philosophy` |

## Core Principle

Make completion falsifiable. Each normative requirement should state one obligation with a responsible entity, applicable condition, observable outcome, and measurable bound or direct verification where those details matter.

## Practical Steps

1. Restate the outcome in one sentence and preserve established identifiers and defined terms.
2. List scope boundaries and only the assumptions that affect execution.
3. Split combined obligations and replace vague modifiers with observable behavior, measures, bounds, or named exceptions.
4. Preserve the strength of normative words such as `shall`, `must`, `should`, and `may`; do not silently weaken or strengthen them.
5. Add concise acceptance criteria with the relevant state or trigger, actor, action, and expected result.
6. Define a verification method and pass condition that directly exercise the outcome.
7. Surface blockers or competing interpretations that would change the design instead of choosing one silently.

## Conditional Reference

For formal requirements, acceptance criteria, or a requirements section in another artifact, read [Requirements language](references/requirements-language.md). Do not force its sentence patterns onto narrative context or rationale.

## Acceptance Criteria Pattern

```markdown
## Acceptance Criteria
- Given <condition>, when <actor or system action>, then <observable outcome within a bound, if applicable>.
- Verification: <inspection, test, demonstration, or analysis> passes when <direct pass condition>.
```

## Anti-Patterns

- Combining multiple independently verifiable obligations in one requirement.
- Using `should`, `fast`, `appropriate`, or similar language without its intended force or a checkable meaning.
- Treating implementation details as requirements unless they are explicit constraints.
- Claiming validation without a direct check of the requested contract.
- Adding PRD sections when the user only needs acceptance criteria.
