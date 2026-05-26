# Prompt Router Classifier Experiment Pipeline

## Purpose

This document defines the experiment workflow for changing the prompt-router
classifier. It separates three concerns that are easy to mix up:

- production runtime behavior,
- rebuild parity for the current classifier,
- candidate retraining experiments.

Do not claim a candidate is better unless it beats the current production
ConfGate classifier on frozen eval gates after rebuild parity has been checked.

## Production Classifier

The production classifier is ConfGate.

ConfGate is not a separately trained model. It is a runtime wrapper over two
trained classifiers:

1. LGBM, stored at `models/router_v3_lgbm.joblib`.
2. T2, stored at `models/router_v3.joblib`.

ConfGate behavior:

1. Ask LGBM first.
2. If LGBM confidence is at least `CONF_GATE`, use the LGBM route.
3. If LGBM is uncertain, ask T2.
4. If LGBM and T2 agree, use the agreed route.
5. If they disagree, use confidence and catastrophic-under-routing tie-break
   rules from `classifier_confgate.py`.

The runtime default is ConfGate through `classify.py --classifier confgate`.
Experiments that only compare against T2 are incomplete for promotion purposes.

## Current Model Roles

| Name | Artifact | Implementation | Role |
|------|----------|----------------|------|
| T2 | `models/router_v3.joblib` | `classifier.V3Classifier` | Fast TF-IDF plus LinearSVC fallback model |
| LGBM | `models/router_v3_lgbm.joblib` | `classifier_lgbm.V3ClassifierLGBM` | Stronger primary classifier |
| ConfGate | wrapper | `classifier_confgate.ConfGatedClassifier` | Production route selector over LGBM and T2 |

## Baseline Rebuild Parity

Before evaluating a candidate, rebuild the current classifier from canonical
current data in a sandbox and compare it to production artifacts.

Command:

```bash
uv run --project pi/prompt-routing python pi/prompt-routing/baseline_rebuild_parity.py
```

Inputs:

- `data/train_v3.jsonl`
- `data/dev_v3.jsonl`
- `data/eval_v3.jsonl`
- current production artifacts in `models/`

Outputs:

```text
pi/prompt-routing/experiments/baseline-rebuild-parity/report.json
pi/prompt-routing/experiments/baseline-rebuild-parity/discussion-summary.md
```

The parity check rebuilds T2, LGBM, and ConfGate in sandbox paths, then compares
production metrics and prediction agreement against the current production
artifacts.

Observed 2026-05-26 parity result:

| Model | Eval prediction agreement | Production top-1 | Rebuilt top-1 | Production catastrophic | Rebuilt catastrophic |
|-------|---------------------------|------------------|---------------|-------------------------|----------------------|
| T2 | 98.56% | 0.592 | 0.592 | 37 | 37 |
| LGBM | 89.60% | 0.6416 | 0.6384 | 35 | 34 |
| ConfGate | 89.60% | 0.6432 | 0.6384 | 35 | 34 |

Interpretation:

- T2 rebuild parity is strong enough for close T2 experiments.
- LGBM and ConfGate rebuilds are close on aggregate metrics but not
  prediction-identical.
- Promotion evidence must compare candidates to production ConfGate, not only
  to rebuilt T2.

## Active-Learning Queue

The active-learning queue is a review-target selection tool. It does not prove
classifier improvement by itself.

Command:

```bash
uv run --project pi/prompt-routing python pi/prompt-routing/active_learning_queue.py --limit 100
```

Outputs:

```text
pi/prompt-routing/experiments/active-learning/review-queue-<timestamp>/candidates.jsonl
pi/prompt-routing/experiments/active-learning/review-queue-<timestamp>/review_packet.md
pi/prompt-routing/experiments/active-learning/review-queue-<timestamp>/summary.json
```

Default behavior is privacy-safe:

- prompt hashes are included,
- deterministic prompt features are included when available,
- raw prompts are omitted,
- raw prompts require explicit `--include-raw-prompt`.

Ranking signals include:

- low classifier confidence,
- close candidate margins,
- user effort overrides,
- router/final route disagreement,
- fallback decisions.

Known limitation: excerpt-only rows and one-word continuation prompts are weak
training material without full conversational context.

## Ranking Benefit Experiment

Use the frozen eval set to test whether the active-learning ranking finds known
classifier errors more efficiently than deterministic hash ordering.

Command:

```bash
uv run --project pi/prompt-routing python pi/prompt-routing/active_learning_eval.py
```

Output:

```text
pi/prompt-routing/experiments/active-learning/ranking-eval/report.json
```

Observed 2026-05-26 result:

| Top N | Active error rate | Baseline error rate | Error enrichment |
|-------|-------------------|---------------------|------------------|
| 25 | 0.80 | 0.40 | 1.96x |
| 50 | 0.76 | 0.30 | 1.86x |
| 100 | 0.60 | 0.35 | 1.47x |
| 200 | 0.63 | 0.395 | 1.54x |

Interpretation: the queue is useful for spending review effort, but it is not
evidence that retraining will improve production routing.

## Sandbox Retrain Experiment

Sandbox retraining experiments may use selected reviewed rows or proof-of-
mechanism rows, but promotion eligibility depends on label quality and baseline
comparison.

Current proof-of-mechanism command:

```bash
uv run --project pi/prompt-routing python pi/prompt-routing/active_learning_retrain_eval.py
```

Output:

```text
pi/prompt-routing/experiments/active-learning/retrain-eval/report.json
pi/prompt-routing/experiments/active-learning/retrain-eval/discussion-summary.md
```

The 2026-05-26 run used dev rows as a stand-in for reviewed labels. That makes
it useful for method testing, but not promotion-eligible.

## Promotion Requirements

A candidate may be considered for promotion only when all are true:

- Baseline rebuild parity has been run and documented for the session.
- Candidate is compared against production ConfGate.
- Eval data is frozen and not used for training.
- Added rows have reviewed `cheapest_acceptable_route` labels.
- Added rows include source, review, and provenance metadata.
- Catastrophic under-routing improves or stays flat under the agreed gate.
- Top-1 accuracy improves or stays within the agreed gate.
- Over-routing does not materially regress.
- Per-tier recall does not materially regress for nonempty tiers.
- Latency remains within budget.
- Production artifacts remain unchanged until explicit promotion approval.
- SHA256 sidecars are generated and verified for any candidate artifacts.

## Recommended Next Experiment

Review 25 to 50 active-learning queue rows with full prompt context and label
`cheapest_acceptable_route`. Then retrain in sandbox and compare against
production ConfGate.

Do not use excerpt-only rows for promotion training unless the excerpt is the
full prompt and the review record says so.
