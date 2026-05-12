---
created: 2026-05-12
status: draft
---

# PRD: Dolos Private Archive Workflow

## Problem

The current private archive workflow mixes Git hooks, age encryption, ignored plaintext data, and staged encrypted artifacts in ways that can fail unrelated commits and mutate the Git index unexpectedly. Operators need a safer workflow for keeping `private/` untracked while committing an encrypted archive only when private data changes.

## Users / Jobs To Be Done

- Primary user: dotfiles repo operator using Git, `/commit`, and private local data across machines.
- Job/story: keep `private/` plaintext local and gitignored, sync it through a tracked age-encrypted artifact, and avoid overwriting local private edits after pull.
- Current workaround: Python `private-archive-*` scripts and a pre-commit hook that auto-encrypts/stages `.encrypted/`, requiring age recipients during unrelated commits.

## Goals

1. Provide a Go `bin/dolos` CLI that manages `private/` through a tracked encrypted archive.
2. Preserve normal Git workflows while making private archive sync state explicit and safe.
3. Use convention-over-configuration for MVP paths and SSH key conventions for age encryption.
4. Replace the old `.encrypted/` private archive workflow with Dolos.

## Non-Goals

- No automatic three-way merge for arbitrary private files in MVP.
- No SOPS, git-crypt, clean/smudge filters, or transparent Git encryption.
- No auto-pack/decrypt from Git hooks in MVP; hooks may warn/block only.
- No support for multiple archives in MVP, though the design must not block future `.dolos/artifacts/<name>.tar.gz.age` archives.

## Requirements

### Functional Requirements

- `bin/dolos` is a Go CLI built using the existing `claude/claude-status-go` Docker build pattern (`Dockerfile`, `build.sh`, `GOOS`, `GOARCH`, `BINARY`) or a shared/generalized equivalent.
- MVP convention:
  - Source: `private/`
  - Artifact: `.dolos/artifacts/private.tar.gz.age`
  - Public encryption keys: tracked `.dolos/authorized_keys` containing SSH public keys.
  - Local state/scratch: `git rev-parse --git-path dolos/...`.
- `dolos init` creates `private/` only when missing or empty; it errors if `private/` is non-empty or an artifact already exists.
- `dolos init --force` initializes tracking for existing `private/` but reports it as needing pack.
- `dolos init --force --pack` initializes existing `private/`, packs, writes the artifact, and updates local Dolos index.
- `dolos status` discovers tracked artifacts first and reports states including clean, needs-pack, source-missing/artifact-present, artifact-changed, private-changed, diverged, and unknown/no-index.
- `dolos pack private` creates `.dolos/artifacts/private.tar.gz.age` from `private/`, using all SSH public keys in `.dolos/authorized_keys` as age recipients.
- `dolos unpack private` decrypts to Git-dir scratch first, validates, then promotes into `private/` only when safe.
- If `private/` exists and Dolos has no local index entry, `dolos unpack private` errors.
- If both current `private/` and artifact changed relative to local index, Dolos reports diverged and does not overwrite.
- `/commit push` integration should run `git fetch --all --prune` when an upstream exists, warn when generally behind, and hard-block auto-pack if upstream changed anything under `.dolos/artifacts/**`.
- `/commit` may auto-run `dolos pack private` only when local Dolos state proves the artifact is not stale/diverged.
- Existing private archive scripts/hooks/tests must be migrated or removed so `.encrypted/` per-file private archive assumptions go away.

### Non-Functional Requirements

- Never commit plaintext `private/` content.
- Never print private file contents, private keys, or decrypted temp paths unless explicitly needed for diagnostics.
- Decryption must always be scratch-first; never extract directly into live `private/`.
- Archive validation must reject absolute paths, `..`, backslashes, empty names, duplicate normalized paths, symlinks, hardlinks, devices, FIFOs, sockets, and path collisions.
- Tree digest must be deterministic: normalized relative paths, sorted order, regular-file content hashes, size, and executable-bit mode where applicable.
- The encrypted archive must include a manifest such as `.dolos-manifest.json` with version, archive name, source path, artifact path, tree digest, file count, created timestamp, tool name, and tool version.
- Local state must live under Git’s private path via `git rev-parse --git-path dolos/index.json` so worktrees are handled safely.

## Acceptance Criteria

1. [ ] `bin/dolos` builds via Docker using the existing status-bar Go build pattern or a shared equivalent.
   - Verify: run the Dolos build script on the current platform.
   - Pass: executable is produced at the expected path and reports `dolos --help`.
   - Fail: build requires unrelated tooling or duplicates incompatible build conventions.

2. [ ] Dolos packs `private/` into `.dolos/artifacts/private.tar.gz.age` using SSH public keys.
   - Verify: create temp SSH keypair fixtures, write `.dolos/authorized_keys`, run `bin/dolos pack private`.
   - Pass: artifact exists and decrypts with the matching private key.
   - Fail: artifact is missing, cannot decrypt, or requires `recipients.txt`.

3. [ ] Dolos unpack is scratch-first and overwrite-safe.
   - Verify: run `bin/dolos unpack private` with missing, clean, dirty, and no-index `private/` cases.
   - Pass: only safe cases promote to `private/`; unsafe cases error without modifying `private/`.
   - Fail: direct extraction or overwrite occurs.

4. [ ] Dolos detects divergence.
   - Verify: pack once, mutate `private/`, mutate artifact fixture, then run `bin/dolos status` and `bin/dolos unpack private`.
   - Pass: status reports diverged and unpack refuses.
   - Fail: local private changes are overwritten or artifact is repacked blindly.

5. [ ] `/commit` private freshness behavior is specified and testable.
   - Verify: simulate upstream artifact changes under `.dolos/artifacts/**`.
   - Pass: `/commit` hard-blocks auto-pack when upstream artifact changes exist and only warns for unrelated behind state.
   - Fail: stale private artifact can be overwritten by auto-pack.

6. [ ] Old `.encrypted/` private workflow is removed or compatibility-wrapped into Dolos.
   - Verify: search for active `.encrypted/` private archive assumptions and run private workflow tests.
   - Pass: tests and docs point to Dolos artifact workflow.
   - Fail: old hook still auto-encrypts/stages `.encrypted/`.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Keep pre-commit auto-encryption | Always refreshes artifact | Breaks unrelated commits; mutates index; requires keys at commit time | Rejected |
| Per-file `.encrypted/**/*.age` | Path-level Git changes | More moving parts; leaks path structure; drifted from desired archive model | Rejected for MVP |
| Single `.dolos/artifacts/private.tar.gz.age` | Simple artifact; manifest fits naturally | Binary artifact rewrites on any change | Selected |
| SOPS/git-crypt | Existing secret workflows | Not aligned with ignored `private/` plus explicit archive sync | Rejected |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| SSH recipient lookup ambiguity | Pack may encrypt to wrong or incomplete key set | Require tracked `.dolos/authorized_keys`; local SSH key fallback only if explicitly designed/tested |
| Tar traversal/symlink attack | Decrypt could overwrite arbitrary files | Strict validation before extraction and scratch-first flow |
| Lost local Dolos index | Tool cannot know whether `private/` matches artifact | Refuse unsafe unpack when `private/` exists without index |
| Commit after pack fails | Local index may say clean while commit did not land | Defer unless real pain; status should compare current digests and remain retryable |
| Multi-machine stale artifact | User overwrites newer private artifact | `/commit` fetches and hard-blocks when upstream `.dolos/artifacts/**` changed |

## Open Questions

- Should local SSH public-key fallback for pack exist, or should `.dolos/authorized_keys` be mandatory?
- Should conflict helper commands be included in MVP, or only status/error guidance?
- Should old `scripts/private-archive-*` remain compatibility wrappers to `bin/dolos` for one release?

## Plan Handoff

- Recommended next command:
  ```bash
  /plan-it .specs/dolos-private-archive/PRD.md
  ```
- Review command:
  ```bash
  /review-it .specs/dolos-private-archive/PRD.md
  ```
- Notes for planner:
  - Start by inventorying existing private archive scripts/tests and `claude/claude-status-go` build structure.
  - Prefer convention-over-configuration and avoid adding YAML/JSON config in MVP.
  - Treat archive validation, Git-dir local state, and `/commit` stale-artifact blocking as core safety requirements.
