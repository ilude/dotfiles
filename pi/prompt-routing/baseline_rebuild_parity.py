"""Sandbox parity check for rebuilding current prompt-router classifiers."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import joblib
from classifier import V3Classifier
from classifier_confgate import CONF_GATE, ConfGatedClassifier
from classifier_lgbm import V3ClassifierLGBM
from curation_experiment import load_jsonl, metric_rows, production_snapshots

ROOT = Path(__file__).parent
TRAIN_V3 = ROOT / "data" / "train_v3.jsonl"
DEV_V3 = ROOT / "data" / "dev_v3.jsonl"
EVAL_V3 = ROOT / "data" / "eval_v3.jsonl"
MODEL_DIR = ROOT / "models"
DEFAULT_OUTPUT_ROOT = ROOT / "experiments" / "baseline-rebuild-parity"


class LocalConfGate:
    """ConfGate wrapper over supplied rebuilt models."""

    def __init__(self, lgbm: V3ClassifierLGBM, t2: V3Classifier) -> None:
        self._lgbm = lgbm
        self._t2 = t2
        self.conf_gate = CONF_GATE

    def predict_single_full(self, prompt: str) -> tuple[str, float, list[tuple[str, float]]]:
        lgbm_label, lgbm_confidence, lgbm_candidates = self._lgbm.predict_single_full(prompt)
        if lgbm_confidence >= self.conf_gate:
            return lgbm_label, lgbm_confidence, lgbm_candidates
        t2_label, t2_confidence, t2_candidates = self._t2.predict_single_full(prompt)
        final_label, confidence, candidates, _rule = ConfGatedClassifier._gate(
            self,
            lgbm_label,
            lgbm_confidence,
            lgbm_candidates,
            t2_label,
            t2_confidence,
            t2_candidates,
        )
        return final_label, confidence, candidates

    def predict_texts(self, texts: list[str]) -> list[str]:
        return [self.predict_single_full(text)[0] for text in texts]

    def predict(self, rows: list[dict[str, Any]]) -> list[str]:
        return self.predict_texts([row["prompt"] for row in rows])


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def artifact_record(path: Path) -> dict[str, Any]:
    return {"path": str(path), "sha256": sha256_file(path), "bytes": path.stat().st_size}


def load_production_models() -> dict[str, Any]:
    return {
        "t2": joblib.load(MODEL_DIR / "router_v3.joblib"),
        "lgbm": joblib.load(MODEL_DIR / "router_v3_lgbm.joblib"),
        "confgate": ConfGatedClassifier(),
    }


def rebuild_models(train_rows: list[dict[str, Any]]) -> dict[str, Any]:
    t2 = V3Classifier(random_state=42).fit(train_rows)
    lgbm = V3ClassifierLGBM(random_state=42).fit(train_rows)
    return {"t2": t2, "lgbm": lgbm, "confgate": LocalConfGate(lgbm, t2)}


def prediction_agreement(left: Any, right: Any, rows: list[dict[str, Any]]) -> dict[str, Any]:
    left_predictions = left.predict(rows)
    right_predictions = right.predict(rows)
    mismatches = [
        {
            "index": index,
            "left": left_value,
            "right": right_value,
            "prompt_hash": hashlib.sha256(row["prompt"].encode("utf-8")).hexdigest(),
        }
        for index, (left_value, right_value, row) in enumerate(
            zip(left_predictions, right_predictions, rows, strict=True)
        )
        if left_value != right_value
    ]
    return {
        "agreement_rate": 1.0 - (len(mismatches) / len(rows)),
        "mismatch_count": len(mismatches),
        "sample_mismatches": mismatches[:20],
    }


def metric_summary(model: Any, rows: list[dict[str, Any]]) -> dict[str, Any]:
    metrics = metric_rows(model, rows, 50)
    return {
        "top1_accuracy": metrics["top1_accuracy"],
        "catastrophic_under_routing": metrics["catastrophic_under_routing"],
        "over_routing_rate": metrics["over_routing_rate"],
        "per_tier_recall": metrics["per_tier_recall"],
        "latency": metrics["latency"],
    }


def write_artifacts(output_dir: Path, rebuilt: dict[str, Any]) -> dict[str, Any]:
    artifacts = {}
    for name in ("t2", "lgbm"):
        path = output_dir / f"rebuilt_{name}.joblib"
        joblib.dump(rebuilt[name], path)
        artifacts[name] = artifact_record(path)
    return artifacts


def run(output_dir: Path) -> dict[str, Any]:
    pre = production_snapshots()
    train_rows = load_jsonl(TRAIN_V3)
    dev_rows = load_jsonl(DEV_V3)
    all_train = train_rows + dev_rows
    eval_rows = load_jsonl(EVAL_V3)
    output_dir.mkdir(parents=True, exist_ok=True)

    production = load_production_models()
    rebuilt = rebuild_models(all_train)
    artifacts = write_artifacts(output_dir, rebuilt)

    models_report = {}
    for name in ("t2", "lgbm", "confgate"):
        models_report[name] = {
            "production_metrics": metric_summary(production[name], eval_rows),
            "rebuilt_metrics": metric_summary(rebuilt[name], eval_rows),
            "prediction_agreement": prediction_agreement(
                production[name],
                rebuilt[name],
                eval_rows,
            ),
        }

    post = production_snapshots()
    if pre != post:
        raise RuntimeError("production artifacts changed during baseline rebuild parity")

    report = {
        "generated_at": datetime.now(UTC).isoformat(),
        "training_rows": {"train": len(train_rows), "dev": len(dev_rows), "total": len(all_train)},
        "eval_rows": len(eval_rows),
        "production_artifacts_unchanged": True,
        "rebuilt_artifacts": artifacts,
        "models": models_report,
    }
    (output_dir / "report.json").write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_ROOT)
    args = parser.parse_args()
    report = run(args.output_dir)
    print(json.dumps(report["models"], indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
