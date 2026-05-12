---
created: 2026-05-12
status: draft
---

# PRD: Dolos Private Archive Workflow

## Problem

The current private archive workflow mixes Git hooks, age encryption, ignored plaintext data, and staged encrypted artifacts in ways that can fail unrelated commits and mutate the Git index unexpectedly. Operators need a safer workflow for keeping `private/` untracked while committing an encrypted archive only when private data changes, without overwriting local private edits after pull.

## Users / Jobs To Be Done

- Primary user: dotfiles repo operator using Git, `/commit`, and private local data across machines.
- Job/story: keep `private/` plaintext local and gitignored, sync it through a tracked age-encrypted artifact, and detect stale/diverged private archive state before pack or unpack.
- Current workaround: Python `private-archive-*` scripts and a pre-commit hook that auto-encrypts/stages `.encrypted/`, requiring age recipients during unrelated commits.

## Operator Journeys

1. **First-time setup with no private tree**
   - Start: no `private/`, no `.dolos/artifacts/private.tar.gz.age`.
   - Command: `bin/dolos init`.
   - Expected: creates empty `private/`, creates local Dolos state as initialized/needs-pack, and does not encrypt, decrypt, or stage files.

2. **Bootstrap existing local private data**
   - Start: non-empty `private/`, no artifact, no local Dolos index.
   - Command: `bin/dolos init --force --pack`.
   - Expected: validates `.dolos/authorized_keys`, packs `private/` to `.dolos/artifacts/private.tar.gz.age`, and writes a local index entry.

3. **Fresh clone restore**
   - Start: tracked artifact exists, `private/` missing, no local Dolos index.
   - Commands: `bin/dolos status`, then `bin/dolos unpack private`.
   - Expected: status reports source-missing/artifact-present; unpack decrypts to Git-dir scratch, validates, promotes to `private/`, and writes local index.

4. **Normal edit and commit**
   - Start: artifact and local index match `private/`.
   - Command: edit files under `private/`, run `bin/dolos status`, run `bin/dolos pack private` or let `/commit` Phase 2 auto-pack when safe.
   - Expected: status reports private-changed; pack refuses if the artifact changed relative to the local index, otherwise writes a new artifact and updates the index.

5. **Pull/update with remote artifact change**
   - Start: local `private/` matches index; checked-out artifact changes after pull/rebase.
   - Command: `bin/dolos status`, then `bin/dolos unpack private`.
   - Expected: status reports artifact-changed; unpack is allowed only because current `private/` matches the previous index digest.

6. **Divergence**
   - Start: local `private/` changed and artifact changed relative to the local index.
   - Command: `bin/dolos status` or `bin/dolos unpack private`.
   - Expected: status reports diverged; unpack and auto-pack refuse without overwriting or staging.

## Goals

1. Provide a Go `bin/dolos` CLI that manages one MVP archive: `private/` through `.dolos/artifacts/private.tar.gz.age`.
2. Preserve normal Git workflows while making private archive sync state explicit and safe.
3. Use convention-over-configuration for MVP paths and SSH key conventions for age encryption.
4. Replace the old `.encrypted/` private archive workflow with Dolos.
5. Phase delivery so standalone Dolos commands are validated before `/commit` auto-pack integration is enabled.

## Non-Goals

- No automatic three-way merge for arbitrary private files in MVP.
- No SOPS, git-crypt, clean/smudge filters, or transparent Git encryption.
- No auto-pack/decrypt from Git hooks in MVP; hooks may warn/block only.
- No support for multiple archives in MVP. MVP may use per-archive internal data structures and the reserved convention `.dolos/artifacts/<name>.tar.gz.age`, but user-facing commands only need to accept `private`.
- No implicit local public-key fallback for packing. `.dolos/authorized_keys` is mandatory for MVP.

## Requirements

### Functional Requirements

- `bin/dolos` is a Go CLI built using the existing `claude/claude-status-go` Docker build pattern (`Dockerfile`, `build.sh`, `GOOS`, `GOARCH`, `BINARY`) or a shared/generalized equivalent.
- The build output must be repo/install-managed as `bin/dolos` on POSIX-like targets and `bin/dolos.exe` on Windows targets; it must not install to client-specific paths such as `~/.claude`.
- MVP convention:
  - Archive name: `private`.
  - Source: `private/`.
  - Artifact: `.dolos/artifacts/private.tar.gz.age`.
  - Public encryption keys: tracked `.dolos/authorized_keys` containing one or more supported SSH public keys.
  - Local state/scratch/locks: `git rev-parse --git-path dolos/...`.
- `.dolos/authorized_keys` is required for pack. Empty, missing, malformed, unsupported, or duplicate-only key sets fail before artifact output is promoted.
- Pack encrypts to every valid SSH public key in `.dolos/authorized_keys`; removing a key only affects future packs and requires repacking before that key loses access to the latest artifact.
- Unpack uses age-supported SSH private identities discovered by SSH-like defaults plus explicit `--identity <path>` overrides. The implementation plan must verify exact age CLI/library behavior; unsupported encrypted key or agent flows must fail with actionable messages.
- `dolos init` creates `private/` only when missing or empty; it errors if `private/` is non-empty or an artifact already exists.
- `dolos init --force` initializes tracking for existing `private/` but reports it as needing pack; it must not mark the archive clean.
- `dolos init --force --pack` initializes existing `private/`, packs, writes the artifact, and updates local Dolos index.
- `dolos status` discovers tracked artifacts first and reports states using a defined precedence table over: source existence/digest, artifact existence/digest, manifest validity, local index presence, and upstream artifact freshness.
- `dolos pack private` creates `.dolos/artifacts/private.tar.gz.age` from `private/`, using all SSH public keys in `.dolos/authorized_keys` as age recipients.
- `dolos pack private` refuses by default if the current artifact differs from the local index, if the current state is diverged, or if the artifact manifest is invalid. Any future force mode must be explicitly named and out of MVP unless planned separately.
- `dolos unpack private` decrypts to Git-dir scratch first, validates, then promotes into `private/` only when safe.
- If `private/` exists and Dolos has no local index entry, `dolos unpack private` errors.
- If both current `private/` and artifact changed relative to local index, Dolos reports diverged and does not overwrite.
- Local Dolos state is per-worktree. Use `git rev-parse --git-path dolos/index.json`, not `--git-common-dir`, for the MVP index unless a later plan explicitly changes this.
- Minimum local index entry fields:
  - `version`
  - `archives.private.sourcePath`
  - `archives.private.artifactPath`
  - `archives.private.initialized`
  - `archives.private.sourceTreeDigest`
  - `archives.private.artifactDigest`
  - `archives.private.manifestDigest`
  - `archives.private.manifestVersion`
  - `archives.private.lastSyncDirection` (`pack` or `unpack`)
  - optional timestamps for diagnostics only, never for correctness.
- Digest fields (`sourceTreeDigest`, `artifactDigest`, `manifestDigest`, `manifestVersion`, `lastSyncDirection`) are nullable or omitted until the first successful `pack` or `unpack`. `initialized: true` without all clean digest fields means tracked-but-dirty/needs-pack, never clean.
- Index update rules:
  - `init`: creates tracking state only when safe, without clean digests unless pack/unpack succeeds.
  - successful `pack`: update source tree digest, artifact digest, manifest digest/version, and sync direction after atomic artifact replace.
  - failed `pack`: do not update clean digests.
  - successful `unpack`: update source tree digest, artifact digest, manifest digest/version, and sync direction after safe promotion.
  - failed `unpack`: do not update clean digests.
  - missing/deleted artifact: status must not silently mark clean.
- `/commit` integration is Phase 2. Phase 1 implements explicit `bin/dolos` commands and hook safety only. Phase 2 may auto-run `dolos pack private` when safe.
- `/commit` freshness algorithm for Phase 2:
  - If no upstream exists, skip remote freshness blocking because there is no remote tracking ref to compare.
  - If upstream exists, fetch the upstream remote (or `git fetch --all --prune` if the implementation already does that safely).
  - Resolve `@{upstream}` and `merge-base HEAD @{upstream}`.
  - If `git diff --name-only <merge-base>..@{upstream} -- .dolos/artifacts/` returns any path, hard-block auto-pack and tell the user to pull/rebase and run `bin/dolos status`.
  - If the branch is behind only on unrelated files, warn but do not hard-block non-private commits.
  - Fetch failure must block auto-pack but should not block unrelated non-private commits unless the surrounding `/commit push` policy already requires fetch.
- `/commit` may auto-run `dolos pack private` only when local Dolos state proves the artifact is not stale/diverged and after a Dolos lock is acquired. It must recheck status before staging/committing the artifact.
- Git hooks must not pack, decrypt, stage, or mutate Dolos state. Hooks may only block/warn on staged plaintext private paths or unsafe artifacts.
- Existing private archive scripts/hooks/tests must be migrated or removed so `.encrypted/` per-file private archive assumptions go away.
- Migration inventory must include at least `.gitignore`, `.gitattributes`, `scripts/git-hooks/pre-commit-x-private`, `scripts/install-x-private-hook`, `scripts/private-archive-*`, `scripts/x-private-*`, `scripts/private_archive_lib.py`, `test/test_private_archive.py`, and `pi/prompts/handoff.md`.
- Compatibility wrappers, if retained, must call `bin/dolos` or print a deprecation/error message; they must not auto-encrypt/stage `.encrypted/`.

### State Model Requirements

The implementation plan must define a status truth table. The PRD-level expected precedence is:

| Condition | Status | Pack | Unpack |
|-----------|--------|------|--------|
| no source, no artifact | uninitialized | error until init/source exists | error |
| source exists, no artifact, no clean index | needs-pack | allowed after init/force semantics | error |
| artifact exists, source missing, no index | source-missing/artifact-present | error | allowed |
| source exists, artifact exists, no index | unknown/no-index | error | error |
| source digest equals index and artifact digest equals index | clean | no-op or repack only if explicit | no-op |
| source digest differs, artifact digest equals index | private-changed | allowed | error |
| source digest equals index, artifact digest differs | artifact-changed | error | allowed |
| source digest differs and artifact digest differs | diverged | error | error |
| artifact manifest invalid or digest mismatch | invalid-artifact | error | error |

### Non-Functional Requirements

- Never commit plaintext `private/` content.
- Never print private file contents, private keys, or decrypted temp paths in normal output.
- Decryption must always be scratch-first; never extract directly into live `private/`.
- Scratch directories must live under `git rev-parse --git-path dolos/tmp` or equivalent Git private path, use restrictive permissions where supported (`0700` dirs, `0600` files), and be cleaned after success/failure unless an explicit debug flag is added in a later plan.
- Dolos must use a lock under Git private path to prevent concurrent `pack`, `unpack`, and status-mutating operations from corrupting index/artifact state.
- Archive validation must reject absolute paths, `..`, backslashes, empty names, duplicate normalized paths, symlinks, hardlinks, devices, FIFOs, sockets, and path collisions.
- Archive/resource validation must enforce MVP limits before promotion: maximum 10,000 regular files, maximum 512 MiB total uncompressed bytes, maximum 128 MiB per file, maximum 240 characters per normalized relative path, and maximum 10 MiB manifest size. These limits may become configurable later, but MVP tests must use these exact defaults.
- Tree digest must be deterministic: normalized relative paths, sorted order, regular-file content hashes, size, and executable-bit mode where applicable.
- The encrypted archive must include a manifest such as `.dolos-manifest.json` with version, archive name, source path, artifact path, tree digest, file count, total bytes, created timestamp, tool name, and tool version.
- Pack writes to temporary files, validates the artifact/manifest relationship, and atomically replaces `.dolos/artifacts/private.tar.gz.age`.
- Unpack validates in scratch, verifies manifest/tree digest, preflights promotion permissions, preserves existing `private/` until final promotion, and remains recoverable if interrupted.
- Local state must live under Git’s private path via `git rev-parse --git-path dolos/index.json` so linked worktrees are handled safely.
- `.dolos/artifacts/*.tar.gz.age` must be tracked and marked binary `-diff -merge` in `.gitattributes`.
- `.dolos/authorized_keys` must be tracked as text.
- No working-tree `.dolos` scratch/cache/state files may be created outside tracked artifact/key files.

## Acceptance Criteria

1. [ ] `bin/dolos` builds via Docker using the existing status-bar Go build pattern or a shared equivalent.
   - Verify: run the Dolos build script on the current platform.
   - Pass: executable is produced as `bin/dolos` or `bin/dolos.exe` and reports `dolos --help`.
   - Fail: build writes to client-specific paths such as `~/.claude`, requires unrelated tooling, or duplicates incompatible build conventions.

2. [ ] Dolos packs `private/` into `.dolos/artifacts/private.tar.gz.age` using mandatory tracked SSH public keys.
   - Verify: create temp SSH keypair fixtures, write `.dolos/authorized_keys`, run `bin/dolos pack private`, and decrypt with each matching private key.
   - Pass: artifact exists; every listed keypair can decrypt; malformed/empty/missing `.dolos/authorized_keys` fails before artifact promotion; no `recipients.txt` is read.
   - Fail: artifact is missing, decrypts for only one listed key, accepts malformed keys, or relies on local public-key fallback.

3. [ ] Dolos unpack is scratch-first, private, and overwrite-safe.
   - Verify: run `bin/dolos unpack private` with missing, clean, dirty, no-index, corrupt archive, and permission-denied cases; include sentinel files in live `private/`.
   - Pass: only safe cases promote to `private/`; unsafe cases error without modifying sentinel content/tree digest; scratch is under Git private path, permission-restricted where supported, and cleaned after success/failure.
   - Fail: direct extraction, leaked temp paths in normal output, world-readable scratch on supported platforms, or partial overwrite occurs.

4. [ ] Dolos rejects malicious or resource-exhausting archives.
   - Verify: create fixture archives with absolute paths, `..`, backslashes, duplicate normalized paths, symlinks, hardlinks, devices/FIFOs/sockets where platform-supported, path collisions, oversized manifest, too many files, too-large file, and excessive total uncompressed size.
   - Pass: every fixture fails before promotion and leaves live `private/` unchanged.
   - Fail: any unsafe fixture extracts, partially promotes, or exhausts disk/memory before refusal.

5. [ ] Dolos status implements the state table deterministically.
   - Verify: run fixture cases for every row in the PRD state model.
   - Pass: status, pack allowance, and unpack allowance match the table; exit codes are documented and tested.
   - Fail: ambiguous/no-index/diverged cases are reported as clean or allowed to mutate state.

6. [ ] Dolos detects divergence.
   - Verify: pack once, mutate `private/`, mutate artifact fixture, then run `bin/dolos status`, `bin/dolos pack private`, and `bin/dolos unpack private`.
   - Pass: status reports diverged; pack and unpack refuse; live `private/` and artifact are not overwritten.
   - Fail: local private changes are overwritten or artifact is repacked blindly.

7. [ ] Phase 2 `/commit` private freshness behavior is specified and testable before implementation.
   - Verify: simulate real temporary origin/clone refs with commits for unrelated files and `.dolos/artifacts/**`; test no-upstream, fetch-failure, behind-only, ahead-only, and diverged cases.
   - Pass: auto-pack hard-blocks when upstream artifact changes exist; unrelated behind state warns only; no-upstream skips remote blocking; fetch failure blocks auto-pack only.
   - Fail: stale private artifact can be overwritten by auto-pack or unrelated remote changes block all non-private commits.

8. [ ] Git/worktree and hook boundaries are enforced.
   - Verify: create linked worktree fixtures and active hook fixtures; run Dolos status/pack/unpack and unrelated commits.
   - Pass: local index is per-worktree; hooks never pack/decrypt/stage; hooks block plaintext `private/` staging; unrelated commits do not require age keys.
   - Fail: linked worktrees share unsafe clean state, hooks mutate artifacts, or unrelated commits fail due missing Dolos keys.

9. [ ] Old `.encrypted/` private workflow is removed or compatibility-wrapped into Dolos.
   - Verify: inspect the migration inventory paths and run private workflow tests.
   - Pass: tests and docs point to Dolos artifact workflow; retained wrappers call `bin/dolos` or clearly deprecate; old hook no longer auto-encrypts/stages `.encrypted/`.
   - Fail: active code still stages `.encrypted/`, requires old `recipients.txt`, or silently follows old per-file encryption semantics.

10. [ ] Git tracking metadata is correct.
   - Verify: run `git check-ignore` and `git check-attr` for `.dolos/authorized_keys`, `.dolos/artifacts/private.tar.gz.age`, and representative Git-private state paths where applicable.
   - Pass: authorized keys and artifact are committable; artifact is binary `-diff -merge`; no worktree scratch/cache is committable.
   - Fail: artifact is ignored, diff/merge treats it as text, or local state can be committed.

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
| SSH recipient lookup ambiguity | Pack may encrypt to wrong or incomplete key set | Make `.dolos/authorized_keys` mandatory; no implicit local public-key fallback in MVP |
| Recipient removal misunderstanding | Removed user/key can decrypt old artifacts | Document that removal affects future packs only and requires repacking |
| Tar traversal/symlink attack | Decrypt could overwrite arbitrary files | Strict validation before extraction and scratch-first flow |
| Archive bomb/resource exhaustion | Malicious/corrupt artifact could exhaust disk/memory | Enforce file count, size, path, manifest, and total uncompressed limits before promotion |
| Lost local Dolos index | Tool cannot know whether `private/` matches artifact | Refuse unsafe unpack when `private/` exists without index |
| Commit after pack fails | Local index may say clean while commit did not land | Status compares current digests and remains retryable; deeper recovery deferred unless it becomes real pain |
| Multi-machine stale artifact | User overwrites newer private artifact | Phase 2 `/commit` fetches and hard-blocks auto-pack when upstream `.dolos/artifacts/**` changed |
| Concurrent operations | Pack/unpack/index operations race | Use Git-private Dolos lock and pre/post status checks |

## Open Questions

- Should conflict helper commands be included in MVP, or only status/error guidance?
- Should old `scripts/private-archive-*` remain compatibility wrappers to `bin/dolos` for one release, or should they fail with migration instructions?

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
  - Start by inventorying existing private archive scripts/tests, Git ignore/attribute rules, active hooks, and `claude/claude-status-go` build structure.
  - Prefer convention-over-configuration and avoid adding YAML/JSON user config in MVP.
  - Phase implementation: standalone `bin/dolos` commands and migration first; `/commit` auto-pack integration second.
  - Treat archive validation, Git-dir local state, `.dolos/authorized_keys`, scratch cleanup, and stale-artifact blocking as core safety requirements.
