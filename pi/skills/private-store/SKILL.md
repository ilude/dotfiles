---
name: private-store
description: "Private datastore workflow. Activate when writing, saving, archiving, packing, encrypting, committing, or storing sensitive local files under private/ or Dolos encrypted archives."
---

# Private Store

**Auto-activate when:** The user asks to write, save, archive, pack, encrypt, commit, or store sensitive local files under `private/`, or mentions Dolos private archives.

## Core Principle

`private/` is the local plaintext Obsidian-compatible vault. `.dolos/artifacts/private.tar.gz.age` is the encrypted commit artifact. Writes to `private/` must be intentional, scoped, browsable, and easy to audit without opening raw data.

## Private Vault Layout

Use this layout for generated private content:

```text
private/
  README.md
  _indexes/
    browser-tabs.md
    handoffs.md
    x.md
  _attachments/
    <domain>/...
  <domain>/
    .../*.md
```

Rules:

1. Human-readable Markdown notes live in domain folders such as `private/browser-tabs/brave/` or `private/handoffs/`.
2. Raw exports, JSON, SQLite files, browser session copies, media, and other machine data live under `private/_attachments/<domain>/...` or a domain data directory documented by a README note.
3. Index notes live under `private/_indexes/` and should contain path-level metadata only. Do not put secrets, full URLs, cookies, or raw exports in indexes.
4. Avoid writing mixed note/raw/index folders. A timestamped note can link to timestamped attachments, but should not contain copied binary/session data beside it.

## Markdown Note Contract

Every generated Markdown note under `private/` should include YAML frontmatter:

```yaml
---
title: Example private note
created: 2026-06-06T10:45:09-04:00
updated: 2026-06-06T10:45:09-04:00
type: browser-tabs
source: brave
sensitive: true
tags:
  - private/browser-tabs
related:
  - "[[browser-tabs]]"
attachments:
  - "../../_attachments/browser-tabs/brave/20260606-104509/brave-tabs-full.json"
---
```

Body rules:

- Use one H1 matching `title`.
- Include `## Summary` near the top.
- Use normal Markdown links for files and URLs.
- Use wikilinks for vault notes and indexes, such as `[[browser-tabs]]`.
- Use namespaced tags such as `private/browser-tabs`, `private/handoff`, `private/x`, and `browser/brave`.

## Practical Steps

1. Choose a scoped domain path before writing to `private/`.
2. Write the Markdown note first, then put raw artifacts under `_attachments/`.
3. Update the relevant `_indexes/` note with path-level metadata.
4. Do not stage plaintext paths under `private/`.
5. Let the Dolos pre-commit hook pack diverged `private/` content into the encrypted artifact.
6. After a commit attempt that touches private content, verify that only `.dolos/artifacts/private.tar.gz.age` was staged or committed for the private payload.

## Commit Behavior

The Dolos pre-commit hook:

1. Blocks unsafe staged plaintext paths such as `private/...`.
2. Checks `bin/dolos status`.
3. If `private/` diverged from the encrypted artifact, runs:

   ```bash
   bin/dolos.exe pack private
   git add -- .dolos/artifacts/private.tar.gz.age
   ```

4. Scans the staged set again before allowing the commit.

## Domain Conventions

| Domain | Notes | Attachments / Data | Index |
|--------|-------|--------------------|-------|
| Browser tabs | `private/browser-tabs/brave/<timestamp>.md` | `private/_attachments/browser-tabs/brave/<timestamp>/` | `private/_indexes/browser-tabs.md` |
| Handoffs | `private/handoffs/<timestamp>.md` | `private/_attachments/handoffs/<timestamp>/` | `private/_indexes/handoffs.md` |
| X data | `private/x/README.md` and optional notes | `private/x/` data files or `private/_attachments/x/` exports | `private/_indexes/x.md` |

## Anti-Patterns

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| Force-adding `private/...` | Commits plaintext sensitive data | Commit the encrypted Dolos artifact only |
| Dumping mixed data into `private/` root | Hard to audit and easy to over-include | Use a scoped subdirectory |
| Mixing notes, raw blobs, and indexes in one timestamp folder | Hard to browse in Obsidian and hard to migrate | Put notes in domain folders, raw files in `_attachments`, indexes in `_indexes` |
| Writing secrets to tracked docs for convenience | Bypasses private archive protections | Write to `private/` and reference the path |
| Assuming all private writes belong in a commit | Can include unrelated private changes | Check `bin/dolos.exe status` and capture scope before committing |

## Quick Reference

| Need | Command |
|------|---------|
| Check private/archive state | `bin/dolos.exe status` |
| Manually pack private store | `bin/dolos.exe pack private` |
| Verify staged safety | `bin/dolos.exe scan --staged` |
| Inspect private artifact status | `git status --short -- .dolos private` |

## Notes

The hook packs automatically during commit when Dolos reports `status=diverged`. Manual packing remains useful before reviewing a commit or when no other tracked files are staged.
