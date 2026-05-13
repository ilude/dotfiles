---
description: Compact the current conversation into a handoff document for another agent to pick up
argument-hint: "[next-session focus]"
---

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save it under `private/handoffs/` using a unique filename such as `handoff-YYYYMMDD-HHMMSS.md` (create the directory if needed; read the file before you write to it).

Handoff artifacts are private data. Dolos is the explicit archive workflow: run `bin/dolos status` to inspect freshness and `bin/dolos pack private` only when you intentionally want to refresh `.dolos/artifacts/private.tar.gz.age`. The encrypted artifact is an opaque binary diff; use Dolos status rather than Git diff contents to reason about freshness. Do not rely on hooks to pack, decrypt, or stage private data.

Suggest the skills to be used, if any, by the next session.

Do not duplicate content already captured in other artifacts (PRDs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

If the user passed arguments, treat them as this next-session focus and tailor the document accordingly:

$ARGUMENTS
