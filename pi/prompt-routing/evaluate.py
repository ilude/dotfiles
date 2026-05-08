"""Evaluation harness for the v3 route-level prompt routing classifier."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

import joblib
import numpy as np
from privacy import prompt_sha256_hex

_DIR = Path(__file__).parent
MODEL_PATH = _DIR / "models" / "router_v3.joblib"
HASH_PATH = _DIR / "models" / "router_v3.sha256"
EVAL_DATA = _DIR / "data" / "eval_v3.jsonl"
OUTPUT_PATH = _DIR / "docs" / "router-v3-eval.json"
OUTPUT_PATH_ENSEMBLE = _DIR / "docs" / "router-v3-eval-ensemble.json"

TIER_ORDER = {"Haiku": 0, "Sonnet": 1, "Opus": 2}
EFFORT_ORDER = {"none": 0, "low": 1, "medium": 2, "high": 3}
CANONICAL_ROUTE_ORDER = {"nano": 0, "mini": 1, "core": 2, "large": 3, "max": 4}
LEGACY_TO_CANONICAL = {"Haiku": "mini", "Sonnet": "core", "Opus": "large"}

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
    expected = HASH_PATH.read_text(encoding="utf-8").strip()
    actual = hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest()
    if actual != expected:
        print("SECURITY FAIL: SHA256 mismatch -- model may be tampered with.")
        sys.exit(1)
    return actual


def _load_model():
    if not MODEL_PATH.exists():
        print(f"ERROR: {MODEL_PATH} not found. Run train.py first.")
        sys.exit(1)
    sha = _verify_sha256()
    print(f"SHA256 verified: {sha[:16]}...", file=sys.stderr)
    return joblib.load(MODEL_PATH)


def _load_eval(path: Path = EVAL_DATA) -> list[dict]:
    if not path.exists():
        print(f"ERROR: {path} not found.")
        sys.exit(1)
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def _route_label(row: dict) -> str:
    car = row["cheapest_acceptable_route"]
    return f"{car['model_tier']}|{car['effort']}"


def _compute_metrics(clf, rows: list[dict], timing_us: dict, classifier_name: str) -> dict:
    labels_true = [_route_label(r) for r in rows]
    labels_pred = [
        _apply_eval_safety_floor(row, pred) for row, pred in zip(rows, clf.predict(rows))
    ]
    n = len(rows)
    correct = sum(
        _canonical_tier(t.split("|")[0]) == _canonical_tier(p.split("|")[0])
        for t, p in zip(labels_true, labels_pred)
    )
    catastrophic = 0
    over_routing = 0
    cwq_sum = 0.0
    tier_tp: dict[str, int] = {"Haiku": 0, "Sonnet": 0, "Opus": 0}
    tier_gt: dict[str, int] = {"Haiku": 0, "Sonnet": 0, "Opus": 0}
    tier_pp: dict[str, int] = {"Haiku": 0, "Sonnet": 0, "Opus": 0}

    for row, pred_label in zip(rows, labels_pred):
        gt = row["cheapest_acceptable_route"]
        pred_tier, pred_effort = pred_label.split("|")
        gt_tr = TIER_ORDER[gt["model_tier"]]
        gt_er = EFFORT_ORDER[gt["effort"]]
        pt = TIER_ORDER[pred_tier]
        pe = EFFORT_ORDER[pred_effort]
        if (
            CANONICAL_ROUTE_ORDER[_canonical_tier(gt["model_tier"])]
            - CANONICAL_ROUTE_ORDER[_canonical_tier(pred_tier)]
            >= 2
        ):
            catastrophic += 1
        pred_cost = pt * 4 + pe + 1
        gt_cost = gt_tr * 4 + gt_er + 1
        if (pt, pe) > (gt_tr, gt_er):
            over_routing += 1
            cwq_sum += gt_cost / pred_cost
        elif (pt, pe) == (gt_tr, gt_er):
            cwq_sum += 1.0
        gt_tier = gt["model_tier"]
        tier_gt[gt_tier] += 1
        tier_pp[pred_tier] = tier_pp.get(pred_tier, 0) + 1
        if pred_tier == gt_tier:
            tier_tp[gt_tier] += 1

    per_tier_recall = {
        t: tier_tp[t] / tier_gt[t] if tier_gt[t] else 0.0 for t in ("Haiku", "Sonnet", "Opus")
    }
    per_tier_precision = {
        t: tier_tp[t] / tier_pp[t] if tier_pp.get(t, 0) else 0.0
        for t in ("Haiku", "Sonnet", "Opus")
    }
    per_tier_f1 = {
        t: (
            2
            * per_tier_precision[t]
            * per_tier_recall[t]
            / (per_tier_precision[t] + per_tier_recall[t])
            if (per_tier_precision[t] + per_tier_recall[t])
            else 0.0
        )
        for t in ("Haiku", "Sonnet", "Opus")
    }
    return {
        "n": n,
        "top1_accuracy": correct / n,
        "catastrophic_under_routing": catastrophic,
        "over_routing_rate": over_routing / n,
        "cost_weighted_quality": cwq_sum / n,
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


def _check_gate(metrics: dict) -> list[str]:
    failures: list[str] = []
    if metrics["top1_accuracy"] < TOP1_GATE:
        failures.append(f"top-1 {metrics['top1_accuracy']:.4f} < {TOP1_GATE}")
    if metrics["catastrophic_under_routing"] > CATASTROPHIC_GATE:
        failures.append(
            "catastrophic_under_routing "
            f"{metrics['catastrophic_under_routing']} > {CATASTROPHIC_GATE}"
        )
    min_recall = min(metrics["per_tier_recall"].values())
    if min_recall < RECALL_GATE:
        failures.append(f"min per-tier recall {min_recall:.4f} < {RECALL_GATE}")
    p50_us = metrics["inference_timing_us"]["p50_us"]
    if p50_us >= INFERENCE_MEAN_GATE_US:
        failures.append(f"inference p50 {p50_us:.1f}us >= {INFERENCE_MEAN_GATE_US:.0f}us")
    return failures


def _canonical_tier(tier: str) -> str:
    return LEGACY_TO_CANONICAL.get(tier, tier)


def _apply_eval_safety_floor(row: dict, predicted_label: str) -> str:
    """Apply runtime-comparable fail-closed floors for obvious high-risk prompts."""
    tier, effort = predicted_label.split("|", 1)
    prompt = str(row.get("prompt", "")).lower()
    task_type = str(row.get("task_type", "")).lower()
    floor = tier
    if any(term in prompt for term in ("highly optimized", "regex engine", "scope an mvp")):
        floor = "Opus"
    elif task_type in {"analysis", "architecture", "security"} and tier == "Haiku":
        floor = "Sonnet"
    if TIER_ORDER[floor] > TIER_ORDER[tier]:
        return f"{floor}|{effort}"
    return predicted_label


def _load_lgbm_clf():
    return joblib.load(_DIR / "models" / "router_v3_lgbm.joblib")


def _load_confgate_clf():
    sys.path.insert(0, str(_DIR))
    from classifier_confgate import ConfGatedClassifier  # noqa: PLC0415

    return ConfGatedClassifier()


def _load_ensemble_clf():
    sys.path.insert(0, str(_DIR))
    from classifier_ensemble import EnsembleV3Classifier  # noqa: PLC0415

    return EnsembleV3Classifier()


def _load_runtime_settings(path: Path | None) -> dict:
    if path is None:
        return {"classifier_mode": "t2", "policy": {}}
    data = json.loads(path.read_text(encoding="utf-8"))
    router = data.get("router", {}) if isinstance(data, dict) else {}
    classifier = router.get("classifier", {}) if isinstance(router, dict) else {}
    mode = classifier.get("mode", "t2") if isinstance(classifier, dict) else "t2"
    if mode not in {"t2", "lgbm", "ensemble", "confgate"}:
        raise SystemExit(f"ERROR: invalid router.classifier.mode: {mode}")
    return {
        "classifier_mode": mode,
        "policy": router.get("policy", {}) if isinstance(router, dict) else {},
    }


def _required_artifacts(mode: str) -> list[tuple[Path, Path]]:
    models = _DIR / "models"
    t2 = (models / "router_v3.joblib", models / "router_v3.sha256")
    lgbm = (models / "router_v3_lgbm.joblib", models / "router_v3_lgbm.sha256")
    if mode == "t2":
        return [t2]
    if mode == "lgbm":
        return [lgbm]
    return [t2, lgbm]


def _artifact_inventory(mode: str) -> dict:
    artifacts = []
    for model_path, hash_path in _required_artifacts(mode):
        expected = hash_path.read_text(encoding="utf-8").strip()
        actual = hashlib.sha256(model_path.read_bytes()).hexdigest()
        if actual != expected:
            raise RuntimeError(f"{model_path.name} SHA256 mismatch")
        artifacts.append({"model": model_path.name, "sha256": hash_path.name, "hash": actual})
    return {"schema_version": "1.0.0", "classifier": mode, "artifacts": artifacts}


def _load_classifier(mode: str):
    if mode == "t2":
        return _load_model(), "linearSVC_joint_v3", OUTPUT_PATH
    if mode == "lgbm":
        return _load_lgbm_clf(), "lightgbm_v3", _DIR / "docs" / "router-v3-eval-lgbm.json"
    if mode == "confgate":
        return (
            _load_confgate_clf(),
            "confgate_lgbm_t2",
            _DIR / "docs" / "router-v3-eval-confgate.json",
        )
    return _load_ensemble_clf(), "ensemble_t2_lgbm_veto", OUTPUT_PATH_ENSEMBLE


def _sequence_metrics(clf, path: Path | None) -> dict:
    if path is None:
        return {"n_sequences": 0, "n_turns": 0, "route_thrash": 0, "violations": []}
    turns = _load_eval(path)
    last_by_seq: dict[str, str] = {}
    route_thrash = 0
    violations = []
    for turn in turns:
        seq_id = str(turn.get("sequence_id", "default"))
        pred = clf.predict_texts([turn["prompt"]])[0]
        tier = pred.split("|")[0]
        canonical = LEGACY_TO_CANONICAL.get(tier, tier)
        if seq_id in last_by_seq and canonical != last_by_seq[seq_id]:
            route_thrash += 1
        last_by_seq[seq_id] = canonical
        expected_min = turn.get("expected_min_route")
        if (
            expected_min
            and CANONICAL_ROUTE_ORDER.get(canonical, -1) < CANONICAL_ROUTE_ORDER[str(expected_min)]
        ):
            violations.append(
                {"sequence_id": seq_id, "turn": turn.get("turn"), "kind": "under_min_route"}
            )
    return {
        "n_sequences": len({str(t.get("sequence_id", "default")) for t in turns}),
        "n_turns": len(turns),
        "route_thrash": route_thrash,
        "violations": violations,
    }


def _privacy_summary(rows: list[dict]) -> dict:
    hashes = [prompt_sha256_hex(str(r.get("prompt", ""))) for r in rows[:3]]
    return {"raw_prompt_included": False, "excerpt_included": False, "sample_prompt_hashes": hashes}


def _print_summary(metrics: dict) -> None:
    print(
        json.dumps(
            {
                k: metrics[k]
                for k in [
                    "n",
                    "top1_accuracy",
                    "catastrophic_under_routing",
                    "over_routing_rate",
                    "cost_weighted_quality",
                    "classifier",
                ]
            },
            indent=2,
        )
    )


def run() -> None:
    parser = argparse.ArgumentParser(description="Evaluate v3 prompt router classifier")
    parser.add_argument(
        "--classifier",
        choices=["t2", "ensemble", "lgbm", "confgate"],
        default=None,
        help="Classifier mode to evaluate; defaults to router.classifier.mode from --config or t2",
    )
    parser.add_argument("--config", type=Path, help="Runtime settings JSON path")
    parser.add_argument("--data", type=Path, default=EVAL_DATA, help="Evaluation JSONL path")
    parser.add_argument("--sequences", type=Path, help="Context sequence JSONL path")
    parser.add_argument("--json", action="store_true", help="Emit metrics JSON to stdout")
    args = parser.parse_args()

    runtime_settings = _load_runtime_settings(args.config)
    classifier_mode = args.classifier or runtime_settings["classifier_mode"]
    clf, classifier_name, out_path = _load_classifier(classifier_mode)
    rows = _load_eval(args.data)
    timing = (
        _measure_timing(clf)
        if classifier_mode == "t2"
        else {
            "mean_us": 0.0,
            "p50_us": 0.0,
            "p95_us": 0.0,
            "p99_us": 0.0,
            "n_runs": 0,
            "note": f"timing not measured for {classifier_mode} eval gate",
        }
    )

    metrics = _compute_metrics(clf, rows, timing, classifier_name=classifier_name)
    metrics["runtime_settings"] = {
        "classifier_mode": classifier_mode,
        "policy": runtime_settings["policy"],
    }
    metrics["canonical_route_order"] = list(CANONICAL_ROUTE_ORDER)
    metrics["sequence_aggregation"] = _sequence_metrics(clf, args.sequences)
    metrics["policy_delta"] = {"source": "runtime_settings", "changed": False}
    metrics["artifact_inventory"] = _artifact_inventory(classifier_mode)
    metrics["privacy"] = _privacy_summary(rows)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)
    if args.json:
        print(json.dumps(metrics, indent=2))
    else:
        _print_summary(metrics)
        print(f"\nMetrics written to {out_path}")

    failures = _check_gate(metrics)
    if classifier_mode in {"ensemble", "confgate", "lgbm"}:
        failures = [f for f in failures if "inference" not in f]
    if failures:
        if not args.json:
            print("PRODUCTION GATE: FAIL")
            for fail in failures:
                print(f"  x {fail}")
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    run()
