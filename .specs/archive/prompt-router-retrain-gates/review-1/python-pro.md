## Finding 1

severity: high

evidence: `.gitignore` currently ignores `pi/prompt-routing/experiments/curation/**` only, not `pi/prompt-routing/experiments/retraining/**`. The plan's first generated retraining output is `init-gates --output-dir pi/prompt-routing/experiments/retraining/schema-smoke`; generated gate/report/JSONL/joblib files can become untracked before V1 notices.

required_fix: Make `.gitignore` update an explicit prerequisite before any retraining output command. Add a preflight verification such as `git check-ignore pi/prompt-routing/experiments/retraining/schema-smoke/gates.json` and fail if it is not ignored.

## Finding 2

severity: high

evidence: `pi/prompt-routing/train.py` hardcodes `MODEL_DIR`, `MODEL_PATH`, and `HASH_PATH`, and `_save_artifacts()` writes to `pi/prompt-routing/models/router_v3.joblib` and `.sha256`. The plan says existing `train.py` may be reused if safe, but does not prohibit calling `train.run()` or `_save_artifacts()`.

required_fix: Require experiment training to use pure helper functions with explicit output paths, or duplicate minimal fit/eval logic. Add tests that monkeypatch or snapshot production model paths and fail if `models/*.joblib`, `models/*.sha256`, `model.pkl`, or `test_set.pkl` are written.

## Finding 3

severity: medium

evidence: T3 requires fixed inputs, but the acceptance criteria only inspect report/manifest text. There is no required persisted hash or row-ID set for production train/dev/eval rows, exported weak candidates, and holdout/OOD rows used by both baseline and candidate evaluation.

required_fix: Require `manifest.json` to record sorted row IDs and content hashes for baseline eval rows, candidate training rows, candidate holdout rows, and production corpus inputs. Tests must assert baseline and candidate metrics use the identical eval row hash and that train/holdout ID sets are disjoint.

## Finding 4

severity: medium

evidence: The plan allows generated experiment model artifacts under the experiment directory, but does not require SHA256 sidecars or load verification. Existing `evaluate.py` verifies `models/router_v3.sha256` before `joblib.load`; the new experiment path omits that artifact-safety contract.

required_fix: Require every experiment joblib to be written with a SHA256 sidecar and verified before any later load. `evaluate` should refuse missing or mismatched sidecars and should not overwrite existing experiment joblibs or reports unless an explicit overwrite flag is provided.

## Finding 5

severity: medium

evidence: The report must include `shadow_comparison where labels exist`, but the plan does not define which labels qualify. Exported candidates intentionally keep `accepted_route` null and use `proposed_route` only as weak labels, so implementers can accidentally compute shadow metrics over weak labels and present them as labeled evaluation.

required_fix: Define label provenance in the schema: production eval labels, manually accepted labels, and weak proposed labels must be separate fields. Require `shadow_comparison` to use only production/manual labels, while weak-label comparisons are named separately and excluded from pass/fail quality gates unless explicitly documented.
