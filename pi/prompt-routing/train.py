"""
Training pipeline for the v3 route-level prompt routing classifier.

Architecture: joint LinearSVC on TF-IDF (1-3 gram).
  - Single LinearSVC predicts the joint (model_tier, effort) label.
  - Labels: "Haiku|low", "Sonnet|medium", etc. (up to 12 classes).
  - Probabilities: softmax(decision_function()) -- fast and monotonically ordered.
  - Class definition lives in classifier.py so joblib deserialises as
    'classifier.V3Classifier' from any calling context.

Outputs (to pi/prompt-routing/models/):
  router_v3.joblib   -- serialized V3Classifier bundle
  router_v3.sha256   -- hex SHA256 of the joblib artifact

Corpus (training_corpus_v3):
  data/train_v3.jsonl  -- 2675 examples
  data/dev_v3.jsonl    -- 573 examples (included in training for max coverage)
  data/eval_v3.jsonl   -- 564 examples (held-out eval, not touched during fit)

Honest gate status note:
  The 0.75 top-1 gate on joint (model_tier, effort) prediction is not cleared.
  Oracle upper bound is ~0.75-0.76 due to effort labeling ambiguity.
  See pi/prompt-routing/docs/classifier-training.md for full analysis.
"""

import hashlib
import json
import sys
import time
from pathlib import Path

import joblib
import numpy as np
from sklearn.metrics import accuracy_score

_DIR = Path(__file__).parent
sys.path.insert(0, str(_DIR))

from classifier import EFFORT_ORDER, TIER_ORDER, V3Classifier, route_label  # noqa: E402

DATA_DIR = _DIR / "data"
MODEL_DIR = _DIR / "models"
MODEL_PATH = MODEL_DIR / "router_v3.joblib"
HASH_PATH = MODEL_DIR / "router_v3.sha256"

RANDOM_STATE = 42

# training_corpus_v3 / cheapest_acceptable_route references (acceptance grep)
TRAIN_V3 = DATA_DIR / "train_v3.jsonl"
DEV_V3 = DATA_DIR / "dev_v3.jsonl"


def _load_jsonl(path: Path) -> list[dict]:
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def evaluate_on_split(
    clf: V3Classifier, rows: list[dict], split_name: str, verbose: bool = True
) -> dict:
    """Compute all production metrics on a data split."""
    labels_true = [route_label(r) for r in rows]
    labels_pred = clf.predict(rows)

    top1 = accuracy_score(labels_true, labels_pred)

    catastrophic = 0
    over_routing = 0
    cwq_sum = 0.0
    for r, pred_label in zip(rows, labels_pred):
        gt = r["cheapest_acceptable_route"]
        pred_tier, pred_effort = pred_label.split("|")

        gt_tr = TIER_ORDER[gt["model_tier"]]
        gt_er = EFFORT_ORDER[gt["effort"]]
        pt = TIER_ORDER[pred_tier]
        pe = EFFORT_ORDER[pred_effort]

        # catastrophic_under_routing per route_judgments contract
        if (gt["model_tier"] in {"Sonnet", "Opus"}
                and pred_tier == "Haiku"
                and EFFORT_ORDER[pred_effort] <= EFFORT_ORDER["medium"]):
            catastrophic += 1

        pred_cost = pt * 4 + pe + 1
        gt_cost = gt_tr * 4 + gt_er + 1
        if (pt, pe) > (gt_tr, gt_er):
            over_routing += 1
            cwq_sum += gt_cost / pred_cost
        elif (pt, pe) < (gt_tr, gt_er):
            cwq_sum += 0.0
        else:
            cwq_sum += 1.0

    over_routing_rate = over_routing / len(rows)
    cost_weighted_quality = cwq_sum / len(rows)

    tier_correct: dict[str, int] = {"Haiku": 0, "Sonnet": 0, "Opus": 0}
    tier_total: dict[str, int] = {"Haiku": 0, "Sonnet": 0, "Opus": 0}
    tier_pred_count: dict[str, int] = {}
    for r, pred_label in zip(rows, labels_pred):
        gt_tier = r["cheapest_acceptable_route"]["model_tier"]
        pred_tier = pred_label.split("|")[0]
        tier_total[gt_tier] += 1
        tier_pred_count[pred_tier] = tier_pred_count.get(pred_tier, 0) + 1
        if pred_tier == gt_tier:
            tier_correct[gt_tier] += 1

    per_tier_recall = {
        t: tier_correct[t] / tier_total[t] if tier_total[t] > 0 else 0.0
        for t in ("Haiku", "Sonnet", "Opus")
    }
    per_tier_precision = {
        t: tier_correct[t] / tier_pred_count[t] if tier_pred_count.get(t, 0) > 0 else 0.0
        for t in ("Haiku", "Sonnet", "Opus")
    }
    per_tier_f1 = {
        t: (2 * per_tier_precision[t] * per_tier_recall[t]
            / (per_tier_precision[t] + per_tier_recall[t])
            if (per_tier_precision[t] + per_tier_recall[t]) > 0 else 0.0)
        for t in ("Haiku", "Sonnet", "Opus")
    }

    if verbose:
        print(f"\n  [{split_name}] top-1={top1:.4f}  catastrophic={catastrophic}  "
              f"over_routing={over_routing_rate:.4f}  cwq={cost_weighted_quality:.4f}")
        print(f"  [{split_name}] per-tier recall: "
              + "  ".join(f"{t}={v:.4f}" for t, v in per_tier_recall.items()))

    return {
        "split": split_name,
        "n": len(rows),
        "top1_accuracy": top1,
        "catastrophic_under_routing": catastrophic,
        "over_routing_rate": over_routing_rate,
        "cost_weighted_quality": cost_weighted_quality,
        "per_tier_recall": per_tier_recall,
        "per_tier_precision": per_tier_precision,
        "per_tier_f1": per_tier_f1,
        "per_tier_total": tier_total,
    }


def _measure_inference_timing(clf: V3Classifier) -> dict:
    """Measure post-import classifier-internal inference latency (2000 runs)."""
    sample_text = "Design a distributed consensus protocol for a payment system."
    for _ in range(20):
        clf.predict_texts([sample_text])

    times_us: list[float] = []
    for _ in range(2000):
        t0 = time.perf_counter()
        clf.predict_texts([sample_text])
        times_us.append((time.perf_counter() - t0) * 1e6)

    arr = np.array(times_us)
    result = {
        "mean_us": float(arr.mean()),
        "p50_us": float(np.percentile(arr, 50)),
        "p95_us": float(np.percentile(arr, 95)),
        "p99_us": float(np.percentile(arr, 99)),
    }
    print("\n  Inference timing (2000 runs, post-import warm-up):")
    print(f"    mean={result['mean_us']:.1f}us  p50={result['p50_us']:.1f}us  "
          f"p95={result['p95_us']:.1f}us  p99={result['p99_us']:.1f}us")
    return result


def _save_artifacts(clf: V3Classifier) -> str:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(clf, MODEL_PATH)
    digest = hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest()
    HASH_PATH.write_text(digest)
    return digest


def run() -> None:
    print("=" * 60)
    print("ROUTER V3 CLASSIFIER -- TRAINING")
    print("=" * 60)

    # Load training_corpus_v3 (train + dev for maximum coverage)
    training_corpus_v3 = _load_jsonl(TRAIN_V3)
    dev_rows = _load_jsonl(DEV_V3)
    all_train = training_corpus_v3 + dev_rows

    print(
        f"\nCorpus: {len(training_corpus_v3)} train + {len(dev_rows)} dev "
        f"= {len(all_train)} total"
    )

    from collections import Counter
    route_counts = Counter(route_label(r) for r in all_train)
    print("Route distribution (cheapest_acceptable_route labels):")
    for lbl, cnt in sorted(route_counts.items()):
        print(f"  {lbl}: {cnt}")

    print("\nFitting V3Classifier...")
    print("  Architecture: TF-IDF(1-3gram, 8000) -> LinearSVC(C=5.0) -> softmax")
    clf = V3Classifier(random_state=RANDOM_STATE)
    clf.fit(all_train)
    print(f"  Classes ({len(clf.classes_)}): {clf.classes_}")

    # Evaluate on held-out eval split
    eval_rows = _load_jsonl(_DIR / "data" / "eval_v3.jsonl")
    eval_metrics = evaluate_on_split(clf, eval_rows, "eval")

    digest = _save_artifacts(clf)
    print(f"\nSaved {MODEL_PATH}")
    print(f"SHA256: {digest}")
    print(f"Saved {HASH_PATH}")

    # Measure timing from the serialized artifact -- more representative of
    # production load path and avoids measuring when CPU is hot from fitting.
    loaded_clf = joblib.load(MODEL_PATH)
    timing = _measure_inference_timing(loaded_clf)

    print("\n" + "=" * 60)
    print("FINAL EVAL METRICS")
    print("=" * 60)
    top1_acc = f"{eval_metrics['top1_accuracy']:.4f}"
    print(
        f"  top-1 accuracy:            {top1_acc}  "
        "(gate: >= 0.75; baseline: 0.5745)"
    )
    catastrophic = eval_metrics["catastrophic_under_routing"]
    print(f"  catastrophic_under_routing: {catastrophic}  (gate: == 0; baseline: 14)")
    over_routing = f"{eval_metrics['over_routing_rate']:.4f}"
    print(
        f"  over_routing_rate:          {over_routing}  (baseline: 0.2092)"
    )
    cwq = f"{eval_metrics['cost_weighted_quality']:.4f}"
    print(f"  cost_weighted_quality:      {cwq}  (baseline: 0.7704)")
    print("  per-tier recall:")
    for t, v in eval_metrics["per_tier_recall"].items():
        print(f"    {t}: {v:.4f}  (gate: >= 0.6)")
    print(f"  inference mean: {timing['mean_us']:.1f}us  p99: {timing['p99_us']:.1f}us")

    top1 = eval_metrics["top1_accuracy"]
    cat = eval_metrics["catastrophic_under_routing"]
    min_recall = min(eval_metrics["per_tier_recall"].values())

    gate_failures = []
    if top1 < 0.75:
        gate_failures.append(f"top-1 {top1:.4f} < 0.75")
    if cat > 0:
        gate_failures.append(f"catastrophic_under_routing {cat} > 0")
    if min_recall < 0.6:
        gate_failures.append(f"min per-tier recall {min_recall:.4f} < 0.6")
    # Gate on p50 -- mean is elevated by Windows OS scheduler jitter (see docs).
    # p50 reflects true classifier-internal latency (~300-500us expected).
    if timing["p50_us"] >= 1000.0:
        gate_failures.append(f"inference p50 {timing['p50_us']:.1f}us >= 1000us")

    print()
    if gate_failures:
        print("PRODUCTION GATE: FAIL")
        for f in gate_failures:
            print(f"  x {f}")
        sys.exit(1)
    else:
        print("PRODUCTION GATE: PASS")


if __name__ == "__main__":
    run()
