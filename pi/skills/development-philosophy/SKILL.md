---
name: development-philosophy
description: "Implementation strategy and design tradeoff guardrails. Use when planning implementation approach, architecture choices, experiment-driven development, or avoiding over-engineering. Not for edit-time diff consistency; use least-astonishment."
---

# Development Philosophy

**Auto-activate when:** choosing an implementation approach, evaluating architecture tradeoffs, planning experiments, or explicitly applying development principles.

## Boundary

Use this skill before or during design decisions. Use `least-astonishment` when editing existing code and checking whether the diff matches local patterns.

## Core Principles

- Solve the observed problem, not a generalized future version.
- Prefer small experiments over speculative architecture.
- Fail explicitly when required data/dependencies are missing.
- Remove redundant paths instead of hiding them behind flags.
- Standard library and existing project patterns first.

## Practical Steps

1. Name the real problem and evidence it exists.
2. Choose the smallest solution that tests the assumption.
3. Prefer deterministic code for routing, retries, transforms, and validation.
4. Use model judgment for synthesis or ambiguous language, not deterministic decisions.
5. Validate the behavior that matters, not just command execution.
6. Stop when the requirement is satisfied; list follow-ups separately.

## Decision Checks

| Question | If yes |
| --- | --- |
| Is this solving a hypothetical future case? | Defer it |
| Is a new abstraction replacing two simple uses? | Keep it simple |
| Is fallback logic masking missing data? | Fail explicitly |
| Can a quick test reduce uncertainty? | Run it first |

## Anti-Patterns

- Adding guard flags around obsolete behavior.
- Introducing fallback logic without a requirement.
- Refactoring broadly while fixing a narrow issue.
- Treating a smoke test as full validation.

## Quick Reference

Experiment first, generalize later, and keep failure modes explicit.
