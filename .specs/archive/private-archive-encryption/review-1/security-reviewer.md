- severity: HIGH
  evidence: Plan makes `private.tar.age` committable but never requires `.gitattributes` to mark it `-diff` or prevent diff drivers/textconv from invoking tools that might decrypt or dump archive bytes into review artifacts. Existing review/evidence workflow captures terminal output under `/do-it` evidence, so accidental archive inspection can leak ciphertext metadata or plaintext if a helper is miswired.
  required_fix: Add an explicit `.gitattributes` acceptance criterion: `private.tar.age binary -diff -merge`, no textconv/filter, and validation via `git check-attr diff merge filter textconv -- private.tar.age`.

- severity: HIGH
  evidence: Decrypt helper acceptance only says “refuses overwrite unless explicitly requested.” It does not require a backup/snapshot of existing `private/` before forced overwrite. A wrong identity/archive, stale `private.tar.age`, or mistaken `--force` can destroy newer local plaintext with no recovery.
  required_fix: Require forced decrypt to create a timestamped ignored backup or refuse unless `--backup-created`/explicit backup path exists; add tests proving existing `private/` is preserved on failed decrypt and backed up before overwrite.

- severity: MEDIUM
  evidence: Conflict resolver may extract base/ours/theirs plaintext and has `--keep-temp`. The plan says restrictive temp storage “where practical” but does not require temp roots to be outside the repo. If temp or kept files land under the repo, `git status`, review artifacts, or broad evidence capture can expose secret paths/content.
  required_fix: Require temp plaintext under OS temp with 0700 permissions, never under the worktree; make `--keep-temp` print only path metadata, warn loudly, and add validation that no decrypted conflict temp paths appear under repo root.

- severity: MEDIUM
  evidence: Scanner tests only cover path names. Archive workflows can produce plaintext tarballs with variant names (`private.tar.gz`, `private-*.tar`, `.private.tar`, conflict sidecar copies) and helper logs/manifests may include sensitive file names from `private/handoffs/`.
  required_fix: Expand scanner/blocklist criteria to reject common private archive/temp variants and forbid content-bearing manifests; conflict manifests must contain relative paths only if explicitly accepted as non-sensitive, otherwise hashed/redacted path identifiers.

- severity: MEDIUM
  evidence: Completion allows age-dependent tests to skip if `age` is missing, while final validation still claims full completion. That creates an archive-gate safety gap: encryption, multi-recipient decrypt, and conflict re-encrypt behavior could be untested on the implementation environment.
  required_fix: Make `age` availability a hard prerequisite for F1/F2 completion. If missing, plan status must remain blocked, not complete; add preflight failure criteria that stop before archiving the plan.
