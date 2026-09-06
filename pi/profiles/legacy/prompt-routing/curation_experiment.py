"""Sandboxed curation retraining experiment workflow."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Final

import joblib
import numpy as np

_DIR: Final = Path(__file__).resolve().parent
_REPO_ROOT: Final = _DIR.parents[1]
EXPERIMENT_ROOT_PARTS: Final = ("pi", "prompt-routing", "experiments", "retraining")
EXPERIMENT_SCHEMA_VERSION: Final = "1.0.0"
GATES_SCHEMA_VERSION: Final = "1.0.0"
REVIEW_STATUSES: Final = (
    "auto_accept_candidate",
    "holdout_candidate",
    "needs_review",
    "reject",
)
PRODUCTION_ARTIFACTS: Final = (
    _DIR / "data",
    _DIR / "models",
    _DIR / "model.pkl",
    _DIR / "model.pkl.sha256",
    _DIR / "test_set.pkl",
)
SCAN_PATTERNS: Final = {
    "private_key": re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    "token": re.compile(r"(?i)(api[_-]?key|secret|token)\s*[:=]\s*['\"]?[A-Za-z0-9_\-]{20,}"),
    "email": re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"),
    "windows_path": re.compile(r"[A-Za-z]:\\\\Users\\\\[^\\\s]+"),
    "unix_home_path": re.compile(r"/home/[^/\s]+/"),
}

DEFAULT_GATES: Final = {
    "top1_accuracy_min_delta": -0.02,
    "catastrophic_under_routing_max_delta": 0,
    "over_routing_rate_max_delta": 0.10,
    "per_tier_recall_min_delta": -0.05,
    "mean_latency_max_multiplier": 1.25,
}

TIER_ORDER: Final = {"mini": 0, "core": 1, "large": 2}
EFFORT_ORDER: Final = {"none": 0, "low": 1, "medium": 2, "high": 3}


@dataclass(frozen=True)
class Partition:
    name: str
    path: Path
    rows: list[dict[str, Any]]


def repo_root() -> Path:
    return _REPO_ROOT


def experiment_root() -> Path:
    return repo_root().joinpath(*EXPERIMENT_ROOT_PARTS)


def stable_json_hash(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=True, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rel(path: Path) -> str:
    return str(path.resolve().relative_to(repo_root().resolve())).replace("\\", "/")


def ensure_gitignore_policy() -> None:
    gitignore = repo_root() / ".gitignore"
    required = "pi/prompt-routing/experiments/retraining/**"
    text = gitignore.read_text(encoding="utf-8") if gitignore.exists() else ""
    if required not in text.splitlines():
        with gitignore.open("a", encoding="utf-8", newline="\n") as handle:
            if text and not text.endswith("\n"):
                handle.write("\n")
            handle.write(required + "\n")


def _reject_path_escape(path_text: str) -> None:
    path = Path(path_text)
    if ".." in path.parts:
        raise ValueError("output directory must not contain '..'")
    if path.is_absolute():
        root = experiment_root().resolve()
        resolved = path.resolve()
        if not resolved.is_relative_to(root):
            raise ValueError(f"output directory must be under {root}")


def _reject_symlink_ancestor(path: Path) -> None:
    root = experiment_root().resolve()
    current = root
    for part in path.resolve().relative_to(root).parts[:-1]:
        current = current / part
        if current.exists() and current.is_symlink():
            raise ValueError("output directory must not use symlinked ancestors")


def safe_output_dir(
    path_text: str, *, allow_existing: bool = True, require_existing: bool = False
) -> Path:
    _reject_path_escape(path_text)
    root = experiment_root().resolve()
    path = Path(path_text)
    candidate = (repo_root() / path if not path.is_absolute() else path).resolve()
    if not candidate.is_relative_to(root):
        raise ValueError(f"output directory must be under {root}")
    if candidate.exists() and candidate.is_file():
        raise ValueError("output directory collides with an existing file")
    if require_existing and not candidate.exists():
        raise FileNotFoundError(candidate)
    _reject_symlink_ancestor(candidate)
    if candidate.exists() and not allow_existing and any(candidate.iterdir()):
        raise ValueError("output directory is not empty")
    return candidate


def require_gates(experiment_dir: Path) -> dict[str, Any]:
    gates_path = experiment_dir / "gates.json"
    if not gates_path.exists():
        raise FileNotFoundError("gates.json must exist before export or evaluation")
    return json.loads(gates_path.read_text(encoding="utf-8"))


def init_gates(args: argparse.Namespace) -> int:
    ensure_gitignore_policy()
    output_dir = safe_output_dir(args.output_dir, allow_existing=True)
    if output_dir.exists() and (args.fail_if_exists or any(output_dir.iterdir())):
        raise FileExistsError(output_dir)
    output_dir.mkdir(parents=True, exist_ok=False)
    gate_content = {
        "schema_version": GATES_SCHEMA_VERSION,
        "gates_created_at": datetime.now(timezone.utc).isoformat(),
        "thresholds": DEFAULT_GATES,
        "quality_scope": "production_or_manual_labels_only",
        "weak_label_scope": "informational_only",
    }
    gate_content["gate_hash"] = stable_json_hash(
        {k: v for k, v in gate_content.items() if k != "gate_hash"}
    )
    (output_dir / "gates.json").write_text(
        json.dumps(gate_content, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(f"wrote {rel(output_dir / 'gates.json')}")
    return 0


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def partition_hash(rows: list[dict[str, Any]]) -> str:
    return stable_json_hash([row.get("id") for row in rows] + [row_hash(row) for row in rows])


def row_hash(row: dict[str, Any]) -> str:
    return stable_json_hash(row)


def prompt_safe_row(row: dict[str, Any]) -> dict[str, Any]:
    proposed = row.get("proposed_route") or {}
    return {
        "id": row.get("id"),
        "source": row.get("source"),
        "source_row_id": row.get("source_row_id"),
        "review_status": row.get("review_status"),
        "reason_codes": row.get("reason_codes", []),
        "trace_features": row.get("trace_features", {}),
        "proposed_route": proposed,
        "accepted_route": row.get("accepted_route"),
        "content_hash": row_hash(row),
    }


def export_candidates(args: argparse.Namespace) -> int:
    ensure_gitignore_policy()
    curation_dir = Path(args.curation_dir)
    if not curation_dir.is_absolute():
        curation_dir = repo_root() / curation_dir
    curation_dir = curation_dir.resolve()
    manifest_path = curation_dir / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError("curation manifest.json is required")
    output_dir = safe_output_dir(args.output_dir, allow_existing=True, require_existing=True)
    gates = require_gates(output_dir)
    candidates_path = curation_dir / "candidates.jsonl"
    if not candidates_path.exists():
        raise FileNotFoundError("curation candidates.jsonl is required")
    rows = load_jsonl(candidates_path)
    partitions: list[Partition] = []
    generated: list[str] = []
    for status in REVIEW_STATUSES:
        status_rows = [row for row in rows if row.get("review_status") == status]
        if status == "auto_accept_candidate":
            for row in status_rows:
                row["accepted_route"] = None
                row["label_provenance"] = {
                    "weak_experimental_route": row.get("proposed_route"),
                    "production_or_manual_label": None,
                    "usable_for_quality_gates": False,
                }
        out_name = {
            "auto_accept_candidate": "candidates.jsonl",
            "holdout_candidate": "holdout.jsonl",
            "needs_review": "needs_review.jsonl",
            "reject": "rejected.jsonl",
        }[status]
        out_path = output_dir / out_name
        write_jsonl(out_path, status_rows)
        generated.append(rel(out_path))
        partitions.append(Partition(status, out_path, status_rows))
    candidate_rows = partitions[0].rows
    if not candidate_rows:
        raise RuntimeError("export requires at least one auto_accept_candidate row")
    review_packet = render_review_packet(partitions[2].rows)
    review_path = output_dir / "review_packet.md"
    review_path.write_text(review_packet, encoding="utf-8", newline="\n")
    generated.append(rel(review_path))
    source_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest = {
        "schema_version": EXPERIMENT_SCHEMA_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "curation_manifest": rel(manifest_path),
        "curation_manifest_hash": file_sha256(manifest_path),
        "gates": {"gate_hash": gates["gate_hash"], "gates_created_at": gates["gates_created_at"]},
        "partitions": {
            partition.name: {
                "path": rel(partition.path),
                "row_count": len(partition.rows),
                "row_ids": sorted(str(row.get("id")) for row in partition.rows),
                "content_hash": partition_hash(partition.rows),
            }
            for partition in partitions
        },
        "source_counts_by_status": source_manifest.get("counts_by_status", {}),
        "generated_files": generated,
        "output_classifications": {path: "local_ignored_experiment" for path in generated},
        "boundary": "weak labels are experimental and are not production truth",
    }
    manifest_path_out = output_dir / "manifest.json"
    manifest_path_out.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(f"exported {len(candidate_rows)} candidate rows to {rel(output_dir)}")
    return 0


def render_review_packet(rows: list[dict[str, Any]]) -> str:
    lines = [
        "# Prompt Router Exception Review Packet",
        "",
        "This packet omits full prompt text by default.",
        "",
    ]
    if not rows:
        lines.append("- No needs_review rows.")
        return "\n".join(lines) + "\n"
    for row in rows:
        lines.append(f"## {row.get('id')}")
        lines.append(f"- Source: {row.get('source')}")
        lines.append(f"- Status: {row.get('review_status')}")
        lines.append(f"- Reasons: {', '.join(row.get('reason_codes', [])) or 'none'}")
        lines.append(f"- Proposed route: {json.dumps(row.get('proposed_route'), sort_keys=True)}")
        lines.append(f"- Features: {json.dumps(row.get('trace_features', {}), sort_keys=True)}")
        lines.append("")
    return "\n".join(lines)


def production_snapshots() -> dict[str, str]:
    snapshots: dict[str, str] = {}
    for artifact in PRODUCTION_ARTIFACTS:
        if artifact.is_file():
            snapshots[rel(artifact)] = file_sha256(artifact)
        elif artifact.is_dir():
            for path in sorted(artifact.rglob("*")):
                if path.is_file():
                    snapshots[rel(path)] = file_sha256(path)
        else:
            snapshots[rel(artifact)] = "missing"
    return snapshots


def load_training_rows() -> list[dict[str, Any]]:
    return load_jsonl(_DIR / "data" / "train_v3.jsonl") + load_jsonl(_DIR / "data" / "dev_v3.jsonl")


def route_label(row: dict[str, Any]) -> str:
    route = row["cheapest_acceptable_route"]
    return f"{route['model_tier']}|{route['effort']}"


def metric_rows(clf: Any, rows: list[dict[str, Any]], latency_runs: int) -> dict[str, Any]:
    if not rows:
        raise RuntimeError("evaluation rows must not be empty")
    labels_true = [route_label(row) for row in rows]
    labels_pred = list(clf.predict(rows))
    correct = sum(true == pred for true, pred in zip(labels_true, labels_pred))
    catastrophic = 0
    over_routing = 0
    tier_tp = {tier: 0 for tier in TIER_ORDER}
    tier_total = {tier: 0 for tier in TIER_ORDER}
    for row, pred_label in zip(rows, labels_pred):
        gt = row["cheapest_acceptable_route"]
        pred_tier, pred_effort = pred_label.split("|")
        gt_tier = gt["model_tier"]
        tier_total[gt_tier] += 1
        if pred_tier == gt_tier:
            tier_tp[gt_tier] += 1
        if (
            gt_tier in {"core", "large"}
            and pred_tier == "mini"
            and EFFORT_ORDER[pred_effort] <= EFFORT_ORDER["medium"]
        ):
            catastrophic += 1
        gt_cost = TIER_ORDER[gt_tier] * 4 + EFFORT_ORDER[gt["effort"]]
        pred_cost = TIER_ORDER[pred_tier] * 4 + EFFORT_ORDER[pred_effort]
        if pred_cost > gt_cost:
            over_routing += 1
    sample = rows[0]["prompt"]
    for _ in range(5):
        clf.predict_texts([sample])
    times_us: list[float] = []
    for _ in range(latency_runs):
        start = time.perf_counter()
        clf.predict_texts([sample])
        times_us.append((time.perf_counter() - start) * 1e6)
    arr = np.array(times_us)
    return {
        "top1_accuracy": correct / len(rows),
        "catastrophic_under_routing": catastrophic,
        "over_routing_rate": over_routing / len(rows),
        "per_tier_recall": {
            tier: (tier_tp[tier] / tier_total[tier] if tier_total[tier] else None)
            for tier in TIER_ORDER
        },
        "latency": {
            "unit": "microseconds",
            "runs": latency_runs,
            "mean_us": float(arr.mean()),
            "p95_us": float(np.percentile(arr, 95)),
        },
        "denominators": {"rows": len(rows), "per_tier": tier_total},
        "predictions_hash": stable_json_hash(labels_pred),
    }


def weak_candidate_rows(
    candidate_rows: list[dict[str, Any]],
    *,
    reviewed_only: bool = False,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for row in candidate_rows:
        route = row.get("accepted_route") if reviewed_only else row.get("proposed_route")
        route = route or {}
        tier = route.get("model_tier")
        effort = route.get("effort")
        reviewed = row.get("review_decision") == "accept" and row.get("accepted_route")
        if reviewed_only and not reviewed:
            continue
        if tier in TIER_ORDER and effort in EFFORT_ORDER and row.get("prompt"):
            rows.append(
                {
                    "prompt": row["prompt"],
                    "cheapest_acceptable_route": {"model_tier": tier, "effort": effort},
                    "source_id": row.get("id"),
                }
            )
    if not rows:
        raise RuntimeError("candidate training rows must not be empty")
    return rows


def evaluate(args: argparse.Namespace) -> int:
    sys.path.insert(0, str(_DIR))
    from classifier import V3Classifier

    experiment_dir = safe_output_dir(
        args.experiment_dir, allow_existing=True, require_existing=True
    )
    gates = require_gates(experiment_dir)
    manifest_path = experiment_dir / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError("export manifest.json is required")
    candidate_rows = load_jsonl(experiment_dir / "candidates.jsonl")
    reviewed_only = bool(getattr(args, "reviewed_only", False))
    weak_rows = weak_candidate_rows(candidate_rows, reviewed_only=reviewed_only)
    holdout_rows = (
        load_jsonl(experiment_dir / "holdout.jsonl")
        if (experiment_dir / "holdout.jsonl").exists()
        else []
    )
    train_ids = {str(row.get("id")) for row in candidate_rows}
    holdout_ids = {str(row.get("id")) for row in holdout_rows}
    if train_ids & holdout_ids:
        raise RuntimeError("candidate training rows overlap holdout rows")
    pre = production_snapshots()
    eval_rows = load_jsonl(_DIR / "data" / "eval_v3.jsonl")
    training_rows = load_training_rows()
    baseline = joblib.load(_DIR / "models" / "router_v3.joblib")
    candidate = V3Classifier().fit(training_rows + weak_rows)
    baseline_metrics = metric_rows(baseline, eval_rows, args.latency_runs)
    candidate_metrics = metric_rows(candidate, eval_rows, args.latency_runs)
    model_path = experiment_dir / "candidate_model.joblib"
    joblib.dump(candidate, model_path)
    model_hash = file_sha256(model_path)
    (experiment_dir / "candidate_model.sha256").write_text(model_hash + "\n", encoding="utf-8")
    post = production_snapshots()
    if pre != post:
        raise RuntimeError("production artifact snapshots changed during experiment")
    gate_results, overall_status = apply_gates(baseline_metrics, candidate_metrics, gates)
    eval_hash = stable_json_hash([row_hash(row) for row in eval_rows])
    report = {
        "schema_version": EXPERIMENT_SCHEMA_VERSION,
        "overall_status": overall_status,
        "row_counts": {
            "candidate_training_rows": len(weak_rows),
            "holdout_rows": len(holdout_rows),
            "eval_rows": len(eval_rows),
        },
        "denominators": candidate_metrics["denominators"],
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
        "per_tier_recall": {
            "baseline": baseline_metrics["per_tier_recall"],
            "candidate": candidate_metrics["per_tier_recall"],
        },
        "latency": {
            "baseline": baseline_metrics["latency"],
            "candidate": candidate_metrics["latency"],
        },
        "shadow_comparison": {"available_label_count": len(eval_rows), "eval_row_hash": eval_hash},
        "weak_label_comparison": {
            "candidate_rows": len(weak_rows),
            "quality_gate_input": reviewed_only,
            "reviewed_only": reviewed_only,
        },
        "gates": gates["thresholds"],
        "gate_results": gate_results,
        "gate_hash": gates["gate_hash"],
        "gates_created_at": gates["gates_created_at"],
        "partition_hashes": {
            "candidate_training": partition_hash(candidate_rows),
            "holdout": partition_hash(holdout_rows),
            "eval": eval_hash,
        },
        "generated_files": [],
        "output_classifications": {},
        "production_artifact_snapshots": {"before": pre, "after": post},
        "experiment_joblib_sha256": {rel(model_path): model_hash},
        "scanned_directories": [rel(experiment_dir)],
    }
    generated = [
        model_path,
        experiment_dir / "candidate_model.sha256",
        experiment_dir / "report.json",
        experiment_dir / "report.md",
    ]
    report["generated_files"] = [rel(path) for path in generated]
    report["output_classifications"] = {rel(path): "local_ignored_experiment" for path in generated}
    (experiment_dir / "report.json").write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    (experiment_dir / "report.md").write_text(render_report(report), encoding="utf-8", newline="\n")
    print(f"overall_status={overall_status}")
    return 0 if overall_status in {"passed", "gate_failed"} else 2


def apply_gates(
    baseline: dict[str, Any], candidate: dict[str, Any], gates: dict[str, Any]
) -> tuple[dict[str, Any], str]:
    thresholds = gates["thresholds"]
    results: dict[str, Any] = {}
    results["top1_accuracy"] = (
        candidate["top1_accuracy"] - baseline["top1_accuracy"]
        >= thresholds["top1_accuracy_min_delta"]
    )
    results["catastrophic_under_routing"] = (
        candidate["catastrophic_under_routing"] - baseline["catastrophic_under_routing"]
        <= thresholds["catastrophic_under_routing_max_delta"]
    )
    results["over_routing_rate"] = (
        candidate["over_routing_rate"] - baseline["over_routing_rate"]
        <= thresholds["over_routing_rate_max_delta"]
    )
    per_tier: dict[str, bool] = {}
    for tier, base_value in baseline["per_tier_recall"].items():
        cand_value = candidate["per_tier_recall"][tier]
        per_tier[tier] = (
            True
            if base_value is None
            else cand_value is not None
            and cand_value - base_value >= thresholds["per_tier_recall_min_delta"]
        )
    results["per_tier_recall"] = per_tier
    results["latency"] = (
        candidate["latency"]["mean_us"]
        <= baseline["latency"]["mean_us"] * thresholds["mean_latency_max_multiplier"]
    )
    passed = all(
        value if isinstance(value, bool) else all(value.values()) for value in results.values()
    )
    return results, "passed" if passed else "gate_failed"


def render_report(report: dict[str, Any]) -> str:
    lines = ["# Prompt Router Retraining Experiment Report", ""]
    lines.append(f"Overall status: `{report['overall_status']}`")
    lines.append(f"Gate hash: `{report['gate_hash']}`")
    lines.append("")
    lines.append("## Row Counts")
    for key, value in report["row_counts"].items():
        lines.append(f"- {key}: {value}")
    lines.append("")
    lines.append("## Metrics")
    for key in ("top1_accuracy", "catastrophic_under_routing", "over_routing_rate"):
        lines.append(
            f"- {key}: baseline={report[key]['baseline']} candidate={report[key]['candidate']}"
        )
    lines.append(f"- per_tier_recall: {json.dumps(report['per_tier_recall'], sort_keys=True)}")
    lines.append(f"- latency: {json.dumps(report['latency'], sort_keys=True)}")
    lines.append("")
    lines.append("## Boundary")
    lines.append("Weak-label-only comparisons are informational and cannot pass quality gates.")
    lines.append("No production corpus or model artifacts were promoted or updated.")
    return "\n".join(lines) + "\n"


def prepare_promotion_review(args: argparse.Namespace) -> int:
    experiment_dir = safe_output_dir(
        args.experiment_dir,
        allow_existing=True,
        require_existing=True,
    )
    output_dir = safe_output_dir(args.output_dir, allow_existing=False)
    output_dir.mkdir(parents=True, exist_ok=False)
    candidates = load_jsonl(experiment_dir / "candidates.jsonl")
    review_rows: list[dict[str, Any]] = []
    for row in candidates:
        review_rows.append(
            {
                "schema_version": EXPERIMENT_SCHEMA_VERSION,
                "id": row["id"],
                "source": row["source"],
                "source_dataset": row.get("source_dataset"),
                "source_url": row.get("source_url"),
                "source_revision": row.get("source_revision"),
                "source_row_id": row.get("source_row_id"),
                "license_name": row.get("license_name"),
                "license_url": row.get("license_url"),
                "prompt": row.get("prompt"),
                "weak_proposed_route": row.get("proposed_route"),
                "accepted_route": None,
                "review_decision": "pending",
                "reviewer": None,
                "reviewed_at": None,
                "review_notes": [],
                "content_hash": row_hash(row),
                "label_provenance": {
                    "weak_label_is_ground_truth": False,
                    "requires_human_review": True,
                    "source_experiment": rel(experiment_dir),
                },
            }
        )
    review_path = output_dir / "promotion_review_queue.jsonl"
    write_jsonl(review_path, review_rows)
    instructions = [
        "# Prompt Router Promotion Review",
        "",
        "This queue is a sandbox artifact for manual review. Do not merge rows into",
        "production training data until accepted_route is populated by review.",
        "",
        "For each row, set review_decision to accept or reject. For accepted rows,",
        "populate accepted_route with model_tier and effort after reviewing the prompt.",
        "Weak proposed routes are hints only and are not ground truth.",
        "",
        f"Rows: {len(review_rows)}",
        f"Source experiment: {rel(experiment_dir)}",
        "",
    ]
    (output_dir / "promotion_instructions.md").write_text(
        "\n".join(instructions),
        encoding="utf-8",
        newline="\n",
    )
    manifest = {
        "schema_version": EXPERIMENT_SCHEMA_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source_experiment": rel(experiment_dir),
        "review_queue": rel(review_path),
        "row_count": len(review_rows),
        "boundary": "accepted_route remains null until manual review",
        "generated_files": [
            rel(review_path),
            rel(output_dir / "promotion_instructions.md"),
        ],
    }
    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"wrote promotion review queue: {rel(review_path)}")
    return 0


def run(args: argparse.Namespace) -> int:
    output_dir = safe_output_dir(args.output_dir, allow_existing=False)
    init_args = argparse.Namespace(output_dir=str(output_dir), fail_if_exists=True)
    init_gates(init_args)
    export_args = argparse.Namespace(curation_dir=args.curation_dir, output_dir=str(output_dir))
    export_candidates(export_args)
    eval_args = argparse.Namespace(
        experiment_dir=str(output_dir),
        latency_runs=args.latency_runs,
        reviewed_only=args.reviewed_only,
    )
    return evaluate(eval_args)


def scan_output_dir(path_text: str) -> int:
    output_dir = safe_output_dir(path_text, allow_existing=True, require_existing=True)
    failures: list[str] = []
    for path in output_dir.rglob("*"):
        if not path.is_file() or path.suffix not in {".json", ".jsonl", ".md"}:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if path.name in {"candidates.jsonl", "holdout.jsonl"}:
            continue
        for name, pattern in SCAN_PATTERNS.items():
            if pattern.search(text):
                failures.append(f"{rel(path)}:{name}")
    if failures:
        print("scan failed")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print(f"scan passed: {rel(output_dir)}")
    return 0


def cleanup_output_dir(path_text: str, dry_run: bool) -> int:
    output_dir = safe_output_dir(path_text, allow_existing=True)
    if not output_dir.exists():
        print(f"not found: {rel(output_dir)}")
        return 0
    if not (output_dir / "gates.json").exists():
        raise ValueError("refusing cleanup for directory without gates.json")
    print(f"remove: {rel(output_dir)}")
    if not dry_run:
        shutil.rmtree(output_dir)
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prompt-router curation retraining experiment")
    subparsers = parser.add_subparsers(dest="command", required=True)
    init = subparsers.add_parser("init-gates")
    init.add_argument("--output-dir", required=True)
    init.add_argument("--fail-if-exists", action="store_true")
    export = subparsers.add_parser("export")
    export.add_argument("--curation-dir", required=True)
    export.add_argument("--output-dir", required=True)
    evaluate_parser = subparsers.add_parser("evaluate")
    evaluate_parser.add_argument("--experiment-dir", required=True)
    evaluate_parser.add_argument("--latency-runs", type=int, default=50)
    evaluate_parser.add_argument("--reviewed-only", action="store_true")
    run_parser = subparsers.add_parser("run")
    run_parser.add_argument("--curation-dir", required=True)
    run_parser.add_argument("--output-dir", required=True)
    run_parser.add_argument("--latency-runs", type=int, default=50)
    run_parser.add_argument("--reviewed-only", action="store_true")
    scan = subparsers.add_parser("scan")
    scan.add_argument("--output-dir", required=True)
    promote = subparsers.add_parser("prepare-promotion-review")
    promote.add_argument("--experiment-dir", required=True)
    promote.add_argument("--output-dir", required=True)
    cleanup = subparsers.add_parser("cleanup")
    cleanup.add_argument("--output-dir", required=True)
    cleanup.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.command == "init-gates":
        return init_gates(args)
    if args.command == "export":
        return export_candidates(args)
    if args.command == "evaluate":
        return evaluate(args)
    if args.command == "run":
        return run(args)
    if args.command == "scan":
        return scan_output_dir(args.output_dir)
    if args.command == "prepare-promotion-review":
        return prepare_promotion_review(args)
    if args.command == "cleanup":
        return cleanup_output_dir(args.output_dir, args.dry_run)
    raise ValueError(args.command)


if __name__ == "__main__":
    raise SystemExit(main())
