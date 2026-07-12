---
name: no-ai-slop
description: "Prose cleanup for generic machine-style writing. Use when writing, editing, or reviewing prose for filler, hype, vague claims, repetitive structure, detection tells, or uncited specifics. Not for Markdown/doc architecture or research archiving."
---

# No-Slop Writing

**Auto-activate when:** the user asks to clean up prose, make writing less AI-like, remove filler/hype, tighten wording, or review text quality.

## Boundary

Use this skill for wording quality and for spotting implementation/documentation residue that reads like AI-generated filler. Use `docs` for document structure and `research-archive` for saving sourced findings.

## Core Principle

Keep only claims that are specific, supported, and useful. Plain language beats inflated language.

## Practical Steps

1. Cut throat-clearing: "In today’s world", "It’s important to note", "delve".
2. Replace hype with evidence: say what changed, by how much, or for whom.
3. Prefer concrete verbs over abstract nouns.
4. Remove repeated sentence shapes and summary boilerplate.
5. Delete unsupported superlatives and invented precision.
6. Preserve the author’s meaning, terminology, and level of certainty.
7. If a claim needs a source, mark it or remove it.
8. Treat breadcrumb/comment-only files, placeholder stubs, and "left for context" artifacts as slop unless the user explicitly asked for them.
9. When behavior moves, prefer a real migration path and remove the old surface. Do not leave dead files, duplicate knobs, or compatibility allowances without an expiry/removal plan.
10. Prefer executable source of truth over wrapper glue. If a shell wrapper only routes to another tool, challenge whether it should be a native task/playbook/script instead.

## Edit Rules

- Do not sanitize personality out of the text.
- Keep domain terms when they carry meaning.
- Do not make prose blunter than the audience expects.
- Keep citations and qualifiers that prevent overclaiming.

## Anti-Patterns

| Anti-pattern | Fix |
| --- | --- |
| "Comprehensive, robust, seamless" | Name the actual capability |
| Vague benefit claims | Add evidence or delete |
| Repeated intro/body/conclusion rhythm | Vary structure around content |
| Overconfident certainty | Match the evidence |
| Comment-only "breadcrumb" files | Delete them; update real docs/migrations instead |
| Placeholder/stub files after refactors | Remove them or implement the real path |
| Old and new config knobs both accepted forever | Add migration, update users, then remove the old knob |
| Thin shell wrappers around first-class workflows | Replace with the native workflow surface where practical |

## Quick Reference

Before returning prose, ask: is every sentence either evidence, reasoning, instruction, or necessary context?
