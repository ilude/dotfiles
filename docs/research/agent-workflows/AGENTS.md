# AGENTS.md

Guidance for agents working in this Obsidian-style research vault.

## Purpose

This vault is a **context pool / idea garden** for agent-workflow research. It is not a roadmap, product spec, or commitment to build a large system.

Use it to preserve useful signals so future Pi sessions can understand what the user is aiming at and discuss how new ideas might fit the Pi/dotfiles workflow.

## Operating Principles

- **KISS and function over complexity.** Prefer the smallest useful note, skill, checklist, or script.
- **Research notes are not implementation plans.** Do not turn every idea into a backlog item.
- **Promote only from repeated pain.** An idea should move toward Pi implementation only when it solves a real recurring workflow problem.
- **Prefer reversible thin slices.** First implementation should usually be one skill, one checklist, one command wrapper, one artifact format, or one README update.
- **Do not build a big integrated system by default.** Avoid new daemons, databases, orchestration frameworks, or generalized abstractions until concrete usage proves the need.
- **Keep notes opinionated.** End notes with a `KISS recommendation` so future agents can quickly infer intent.

## Directory Roles

- `projects/` — concrete tools, repos, systems, products, or local projects.
- `patterns/` — reusable ideas that appear across multiple tools or systems.
- `workflow-ideas/` — possible Pi/dotfiles adaptations, usually not ready to build yet.
- `_templates/` — note templates for future additions.
- `index.md` — curated map of the vault.
- `README.md` — human entry point.

## Note Template

Use this shape for new notes unless the source material demands something different:

```md
---
status: research-note
source: <url-or-path>
---

# Title

## Why this matters

What problem, pattern, or useful signal does this capture?

## Useful signals

- Concrete things worth remembering.
- Links, commands, architecture ideas, or workflow patterns.

## Possible Pi fit

How this might help Pi, dotfiles, menos, or agent workflows.

## Risks / reasons not to build yet

Why this should remain research for now, what could overcomplicate it, and what assumptions are unproven.

## KISS recommendation

The smallest reasonable next step, or an explicit recommendation not to build yet.

## Related notes

- [[some-related-note]]
```

## Promotion Filter

Before turning a note into an implementation plan, ask:

1. Has this problem appeared more than once?
2. Can it be solved with a small skill, doc, checklist, or script first?
3. Does it reduce friction in the current workflow?
4. Can it be removed or ignored later if wrong?
5. Is there a clear validation signal?

If the answer is mostly no, keep it as research.

## Linking Conventions

- Use Obsidian wiki links for notes in this vault: `[[projects/menos]]`.
- Prefer relative conceptual links over raw paths in prose.
- Keep source paths/URLs in frontmatter or a short source section.
- When moving a note, update `README.md`, `index.md`, and obvious backlinks.

## Restructuring Guidance

Restructure only when it makes browsing simpler. Do not reorganize for aesthetics alone.

Good reasons to move a note:

- It is a concrete tool/project currently under `workflow-ideas/`.
- It is a reusable pattern currently buried in a project note.
- It is an implementation idea currently at vault root.

Bad reasons:

- Making a perfect taxonomy.
- Splitting short notes prematurely.
- Creating a category with only one note unless it clarifies an existing mess.

## Current Direction

The vault currently points toward Pi as the workflow/control plane, menos as durable memory/search, and small auditable skills/scripts as the execution layer. That is context, not a mandate.
