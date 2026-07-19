---
name: research-archive
description: "Research note archival. Use when saving sourced findings, citing references, documenting prior investigations, or using /research outputs in .specs/research/. Not for general docs writing or prose cleanup."
---

# Research Archive

**Auto-activate when:** saving research findings, recording sources, documenting references, or checking whether prior research already exists.

## Boundary

Use `research-archive` when sources and findings must be preserved. Use `docs` for user-facing documentation and `no-ai-slop` for prose cleanup.

## Core Principle

Research notes should preserve what was learned, where it came from, and how reliable it is. Future readers must be able to verify the claim trail.

## Practical Steps

1. Search existing research before creating a new note.
2. Choose a descriptive filename with date or topic when useful.
3. Summarize the answer first.
4. Record sources with URLs, dates accessed when relevant, and source type.
5. Separate findings, quotes, uncertainties, and next questions.
6. Prefer primary sources and mark weaker sources clearly.

## Minimal Note Shape

```markdown
# <Topic>

## Summary

## Key Findings

## Sources
- <title> - <url> - <source type>

## Open Questions
```

## Source Quality

Primary docs/specs > academic papers > official blogs > reputable technical posts > forums/social posts. Use weaker sources only when they provide direct evidence unavailable elsewhere.

## Anti-Patterns

- Saving links without a summary.
- Mixing speculation with findings.
- Dropping source context needed to judge reliability.
- Turning research notes into polished user documentation prematurely.

## Quick Reference

Archive the trail, not just the conclusion.
