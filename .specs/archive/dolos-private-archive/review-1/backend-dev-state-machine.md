# Backend Dev State-Machine Review

## Finding 1 — High: local index contract is underspecified
Evidence: PRD requires `git rev-parse --git-path dolos/index.json` and states like clean/dirty/diverged/no-index, but does not define index schema, fields, per-archive identity, or when pack/unpack/init update it.
required_fix: Specify minimum index entry contract: archive name, source path, artifact path, artifact digest or Git blob/tree reference, source tree digest, manifest digest/version, timestamps optional, and exact update points for init, pack, successful unpack, failed pack/unpack, and artifact deletion.

## Finding 2 — High: status state precedence can be ambiguous
Evidence: `dolos status` must report clean, needs-pack, source-missing/artifact-present, artifact-changed, private-changed, diverged, and unknown/no-index, but no truth table says which state wins when source missing plus artifact changed, no index plus artifact exists, or artifact missing plus private changed.
required_fix: Add a compact state table keyed by index present, source exists/digest, artifact exists/digest, and manifest validity, including precedence and command exit codes.

## Finding 3 — Medium: pack overwrite semantics for stale artifacts are incomplete
Evidence: `/commit` auto-pack is guarded against upstream artifact changes, but direct `dolos pack private` behavior is not defined when current artifact differs from the local index, is missing, or has invalid manifest.
required_fix: Define `pack` preconditions: whether it refuses artifact-changed/diverged by default, supports `--force`, and whether it updates index only after successful encryption plus atomic artifact replace.

## Finding 4 — Medium: partial-failure atomicity is not specified
Evidence: PRD says unpack decrypts to scratch first and promotes only when safe, but does not specify atomic replacement strategy, cleanup, or recovery if validation/promote/index-write fails.
required_fix: Require write-to-temp and atomic rename for artifact and index updates; unpack must validate scratch, preserve existing `private/` until final promote, and leave status recoverable after any interrupted operation.

## Finding 5 — Medium: multi-archive compatibility lacks reserved invariants
Evidence: Non-goal says no multiple archives in MVP but design must not block `.dolos/artifacts/<name>.tar.gz.age`; commands already accept `pack private` while index/status wording sometimes assumes one artifact.
required_fix: Define archive name normalization/reserved names, artifact discovery pattern, per-archive index entries, and that status/pack/unpack operate on archive identity rather than hard-coded paths except for MVP default `private`.
