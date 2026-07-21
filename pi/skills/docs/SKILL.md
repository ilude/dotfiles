---
name: docs
description: "Technical documentation structure and Markdown conventions. Use for README, CHANGELOG, docs/ files, RFCs, ADRs, guides, and Markdown organization. Not for prose cleanup or archival work."
---

# Documentation Workflow

**Auto-activate when:** writing or editing technical documentation structure, Markdown files, README/CHANGELOG, RFCs, ADRs, guides, or docs folders.

## Boundary

| Need | Use |
| --- | --- |
| Document structure, headings, examples, docs navigation | `docs` |
| Remove generic/hypey wording from prose | `no-ai-slop` |

## Core Principle

Documentation should help a reader do the next task. Optimize for accurate structure, clear sequence, and maintainable examples.

## Practical Steps

1. Identify the reader and task.
2. Put the answer or summary first.
3. Use headings that name the content, not the writing process.
4. Keep commands copy-pasteable and fenced with language labels.
5. Link related docs instead of duplicating long explanations.
6. Update navigation/index files when adding docs.

## Markdown Defaults

- One `#` title per document.
- Sentence-case headings unless local style differs.
- Prefer short paragraphs and bullets for procedures.
- Use relative links for repo-local docs.
- Keep code blocks minimal and tested when practical.

## Common Artifacts

| Artifact | Use when |
| --- | --- |
| README | Entry point and quick start |
| CHANGELOG | User-visible release notes |
| ADR | Architecture decision and consequences |
| RFC/design doc | Proposal with alternatives and open questions |
| Runbook | Operational steps and recovery |

## Anti-Patterns

- Rewriting prose style when the task is docs structure only.
- Adding unsourced claims to technical references.
- Duplicating content that should be linked.
- Letting examples drift from real commands.

## Quick Reference

Good docs answer: who is this for, what should they do, what can go wrong, and where do they go next?
