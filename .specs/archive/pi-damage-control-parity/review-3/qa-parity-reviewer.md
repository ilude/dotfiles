# QA Parity Review — Safety Policy Parity and Validation

## Finding 1 — High — No true per-rule oracle evidence for many Claude regexes

**Evidence:** T5 requires “per-pattern outcome equivalence” but also permits listing patterns with no matching input in `coverage-debt`. If tests pass with many entries in coverage debt, real parity remains unproven for those rules while the manifest can still report `mismatch_count=0`.

**required_fix:** Make the final archive fail when any Phase A Claude `bashToolPatterns` entry lacks at least one generated or curated positive input, unless the entry is explicitly classified as unsupported/deferred and excluded from Phase A claims. Add `covered_pattern_count`, `total_phase_a_pattern_count`, and `coverage_debt_count`; require `coverage_debt_count=0` for claimed Phase A parity.

## Finding 2 — High — Oracle subprocess may be syntactically tested but semantically wrong

**Evidence:** The plan says to drive `bash-tool-damage-control.py` via stdin JSON matching the hook schema, but it does not require a schema canary proving the oracle invocation is interpreted by Claude rather than defaulting to allow/block/error behavior. Passing fixtures could reflect a broken harness, not Claude behavior.

**required_fix:** Add oracle contract canaries with known Claude outcomes from existing Claude tests, including one allow, one ask, and one block. Fail parity setup if stdout schema, exit behavior, or normalized outcomes differ from the known canaries before running Pi comparisons.

## Finding 3 — Medium — No-spawn guarantee only greps one test file

**Evidence:** G2/G3 grep only `pi/tests/damage-control.test.ts`, while T5 allows optional helper files under `pi/tests/` and the parity oracle necessarily uses subprocesses. A helper could accidentally spawn real shell commands or invoke `bash` while the gate still passes.

**required_fix:** Expand the no-real-shell gate to all Pi damage-control test and helper files, with an allowlist only for the Claude oracle subprocess wrapper. Also assert at runtime that tool-call handlers receive mocked executors and that command strings are never passed to shell/pwsh execution APIs.

## Finding 4 — Medium — Evidence manifest can pass with inadequate fixture family coverage

**Evidence:** The manifest extracts only `fixture_count` and `mismatch_count`. A large count can hide missing high-risk families such as metadata endpoint access, cloud/database destructive commands, path/write policies, or negative controls.

**required_fix:** Require `parity-diff.md` and `evidence-manifest.md` to include fixture counts by family and negative-control counts. Fail F5 unless every required family in T5 has at least one positive fixture and each implemented Phase B family has both positive and negative fixtures.

## Finding 5 — Medium — Fail-closed policy health is not tied to archive gates

**Evidence:** T2 requires invalid regexes, unsupported fields, and missing configured policy paths to fail policy health closed, but final gates mostly run tests/typecheck and parse parity output. A skipped or partially implemented health-failure test could still leave final evidence looking green.

**required_fix:** Add explicit final validation artifacts for policy-health scenarios: valid Claude path healthy, configured missing path unhealthy/no fallback, invalid regex unhealthy, Python-only regex unhealthy, unsupported safety-affecting field unhealthy, and unset path Pi-only warning/notification. Include their exit codes in `evidence-manifest.md`.
