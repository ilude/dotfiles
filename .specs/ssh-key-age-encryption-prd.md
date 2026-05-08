# SSH-Key-Based Repo Encryption PRD

**Date:** 2026-05-08
**Status:** Draft for brainstorming
**Owner:** Personal dotfiles

## Context

This repo may need a safe way to keep private notes, machine-local secrets,
or other sensitive artifacts near the dotfiles without committing plaintext.
The preferred primitive is `age` encrypted to one or more SSH public-key
recipients, with decryption performed by the matching private SSH key.

The install scripts now provision `age` across supported package managers:
WinGet, Homebrew, WSL apt packages, and Linux package-manager setup.

## Goals

- Store encrypted artifacts in the repo without exposing plaintext.
- Use existing personal SSH keys as decryption identity where appropriate.
- Keep decrypted files outside git by default.
- Make the workflow simple enough to run from Windows, macOS, Linux, and WSL.
- Support future recovery by allowing multiple recipients.

## Non-Goals

- Do not commit private SSH keys, decrypted secrets, or `.env` files.
- Do not invent custom cryptography or derive symmetric keys from SSH key bytes.
- Do not require a background filesystem mount for the initial version.
- Do not automatically decrypt during install without explicit user action.

## Users and Use Cases

### Personal user

As the repo owner, I want to encrypt a private directory so I can commit the
ciphertext and decrypt it only on machines where my personal SSH key exists.

### Future machine recovery

As the repo owner, I want to include more than one recipient so losing or
rotating one SSH key does not permanently lock me out.

### Agent-safe workflow

As an agent working in this repo, I need clear guardrails so I never read,
modify, or commit decrypted sensitive content accidentally.

## Proposed Workflow Options

### Option 1: Archive-based encrypted directory

Create a directory such as `.private/`, archive it, encrypt the archive with
`age`, and commit only `.private.tar.age`.

```bash
tar -cf .private.tar .private
age -R ~/.ssh/id_ed25519-personal.pub -o .private.tar.age .private.tar
rm .private.tar
```

Decrypt manually:

```bash
age -d -i ~/.ssh/id_ed25519-personal -o .private.tar .private.tar.age
tar -xf .private.tar
rm .private.tar
```

**Pros:** Simple, portable, minimal dependencies.
**Cons:** Whole archive changes for every edit; merge conflicts are opaque.

### Option 2: Per-file encrypted folder

Keep encrypted files under `.encrypted/`, with one `.age` file per plaintext
file. Decrypt into ignored `.private/` paths.

**Pros:** Smaller diffs and less churn than an archive.
**Cons:** Requires more scripting and path mapping rules.

### Option 3: SOPS with age SSH recipients

Use Mozilla SOPS for structured YAML/JSON/TOML secrets while still using age
recipients.

**Pros:** Excellent for structured secrets and partial diffs.
**Cons:** Extra dependency and less useful for arbitrary binary/private files.

## Recommendation

Start with **Option 1: archive-based encrypted directory** because it is the
smallest cross-platform workflow. Revisit per-file encryption or SOPS only if
archive churn becomes painful.

## Requirements

### R1: Install `age` everywhere this repo manages packages

1. [x] Windows core package configuration includes `FiloSottile.age`.
   - Verification: `Select-String winget/configuration/core.dsc.yaml -Pattern 'FiloSottile.age'`
   - Expected result: one WinGet package entry is present.

2. [x] Homebrew package list includes `age`.
   - Verification: `grep '^brew "age"' Brewfile`
   - Expected result: one Homebrew formula entry is present.

3. [x] Linux and WSL package flows include `age`.
   - Verification: `grep -R "age" scripts/zsh-setup wsl/packages`
   - Expected result: `age` appears in Linux and WSL package arrays.

### R2: Prevent plaintext from being committed

1. [ ] Add repo ignore rules for decrypted working paths.
   - Verification: `git check-ignore .private/ .private.tar`
   - Expected result: both paths are ignored.

2. [ ] Document that agents must not inspect decrypted content unless the user
   explicitly asks and confirms it is safe.
   - Verification: `grep -R "decrypted" AGENTS.md .specs/ssh-key-age-encryption-prd.md`
   - Expected result: guardrail text exists.

### R3: Provide helper commands

1. [ ] Add an encrypt helper that archives an ignored private directory and
   writes a committed `.age` artifact.
   - Verification: run helper against a temp fixture.
   - Expected result: ciphertext exists; plaintext archive is removed.

2. [ ] Add a decrypt helper that restores the private directory only when the
   matching SSH key is available.
   - Verification: run helper with a test age identity.
   - Expected result: directory is restored and archive temp file is removed.

3. [ ] Helpers support multiple recipient files.
   - Verification: run helper with two public keys.
   - Expected result: either matching private key can decrypt.

## Open Questions

- What should the canonical plaintext directory be: `.private/`, `private/`, or
  a more specific path like `secrets/`?
- Should encrypted artifact(s) live at repo root or under `.encrypted/`?
- Which personal SSH public key should be the default recipient?
- Should the workflow generate a dedicated age identity as a recovery key in
  addition to SSH recipients?
- Should install scripts only install `age`, or also validate that the personal
  public key exists?

## Verification Commands

```bash
git diff -- Brewfile winget/configuration/core.dsc.yaml scripts/zsh-setup wsl/packages .specs/ssh-key-age-encryption-prd.md
make test-quick
```
