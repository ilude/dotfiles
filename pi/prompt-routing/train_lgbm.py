"""
Training pipeline for the LightGBM v3 route-level prompt routing classifier.

Architecture: LightGBM multiclass on TF-IDF SVD(150) + hand-crafted features.
  - Same joint (model_tier, effort) label space as the T2 LinearSVC model.
  - Class definition lives in classifier_lgbm.py so joblib deserialises as
    'classifier_lgbm.V3ClassifierLGBM' from any calling context.

Outputs (to pi/prompt-routing/models/):
  router_v3_lgbm.joblib   -- serialized V3ClassifierLGBM bundle
  router_v3_lgbm.sha256   -- hex SHA256 of the joblib artifact

Corpus: same as T2 production (train_v3 + dev_v3 for training, eval_v3 held-out).
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

from classifier import EFFORT_ORDER, TIER_ORDER, route_label  # noqa: E402
from classifier_lgbm import V3ClassifierLGBM  # noqa: E402

DATA_DIR = _DIR / "data"
MODEL_DIR = _DIR / "models"
MODEL_PATH = MODEL_DIR / "router_v3_lgbm.joblib"
HASH_PATH = MODEL_DIR / "router_v3_lgbm.sha256"

TRAIN_V3 = DATA_DIR / "train_v3.jsonl"
DEV_V3 = DATA_DIR / "dev_v3.jsonl"
EVAL_V3 = DATA_DIR / "eval_v3.jsonl"

RANDOM_STATE = 42


def _load_jsonl(path: Path) -> list[dict]:
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def evaluate_on_split(clf: V3ClassifierLGBM, rows: list[dict], split_name: str) -> dict:
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

    n = len(rows)
    tier_tp: dict[str, int] = {"Haiku": 0, "Sonnet": 0, "Opus": 0}
    tier_gt: dict[str, int] = {"Haiku": 0, "Sonnet": 0, "Opus": 0}
    for r, pred_label in zip(rows, labels_pred):
        gt_tier = r["cheapest_acceptable_route"]["model_tier"]
        pred_tier = pred_label.split("|")[0]
        tier_gt[gt_tier] += 1
        if pred_tier == gt_tier:
            tier_tp[gt_tier] += 1

    per_tier_recall = {
        t: tier_tp[t] / tier_gt[t] if tier_gt[t] > 0 else 0.0
        for t in ("Haiku", "Sonnet", "Opus")
    }

    print(f"\n  [{split_name}] top-1={top1:.4f}  catastrophic={catastrophic}  "
          f"over_routing={over_routing / n:.4f}  cwq={cwq_sum / n:.4f}")
    print(f"  [{split_name}] per-tier recall: "
          + "  ".join(f"{t}={v:.4f}" for t, v in per_tier_recall.items()))

    return {
        "split": split_name,
        "n": n,
        "top1_accuracy": top1,
        "catastrophic_under_routing": catastrophic,
        "over_routing_rate": over_routing / n,
        "cost_weighted_quality": cwq_sum / n,
        "per_tier_recall": per_tier_recall,
    }


def _save_artifacts(clf: V3ClassifierLGBM) -> str:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(clf, MODEL_PATH)
    digest = hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest()
    HASH_PATH.write_text(digest)
    return digest


def run() -> None:
    print("=" * 60)
    print("ROUTER V3 LGBM CLASSIFIER -- TRAINING")
    print("=" * 60)

    train_rows = _load_jsonl(TRAIN_V3)
    dev_rows = _load_jsonl(DEV_V3)
    all_train = train_rows + dev_rows
    eval_rows = _load_jsonl(EVAL_V3)

    print(f"\nCorpus: {len(train_rows)} train + {len(dev_rows)} dev "
          f"= {len(all_train)} total")
    print(f"Eval: {len(eval_rows)} held-out examples")

    print("\nFitting V3ClassifierLGBM...")
    print("  Architecture: TF-IDF(1-3gram, 6000) -> SVD(150) + hand features -> LightGBM")
    t0 = time.perf_counter()
    clf = V3ClassifierLGBM(random_state=RANDOM_STATE)
    clf.fit(all_train)
    elapsed = time.perf_counter() - t0
    print(f"  Trained in {elapsed:.1f}s")
    print(f"  Classes ({len(clf.classes_)}): {clf.classes_}")

    eval_metrics = evaluate_on_split(clf, eval_rows, "eval")

    digest = _save_artifacts(clf)
    print(f"\nSaved {MODEL_PATH}")
    print(f"SHA256: {digest}")
    print(f"Saved {HASH_PATH}")

    # Measure timing from the serialized artifact.
    loaded_clf = joblib.load(MODEL_PATH)
    sample_text = "Design a distributed consensus protocol for a payment system."
    for _ in range(10):
        loaded_clf.predict_texts([sample_text])
    times_us = []
    for _ in range(200):
        t0 = time.perf_counter()
        loaded_clf.predict_texts([sample_text])
        times_us.append((time.perf_counter() - t0) * 1e6)
    arr = np.array(times_us)
    mean_us = float(arr.mean())
    p50_us = float(np.percentile(arr, 50))
    p99_us = float(np.percentile(arr, 99))
    print(
        f"\n  Inference timing (200 runs): "
        f"mean={mean_us:.1f}us  p50={p50_us:.1f}us  p99={p99_us:.1f}us"
    )

    print("\n" + "=" * 60)
    print("FINAL EVAL METRICS")
    print("=" * 60)
    print(f"  top-1 accuracy:            {eval_metrics['top1_accuracy']:.4f}  "
          "(ref baseline T2: 0.6241)")
    print(f"  catastrophic_under_routing: {eval_metrics['catastrophic_under_routing']}  "
          "(ref baseline T2: 38)")
    print(f"  over_routing_rate:          {eval_metrics['over_routing_rate']:.4f}")
    print(f"  cost_weighted_quality:      {eval_metrics['cost_weighted_quality']:.4f}")
    print("  per-tier recall:")
    for t, v in eval_metrics["per_tier_recall"].items():
        print(f"    {t}: {v:.4f}")


if __name__ == "__main__":
    run()
