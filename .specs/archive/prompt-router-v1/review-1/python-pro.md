# Python classifier/eval reproducibility review

## Finding 1 — HIGH — Python test gate is already red, so `/do-it` will fail before validating new eval work

**Evidence:** Running the plan's required command from repo root failed: `uv run --project pi/prompt-routing pytest pi/prompt-routing/tests -q` exited 1 with 4 failures in `pi/prompt-routing/tests/test_evaluate.py`. Each failure calls `evaluate._compute_metrics(clf, rows, timing)` but `evaluate.py` now requires `classifier_name`: `TypeError: _compute_metrics() missing 1 required positional argument: 'classifier_name'`.

**Required fix:** Add an explicit early T7 subtask to repair the existing eval tests/signature mismatch before treating Python validation as a regression gate, or update the plan's preflight to record this as known-red and require it fixed before V3. Do not leave V3/F2 depending on a currently failing command without an owning checklist item.

## Finding 2 — MEDIUM — Eval validation mutates tracked/generated docs, causing dirty-worktree false failures

**Evidence:** The plan repeatedly verifies with `uv run --project pi/prompt-routing python pi/prompt-routing/evaluate.py --config pi/settings.json --sequences ... --json`. Current `evaluate.py` writes `pi/prompt-routing/docs/router-v3-eval*.json` unconditionally before printing JSON. A validation-only run produced/modified `router-v3-eval.json`, `router-v3-eval-lgbm.json`, `router-v3-eval-confgate.json`, and `router-v3-eval-ensemble.json`.

**Required fix:** Make the plan require either an `evaluate.py --output <evidence path>` / `--no-write` option, or explicitly route generated eval JSON into `.specs/prompt-router-v1/evidence/`. Add a post-command cleanliness check so validation runs do not create unexplained repo changes.

## Finding 3 — MEDIUM — Mode-matrix pass criteria contradict the shell command

**Evidence:** T7 says each classifier mode may "succeed or fail with explicit unsupported/artifact reason," but the verify loop is `for m in t2 lgbm ensemble confgate; do ... >/tmp/router-eval-$m.json || exit 1; done`, which fails the whole gate on any nonzero exit. The validation contract repeats a softer rule: eval may exit nonzero if the documented gate status matches artifact availability.

**Required fix:** Pick one contract and encode it in the command. If all four modes are required artifacts, state that all four must exit 0. If missing/unsupported artifacts are acceptable, replace `|| exit 1` with logic that captures exit code and asserts the JSON/error contains the expected explicit artifact reason.

## Finding 4 — LOW — Shadow-eval retirement check can pass while stale active entrypoints remain usable

**Evidence:** T7's verification is only `grep -RIn "shadow_eval" ...`; a grep result pointing at documentation can satisfy the written pass condition even if `pi/prompt-routing/scripts/shadow_eval.py` remains executable and divergent from `evaluate.py`.

**Required fix:** Require a concrete retirement action: delete the script, replace it with a stub that exits nonzero and points to `evaluate.py`, or add a test that invokes `shadow_eval.py --help`/execution and verifies it cannot silently produce independent metrics.
