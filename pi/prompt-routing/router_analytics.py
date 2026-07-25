"""DuckDB analytics over prompt-router and Pi transcript JSONL logs.

This is the canonical local analytics entrypoint for prompt routing. It keeps
raw logs append-only and builds a consistent joined view at query time.

Usage:
    uv run --project pi/prompt-routing python pi/prompt-routing/router_analytics.py
    uv run --project pi/prompt-routing python pi/prompt-routing/router_analytics.py --limit 50
    uv run --project pi/prompt-routing python pi/prompt-routing/router_analytics.py --csv
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import duckdb

_DIR = Path(__file__).parent
DEFAULT_ROUTING_LOG = _DIR / "logs" / "routing_log.jsonl"
DEFAULT_TRACE_GLOB = Path.home() / ".pi" / "agent" / "traces" / "*.jsonl"
ROUTER_COLUMNS = [
    "router_ts",
    "router_time",
    "prompt_hash",
    "route_decision_id",
    "legacy_occurrence",
    "prompt_excerpt",
    "prompt",
    "classifier_model_size",
    "classifier_effort",
    "confidence",
    "elapsed_us",
    "schema_version",
]
LEGACY_ROUTE_DECISION_ID = re.compile(r"^route-[0-9a-f]{16}$")

DECISION_COLUMNS = [
    "session_id",
    "turn_id",
    "trace_id",
    "transcript_time",
    "prompt_hash",
    "route_decision_id",
    "legacy_occurrence",
    "transcript_prompt_excerpt",
    "applied_route",
    "selected_model_size",
    "actual_provider",
    "actual_model_id",
    "actual_model_name",
    "model_switch_applied",
    "runtime_confidence",
    "rule_fired",
    "fallback_metadata",
]


def _iter_jsonl(path: Path):
    if not path.exists():
        return
    with path.open(encoding="utf-8", errors="replace") as f:
        for line in f:
            if not line.strip():
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def _excerpt(prompt: str | None, max_chars: int = 160) -> str | None:
    if not prompt:
        return None
    if len(prompt) <= max_chars:
        return prompt
    return f"{prompt[: max_chars - 3]}..."


def _has_matches(pattern: Path | str) -> bool:
    path = Path(str(pattern))
    if path.is_absolute():
        return bool(list(path.parent.glob(path.name)))
    return bool(list(Path().glob(str(pattern))))


def _trace_paths(pattern: Path | str) -> list[Path]:
    path = Path(str(pattern))
    if path.is_absolute():
        return sorted(path.parent.glob(path.name))
    return sorted(Path().glob(str(pattern)))


def _format_epoch(ts: Any) -> str | None:
    try:
        return datetime.fromtimestamp(float(ts), UTC).isoformat()
    except (TypeError, ValueError, OSError):
        return None


def _next_legacy_occurrence(counts: dict[str, int], prompt_hash: Any) -> int | None:
    if not isinstance(prompt_hash, str):
        return None
    occurrence = counts.get(prompt_hash, 0) + 1
    counts[prompt_hash] = occurrence
    return occurrence


def _current_route_decision_id(value: Any) -> str | None:
    if not isinstance(value, str) or LEGACY_ROUTE_DECISION_ID.fullmatch(value):
        return None
    return value


def load_router_rows(routing_log: Path) -> list[tuple[Any, ...]]:
    rows: list[tuple[Any, ...]] = []
    occurrences: dict[str, int] = {}
    for entry in _iter_jsonl(routing_log) or []:
        primary = entry.get("primary") if isinstance(entry.get("primary"), dict) else {}
        prompt = entry.get("prompt") if isinstance(entry.get("prompt"), str) else None
        prompt_hash = entry.get("prompt_hash")
        route_decision_id = _current_route_decision_id(entry.get("route_decision_id"))
        prompt_excerpt = entry.get("prompt_excerpt") or _excerpt(prompt)
        rows.append(
            (
                entry.get("ts"),
                entry.get("timestamp") or _format_epoch(entry.get("ts")),
                prompt_hash,
                route_decision_id,
                (
                    _next_legacy_occurrence(occurrences, prompt_hash)
                    if route_decision_id is None
                    else None
                ),
                prompt_excerpt,
                prompt,
                primary.get("model_size") or primary.get("model_tier"),
                primary.get("effort"),
                entry.get("confidence"),
                entry.get("elapsed_us"),
                entry.get("schema_version"),
            )
        )
    return rows


def load_decision_rows(trace_glob: Path | str) -> list[tuple[Any, ...]]:
    rows: list[tuple[Any, ...]] = []
    occurrences: dict[str, int] = {}
    entries: list[tuple[int, dict[str, Any]]] = []
    sequence = 0
    for path in _trace_paths(trace_glob):
        for entry in _iter_jsonl(path) or []:
            if entry.get("event_type") == "routing_decision":
                entries.append((sequence, entry))
                sequence += 1
    entries.sort(key=lambda item: (str(item[1].get("timestamp") or ""), item[0]))
    for _, entry in entries:
        payload = entry.get("payload") if isinstance(entry.get("payload"), dict) else {}
        actual_model = (
            payload.get("actual_model") if isinstance(payload.get("actual_model"), dict) else {}
        )
        prompt_hash = payload.get("prompt_hash")
        route_decision_id = _current_route_decision_id(payload.get("route_decision_id"))
        rows.append(
            (
                entry.get("session_id"),
                entry.get("turn_id"),
                entry.get("trace_id"),
                entry.get("timestamp"),
                prompt_hash,
                route_decision_id,
                (
                    _next_legacy_occurrence(occurrences, prompt_hash)
                    if route_decision_id is None
                    else None
                ),
                payload.get("prompt_excerpt"),
                payload.get("applied_route"),
                payload.get("selected_model_size"),
                actual_model.get("provider"),
                actual_model.get("id"),
                actual_model.get("name"),
                payload.get("model_switch_applied"),
                payload.get("confidence"),
                payload.get("rule_fired"),
                json.dumps(payload.get("fallback_metadata"), ensure_ascii=False),
            )
        )
    return rows


def _create_table(con: duckdb.DuckDBPyConnection, name: str, columns: list[str]) -> None:
    defs = ", ".join(f"{column} VARCHAR" for column in columns)
    con.sql(f"CREATE TABLE {name} ({defs})")


def connect_with_views(routing_log: Path, trace_glob: Path | str) -> duckdb.DuckDBPyConnection:
    con = duckdb.connect(database=":memory:")
    _create_table(con, "router_log", ROUTER_COLUMNS)
    _create_table(con, "routing_decisions", DECISION_COLUMNS)
    router_rows = load_router_rows(routing_log)
    decision_rows = load_decision_rows(trace_glob)
    if router_rows:
        placeholders = ", ".join("?" for _ in ROUTER_COLUMNS)
        con.executemany(f"INSERT INTO router_log VALUES ({placeholders})", router_rows)
    if decision_rows:
        placeholders = ", ".join("?" for _ in DECISION_COLUMNS)
        con.executemany(f"INSERT INTO routing_decisions VALUES ({placeholders})", decision_rows)

    con.sql(
        """
        CREATE VIEW router_session_view AS
        SELECT
          r.router_ts,
          r.router_time,
          r.prompt_hash,
          r.route_decision_id,
          r.prompt_excerpt,
          r.prompt,
          r.classifier_model_size,
          r.classifier_effort,
          CAST(r.confidence AS DOUBLE) AS confidence,
          CAST(r.elapsed_us AS DOUBLE) AS elapsed_us,
          d.session_id,
          d.turn_id,
          d.trace_id,
          d.transcript_time,
          d.applied_route,
          d.selected_model_size,
          d.actual_provider,
          d.actual_model_id,
          d.actual_model_name,
          CAST(d.model_switch_applied AS BOOLEAN) AS model_switch_applied,
          d.rule_fired,
          d.fallback_metadata
        FROM router_log r
        LEFT JOIN routing_decisions d
          ON (
            r.route_decision_id IS NOT NULL
            AND d.route_decision_id IS NOT NULL
            AND r.route_decision_id = d.route_decision_id
          )
          OR (
            r.route_decision_id IS NULL
            AND d.route_decision_id IS NULL
            AND r.prompt_hash = d.prompt_hash
            AND r.legacy_occurrence = d.legacy_occurrence
          );
        """
    )
    return con


def print_table(rows: list[tuple[Any, ...]], headers: list[str]) -> None:
    if not rows:
        print("No rows.")
        return
    widths = [len(h) for h in headers]
    for row in rows:
        for i, value in enumerate(row):
            widths[i] = max(widths[i], len(str(value or "")))
    print(" | ".join(h.ljust(widths[i]) for i, h in enumerate(headers)))
    print("-+-".join("-" * w for w in widths))
    for row in rows:
        print(" | ".join(str(value or "").ljust(widths[i]) for i, value in enumerate(row)))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--routing-log", type=Path, default=DEFAULT_ROUTING_LOG)
    parser.add_argument("--trace-glob", default=os.fspath(DEFAULT_TRACE_GLOB))
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--csv", action="store_true", help="write joined rows as CSV")
    args = parser.parse_args()

    if not args.routing_log.exists():
        print(f"routing log not found: {args.routing_log}", file=sys.stderr)
        return 1
    if not _has_matches(args.trace_glob):
        print(f"warning: no transcript traces matched {args.trace_glob}", file=sys.stderr)

    con = connect_with_views(args.routing_log, args.trace_glob)
    query = f"""
        SELECT
          router_time,
          prompt_hash,
          classifier_model_size,
          classifier_effort,
          confidence,
          selected_model_size,
          actual_provider,
          actual_model_id,
          rule_fired,
          prompt_excerpt
        FROM router_session_view
        ORDER BY CAST(router_ts AS DOUBLE) DESC
        LIMIT {max(args.limit, 1)}
    """
    result = con.sql(query)
    headers = [d[0] for d in result.description]
    rows = result.fetchall()

    if args.csv:
        writer = csv.writer(sys.stdout, lineterminator="\n")
        writer.writerow(headers)
        writer.writerows(rows)
    else:
        print_table(rows, headers)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
