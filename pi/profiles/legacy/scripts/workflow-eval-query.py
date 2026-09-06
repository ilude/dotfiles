#!/usr/bin/env python
"""Summarize Pi workflow telemetry JSONL.

DuckDB is used when available. A standard-library fallback keeps the helper
usable before optional analysis dependencies are installed.
"""

from __future__ import annotations

import argparse
import json
import os
from collections import Counter
from collections.abc import Iterable
from pathlib import Path
from typing import Any

DEFAULT_TELEMETRY_DIR = Path.home() / ".pi" / "workflow-telemetry"


def expand_path(value: str) -> Path:
    return Path(os.path.expandvars(os.path.expanduser(value)))


def iter_jsonl(paths: Iterable[Path]) -> Iterable[dict[str, Any]]:
    for path in paths:
        if not path.exists():
            continue
        with path.open("r", encoding="utf-8") as handle:
            for line_number, line in enumerate(handle, 1):
                stripped = line.strip()
                if not stripped:
                    continue
                try:
                    yield json.loads(stripped)
                except json.JSONDecodeError as exc:
                    raise ValueError(f"Invalid JSONL in {path}:{line_number}: {exc}") from exc


def event_files(telemetry_dir: Path) -> list[Path]:
    return sorted(telemetry_dir.glob("**/events.jsonl"))


def episode_file(telemetry_dir: Path) -> Path:
    return telemetry_dir / "episodes.jsonl"


def summarize_with_stdlib(telemetry_dir: Path) -> str:
    episodes = list(iter_jsonl([episode_file(telemetry_dir)]))
    events = list(iter_jsonl(event_files(telemetry_dir)))
    event_counts = Counter(event.get("event_type", "unknown") for event in events)
    commands = Counter(episode.get("command", "unknown") for episode in episodes)

    lines = [
        "Workflow telemetry summary",
        f"telemetry_dir: {telemetry_dir}",
        f"episodes: {len(episodes)}",
        f"events: {len(events)}",
        "",
        "Commands:",
    ]
    if commands:
        lines.extend(f"  {name}: {count}" for name, count in sorted(commands.items()))
    else:
        lines.append("  none")

    lines.append("")
    lines.append("Event types:")
    if event_counts:
        lines.extend(f"  {name}: {count}" for name, count in sorted(event_counts.items()))
    else:
        lines.append("  none")

    review_yield_events = [event for event in events if event.get("event_type") == "review_yield"]
    if review_yield_events:
        totals = Counter()
        for event in review_yield_events:
            payload = event.get("review_yield") or {}
            for key in (
                "total_findings",
                "must_fix",
                "hardening",
                "duplicates",
                "low_value_theater",
                "false_positives",
                "applied",
                "rejected",
            ):
                value = payload.get(key)
                if isinstance(value, int):
                    totals[key] += value
        lines.append("")
        lines.append("Review yield totals:")
        lines.extend(f"  {name}: {count}" for name, count in sorted(totals.items()))

    panel_quality_events = [
        event for event in events if event.get("event_type") == "panel_quality_label"
    ]
    if panel_quality_events:
        sizing = Counter(
            (event.get("panel_quality_label") or {}).get("sizing", "unknown")
            for event in panel_quality_events
        )
        lines.append("")
        lines.append("Panel sizing labels:")
        lines.extend(f"  {name}: {count}" for name, count in sorted(sizing.items()))

    return "\n".join(lines)


def summarize_with_duckdb(telemetry_dir: Path) -> str | None:
    try:
        import duckdb  # type: ignore[import-not-found]
    except ModuleNotFoundError:
        return None

    events_glob = str(telemetry_dir / "**" / "events.jsonl").replace("\\", "/")
    episodes_path = str(episode_file(telemetry_dir)).replace("\\", "/")
    con = duckdb.connect()

    episodes = 0
    if episode_file(telemetry_dir).exists():
        episodes = con.execute(
            "SELECT count(*) FROM read_ndjson_auto(?, union_by_name = true)",
            [episodes_path],
        ).fetchone()[0]

    event_paths = event_files(telemetry_dir)
    events = 0
    event_rows: list[tuple[str, int]] = []
    panel_rows: list[tuple[str, int]] = []
    if event_paths:
        events = con.execute(
            "SELECT count(*) FROM read_ndjson_auto(?, union_by_name = true)",
            [events_glob],
        ).fetchone()[0]
        event_rows = con.execute(
            """
            SELECT coalesce(event_type, 'unknown') AS event_type, count(*) AS count
            FROM read_ndjson_auto(?, union_by_name = true)
            GROUP BY event_type
            ORDER BY event_type
            """,
            [events_glob],
        ).fetchall()
        panel_rows = con.execute(
            """
            SELECT
              coalesce(panel_quality_label.sizing, 'unknown') AS sizing,
              count(*) AS count
            FROM read_ndjson_auto(?, union_by_name = true)
            WHERE event_type = 'panel_quality_label'
            GROUP BY sizing
            ORDER BY sizing
            """,
            [events_glob],
        ).fetchall()

    lines = [
        "Workflow telemetry summary",
        f"telemetry_dir: {telemetry_dir}",
        "engine: duckdb",
        f"episodes: {episodes}",
        f"events: {events}",
        "",
        "Event types:",
    ]
    if event_rows:
        lines.extend(f"  {name}: {count}" for name, count in event_rows)
    else:
        lines.append("  none")

    if panel_rows:
        lines.append("")
        lines.append("Panel sizing labels:")
        lines.extend(f"  {name}: {count}" for name, count in panel_rows)

    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Summarize Pi workflow telemetry JSONL")
    parser.add_argument(
        "--telemetry-dir",
        default=str(DEFAULT_TELEMETRY_DIR),
        help="Telemetry directory, default: ~/.pi/workflow-telemetry",
    )
    parser.add_argument(
        "--no-duckdb",
        action="store_true",
        help="Use the standard-library JSONL reader even when DuckDB is installed",
    )
    args = parser.parse_args()

    telemetry_dir = expand_path(args.telemetry_dir)
    if not telemetry_dir.exists():
        print(f"No telemetry directory found: {telemetry_dir}")
        return 0

    summary = None if args.no_duckdb else summarize_with_duckdb(telemetry_dir)
    if summary is None:
        summary = summarize_with_stdlib(telemetry_dir)
    print(summary)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
