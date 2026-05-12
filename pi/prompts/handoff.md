---
description: Compact the current conversation into a handoff document for another agent to pick up
argument-hint: "[next-session focus]"
---

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save it under `private/handoffs/` using a unique filename such as `handoff-YYYYMMDD-HHMMSS.md` (create the directory if needed; read the file before you write to it). Handoff artifacts are private data; the private pre-commit hook encrypts files from `private/` into `.encrypted/`.

Suggest the skills to be used, if any, by the next session.

Do not duplicate content already captured in other artifacts (PRDs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

If the user passed arguments, treat them as this next-session focus and tailor the document accordingly:

$ARGUMENTS
