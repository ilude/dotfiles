# Product/Simplicity PRD Readiness Review

## Finding 1
severity: high

evidence: The PRD bundles a new Go CLI, Docker build pattern reuse/generalization, age SSH-recipient handling, tar validation, manifest format, local index semantics, `/commit` fetch/block integration, and migration/removal of old scripts into one MVP.

required_fix: Split MVP into a smaller user-outcome slice: explicit pack/unpack/status for one archive plus safety invariants. Move build-system generalization, `/commit` auto-pack integration, and old workflow migration into separate phased requirements unless each is necessary for first successful operator use.

## Finding 2
severity: high

evidence: The primary user outcome is broad (“safer workflow”) but the PRD does not define the minimum successful operator journey end-to-end, e.g. fresh machine restore, normal edit/pack/commit/push, pull with remote artifact change, or lost local index recovery.

required_fix: Add 3-5 concrete user journeys with start state, commands, expected decisions, and success/failure outcomes. Use those journeys to decide which states and commands are MVP versus later.

## Finding 3
severity: medium

evidence: Status states include clean, needs-pack, source-missing/artifact-present, artifact-changed, private-changed, diverged, and unknown/no-index, but their exact predicates are not specified. “Discovers tracked artifacts first” and “local Dolos state proves” leave planner discretion in a safety-critical area.

required_fix: Define a concise state table with inputs: artifact existence/digest, source existence/digest, local index presence, and upstream artifact change. For each state, specify allowed actions for status, pack, unpack, and `/commit`.

## Finding 4
severity: medium

evidence: The PRD rejects multiple archives for MVP but simultaneously requires the design not block future `.dolos/artifacts/<name>.tar.gz.age` archives and commands are written as `dolos pack private`. This invites generic archive abstractions before the single private archive is proven.

required_fix: Make MVP explicitly single-archive: command may accept only `private` and all paths are fixed. Limit future-proofing to avoiding hardcoded names in places that are trivial, and forbid user-facing multi-archive config/semantics in the first plan.

## Finding 5
severity: medium

evidence: Acceptance criterion 5 requires `/commit` private freshness behavior, including fetch and upstream artifact detection, while the problem statement mainly criticizes hooks mutating unrelated commits. This risks reintroducing commit-time coupling before the standalone Dolos workflow is validated.

required_fix: Reframe `/commit` integration as a later phase or warning-only MVP unless a specific user journey proves it is required. If retained, specify exact scope: no auto-pack by default, no index mutation, and only block when committing `.dolos/artifacts/private.tar.gz.age` with known upstream artifact changes.
