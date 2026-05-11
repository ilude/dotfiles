---
reviewer: python-pro
persona: Python classifier/eval contract reviewer
plan: .specs/prompt-router-control-plane/plan.md
---

# Findings

- severity: high
  evidence: T2 verifies strict mode handling with `python pi/prompt-routing/classify.py --help`. Current `classify.py` treats any non-`t2|lgbm|confgate` mode as ensemble, so help output would pass while invalid runtime settings silently use ensemble.
  required_fix: Replace help-only verification with executable valid/invalid mode tests via `uv run`, asserting each supported mode returns JSON with the requested mode and invalid mode exits nonzero with an explicit no-classification error.

- severity: high
  evidence: T8 acceptance says metric names must appear, but not their formulas, route ordering, labels, gates, or fixtures. Existing eval code computes against `Haiku/Sonnet/Opus`; V1 requires canonical `nano|mini|core|large|max`.
  required_fix: Add an eval contract section defining each metric formula, route order, canonical labels, gate thresholds, and minimum fixtures, including multi-turn sequence expected results.

- severity: medium
  evidence: Artifact integrity is only implicit in existing Python loaders. The plan changes modes and artifacts but does not require sidecar checks for every classifier artifact or define behavior when `.sha256` is missing/mismatched.
  required_fix: Add acceptance tests for each mode’s model/artifact sidecar: valid hash loads, missing sidecar fails closed, mismatch fails closed, and error JSON never falls back to another classifier mode.

- severity: medium
  evidence: T9 requires JSONL schema/log parsing, but validation only says “Python log-reader test/command added” and fixture inspection. It does not pin malformed-line behavior, schema versions, hash normalization, or default excerpt absence.
  required_fix: Specify JSONL schema fields and tests for corrupt-line tolerance, stable prompt hash normalization, no raw prompt/excerpt by default, opt-in redacted excerpt, rotation, and permission best-effort behavior.

- severity: medium
  evidence: Plan commands use bare `python` for classifier/eval (`classify.py --help`, `evaluate.py --help`) despite repo instructions requiring `uv run`; these commands also prove CLI parsing, not classifier/eval artifact loading or runtime-policy parity.
  required_fix: Rewrite Python verification to use `uv run --project pi/prompt-routing ...` and include commands that classify/evaluate real fixtures, emit policy fingerprint/mode, and compare output to runtime settings.
