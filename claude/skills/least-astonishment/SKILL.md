---
name: least-astonishment
description: "Focused, pattern-matching edits to existing code. Not for architecture strategy, approach selection, planning, or pure git operations."
---

# Principle of Least Astonishment

## Boundary

Use this skill as an edit-time diff guard when modifying, refactoring, fixing, patching, extending, or integrating with established code. Use `analysis-workflow` for analysis and approach selection, `architecture-design` for structural design, and `planning` for requirements and sequencing.

## Core Principle

A change should be predictable to someone who knows the codebase. If it would surprise them, make a smaller change or explain the tradeoff first.

## Surprise Check

Before editing, ask:

1. Does this match neighboring naming, structure, error handling, and test style?
2. Is every changed file needed for the request?
3. Did I avoid drive-by formatting and unrelated cleanup?
4. Does any API behavior or default silently change?
5. Would the diff title accurately describe all touched files?
6. If behavior must be preserved during a migration, does the new path preserve it until cutover?

## Compliant Patterns

- Fix only the requested behavior.
- Match existing vocabulary and abstractions.
- Preserve return types and defaults unless asked.
- Add backward-compatible parameters where possible.
- Flag broader refactors separately instead of bundling them.

## Anti-Patterns

- Opportunistic renames or formatting.
- Replacing local idioms with personal preference.
- Adding a dependency for a solved local pattern.
- Changing error-handling style mid-file.
- Modifying callers without a clear need.
