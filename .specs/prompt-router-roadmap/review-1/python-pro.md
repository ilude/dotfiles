---
reviewer: python-pro
persona: Python classifier/eval harness reviewer
focus: classifier schema migration, mode support, eval reproducibility, Python artifact compatibility, current-model sidecar/hash assumptions
status: findings
---

# PRD Readiness Review: Python Classifier / Eval Harness

## Finding 1

**severity:** high

**evidence:** PRD FR1 requires canonical `nano|mini|core|large|max`, but current Python wire output is schema `3.0.0` with `primary.model_tier` values `Haiku|Sonnet|Opus` (`pi/prompt-routing/classify.py`, `pi/lib/prompt-router/classifier.ts`). The PRD says “translate legacy classifier labels initially” but does not specify whether Python output changes, TS adapts, or a new schema version is introduced.

**required_fix:** Define the exact classifier wire contract for v1: schema version, allowed labels, effort semantics, candidate shape, and where legacy-to-canonical mapping occurs. Add acceptance criteria that runtime and eval consume the same contract.

## Finding 2

**severity:** high

**evidence:** FR3 requires modes `t2|lgbm|ensemble|confgate` to be settings-driven. Current TS hardcodes `--classifier t2`; current `classify.py` defaults to `confgate` and treats unknown modes as ensemble. The PRD does not require rejecting invalid modes or logging a normalized mode chosen by Python.

**required_fix:** Require strict mode validation in settings and `classify.py`, no implicit ensemble fallback, and a returned `classifier_mode` field or equivalent sidecar assertion. Eval, runtime logs, status, and explain must report the post-validation mode actually executed.

## Finding 3

**severity:** high

**evidence:** FR9 says “one eval path” and runtime-comparable policy metrics, but existing `evaluate.py` evaluates classifier output while `scripts/shadow_eval.py` has separate policy simulation and explicitly warns that lgbm/ensemble are not fully wired and fall back to t2. The PRD does not name which script survives or the shared policy module boundary.

**required_fix:** Specify the unified eval entrypoint, remove/retire divergent eval paths, and require eval to import/replay the same mode loader, canonical mapper, profile resolver, and policy rules as runtime. Include deterministic fixture seed/source and report a policy/config fingerprint.

## Finding 4

**severity:** medium

**evidence:** Current Python artifacts are hash-verified for lgbm/confgate sidecars (`router_v3_lgbm.joblib`, `router_v3.joblib`), while TS only validates schema `3.0.0`. The PRD adds modes and canonical labels but does not state whether existing joblib/hash files remain compatible or when artifact hashes must change.

**required_fix:** Add an artifact compatibility section: list required model files per mode, hash sidecars, expected schema/version, and migration rules. Acceptance criteria should include a cold-start check that every supported mode loads the intended artifact and fails closed on hash mismatch.

## Finding 5

**severity:** medium

**evidence:** Telemetry requires joining runtime and classifier details using `prompt_hash`, while README notes TS sidecar and Python classifier logs are independent and joined post-hoc by hash. The PRD adds prompt excerpt, context capsule, and policy deltas but does not define hash algorithm, redaction/excerpt limits, or whether Python and TS produce identical hashes after normalization.

**required_fix:** Define prompt hashing/excerpt normalization as a shared contract: algorithm, input bytes, truncation, redaction, and whether stdin/argv joining changes hashes. Add a test that runtime log and Python classifier log produce the same hash for representative prompts.
