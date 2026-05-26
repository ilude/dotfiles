"""Evaluate active-learning ranking against labeled prompt-router eval rows."""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import joblib
from active_learning_queue import CLOSE_MARGIN_THRESHOLD, LOW_CONFIDENCE_THRESHOLD
from classifier import EFFORT_ORDER, TIER_ORDER, route_label

ROOT = Path(__file__).parent
DEFAULT_EVAL = ROOT / "data" / "eval_v3.jsonl"
DEFAULT_MODEL = ROOT / "models" / "router_v3.joblib"
DEFAULT_OUTPUT_ROOT = ROOT / "experiments" / "active-learning"
DEFAULT_TOP_N = (25, 50, 100, 200)
UNCERTAINTY_WEIGHT = 30.0
MARGIN_WEIGHT = 20.0


@dataclass(frozen=True)
class ScoredEvalRow:
    prompt_hash: str
    true_label: str
    predicted_label: str
    confidence: float
    candidate_margin: float
    active_learning_score: float
    is_error: bool
    is_catastrophic_under_route: bool


def iter_jsonl(path: Path):
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                yield json.loads(line)


def prompt_hash(prompt: str) -> str:
    return hashlib.sha256(prompt.encode("utf-8")).hexdigest()


def route_cost(label: str) -> tuple[int, int]:
    tier, effort = label.split("|", 1)
    return (TIER_ORDER[tier], EFFORT_ORDER[effort])


def is_catastrophic_under_route(predicted: str, true: str) -> bool:
    predicted_tier = predicted.split("|", 1)[0]
    true_tier = true.split("|", 1)[0]
    return TIER_ORDER[predicted_tier] < TIER_ORDER[true_tier]


def active_learning_score(confidence: float, margin: float) -> float:
    score = 0.0
    if confidence < LOW_CONFIDENCE_THRESHOLD:
        score += (LOW_CONFIDENCE_THRESHOLD - confidence) * UNCERTAINTY_WEIGHT
    if margin < CLOSE_MARGIN_THRESHOLD:
        score += (CLOSE_MARGIN_THRESHOLD - margin) * MARGIN_WEIGHT
    return score


def score_rows(model: Any, rows: list[dict[str, Any]]) -> list[ScoredEvalRow]:
    scored: list[ScoredEvalRow] = []
    for row in rows:
        predicted, confidence, candidates = model.predict_single_full(row["prompt"])
        ranked = sorted(candidates, key=lambda item: item[1], reverse=True)
        margin = ranked[0][1] - ranked[1][1] if len(ranked) > 1 else ranked[0][1]
        true = route_label(row)
        scored.append(
            ScoredEvalRow(
                prompt_hash=prompt_hash(row["prompt"]),
                true_label=true,
                predicted_label=predicted,
                confidence=confidence,
                candidate_margin=margin,
                active_learning_score=active_learning_score(confidence, margin),
                is_error=predicted != true,
                is_catastrophic_under_route=is_catastrophic_under_route(predicted, true),
            )
        )
    return scored


def deterministic_baseline(rows: list[ScoredEvalRow], n: int) -> list[ScoredEvalRow]:
    return sorted(rows, key=lambda row: row.prompt_hash)[:n]


def summarize_slice(rows: list[ScoredEvalRow]) -> dict[str, Any]:
    if not rows:
        return {"rows": 0, "errors": 0, "error_rate": 0.0, "catastrophic_under_routes": 0}
    errors = sum(row.is_error for row in rows)
    catastrophic = sum(row.is_catastrophic_under_route for row in rows)
    return {
        "rows": len(rows),
        "errors": errors,
        "error_rate": errors / len(rows),
        "catastrophic_under_routes": catastrophic,
    }


def run_experiment(eval_path: Path, model_path: Path, top_n: tuple[int, ...]) -> dict[str, Any]:
    rows = list(iter_jsonl(eval_path))
    model = joblib.load(model_path)
    scored = score_rows(model, rows)
    ranked = sorted(scored, key=lambda row: (-row.active_learning_score, row.prompt_hash))
    overall = summarize_slice(scored)
    cuts = {}
    for n in top_n:
        limit = min(n, len(scored))
        active = summarize_slice(ranked[:limit])
        baseline = summarize_slice(deterministic_baseline(scored, limit))
        cuts[str(limit)] = {
            "active_learning": active,
            "deterministic_baseline": baseline,
            "error_enrichment": active["error_rate"] / overall["error_rate"]
            if overall["error_rate"]
            else None,
        }
    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "eval_path": str(eval_path),
        "model_path": str(model_path),
        "overall": overall,
        "cuts": cuts,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--eval", type=Path, default=DEFAULT_EVAL)
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    args = parser.parse_args()

    report = run_experiment(args.eval, args.model, DEFAULT_TOP_N)
    output_dir = args.output_root / "ranking-eval"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "report.json"
    output_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"wrote {output_path}")
    print(json.dumps(report["cuts"], indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
