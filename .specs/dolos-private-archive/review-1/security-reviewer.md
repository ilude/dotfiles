# Security Review: Dolos Private Archive PRD

## Findings

### HIGH: Recipient/key authorization model is underspecified

- **Evidence:** PRD says `.dolos/authorized_keys` is tracked and `dolos pack` uses all SSH public keys in it, but leaves local SSH fallback as an open question and does not require recipient validation, key provenance, removal handling, or warnings for unrecognized/expired recipients.
- **Required fix:** Before `/plan-it`, require `.dolos/authorized_keys` to be mandatory for MVP, disallow implicit local-key fallback, validate supported SSH key types, fail on empty/invalid recipient sets, and document that removing a recipient only affects future packs and requires repacking.

### HIGH: Decrypted scratch path secrecy and cleanup are not acceptance-tested

- **Evidence:** Requirements say scratch-first and “never print decrypted temp paths unless explicitly needed,” but acceptance criteria only verify promotion safety. There is no requirement to set restrictive permissions, clean scratch after success/failure, avoid world-readable temp files, or protect against other users on the machine.
- **Required fix:** Add requirements/tests that scratch lives under Git private path with `0700` directories and `0600` files where supported, is removed after success/failure, is never logged in normal output, and is not reused unsafely across interrupted runs.

### HIGH: Archive bomb/resource-exhaustion controls are missing

- **Evidence:** Archive validation rejects traversal, links, devices, and collisions, but does not cap file count, total uncompressed bytes, per-file size, path length, manifest size, or gzip/tar expansion ratio. A malicious or corrupted artifact could exhaust disk/memory during validation before safe refusal.
- **Required fix:** Add explicit configurable or MVP fixed limits for maximum files, uncompressed bytes, per-file size, path length, manifest size, and streaming validation behavior. Acceptance tests should include oversized archives that fail before promotion without filling the worktree disk.

### MEDIUM: Rollback/atomic promotion semantics are incomplete

- **Evidence:** PRD says unpack validates then promotes into `private/` only when safe, but does not specify atomic rename strategy, backup behavior, failure recovery if promotion partially fails, or whether existing clean `private/` is replaced, merged, or moved aside.
- **Required fix:** Define promotion as atomic directory swap where possible, with same-filesystem scratch, preflight permission checks, no partial merge, and deterministic rollback/backup behavior if rename/delete fails. Add acceptance tests for interrupted or permission-denied promotion.

### MEDIUM: Git/index race conditions remain possible around `/commit` auto-pack

- **Evidence:** `/commit push` fetches and blocks when upstream `.dolos/artifacts/**` changed, and may auto-pack when local state proves not stale/diverged. The PRD does not require rechecking after pack before commit, locking Dolos state, or preventing concurrent `dolos pack`/`unpack` processes.
- **Required fix:** Require a Dolos lock under Git private path, pre/post-pack status checks, and a final pre-commit verification that the artifact being committed still corresponds to the current `private/` digest and unchanged upstream artifact baseline.

## Recommendation

Do not proceed to implementation planning until the PRD makes key authorization, scratch cleanup/permissions, archive resource limits, atomic rollback, and concurrent commit/pack safety testable acceptance criteria.
