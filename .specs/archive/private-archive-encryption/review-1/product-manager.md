- severity: high
  evidence: "Plan selects whole-archive encryption and then adds a bespoke conflict resolver (T3) with stage extraction, decrypt/unpack of base/ours/theirs, directory-level merge decisions, sidecars, re-encryption, cleanup, and `--keep-temp`. Existing scripts are simple per-file `x-private-*` helpers and already block `private/` plus non-age `private-encrypted/` paths."
  required_fix: "Reduce v1 to archive encrypt/decrypt/scan plus a documented manual conflict playbook, or switch to the existing per-file encrypted mirror. Defer automated conflict resolution until real conflict frequency proves the cost."

- severity: high
  evidence: "Objective says all secrets, configs with keys, PII, mined/logged data, and `/handoff` output move under `private/`, but the acceptance criteria only verify path blocking, archive round-trip, recipients, and synthetic conflicts. No migration inventory, data taxonomy, or operator command answers what currently moves and what stays."
  required_fix: "Add a small inventory/migration task: enumerate candidate private paths by category, define explicit in/out rules, and provide one wrapper/report that tells the operator what to move without reading secret contents."

- severity: medium
  evidence: "T2 creates new `scripts/private-archive-*` while existing `scripts/x-private-encrypt`, `x-private-decrypt`, `x-private-scan`, `install-x-private-hook`, and `pre-commit-x-private` remain. The plan says wrappers may be retained or deprecated, which allows two conflicting workflows and hook names."
  required_fix: "Make compatibility non-optional: either update existing x-private scripts into thin wrappers around the archive scanner/encrypt/decrypt, or remove/deprecate them with tests proving only one hook/scanner policy is active."

- severity: medium
  evidence: "Operator friction is under-specified. The plan requires several scripts and manual sequencing, but no single status/preflight command confirms: age installed, recipients present, `private/` ignored, archive current relative to plaintext, hook installed, and no plaintext staged."
  required_fix: "Add `scripts/private-archive-status` or a `--check` mode used by tests and docs. It should fail closed with actionable messages and avoid decrypting or printing private content."

- severity: medium
  evidence: "The plan requires `private.tar.age` to be committable, but does not decide whether the repo should actually track a personal encrypted blob. In a public/shared dotfiles repo, committing opaque personal PII archives can create permanent retention and accidental distribution risk even when encrypted."
  required_fix: "Add an explicit product decision: track `private.tar.age` by default, keep it untracked/local, or support both via documented mode. Include acceptance criteria for `.gitignore`, docs, and scanner behavior matching that decision."
