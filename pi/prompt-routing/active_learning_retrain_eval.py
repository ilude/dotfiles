"""Sandbox retraining experiment for active-learning selected labels."""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import joblib
from active_learning_eval import DEFAULT_MODEL, score_rows
from classifier import V3Classifier
from curation_experiment import apply_gates, load_jsonl, metric_rows, production_snapshots

ROOT = Path(__file__).parent
DEFAULT_TRAIN = ROOT / "data" / "train_v3.jsonl"
DEFAULT_DEV = ROOT / "data" / "dev_v3.jsonl"
DEFAULT_EVAL = ROOT / "data" / "eval_v3.jsonl"
DEFAULT_OUTPUT_ROOT = ROOT / "experiments" / "active-learning" / "retrain-eval"
BATCH_SIZES = (25, 50, 100)
GATES = {
    "thresholds": {
        "top1_accuracy_min_delta": -0.02,
        "catastrophic_under_routing_max_delta": 0,
        "over_routing_rate_max_delta": 0.10,
        "per_tier_recall_min_delta": -0.05,
        "mean_latency_max_multiplier": 1.25,
    }
}


def select_active_learning_rows(
    model: Any,
    rows: list[dict[str, Any]],
    limit: int,
) -> list[dict[str, Any]]:
    scored = score_rows(model, rows)
    ranked = sorted(scored, key=lambda row: (-row.active_learning_score, row.prompt_hash))
    selected_hashes = {row.prompt_hash for row in ranked[:limit]}
    return [row for row in rows if row["prompt_hash"] in selected_hashes]


def select_hash_baseline_rows(rows: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    return sorted(rows, key=lambda row: row["prompt_hash"])[:limit]


def add_prompt_hashes(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    import hashlib

    output = []
    for row in rows:
        copy = dict(row)
        copy["prompt_hash"] = hashlib.sha256(row["prompt"].encode("utf-8")).hexdigest()
        output.append(copy)
    return output


def run(output_root: Path) -> dict[str, Any]:
    pre = production_snapshots()
    train = add_prompt_hashes(load_jsonl(DEFAULT_TRAIN))
    dev = add_prompt_hashes(load_jsonl(DEFAULT_DEV))
    eval_rows = load_jsonl(DEFAULT_EVAL)
    baseline_model = joblib.load(DEFAULT_MODEL)
    baseline_metrics = metric_rows(baseline_model, eval_rows, 50)
    experiments = {}
    output_root.mkdir(parents=True, exist_ok=True)
    for size in BATCH_SIZES:
        experiments[str(size)] = {}
        selections = {
            "active_learning": select_active_learning_rows(baseline_model, dev, size),
            "hash_baseline": select_hash_baseline_rows(dev, size),
        }
        for selection_name, selected in selections.items():
            candidate_train = train + selected
            candidate = V3Classifier().fit(candidate_train)
            candidate_metrics = metric_rows(candidate, eval_rows, 50)
            gate_results, status = apply_gates(baseline_metrics, candidate_metrics, GATES)
            size_dir = output_root / f"{selection_name}-top-{size}"
            size_dir.mkdir(parents=True, exist_ok=True)
            selected_path = size_dir / "selected_dev_rows.jsonl"
            selected_path.write_text(
                "".join(json.dumps(row, sort_keys=True) + "\n" for row in selected),
                encoding="utf-8",
            )
            model_path = size_dir / "candidate_router_v3.joblib"
            joblib.dump(candidate, model_path)
            experiments[str(size)][selection_name] = {
                "status": status,
                "selected_rows": len(selected),
                "top1_accuracy": {
                    "baseline": baseline_metrics["top1_accuracy"],
                    "candidate": candidate_metrics["top1_accuracy"],
                },
                "catastrophic_under_routing": {
                    "baseline": baseline_metrics["catastrophic_under_routing"],
                    "candidate": candidate_metrics["catastrophic_under_routing"],
                },
                "over_routing_rate": {
                    "baseline": baseline_metrics["over_routing_rate"],
                    "candidate": candidate_metrics["over_routing_rate"],
                },
                "latency": {
                    "baseline": baseline_metrics["latency"],
                    "candidate": candidate_metrics["latency"],
                },
                "gate_results": gate_results,
            }
    post = production_snapshots()
    if pre != post:
        raise RuntimeError("production artifacts changed during active-learning retrain eval")
    report = {
        "generated_at": datetime.now(UTC).isoformat(),
        "method": (
            "select top active-learning ranked dev rows, add to train, "
            "evaluate on frozen eval"
        ),
        "promotion_eligible": False,
        "promotion_blocker": "dev labels are reused for a sandbox proof-of-mechanism experiment",
        "production_artifacts_unchanged": True,
        "experiments": experiments,
    }
    (output_root / "report.json").write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    args = parser.parse_args()
    report = run(args.output_root)
    print(json.dumps(report["experiments"], indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
