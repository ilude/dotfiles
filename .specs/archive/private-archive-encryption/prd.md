# PRD: Generalized Private Archive Encryption

## Objective

Provide a repo-wide private archive workflow that keeps plaintext private data local under `private/` while storing a single encrypted artifact, `private.tar.age`, in Git.

## Requirements

- `private/` is the canonical plaintext location and remains gitignored.
- `private/handoffs/` is the canonical destination for `/handoff` outputs.
- `private.tar.age` is the canonical encrypted archive and is intentionally committable.
- Helper commands:
  - `scripts/private-archive-encrypt` archives `private/` and encrypts to `private.tar.age`.
  - `scripts/private-archive-decrypt --identity <file>` restores to `private/` and refuses overwrites unless `--force` is used.
  - `scripts/private-archive-scan --staged|--paths-from <file>` blocks plaintext private paths in hooks and tests.
  - `scripts/private-archive-status` reports prerequisites, recipients, archive metadata, hook presence, and staged plaintext count without decrypting.
  - `scripts/private-archive-conflict-resolve --identity <file>` resolves Git conflict stages by decrypting stages to temporary directories, merging directory contents, and re-encrypting.
- `config/age/recipients.txt` stores public age recipients; tests generate temporary identities and recipients only.

## Inventory and retention

See `private-inventory.md` for the non-secret inventory. In scope categories include secrets, configs with keys, PII, logs, mined personal data, and `/handoff` output files. Because `private.tar.age` is tracked by default, encrypted historical retention is a conscious tradeoff: Git history may preserve older encrypted PII/secrets until history is rewritten. Rotate exposed credentials and avoid committing data whose encrypted retention is unacceptable.

## Guardrails

- Plaintext paths and temporary archives are ignored: `private/`, `private.tar`, `private.tar.gz`, `.private.tar`, `private-merge.tar`, and `private.conflicts/`.
- `private.tar.age` is marked binary with `-diff -merge` in `.gitattributes`; ciphertext must not be text-merged.
- The pre-commit hook invokes `scripts/private-archive-scan` to block plaintext private paths and allow only `private.tar.age`.
- Archive extraction validates tar members and rejects absolute paths, `..`, links, and device nodes.
- Helpers use subprocess argument lists, temp files, atomic replacement, and cleanup; they do not print private file contents.

## Conflict resolution

Ciphertext conflicts are resolved explicitly, never by direct merge. The resolver detects real Git stages for `private.tar.age`, decrypts base/ours/theirs with an identity into OS temp space, validates/unpacks tar files, performs a path-level directory merge, writes path-only conflict manifests under `private.conflicts/` for overlaps, re-encrypts non-overlapping fixture resolutions, and cleans temp plaintext unless `--keep-temp` is explicitly requested.

## Validation

Focused tests cover scanner policy, hook install, encrypt/decrypt, multiple recipients, status output, malicious tar rejection, atomic/failure behavior, temp isolation, and real Git conflict stages. Repo validation requires `make check`, `age --version`, `age-keygen -version`, and `uv run pytest test/test_private_archive.py -q` with no age-dependent skips.

## Migration note

This PRD supersedes the older SSH-key/X-specific age-encryption concept. The selected v1 design is archive-based and generalized around `private/` plus `private.tar.age`; existing `x-private-*` commands are compatibility wrappers for the archive helpers.
