---
name: least-astonishment
description: "Edit-time least-astonishment guardrails. Use when modifying existing code to keep diffs focused, pattern-matching, and unsurprising. Not for architecture strategy or pure git operations."
---

# Principle of Least Astonishment

**Auto-activate when:** editing, fixing, refactoring, extending, or integrating with existing code where local patterns matter.

## Boundary

Use this skill as an edit-time diff guard. Use `development-philosophy` for broader implementation strategy and architecture tradeoffs.

## Core Principle

A change should be predictable to someone who knows the codebase. If it would surprise them, make a smaller change or explain the tradeoff first.

## Surprise Check

Before editing, ask:

1. Does this match neighboring naming, structure, error handling, and test style?
2. Is every changed file needed for the request?
3. Did I avoid drive-by formatting and unrelated cleanup?
4. Does any API behavior or default silently change?
5. Would the diff title accurately describe all touched files?

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
- Modifying cross-file callers without a clear need.

## Quick Reference

Small, local, pattern-matching diffs are least surprising. No drive-by improvements.
