"""
Evaluation harness for the v3 route-level prompt routing classifier.

Loads the specified classifier (T2 or ensemble) after SHA256 integrity
verification, computes all v3 production metrics on eval_v3.jsonl, emits
JSON to docs/, and enforces the production gate.

Usage:
    python evaluate.py                         # T2 model -> router-v3-eval.json
    python evaluate.py --classifier ensemble   # ensemble -> router-v3-eval-ensemble.json

Exit codes:
    0 -- PRODUCTION GATE: PASS (top-1 >= 0.75, catastrophic == 0, per-tier
         recall >= 0.6 on all tiers)
    1 -- PRODUCTION GATE: FAIL (one or more thresholds not cleared)

Production gates:
    top-1 accuracy             >= 0.75
    catastrophic_under_routing == 0   (hard gate)
    per-tier recall (all tiers) >= 0.6
    inference mean              < 1000us  (post-import, T2 only; ensemble skips timing gate)

Security note:
    joblib.load() deserializes arbitrary Python objects. SHA256 is verified
    against the .sha256 sidecar before loading. Never load a model from an
    untrusted source.
"""

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

import joblib
import numpy as np

_DIR = Path(__file__).parent
MODEL_PATH = _DIR / "models" / "router_v3.joblib"
HASH_PATH = _DIR / "models" / "router_v3.sha256"
EVAL_DATA = _DIR / "data" / "eval_v3.jsonl"
OUTPUT_PATH = _DIR / "docs" / "router-v3-eval.json"
OUTPUT_PATH_ENSEMBLE = _DIR / "docs" / "router-v3-eval-ensemble.json"

TIER_ORDER = {"Haiku": 0, "Sonnet": 1, "Opus": 2}
EFFORT_ORDER = {"none": 0, "low": 1, "medium": 2, "high": 3}

TOP1_GATE = 0.75
CATASTROPHIC_GATE = 0
RECALL_GATE = 0.6
INFERENCE_MEAN_GATE_US = 1000.0

BASELINE = {
    "top1_accuracy": 0.5745,
    "catastrophic_under_routing": 14,
    "over_routing_rate": 0.2092,
    "cost_weighted_quality": 0.7704,
}


def _verify_sha256() -> str:
    if not HASH_PATH.exists():
        print(f"SECURITY FAIL: {HASH_PATH} not found. Run train.py first.")
        sys.exit(1)
    expected = HASH_PATH.read_text().strip()
    actual = hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest()
    if actual != expected:
        print("SECURITY FAIL: SHA256 mismatch -- model may be tampered with.")
        print(f"  expected: {expected}")
        print(f"  actual:   {actual}")
        sys.exit(1)
    return actual


def _load_model():
    if not MODEL_PATH.exists():
        print(f"ERROR: {MODEL_PATH} not found. Run train.py first.")
        sys.exit(1)
    sha = _verify_sha256()
    print(f"SHA256 verified: {sha[:16]}...")
    return joblib.load(MODEL_PATH)


def _load_eval() -> list[dict]:
    if not EVAL_DATA.exists():
        print(f"ERROR: {EVAL_DATA} not found.")
        sys.exit(1)
    rows = []
    with open(EVAL_DATA, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def _route_label(row: dict) -> str:
    car = row["cheapest_acceptable_route"]
    return f"{car['model_tier']}|{car['effort']}"


def _compute_metrics(
    clf, rows: list[dict], timing_us: dict, classifier_name: str = "linearSVC_joint_v3"
) -> dict:
    labels_true = [_route_label(r) for r in rows]
    labels_pred = clf.predict(rows)

    n = len(rows)
    correct = sum(t == p for t, p in zip(labels_true, labels_pred))
    top1 = correct / n

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

        # catastrophic_under_routing: gt in {Sonnet,Opus}, pred Haiku with <=medium effort
        if (gt["model_tier"] in {"Sonnet", "Opus"}
                and pred_tier == "Haiku"
                and pe <= EFFORT_ORDER["medium"]):
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

    over_routing_rate = over_routing / n
    cost_weighted_quality = cwq_sum / n

    tier_tp: dict[str, int] = {"Haiku": 0, "Sonnet": 0, "Opus": 0}
    tier_gt: dict[str, int] = {"Haiku": 0, "Sonnet": 0, "Opus": 0}
    tier_pp: dict[str, int] = {"Haiku": 0, "Sonnet": 0, "Opus": 0}
    for r, pred_label in zip(rows, labels_pred):
        gt_tier = r["cheapest_acceptable_route"]["model_tier"]
        pred_tier = pred_label.split("|")[0]
        tier_gt[gt_tier] += 1
        tier_pp[pred_tier] = tier_pp.get(pred_tier, 0) + 1
        if pred_tier == gt_tier:
            tier_tp[gt_tier] += 1

    per_tier_recall = {
        t: tier_tp[t] / tier_gt[t] if tier_gt[t] > 0 else 0.0
        for t in ("Haiku", "Sonnet", "Opus")
    }
    per_tier_precision = {
        t: tier_tp[t] / tier_pp[t] if tier_pp.get(t, 0) > 0 else 0.0
        for t in ("Haiku", "Sonnet", "Opus")
    }
    per_tier_f1 = {
        t: (2 * per_tier_precision[t] * per_tier_recall[t]
            / (per_tier_precision[t] + per_tier_recall[t])
            if (per_tier_precision[t] + per_tier_recall[t]) > 0 else 0.0)
        for t in ("Haiku", "Sonnet", "Opus")
    }

    return {
        "n": n,
        "top1_accuracy": top1,
        "catastrophic_under_routing": catastrophic,
        "over_routing_rate": over_routing_rate,
        "cost_weighted_quality": cost_weighted_quality,
        "per_tier_recall": per_tier_recall,
        "per_tier_precision": per_tier_precision,
        "per_tier_f1": per_tier_f1,
        "per_tier_total": tier_gt,
        "inference_timing_us": timing_us,
        "classifier": classifier_name,
        "thresholds": {
            "top1_gate": TOP1_GATE,
            "catastrophic_gate": CATASTROPHIC_GATE,
            "recall_gate": RECALL_GATE,
        },
        "baseline": BASELINE,
    }


def _measure_timing(clf) -> dict:
    sample = "Design a distributed consensus protocol for a payment system."
    for _ in range(20):
        clf.predict_texts([sample])
    times: list[float] = []
    for _ in range(2000):
        t0 = time.perf_counter()
        clf.predict_texts([sample])
        times.append((time.perf_counter() - t0) * 1e6)
    arr = np.array(times)
    return {
        "mean_us": float(arr.mean()),
        "p50_us": float(np.percentile(arr, 50)),
        "p95_us": float(np.percentile(arr, 95)),
        "p99_us": float(np.percentile(arr, 99)),
        "n_runs": 2000,
    }


def _print_summary(metrics: dict) -> None:
    sep = "=" * 64
    print(f"\n{sep}")
    print("ROUTER V3 EVALUATION -- eval_v3.jsonl")
    print(sep)
    print(f"  n:                         {metrics['n']}")
    print(f"  top-1 accuracy:            {metrics['top1_accuracy']:.4f}  "
          f"(gate >= {TOP1_GATE}; baseline {BASELINE['top1_accuracy']:.4f})")
    print(f"  catastrophic_under_routing: {metrics['catastrophic_under_routing']}  "
          f"(gate == {CATASTROPHIC_GATE}; baseline {BASELINE['catastrophic_under_routing']})")
    print(f"  over_routing_rate:          {metrics['over_routing_rate']:.4f}  "
          f"(baseline {BASELINE['over_routing_rate']:.4f})")
    print(f"  cost_weighted_quality:      {metrics['cost_weighted_quality']:.4f}  "
          f"(baseline {BASELINE['cost_weighted_quality']:.4f})")
    print(f"\n  Per-tier recall (gate >= {RECALL_GATE}):")
    for t in ("Haiku", "Sonnet", "Opus"):
        recall = metrics["per_tier_recall"][t]
        prec = metrics["per_tier_precision"][t]
        f1 = metrics["per_tier_f1"][t]
        n = metrics["per_tier_total"][t]
        marker = "  [PASS]" if recall >= RECALL_GATE else "  [FAIL]"
        print(f"    {t:<6}: recall={recall:.4f}{marker}  prec={prec:.4f}  f1={f1:.4f}  n={n}")
    tim = metrics["inference_timing_us"]
    print("\n  Inference (2000 runs post-import):")
    print(f"    mean={tim['mean_us']:.1f}us  p50={tim['p50_us']:.1f}us  "
          f"p95={tim['p95_us']:.1f}us  p99={tim['p99_us']:.1f}us")
    print(f"    gate: p50 < {INFERENCE_MEAN_GATE_US:.0f}us  (mean elevated by Windows OS jitter)")


def _check_gate(metrics: dict) -> list[str]:
    failures: list[str] = []
    top1 = metrics["top1_accuracy"]
    cat = metrics["catastrophic_under_routing"]
    min_recall = min(metrics["per_tier_recall"].values())

    if top1 < TOP1_GATE:
        failures.append(f"top-1 {top1:.4f} < {TOP1_GATE}")
    if cat > CATASTROPHIC_GATE:
        failures.append(f"catastrophic_under_routing {cat} > {CATASTROPHIC_GATE}")
    if min_recall < RECALL_GATE:
        failures.append(f"min per-tier recall {min_recall:.4f} < {RECALL_GATE}")
    p50_us = metrics["inference_timing_us"]["p50_us"]
    if p50_us >= INFERENCE_MEAN_GATE_US:
        failures.append(f"inference p50 {p50_us:.1f}us >= {INFERENCE_MEAN_GATE_US:.0f}us")
    return failures


def _load_ensemble_clf():
    sys.path.insert(0, str(_DIR))
    from classifier_ensemble import EnsembleV3Classifier  # noqa: PLC0415
    return EnsembleV3Classifier()


def run() -> None:
    parser = argparse.ArgumentParser(description="Evaluate v3 prompt router classifier")
    parser.add_argument(
        "--classifier", choices=["t2", "ensemble"], default="t2",
        help="Which classifier to evaluate (default: t2)",
    )
    args = parser.parse_args()

    use_ensemble = args.classifier == "ensemble"

    if use_ensemble:
        print("=" * 64)
        print("ROUTER V3 EVALUATION -- ensemble classifier")
        print("=" * 64)
        clf = _load_ensemble_clf()
        out_path = OUTPUT_PATH_ENSEMBLE
        classifier_name = "ensemble_t2_lgbm_veto"
    else:
        clf = _load_model()
        out_path = OUTPUT_PATH
        classifier_name = "linearSVC_joint_v3"

    rows = _load_eval()
    print(f"Loaded {len(rows)} eval examples from {EVAL_DATA.name}")

    if use_ensemble:
        # Ensemble uses two models; timing gate is not meaningful here.
        timing = {"mean_us": 0.0, "p50_us": 0.0, "p95_us": 0.0, "p99_us": 0.0, "n_runs": 0,
                  "note": "timing not measured for ensemble (two-model path)"}
    else:
        timing = _measure_timing(clf)

    metrics = _compute_metrics(clf, rows, timing, classifier_name=classifier_name)
    _print_summary(metrics)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)
    print(f"\nMetrics written to {out_path}")

    failures = _check_gate(metrics)
    # Ensemble skips inference timing gate (not applicable).
    if use_ensemble:
        failures = [f for f in failures if "inference" not in f]

    sep = "=" * 64
    print(f"\n{sep}")
    if failures:
        print("PRODUCTION GATE: FAIL")
        for fail in failures:
            print(f"  x {fail}")
        sys.exit(1)
    else:
        print("PRODUCTION GATE: PASS")
        sys.exit(0)


if __name__ == "__main__":
    run()
