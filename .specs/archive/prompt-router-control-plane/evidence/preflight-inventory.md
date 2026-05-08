# Preflight Inventory

- Date: 2026-05-07
- Command: find pi/tests pi/prompt-routing -maxdepth 3 ...
- Exit code: 0

## Router/eval surfaces
pi/tests/memory-eval
pi/tests/prompt-router.test.ts
pi/tests/read-expertise-retrieval.test.ts
pi/prompt-routing/data/eval_v3.jsonl
pi/prompt-routing/data/ood_eval.json
pi/prompt-routing/docs/cost-shadow-eval-confgate.json
pi/prompt-routing/docs/cost-shadow-eval-confgate.md
pi/prompt-routing/docs/cost-shadow-eval.json
pi/prompt-routing/docs/cost-shadow-eval.md
pi/prompt-routing/docs/eval-v3-baseline.json
pi/prompt-routing/docs/eval-v3-metrics.md
pi/prompt-routing/docs/router-v3-eval-ensemble.json
pi/prompt-routing/docs/router-v3-metrics.md
pi/prompt-routing/docs/router-v3-output-contract.md
pi/prompt-routing/docs/router-v3-output.schema.json
pi/prompt-routing/docs/router-v3-target.md
pi/prompt-routing/eval-report.md
pi/prompt-routing/evals
pi/prompt-routing/evaluate.py
pi/prompt-routing/models/router_v3.joblib
pi/prompt-routing/models/router_v3.sha256
pi/prompt-routing/models/router_v3_lgbm.joblib
pi/prompt-routing/models/router_v3_lgbm.sha256
pi/prompt-routing/router.py
pi/prompt-routing/router_analytics.py
pi/prompt-routing/scripts/shadow_eval.py
pi/prompt-routing/tests/test_evaluate.py
pi/prompt-routing/tools/eval_baseline.py

## T0 seam
- Seam: `pi/tests/prompt-router.test.ts` input-hook harness with mocked classifier subprocess and mocked generation dispatch observer (`setModel`/`setThinkingLevel` order).
- Synthetic fixture: `.specs/prompt-router-control-plane/evidence/synthetic_simple.txt`.
