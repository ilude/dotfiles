"""Build review queues for prompt-router training candidates."""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

DEFAULT_ROUTING_LOG = Path(__file__).parent / "logs" / "routing_log.jsonl"
DEFAULT_TRACE_GLOB = Path.home() / ".pi" / "agent" / "traces" / "*.jsonl"
DEFAULT_OUTPUT_ROOT = Path(__file__).parent / "experiments" / "active-learning"
DEFAULT_LIMIT = 100
LOW_CONFIDENCE_THRESHOLD = 0.60
CLOSE_MARGIN_THRESHOLD = 0.12
UNCERTAINTY_WEIGHT = 30.0
MARGIN_WEIGHT = 20.0
OVERRIDE_WEIGHT = 40.0
DISAGREEMENT_WEIGHT = 25.0
FAILURE_WEIGHT = 30.0
FALLBACK_WEIGHT = 15.0
RAW_PROMPT_FIELD = "prompt"


@dataclass
class ReviewCandidate:
    prompt_hash: str
    score: float = 0.0
    reasons: list[str] = field(default_factory=list)
    router_recommended_route: dict[str, Any] | None = None
    user_selected_route: dict[str, Any] | None = None
    final_applied_route: dict[str, Any] | None = None
    override_type: str = "none"
    confidence: float | None = None
    candidate_margin: float | None = None
    prompt_features: dict[str, Any] = field(default_factory=dict)
    prompt_excerpt: str | None = None
    prompt: str | None = None
    source_events: list[str] = field(default_factory=list)

    def to_json(self, include_raw_prompt: bool) -> dict[str, Any]:
        row = {
            "prompt_hash": self.prompt_hash,
            "score": round(self.score, 3),
            "reasons": self.reasons,
            "router_recommended_route": self.router_recommended_route,
            "user_selected_route": self.user_selected_route,
            "final_applied_route": self.final_applied_route,
            "override_type": self.override_type,
            "confidence": self.confidence,
            "candidate_margin": self.candidate_margin,
            "prompt_features": self.prompt_features,
            "prompt_excerpt": self.prompt_excerpt,
            "source_events": self.source_events,
        }
        if include_raw_prompt and self.prompt is not None:
            row[RAW_PROMPT_FIELD] = self.prompt
        return row


def iter_jsonl(path: Path):
    if not path.exists():
        return
    with path.open(encoding="utf-8", errors="replace") as handle:
        for line in handle:
            if not line.strip():
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def trace_paths(pattern: Path | str) -> list[Path]:
    path = Path(str(pattern))
    if path.is_absolute():
        return sorted(path.parent.glob(path.name))
    return sorted(Path().glob(str(pattern)))


def as_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def route_key(route: dict[str, Any] | None) -> tuple[Any, Any] | None:
    if not route:
        return None
    tier = route.get("model_tier") or route.get("route")
    effort = route.get("effort")
    return (tier, effort)


def add_reason(candidate: ReviewCandidate, reason: str, weight: float) -> None:
    if reason in candidate.reasons:
        return
    candidate.reasons.append(reason)
    candidate.score += weight


def apply_router_log(
    candidate: ReviewCandidate,
    entry: dict[str, Any],
    include_raw_prompt: bool,
) -> None:
    primary = entry.get("primary") if isinstance(entry.get("primary"), dict) else {}
    if candidate.router_recommended_route is None and primary:
        candidate.router_recommended_route = {
            "model_tier": primary.get("model_tier") or primary.get("model_size"),
            "effort": primary.get("effort"),
        }
    confidence = as_float(entry.get("confidence"))
    if confidence is not None:
        candidate.confidence = confidence
        if confidence < LOW_CONFIDENCE_THRESHOLD:
            add_reason(
                candidate,
                "low_confidence",
                (LOW_CONFIDENCE_THRESHOLD - confidence) * UNCERTAINTY_WEIGHT,
            )
    if isinstance(entry.get("prompt_excerpt"), str):
        candidate.prompt_excerpt = entry["prompt_excerpt"]
    if include_raw_prompt and isinstance(entry.get(RAW_PROMPT_FIELD), str):
        candidate.prompt = entry[RAW_PROMPT_FIELD]
    candidate.source_events.append("routing_log")


def apply_decision(candidate: ReviewCandidate, payload: dict[str, Any]) -> None:
    recommended = payload.get("router_recommended_route")
    if isinstance(recommended, dict):
        candidate.router_recommended_route = recommended
    selected = payload.get("user_selected_route")
    if isinstance(selected, dict):
        candidate.user_selected_route = selected
    final = payload.get("final_applied_route")
    if isinstance(final, dict):
        candidate.final_applied_route = final
    override_type = payload.get("override_type")
    if isinstance(override_type, str):
        candidate.override_type = override_type
        if override_type != "none":
            add_reason(candidate, override_type, OVERRIDE_WEIGHT)
    confidence = as_float(payload.get("confidence"))
    if confidence is not None:
        candidate.confidence = confidence
        if confidence < LOW_CONFIDENCE_THRESHOLD:
            add_reason(
                candidate,
                "low_confidence",
                (LOW_CONFIDENCE_THRESHOLD - confidence) * UNCERTAINTY_WEIGHT,
            )
    margin = as_float(payload.get("candidate_margin"))
    if margin is not None:
        candidate.candidate_margin = margin
        if margin < CLOSE_MARGIN_THRESHOLD:
            add_reason(
                candidate,
                "close_candidate_margin",
                (CLOSE_MARGIN_THRESHOLD - margin) * MARGIN_WEIGHT,
            )
    features = payload.get("prompt_features")
    if isinstance(features, dict):
        candidate.prompt_features = features
    if route_key(candidate.router_recommended_route) != route_key(candidate.final_applied_route):
        add_reason(candidate, "router_final_disagreement", DISAGREEMENT_WEIGHT)
    fallback_reason = payload.get("fallback_reason")
    if fallback_reason:
        add_reason(candidate, "fallback_applied", FALLBACK_WEIGHT)
    candidate.source_events.append("routing_decision")


def load_candidates(
    routing_log: Path,
    trace_glob: Path | str,
    include_raw_prompt: bool = False,
) -> dict[str, ReviewCandidate]:
    candidates: dict[str, ReviewCandidate] = {}
    for entry in iter_jsonl(routing_log) or []:
        prompt_hash = entry.get("prompt_hash")
        if not isinstance(prompt_hash, str) or not prompt_hash:
            continue
        candidate = candidates.setdefault(prompt_hash, ReviewCandidate(prompt_hash=prompt_hash))
        apply_router_log(candidate, entry, include_raw_prompt)
    for path in trace_paths(trace_glob):
        for entry in iter_jsonl(path) or []:
            if entry.get("event_type") != "routing_decision":
                continue
            payload = entry.get("payload") if isinstance(entry.get("payload"), dict) else {}
            prompt_hash = payload.get("prompt_hash")
            if not isinstance(prompt_hash, str) or not prompt_hash:
                continue
            candidate = candidates.setdefault(prompt_hash, ReviewCandidate(prompt_hash=prompt_hash))
            apply_decision(candidate, payload)
    return candidates


def select_candidates(candidates: dict[str, ReviewCandidate], limit: int) -> list[ReviewCandidate]:
    eligible = [candidate for candidate in candidates.values() if candidate.score > 0]
    return sorted(eligible, key=lambda row: (-row.score, row.prompt_hash))[:limit]


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def reason_counts(candidates: list[ReviewCandidate]) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    for candidate in candidates:
        for reason in candidate.reasons:
            counts[reason] += 1
    return dict(sorted(counts.items()))


def write_review_packet(
    path: Path,
    candidates: list[ReviewCandidate],
    include_raw_prompt: bool,
) -> None:
    lines = [
        "# Prompt-router active-learning review queue",
        "",
        "Review these rows before adding any prompt text to training data.",
        "Raw prompts are omitted unless --include-raw-prompt was explicitly used.",
        "",
    ]
    for index, candidate in enumerate(candidates, start=1):
        lines.extend(
            [
                f"## {index}. {candidate.prompt_hash}",
                "",
                f"score: {candidate.score:.3f}",
                f"reasons: {', '.join(candidate.reasons)}",
                f"router_recommended_route: {candidate.router_recommended_route}",
                f"user_selected_route: {candidate.user_selected_route}",
                f"final_applied_route: {candidate.final_applied_route}",
                f"confidence: {candidate.confidence}",
                f"candidate_margin: {candidate.candidate_margin}",
                f"prompt_features: {candidate.prompt_features}",
                f"prompt_excerpt: {candidate.prompt_excerpt}",
            ]
        )
        if include_raw_prompt and candidate.prompt is not None:
            lines.extend(["", "```", candidate.prompt, "```"])
        lines.append("")
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def create_queue(
    routing_log: Path,
    trace_glob: Path | str,
    output_dir: Path,
    limit: int,
    include_raw_prompt: bool = False,
) -> dict[str, Any]:
    candidates = load_candidates(routing_log, trace_glob, include_raw_prompt)
    selected = select_candidates(candidates, limit)
    output_dir.mkdir(parents=True, exist_ok=True)
    rows = [candidate.to_json(include_raw_prompt) for candidate in selected]
    write_jsonl(output_dir / "candidates.jsonl", rows)
    write_review_packet(output_dir / "review_packet.md", selected, include_raw_prompt)
    summary = {
        "routing_log": str(routing_log),
        "trace_glob": str(trace_glob),
        "candidate_count": len(candidates),
        "selected_count": len(selected),
        "limit": limit,
        "include_raw_prompt": include_raw_prompt,
        "reason_counts": reason_counts(selected),
        "generated_at": datetime.now(UTC).isoformat(),
    }
    (output_dir / "summary.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return summary


def timestamped_output_dir(output_root: Path) -> Path:
    stamp = datetime.now(UTC).strftime("review-queue-%Y%m%dT%H%M%SZ")
    return output_root / stamp


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--routing-log", type=Path, default=DEFAULT_ROUTING_LOG)
    parser.add_argument("--trace-glob", default=str(DEFAULT_TRACE_GLOB))
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT)
    parser.add_argument("--include-raw-prompt", action="store_true")
    args = parser.parse_args()

    output_dir = args.output_dir or timestamped_output_dir(args.output_root)
    summary = create_queue(
        routing_log=args.routing_log,
        trace_glob=args.trace_glob,
        output_dir=output_dir,
        limit=max(args.limit, 1),
        include_raw_prompt=args.include_raw_prompt,
    )
    print(f"wrote {summary['selected_count']} candidates to {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
