"""Trained-baseline evaluation over the v3 eval split.

Implements the metrics described in docs/eval-v3-metrics.md against a
sentence-transformer + LogisticRegression baseline trained on
train_v3.jsonl (with class_weight="balanced") and evaluated on
eval_v3.jsonl.

This replaces the earlier TF-IDF + LR baseline. The majority-class numbers
are still computed for reference but the H4 readiness thresholds apply to
the trained classifier metrics.

Metrics:
  - cheapest-route top-1 accuracy (exact (model_tier, effort) match)
  - catastrophic under-routing count
      ground_truth.model_tier in {Sonnet, Opus}
      AND predicted.model_tier == Haiku
      AND predicted.effort in {none, low, medium}
  - over-routing rate
      predicted route strictly more expensive than ground truth
  - cost-weighted quality proxy
  - per-tier recall
  - stratified cell report
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

from sklearn.linear_model import LogisticRegression

REPO = Path(__file__).resolve().parents[1]
DATA = REPO / "data"

TRAIN = DATA / "train_v3.jsonl"
EVAL = DATA / "eval_v3.jsonl"

MODEL_ORDER = ["Haiku", "Sonnet", "Opus"]
EFFORT_ORDER = ["none", "low", "medium", "high"]

DEFAULT_ENCODER = "all-MiniLM-L6-v2"


def load_jsonl(path: Path) -> list[dict]:
    rows = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def route_cost(route: dict) -> int:
    return MODEL_ORDER.index(route["model_tier"]) * 4 + EFFORT_ORDER.index(route["effort"])


def majority_route(rows: list[dict]) -> dict:
    c: Counter = Counter()
    for r in rows:
        car = r["cheapest_acceptable_route"]
        c[(car["model_tier"], car["effort"])] += 1
    (mt, ef), _ = c.most_common(1)[0]
    return {"model_tier": mt, "effort": ef}


def is_catastrophic(gt: dict, pred: dict) -> bool:
    if gt["model_tier"] not in ("Sonnet", "Opus"):
        return False
    if pred["model_tier"] != "Haiku":
        return False
    if pred["effort"] not in ("none", "low", "medium"):
        return False
    return True


def is_over(gt: dict, pred: dict) -> bool:
    return route_cost(pred) > route_cost(gt)


def is_acceptable(gt: dict, pred: dict) -> bool:
    return (
        MODEL_ORDER.index(pred["model_tier"]) >= MODEL_ORDER.index(gt["model_tier"])
        and EFFORT_ORDER.index(pred["effort"]) >= EFFORT_ORDER.index(gt["effort"])
    )


def evaluate(eval_rows: list[dict], predict) -> dict:
    n = len(eval_rows)
    correct = 0
    catastrophic = 0
    over = 0
    acceptable = 0
    cost_excess = 0
    per_tier_total: Counter = Counter()
    per_tier_hit: Counter = Counter()
    per_tier_pred: Counter = Counter()
    per_tier_tp: Counter = Counter()
    cells: Counter = Counter()
    max_cost = MODEL_ORDER.index("Opus") * 4 + EFFORT_ORDER.index("high")

    for r in eval_rows:
        gt = r["cheapest_acceptable_route"]
        pred = predict(r)
        cells[(gt["model_tier"], r["domain"])] += 1
        per_tier_total[gt["model_tier"]] += 1
        per_tier_pred[pred["model_tier"]] += 1
        if pred["model_tier"] == gt["model_tier"] and pred["effort"] == gt["effort"]:
            correct += 1
        if pred["model_tier"] == gt["model_tier"]:
            per_tier_hit[gt["model_tier"]] += 1
            per_tier_tp[gt["model_tier"]] += 1
        if is_catastrophic(gt, pred):
            catastrophic += 1
        if is_over(gt, pred):
            over += 1
        if is_acceptable(gt, pred):
            acceptable += 1
        cost_excess += max(0, route_cost(pred) - route_cost(gt))

    penalty = 0.1
    cost_weighted = (acceptable / n) - penalty * (cost_excess / (n * max_cost))

    per_tier_recall = {
        t: (per_tier_hit[t] / per_tier_total[t]) if per_tier_total[t] else 0.0
        for t in MODEL_ORDER
    }
    per_tier_precision = {
        t: (per_tier_tp[t] / per_tier_pred[t]) if per_tier_pred[t] else 0.0
        for t in MODEL_ORDER
    }
    per_tier_f1 = {}
    for t in MODEL_ORDER:
        p = per_tier_precision[t]
        r = per_tier_recall[t]
        per_tier_f1[t] = (2 * p * r / (p + r)) if (p + r) else 0.0

    underpowered = {k: v for k, v in cells.items() if v < 15}

    return {
        "n": n,
        "top1_accuracy": correct / n,
        "catastrophic_under_routing": catastrophic,
        "over_routing_rate": over / n,
        "cost_weighted_quality": cost_weighted,
        "per_tier_recall": per_tier_recall,
        "per_tier_precision": per_tier_precision,
        "per_tier_f1": per_tier_f1,
        "per_tier_total": dict(per_tier_total),
        "cells": dict(cells),
        "underpowered_cells": underpowered,
    }


def train_st_logreg_classifier(train_rows: list[dict], model_name: str):
    """Train a two-head SentenceTransformer + LogisticRegression baseline.

    Head 1 predicts model_tier (Haiku/Sonnet/Opus). Head 2 predicts effort
    (none/low/medium/high). A cost-safety rule is applied: when the tier
    head predicts Haiku with low margin over Sonnet (top-1 probability gap
    < 0.20), the prediction is upgraded to Sonnet. This matches the B4
    zero-tolerance gate on catastrophic under-routing: on genuinely
    ambiguous prompts, pay a small over-routing premium rather than risk
    an insufficient route.

    Returns (predict(row) -> route, embedding_dim).
    """
    from sentence_transformers import SentenceTransformer

    encoder = SentenceTransformer(model_name)
    try:
        dim = encoder.get_embedding_dimension()
    except AttributeError:
        dim = encoder.get_sentence_embedding_dimension()

    X_text = [r["prompt"] for r in train_rows]
    y_tier = [r["cheapest_acceptable_route"]["model_tier"] for r in train_rows]
    y_effort = [r["cheapest_acceptable_route"]["effort"] for r in train_rows]

    X_train = encoder.encode(
        X_text,
        batch_size=64,
        show_progress_bar=False,
        convert_to_numpy=True,
        normalize_embeddings=True,
    )

    clf_tier = LogisticRegression(
        C=4.0,
        class_weight="balanced",
        max_iter=2000,
        solver="lbfgs",
        random_state=20260422,
    )
    clf_tier.fit(X_train, y_tier)

    clf_effort = LogisticRegression(
        C=4.0,
        class_weight="balanced",
        max_iter=2000,
        solver="lbfgs",
        random_state=20260422,
    )
    clf_effort.fit(X_train, y_effort)

    tier_classes = list(clf_tier.classes_)
    haiku_idx = tier_classes.index("Haiku") if "Haiku" in tier_classes else -1
    sonnet_idx = tier_classes.index("Sonnet") if "Sonnet" in tier_classes else -1

    def predict(row: dict) -> dict:
        Xq = encoder.encode(
            [row["prompt"]],
            batch_size=1,
            show_progress_bar=False,
            convert_to_numpy=True,
            normalize_embeddings=True,
        )
        tier_probs = clf_tier.predict_proba(Xq)[0]
        effort = clf_effort.predict(Xq)[0]

        best_idx = int(tier_probs.argmax())
        tier = tier_classes[best_idx]

        if tier == "Haiku" and sonnet_idx >= 0:
            margin = tier_probs[haiku_idx] - tier_probs[sonnet_idx]
            if margin < 0.20:
                tier = "Sonnet"

        return {"model_tier": tier, "effort": effort}

    return predict, dim


def train_tfidf_logreg_classifier(train_rows: list[dict]):
    """Fallback TF-IDF + LR baseline when sentence_transformers is missing."""
    from sklearn.feature_extraction.text import TfidfVectorizer

    X_train = [r["prompt"] for r in train_rows]
    y_tier = [r["cheapest_acceptable_route"]["model_tier"] for r in train_rows]
    y_effort = [r["cheapest_acceptable_route"]["effort"] for r in train_rows]

    vec = TfidfVectorizer(
        ngram_range=(1, 3),
        min_df=2,
        max_df=0.95,
        sublinear_tf=True,
        strip_accents="unicode",
        lowercase=True,
        max_features=20000,
    )
    Xv = vec.fit_transform(X_train)

    clf_tier = LogisticRegression(
        C=4.0,
        class_weight="balanced",
        max_iter=4000,
        solver="lbfgs",
        random_state=20260422,
    )
    clf_tier.fit(Xv, y_tier)

    clf_effort = LogisticRegression(
        C=4.0,
        class_weight="balanced",
        max_iter=4000,
        solver="lbfgs",
        random_state=20260422,
    )
    clf_effort.fit(Xv, y_effort)

    tier_classes = list(clf_tier.classes_)
    haiku_idx = tier_classes.index("Haiku") if "Haiku" in tier_classes else -1
    sonnet_idx = tier_classes.index("Sonnet") if "Sonnet" in tier_classes else -1

    def predict(row: dict) -> dict:
        Xq = vec.transform([row["prompt"]])
        tier_probs = clf_tier.predict_proba(Xq)[0]
        effort = clf_effort.predict(Xq)[0]
        best_idx = int(tier_probs.argmax())
        tier = tier_classes[best_idx]
        if tier == "Haiku" and sonnet_idx >= 0:
            margin = tier_probs[haiku_idx] - tier_probs[sonnet_idx]
            if margin < 0.20:
                tier = "Sonnet"
        return {"model_tier": tier, "effort": effort}

    return predict


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--model-name",
        default=DEFAULT_ENCODER,
        help="sentence-transformers model id (default: all-MiniLM-L6-v2)",
    )
    p.add_argument(
        "--allow-tfidf-fallback",
        action="store_true",
        help=(
            "If sentence_transformers is not importable, fall back to TF-IDF. "
            "Default: abort with a clear 'library missing' message so metrics "
            "are not silently mixed."
        ),
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()
    train = load_jsonl(TRAIN)
    eval_rows = load_jsonl(EVAL)

    majority = majority_route(train)
    print(f"Train majority class: {majority}")
    majority_result = evaluate(eval_rows, lambda _r: majority)
    maj_recall = {k: round(v, 3) for k, v in majority_result["per_tier_recall"].items()}
    print(
        f"[majority] top1={majority_result['top1_accuracy']:.4f} "
        f"catastrophic={majority_result['catastrophic_under_routing']} "
        f"per_tier_recall={maj_recall}"
    )

    classifier_name = f"sentence_transformer_logreg[{args.model_name}]"
    embedding_dim: int | None = None
    try:
        import sentence_transformers  # noqa: F401
    except ImportError:
        if not args.allow_tfidf_fallback:
            print(
                "ERROR: sentence_transformers is not installed. "
                "Install with `pip install sentence-transformers` or rerun with "
                "--allow-tfidf-fallback to compare against the legacy TF-IDF baseline.",
                file=sys.stderr,
            )
            return 2
        print("WARNING: sentence_transformers missing; falling back to TF-IDF + LR.")
        predict = train_tfidf_logreg_classifier(train)
        classifier_name = "tfidf_logreg_balanced[fallback]"
    else:
        predict, embedding_dim = train_st_logreg_classifier(train, args.model_name)

    result = evaluate(eval_rows, predict)

    print(f"N={result['n']}")
    print(f"classifier={classifier_name}")
    if embedding_dim is not None:
        print(f"embedding_dim={embedding_dim}")
    print(f"top1_accuracy={result['top1_accuracy']:.4f}")
    print(f"catastrophic_under_routing={result['catastrophic_under_routing']}")
    print(f"over_routing_rate={result['over_routing_rate']:.4f}")
    print(f"cost_weighted_quality={result['cost_weighted_quality']:.4f}")
    print(f"per_tier_total={result['per_tier_total']}")
    recall_rounded = {k: round(v, 4) for k, v in result["per_tier_recall"].items()}
    precision_rounded = {k: round(v, 4) for k, v in result["per_tier_precision"].items()}
    f1_rounded = {k: round(v, 4) for k, v in result["per_tier_f1"].items()}
    print(f"per_tier_recall={recall_rounded}")
    print(f"per_tier_precision={precision_rounded}")
    print(f"per_tier_f1={f1_rounded}")
    n_under = len(result["underpowered_cells"])
    n_cells = len(result["cells"])
    print(f"underpowered_cells (<15): {n_under} of {n_cells}")
    for k, v in sorted(result["underpowered_cells"].items()):
        print(f"  {k}: {v}")

    thresholds_pass = (
        result["top1_accuracy"] >= 0.75
        and result["catastrophic_under_routing"] == 0
        and all(v >= 0.6 for v in result["per_tier_recall"].values())
    )
    print(f"H4 thresholds pass: {thresholds_pass}")

    out = DATA.parent / "docs" / "eval-v3-baseline.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    cells_out = {f"{k[0]}|{k[1]}": v for k, v in result["cells"].items()}
    under_out = {f"{k[0]}|{k[1]}": v for k, v in result["underpowered_cells"].items()}
    result_serializable = {
        **result,
        "cells": cells_out,
        "underpowered_cells": under_out,
        "classifier": classifier_name,
        "encoder_model": args.model_name if embedding_dim is not None else None,
        "embedding_dim": embedding_dim,
        "thresholds_pass": thresholds_pass,
        "majority_reference": {
            "top1_accuracy": majority_result["top1_accuracy"],
            "catastrophic_under_routing": majority_result["catastrophic_under_routing"],
            "per_tier_recall": majority_result["per_tier_recall"],
        },
    }
    out.write_text(json.dumps(result_serializable, indent=2), encoding="utf-8")
    print(f"Wrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
