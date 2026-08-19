---
name: development-philosophy
description: "Implementation strategy, architecture, experiments, or avoiding over-engineering. Not for edit-time diff consistency; use least-astonishment."
---

# Development Philosophy

## Owner

`pi/AGENTS.md` Engineering is the single source of truth. Apply that section directly; use `least-astonishment` for edit-time diff consistency.

## Conditional References

- For architecture reviews, weak module boundaries, scattered change, or code that is difficult to test through a stable interface, read [Architecture review](architecture-review.md). Use it only when the user requests a review or concrete friction justifies one.
- For designing a selected module, its interfaces, or its seams and dependency strategy, read [Codebase design](codebase-design.md).
