# QA Review: Prompt Router Retrain Gates

## Finding 1
severity: high
evidence: The validation contract accepts an e2e command that exits 0 or gate-failed after writing reports, but does not require non-empty candidate rows, non-empty baseline labels, or non-empty shadow-comparison labels. Required metric presence is checked by key existence only, so empty datasets can produce complete-looking but meaningless metrics.
required_fix: Add acceptance/tests requiring explicit row counts in report.json and failing tooling when candidate_count, baseline_eval_label_count, or required labeled metric denominators are zero. Allow network-blocked only as a blocker/status that forbids quality conclusions.

## Finding 2
severity: high
evidence: Gate-failed status is allowed, but the plan never defines the CLI exit-code contract. Commands chained with `&&` may treat nonzero gate-failed as tooling failure, while exit 0 for gate-failed may let automation mark candidate quality as successful.
required_fix: Define distinct semantics: tool errors nonzero, candidate gate failure either exit 0 with `overall_status: gate_failed` or a documented dedicated code that validation wrappers accept. Add tests for both gate_failed and tool_failed paths.

## Finding 3
severity: medium
evidence: T4 only verifies `report.json` contains top-level required keys. It does not verify formulas, denominators, baseline-vs-candidate deltas, or that latency/shadow/per-tier recall values correspond to the same fixed evaluation inputs.
required_fix: Add deterministic fixture tests with known labels/routes/latencies and expected exact metrics, including baseline and candidate values, deltas, denominator counts, and per-tier recall. Make report validation fail on null/NaN metrics except explicitly unavailable optional shadow labels.

## Finding 4
severity: medium
evidence: Safety regression coverage names increased catastrophic under-routing and collapsed per-tier recall, but does not cover over-routing-rate regression, latency regression, empty tier buckets, or candidate rows leaking into holdout/eval partitions beyond an inspection step.
required_fix: Add fixture tests for each gate: over-routing, latency threshold, missing/empty tier recall denominator handling, and ID overlap across candidate-training, holdout, OOD, and evaluation sets.

## Finding 5
severity: medium
evidence: Archive rule requires fixed gates before candidate results, but acceptance verifies only file existence. An executor could regenerate gates after seeing results or overwrite gates during `run` without detectable failure.
required_fix: Record `gates_created_at`, gate file hash, and report reference to that hash. Make evaluate fail if result files predate gates incorrectly, if gates are overwritten without explicit force before evaluation, or if report gate hash differs from the pre-evaluation gates file.
