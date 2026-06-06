---
description: Compact the current conversation into a handoff document for another agent to pick up
argument-hint: "[next-session focus]"
---

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save it under `private/handoffs/` using a unique filename such as `YYYYMMDD-HHMMSS.md` (create the directory if needed; read the file before you write to it).

Handoff artifacts are private data. Use the private Obsidian vault format: include YAML frontmatter, one H1, `## Summary`, `## Current State`, `## Next Steps`, and `## References` sections. If the handoff needs attachments, place them under `private/_attachments/handoffs/<timestamp>/`. If maintaining an index, update `private/_indexes/handoffs.md` with path-level metadata only.

Use this frontmatter shape:

```yaml
---
title: Handoff YYYY-MM-DD HH:MM:SS
created: YYYY-MM-DDTHH:MM:SS-04:00
updated: YYYY-MM-DDTHH:MM:SS-04:00
type: handoff
source: pi
sensitive: true
tags:
  - private/handoff
related:
  - "[[handoffs]]"
---
```

Dolos owns encrypted private archive commits. `private/` is plaintext and ignored; the pre-commit hook packs diverged `private/` content into `.dolos/artifacts/private.tar.gz.age`, stages that encrypted artifact, and scans again. Use `bin/dolos status` to inspect freshness. The encrypted artifact is an opaque binary diff; use Dolos status rather than Git diff contents to reason about freshness.

Suggest the skills to be used, if any, by the next session.

Do not duplicate content already captured in other artifacts (PRDs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

If the user passed arguments, treat them as this next-session focus and tailor the document accordingly:

$ARGUMENTS
