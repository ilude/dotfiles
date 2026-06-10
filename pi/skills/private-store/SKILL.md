---
name: private-store
description: Private datastore/Dolos workflow. Use when saving, archiving, packing, encrypting, or committing sensitive local private/ files.
---

# Private Store

Routing card for sensitive local data. `private/` is plaintext and gitignored; `.dolos/artifacts/private.tar.gz.age` is the encrypted commit artifact.

## Layout

```text
private/<domain>/...                         # Markdown notes or documented domain data
private/_attachments/<domain>/...            # raw exports, JSON, SQLite, media, session copies
private/_indexes/<domain>.md                 # path-level index, no secrets/full raw data
.dolos/artifacts/private.tar.gz.age          # tracked encrypted archive
```

Generated Markdown notes should include YAML frontmatter with `title`, `created`, `updated`, `type`, `source` when applicable, `sensitive: true`, tags, related index links, and attachment paths. Include a matching H1 and `## Summary`.

## Workflow

1. Choose a scoped domain path before writing.
2. Put human-readable notes in the domain folder and raw artifacts under `_attachments/`.
3. Update the relevant `_indexes/` note with path-level metadata only.
4. Never stage plaintext `private/...` paths.
5. Let Dolos pack diverged private content into the encrypted artifact before commit.

## Commands

```bash
bin/dolos.exe status
bin/dolos.exe pack private
bin/dolos.exe scan --staged
git status --short -- .dolos private
```

## Safety

Do not force-add `private/`, dump mixed data in the root, write secrets to tracked docs, or assume all private changes belong in the next commit. After commit attempts touching private content, verify only the encrypted Dolos artifact is staged/committed for private payload.
