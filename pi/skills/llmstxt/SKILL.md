---
name: llmstxt
description: LLMs.txt standard for machine-readable documentation. Activate when discussing llms.txt, /llms.txt endpoints, llms-full.txt, documentation indexes, machine-readable docs, or the llmstxt.org specification.
---

# llms.txt Workflow

Compact index for creating and maintaining `llms.txt` documentation.

## Auto-activate when

- Creating, editing, reviewing, or validating `llms.txt`, `llms-full.txt`, `/llms.txt` endpoints, or machine-readable documentation indexes.
- User mentions llms.txt, llms-full.txt, llmstxt.org, machine-readable docs, documentation endpoints, or inference-time documentation.
- Do not use for ordinary README/docs edits unless the machine-readable index is in scope.

## Project-specific rules

- Keep docs concise and no-slop: avoid hype, vague claims, duplicated summaries, and uncited specifics.
- Preserve local documentation structure; link to canonical docs instead of copying whole sites into the index.
- Do not expose private URLs, credentials, internal-only paths, or generated local files.
- Validate that listed links exist when practical.

## Practical steps

1. Identify the audience: assistants needing fast navigation, not search crawlers.
2. Put the most important docs first, grouped by stable section names.
3. Use short descriptions that state what each linked page contains.
4. Put verbose or optional content in `llms-full.txt` or companion markdown, not the main index.

## Quick validation

| Purpose | Checks |
|---|---|
| Format | Confirm H1 title, short intro, sections, and markdown links |
| Reachability | Fetch or open `/llms.txt` and linked docs when available |
| Scope | Confirm no private/internal-only material is exposed |
| Duplication | Confirm main file is an index, not a copied tutorial dump |

## Anti-patterns

- Treating `llms.txt` as `sitemap.xml`, robots policy, or marketing copy.
- Dumping complete tutorials into the index instead of linking them.
- Using unstable generated URLs without a clear reason.
- Publishing private docs or environment-specific endpoints.

## Optional references

- [reference.md](reference.md) - detailed guidance, examples, and templates.
- [tools.md](tools.md) - tools and ecosystem notes.
