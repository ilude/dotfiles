---
name: no-ai-slop
description: "Prose cleanup for generic machine-style writing. Use when writing, editing, or reviewing prose for filler, hype, vague claims, repetitive structure, detection tells, or uncited specifics. Not for Markdown architecture or archival work."
---

# No-Slop Writing

**Auto-activate when:** the user asks to clean up prose, make writing less AI-like, remove filler/hype, tighten wording, or review text quality.

## Boundary

Use this skill for wording quality and `docs` for document structure. Archival work is outside this skill. `pi/AGENTS.md` owns implementation strategy.

## Core Principle

Keep only claims that are specific, supported, and useful. Plain language beats inflated language.

## Practical Steps

- Cut throat-clearing: "In today's world", "It's important to note", "delve".
- Replace hype with evidence: say what changed, by how much, or for whom.
- Prefer concrete verbs over abstract nouns.
- Remove repeated sentence shapes and summary boilerplate.
- Delete unsupported superlatives and invented precision.
- Preserve the author's meaning, terminology, and level of certainty.
- If a claim needs a source, mark it or remove it.

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

## Quick Reference

Before returning prose, ask: is every sentence either evidence, reasoning, instruction, or necessary context?
