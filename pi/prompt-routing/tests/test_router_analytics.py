"""Correlation tests for prompt-router analytics joins."""

from __future__ import annotations

import json
from pathlib import Path

from router_analytics import connect_with_views


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text(
        "".join(json.dumps(row) + "\n" for row in rows),
        encoding="utf-8",
    )


def router_log_row(ts: float, route_decision_id: str | None, model_size: str) -> dict:
    row = {
        "ts": ts,
        "prompt_hash": "repeated-prompt-hash",
        "primary": {"model_size": model_size, "effort": "medium"},
        "confidence": 0.8,
        "elapsed_us": 100.0,
        "schema_version": "3.0.0",
    }
    if route_decision_id is not None:
        row["route_decision_id"] = route_decision_id
    return row


def trace_row(
    turn_id: str,
    route_decision_id: str | None,
    selected_model_size: str,
    timestamp: str,
) -> dict:
    payload = {
        "prompt_hash": "repeated-prompt-hash",
        "selected_model_size": selected_model_size,
    }
    if route_decision_id is not None:
        payload["route_decision_id"] = route_decision_id
    return {
        "event_type": "routing_decision",
        "turn_id": turn_id,
        "timestamp": timestamp,
        "payload": payload,
    }


def test_analytics_joins_repeated_prompt_hashes_by_route_decision_id(tmp_path):
    routing_log = tmp_path / "routing_log.jsonl"
    trace_file = tmp_path / "trace.jsonl"
    write_jsonl(
        routing_log,
        [
            router_log_row(1.0, "route-first", "small"),
            router_log_row(2.0, "route-second", "large"),
        ],
    )
    write_jsonl(
        trace_file,
        [
            trace_row(
                "turn-second",
                "route-second",
                "large",
                "2026-01-01T00:00:02.000Z",
            ),
            trace_row(
                "turn-first",
                "route-first",
                "small",
                "2026-01-01T00:00:01.000Z",
            ),
        ],
    )

    con = connect_with_views(routing_log, trace_file)
    rows = con.sql(
        """
        SELECT route_decision_id, classifier_model_size, selected_model_size, turn_id
        FROM router_session_view
        ORDER BY route_decision_id
        """
    ).fetchall()

    assert rows == [
        ("route-first", "small", "small", "turn-first"),
        ("route-second", "large", "large", "turn-second"),
    ]


def test_analytics_uses_occurrence_fallback_for_legacy_repeated_prompt_hashes(tmp_path):
    routing_log = tmp_path / "routing_log.jsonl"
    trace_file = tmp_path / "trace.jsonl"
    write_jsonl(
        routing_log,
        [
            router_log_row(1.0, None, "small"),
            router_log_row(2.0, None, "large"),
        ],
    )
    write_jsonl(
        trace_file,
        [
            trace_row(
                "turn-second",
                None,
                "large",
                "2026-01-01T00:00:02.000Z",
            ),
            trace_row(
                "turn-first",
                "route-0123456789abcdef",
                "small",
                "2026-01-01T00:00:01.000Z",
            ),
        ],
    )

    con = connect_with_views(routing_log, trace_file)
    rows = con.sql(
        """
        SELECT classifier_model_size, selected_model_size, turn_id
        FROM router_session_view
        ORDER BY CAST(router_ts AS DOUBLE)
        """
    ).fetchall()

    assert rows == [
        ("small", "small", "turn-first"),
        ("large", "large", "turn-second"),
    ]
