---
name: docs
description: "README, CHANGELOG, docs/, RFCs, ADRs, guides, or Markdown structure. Not for prose cleanup or archival work."
---

# Documentation Workflow

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
4. Structure procedures in execution order: prerequisites, numbered actions, direct checks, and recovery or next steps when needed.
5. Keep one primary action per numbered step and place conditions or expected results next to the step they govern.
6. Keep commands copy-pasteable and fenced with language labels.
7. Link related docs instead of duplicating long explanations.
8. Update navigation/index files when adding docs.

## Markdown Defaults

- One `#` title per document.
- Sentence-case headings unless local style differs.
- Use numbered lists for ordered procedures and bullets for unordered facts.
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
