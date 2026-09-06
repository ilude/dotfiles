"""Tests for prompt-router active-learning queue generation."""

from __future__ import annotations

import json
from pathlib import Path

from active_learning_queue import create_queue


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text(
        "".join(json.dumps(row, sort_keys=True) + "\n" for row in rows),
        encoding="utf-8",
    )


def test_create_queue_prioritizes_overrides_and_omits_raw_prompt(tmp_path):
    routing_log = tmp_path / "routing_log.jsonl"
    trace_file = tmp_path / "trace.jsonl"
    output_dir = tmp_path / "queue"
    raw_prompt = "private prompt text should not be emitted"
    write_jsonl(
        routing_log,
        [
            {
                "prompt_hash": "hash-1",
                "prompt": raw_prompt,
                "primary": {"model_tier": "mini", "effort": "low"},
                "confidence": 0.42,
            },
            {
                "prompt_hash": "hash-2",
                "primary": {"model_tier": "core", "effort": "medium"},
                "confidence": 0.95,
            },
        ],
    )
    write_jsonl(
        trace_file,
        [
            {
                "event_type": "routing_decision",
                "payload": {
                    "prompt_hash": "hash-1",
                    "router_recommended_route": {"model_tier": "mini", "effort": "low"},
                    "user_selected_route": {"route": "large", "effort": "high"},
                    "final_applied_route": {"model_tier": "large", "effort": "high"},
                    "override_type": "user_effort_up",
                    "confidence": 0.42,
                    "candidate_margin": 0.03,
                    "prompt_features": {"estimated_chars": 88, "message_count": 1},
                    "prompt_excerpt": None,
                },
            }
        ],
    )

    summary = create_queue(
        routing_log=routing_log,
        trace_glob=trace_file,
        output_dir=output_dir,
        limit=10,
    )

    assert summary["selected_count"] == 1
    candidates_text = (output_dir / "candidates.jsonl").read_text(encoding="utf-8")
    row = json.loads(candidates_text)
    assert row["prompt_hash"] == "hash-1"
    assert "user_effort_up" in row["reasons"]
    assert "close_candidate_margin" in row["reasons"]
    assert "low_confidence" in row["reasons"]
    assert "prompt" not in row
    assert raw_prompt not in candidates_text
    assert raw_prompt not in (output_dir / "review_packet.md").read_text(encoding="utf-8")


def test_create_queue_can_include_raw_prompt_with_explicit_opt_in(tmp_path):
    routing_log = tmp_path / "routing_log.jsonl"
    trace_file = tmp_path / "trace.jsonl"
    output_dir = tmp_path / "queue"
    raw_prompt = "explicitly reviewed prompt"
    write_jsonl(
        routing_log,
        [
            {
                "prompt_hash": "hash-1",
                "prompt": raw_prompt,
                "primary": {"model_tier": "mini", "effort": "low"},
                "confidence": 0.1,
            }
        ],
    )
    trace_file.write_text("", encoding="utf-8")

    create_queue(
        routing_log=routing_log,
        trace_glob=trace_file,
        output_dir=output_dir,
        limit=10,
        include_raw_prompt=True,
    )

    row = json.loads((output_dir / "candidates.jsonl").read_text(encoding="utf-8"))
    assert row["prompt"] == raw_prompt
    assert raw_prompt in (output_dir / "review_packet.md").read_text(encoding="utf-8")
