---
reviewer: qa-engineer
persona: Router validation and regression reviewer
artifact_type: prd-readiness-review
status: complete
created: 2026-05-07
---

# PRD Readiness Review: QA Validation and Regression Risk

## Finding 1

severity: high

evidence: Acceptance criterion 3 validates only one happy-path sequence: complex prompt routes to `large`, then `do option 2` holds. This can pass while continuation detection fails for `patch it`, `same but with auth`, `previous`, multi-turn unresolved tasks, or when previous route was `core` rather than `large`.

required_fix: Require a named sequence fixture set covering each continuation phrase class, previous effective sizes `mini/core/large/max`, explicit cheap/brief override negatives, and non-continuation lookalikes. Pass criteria should report per-fixture raw route, applied route, rule fired, and failure reason.

## Finding 2

severity: high

evidence: Unified eval metrics are listed, but definitions are absent. “Catastrophic under-routing,” “over-routing,” “cost-weighted quality,” “route thrash,” and “context sequence results” can be implemented inconsistently, allowing regressions to look green by changing thresholds or denominators.

required_fix: Define each metric mathematically in the PRD: route ordering, severity thresholds, denominator, sequence-level vs turn-level aggregation, and minimum report fields. Add required baseline comparison against current/router-disabled behavior so acceptance criteria cannot pass on incomplete or reinterpreted metrics.

## Finding 3

severity: high

evidence: Acceptance criteria verify status/explain/log strings, but not that the selected model/thinking actually served the same turn. A router can log `applied_route: large` and still generate on the prior or default model if model switching races or fails.

required_fix: Add an acceptance criterion requiring generation-time evidence: resolved provider/model/thinking for the current turn must match the applied route, with a failure fixture for model-switch error/fallback. Logs and explain should include both intended route and confirmed effective generation route.

## Finding 4

severity: medium

evidence: Telemetry acceptance allows `prompt_excerpt` by default but does not define max length, redaction, hashing stability, or test fixtures for secret-like prompts. A test could pass field presence while leaking sensitive content or producing hashes that cannot support aggregate analysis.

required_fix: Specify prompt excerpt length, redaction rules, hash algorithm/salt scope, and privacy fixtures containing tokens, emails, paths, and long prompts. Pass criteria must prove full prompts are not logged by default and aggregates remain joinable without raw text.

## Finding 5

severity: medium

evidence: Classifier mode acceptance checks `t2` and `confgate` only. Supported modes include `lgbm` and `ensemble`, and false-pass risk remains if eval/runtime share labels but silently fall back for unsupported modes.

required_fix: Require a mode matrix fixture for `t2 | lgbm | ensemble | confgate` across runtime, status, explain, logs, and eval. Each mode must either execute successfully or emit an explicit unsupported-mode fallback reason consistently in every surface.
