---
name: architecture-design
description: "Module, interface, seam, dependency, or structural design. Not for approach selection, planning, or routine edit consistency."
---

# Architecture Design

## Boundary

Use this skill for structural design decisions involving module boundaries, interfaces, seams, dependencies, or system structure. Use `analysis-workflow` for selecting an approach, `planning` for requirements and sequencing, and `least-astonishment` for routine edits to existing code.

## Process

1. Identify the responsibility, ownership, and change boundary.
2. Map the dependencies and the seams that need to be tested or replaced.
3. Define interfaces around stable behavior rather than implementation details.
4. Select a structure that solves the demonstrated coupling or change problem.
5. Verify the design through the smallest executable boundary or representative integration.

## Conditional References

For architecture reviews, weak module boundaries, scattered change, or code that is difficult to test through a stable interface, read [Architecture review](architecture-review.md).

For designing a selected module, its interfaces, or its seams and dependency strategy, read [Codebase design](codebase-design.md).

For a concrete problem-to-pattern mapping, read [Pattern selection](pattern-selection.md) only after a structural problem is established.
