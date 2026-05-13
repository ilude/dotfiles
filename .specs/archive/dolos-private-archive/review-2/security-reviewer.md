---
reviewer: security-reviewer
status: complete
finding_count: 5
---

# Findings

- severity: high
  category: "decrypt/rollback hazard"
  confidence: high
  evidence: "T5 requires scratch-first validation but never defines the final promotion algorithm for replacing an existing non-empty private/ tree. It says 'promote only when safe' and 'refuse no-index dirty cases', but does not require atomic backup/restore of live private/ or crash tests during promotion."
  required_fix: "Specify and test a transactional unpack: validate into scratch, acquire lock, re-check live/index state, move existing private/ to git-private backup, promote scratch, update index last, and rollback on failure. Add crash/failure-injection tests proving old private/ is recoverable and index never marks clean after partial promotion."
- severity: high
  category: "plaintext leakage"
  confidence: high
  evidence: "The plan stores evidence under .specs/... and captures command output, but only forbids normal output printing decrypted temp paths. Validation does not grep evidence/log files for private file names, manifest contents, tar listings, identity paths, or decrypted scratch paths."
  required_fix: "Add an evidence/log hygiene gate: Dolos must have redacted logging by default, tests must use canary secret contents and assert they do not appear in stdout/stderr/evidence, and final no-secret checks must scan .specs evidence plus staged diffs for canary/private data, key paths, and identity material."
- severity: medium
  category: "key handling"
  confidence: medium
  evidence: "Pack uses tracked .dolos/authorized_keys but the plan only tests malformed/empty keys and decryptability. It does not require recipient pinning, duplicate handling, key option/comment parsing behavior, or a human-verifiable recipient summary before rewriting the single archive."
  required_fix: "Define strict authorized_keys parsing: accept only age-supported SSH public key types, reject options/cert/unknown formats, canonicalize/dedupe recipients, and show recipient fingerprints/count in pack/status. Tests must prove adding/removing a key changes recipient set intentionally and cannot be hidden by comments/options."
- severity: medium
  category: "race/remote freshness"
  confidence: medium
  evidence: "T4 says pack refuses stale/diverged artifact states, but the CLI tasks do not define how local .dolos/artifacts/private.tar.gz.age is compared with upstream before overwrite. Remote/worktree cases are deferred mostly to T8/T9, while pack itself may rewrite the sole encrypted archive without fetching or checking upstream artifact ancestry."
  required_fix: "Make pack's safety contract explicit: before artifact promotion, fetch/check configured upstream when present, compare artifact blob OIDs, block behind/diverged/fetch-failure unless an explicit force flag is used, and cover no-upstream/ahead/behind/diverged/fetch-failure in Go or end-to-end tests for the pack command itself."
- severity: medium
  category: "validation gap"
  confidence: high
  evidence: "Validation relies on generated temp repos and says real private/ must not be modified by tests, but it never requires running Dolos status/scan against this actual repository's ignore/attribute/hook configuration after migration."
  required_fix: "Add a non-mutating in-repo validation gate after T7: run bin/dolos status, scan --staged, git check-ignore/check-attr, and hook fixture checks in the real repo with canary staged paths only. Prove private/ remains ignored, only the artifact/key are committable, and hooks cannot pack/decrypt/stage."
