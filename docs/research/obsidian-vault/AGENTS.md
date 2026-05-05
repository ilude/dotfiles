# AGENTS.md

Guidance for agents working in this Obsidian research vault.

## Purpose

This vault is a multi-topic context pool / idea garden. Use it to preserve useful
research signals so future Pi sessions can understand context and discuss how new
ideas might fit the dotfiles workflow.

It is not a roadmap, product spec, or commitment to build everything captured in
notes.

## Vault Layout

- `README.md` — human entry point for the whole vault.
- `index.md` — curated map of top-level topics.
- `agent-workflows/` — agent tooling and workflow research.
- Other top-level folders may be added as new research topics.

## Operating Principles

- Keep notes small, linked, and easy to browse in Obsidian.
- Prefer top-level topic folders over one giant mixed note collection.
- Do not create a perfect taxonomy before there is content pressure.
- Topic folders may have their own `AGENTS.md` for more specific guidance.
- When moving notes, update `README.md`, `index.md`, and obvious backlinks.

## Linking Conventions

Use GitHub-compatible relative Markdown links for notes inside the vault so links
work in both Obsidian and GitHub's Markdown viewer.

- Prefer `[Readable title](relative/path.md)` over Obsidian wiki links like
  `[[relative/path]]`.
- From vault-root docs, link topic indexes like
  `[Agent workflow research](agent-workflows/index.md)`.
- Inside a topic folder, prefer relative `.md` links unless linking across
  topics is clearer.
- Keep deliberate references to wiki-link syntax only when documenting the syntax
  itself.

## KISS Recommendation

Add new topic folders only when they make browsing simpler or keep unrelated notes
from crowding an existing topic.
