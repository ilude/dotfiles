# Backend Dev Go State-Machine Review

## Finding 1
- **severity:** high
- **evidence:** T3 says implement “PRD state table,” but this plan does not embed the actual command/state contract: local digest, artifact digest, remote freshness, dirty private tree, missing artifact, missing index, and allowed transitions per command.
- **required_fix:** Add a compact state-transition matrix to the plan for `status`, `pack`, `unpack`, and `init --force`, including exit codes and whether artifact/index/private are allowed to mutate.

## Finding 2
- **severity:** high
- **evidence:** T4/T5/T6 are parallel after V1, but pack, unpack, status, and locking all depend on shared index semantics and mutation ordering. Parallel implementation invites divergent interpretations and untestable coupling.
- **required_fix:** Split Wave 2 into shared state/lock transaction API first, then pack/unpack/scan commands against that API, or make T4-T6 explicitly depend on a single transaction contract artifact.

## Finding 3
- **severity:** medium
- **evidence:** Atomic promotion is required for artifacts and index, but partial failure recovery is only tested broadly. There is no required crash-point matrix for: encrypted temp written, artifact renamed, index write started, index rename completed, scratch cleanup failed.
- **required_fix:** Add crash/partial-failure tests with injectable filesystem failures and require recovery rules for orphan temp files, stale locks, artifact/index mismatch, and retry behavior.

## Finding 4
- **severity:** medium
- **evidence:** Go layout is `internal/dolos/*.go` plus `main.go`, but command parsing, filesystem/git adapters, age encryption, tar validation, and pure state derivation are not separated. This risks tests that shell out or need real repos for core state checks.
- **required_fix:** Require packages/interfaces for pure state model, archive validation, Git paths/index store, crypto adapter, and CLI layer; unit-test pure packages without `age`, Docker, or Git.

## Finding 5
- **severity:** medium
- **evidence:** Command contract says `scan --staged` or equivalent and `init --force --pack`, but accepted flags, stdout/stderr wording, and exit-code classes are unspecified. Hook integration will become brittle if tests assert vague behavior only.
- **required_fix:** Define CLI usage, stable machine-checkable exit codes, and minimal hook-facing output contract before implementation; require tests for unknown archive names, missing Git repo, missing `age`, and unsupported identities.
