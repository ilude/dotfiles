#!/usr/bin/env python
"""Query Pi runtime JSONL through explicit DuckDB views."""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional, Sequence

import duckdb

MAX_QUERY_ROWS = 1_000
MAX_VALIDATION_ISSUES = 100
TABLE_CELL_CHARS = 120

Columns = tuple[tuple[str, str], ...]
PathResolver = Callable[["SourceLayout"], list[Path]]


@dataclass(frozen=True)
class SourceLayout:
    repo_root: Path
    agent_dir: Path
    metrics_dir: Path
    trace_dir: Path
    workflow_telemetry_dir: Path
    coms_lan_dir: Path

    @property
    def workflow_friction_dir(self) -> Path:
        override = os.environ.get("PI_WORKFLOW_FRICTION_DIR")
        return Path(override).expanduser() if override else self.agent_dir / "workflow-friction"

    @property
    def operator_dir(self) -> Path:
        override = os.environ.get("PI_OPERATOR_DIR")
        return Path(override).expanduser() if override else self.agent_dir / "operator"


@dataclass(frozen=True)
class SourceSpec:
    name: str
    description: str
    sensitivity: str
    columns: Columns
    resolve_paths: PathResolver


def _files(root: Path, *patterns: str) -> list[Path]:
    if not root.is_dir():
        return []
    found: set[Path] = set()
    for pattern in patterns:
        found.update(path for path in root.rglob(pattern) if path.is_file())
    return sorted(found)


def _one(path: Path) -> list[Path]:
    return [path] if path.is_file() else []


def _default_repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _configured_trace_dir(agent_dir: Path) -> Path:
    fallback = agent_dir / "traces"
    try:
        settings = json.loads((agent_dir / "settings.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return fallback
    transcript = settings.get("transcript") if isinstance(settings, dict) else None
    configured = transcript.get("path") if isinstance(transcript, dict) else None
    if not isinstance(configured, str) or not configured:
        return fallback
    return Path(configured).expanduser()


def default_layout(
    repo_root: Optional[Path] = None,
    agent_dir: Optional[Path] = None,
    metrics_dir: Optional[Path] = None,
    trace_dir: Optional[Path] = None,
    workflow_telemetry_dir: Optional[Path] = None,
    coms_lan_dir: Optional[Path] = None,
) -> SourceLayout:
    home = Path.home()
    resolved_repo = (repo_root or _default_repo_root()).expanduser().resolve()
    resolved_agent = Path(
        agent_dir or os.environ.get("PI_AGENT_DIR", home / ".pi" / "agent")
    ).expanduser()
    resolved_metrics = metrics_dir or Path(
        os.environ.get("PI_METRICS_DIR", resolved_agent / "logs")
    )
    resolved_trace = trace_dir or _configured_trace_dir(resolved_agent)
    resolved_workflow = workflow_telemetry_dir or Path(
        os.environ.get("PI_WORKFLOW_TELEMETRY_DIR", home / ".pi" / "workflow-telemetry")
    )
    resolved_coms = coms_lan_dir or Path(
        os.environ.get("PI_COMS_LAN_DIR", home / ".pi" / "coms-lan")
    )
    return SourceLayout(
        repo_root=resolved_repo,
        agent_dir=resolved_agent.resolve(),
        metrics_dir=resolved_metrics.expanduser().resolve(),
        trace_dir=resolved_trace.expanduser().resolve(),
        workflow_telemetry_dir=resolved_workflow.expanduser().resolve(),
        coms_lan_dir=resolved_coms.expanduser().resolve(),
    )


SESSION_COLUMNS: Columns = (
    ("type", "VARCHAR"),
    ("version", "UBIGINT"),
    ("id", "VARCHAR"),
    ("parentId", "VARCHAR"),
    ("timestamp", "VARCHAR"),
    ("cwd", "VARCHAR"),
    ("provider", "VARCHAR"),
    ("modelId", "VARCHAR"),
    ("thinkingLevel", "VARCHAR"),
    ("message", "JSON"),
    ("customType", "VARCHAR"),
    ("content", "JSON"),
    ("display", "BOOLEAN"),
    ("details", "JSON"),
    ("summary", "VARCHAR"),
    ("firstKeptEntryId", "VARCHAR"),
    ("tokensBefore", "UBIGINT"),
    ("fromHook", "BOOLEAN"),
    ("data", "JSON"),
)

SOURCES: tuple[SourceSpec, ...] = (
    SourceSpec(
        "session_entries",
        "Canonical Pi session entries; do not union with history_entries by default.",
        "content",
        SESSION_COLUMNS,
        lambda layout: _files(layout.agent_dir / "sessions", "*.jsonl", "*.jsonl.gz"),
    ),
    SourceSpec(
        "history_entries",
        "Archived session copies that may overlap session_entries.",
        "content",
        SESSION_COLUMNS,
        lambda layout: _files(layout.agent_dir / "history", "*.jsonl", "*.jsonl.gz"),
    ),
    SourceSpec(
        "metric_events",
        "Structured extension metrics.",
        "metadata",
        (
            ("schemaVersion", "UBIGINT"),
            ("id", "VARCHAR"),
            ("ts", "VARCHAR"),
            ("event", "VARCHAR"),
            ("session", "VARCHAR"),
            ("data", "JSON"),
        ),
        lambda layout: _files(layout.metrics_dir, "metrics*.jsonl"),
    ),
    SourceSpec(
        "trace_events",
        "Sidecar transcript trace envelopes with payload stored as JSON.",
        "content",
        (
            ("schema_version", "VARCHAR"),
            ("event_id", "VARCHAR"),
            ("session_id", "VARCHAR"),
            ("turn_id", "VARCHAR"),
            ("message_id", "VARCHAR"),
            ("tool_call_id", "VARCHAR"),
            ("trace_id", "VARCHAR"),
            ("parent_trace_id", "VARCHAR"),
            ("event_type", "VARCHAR"),
            ("timestamp", "VARCHAR"),
            ("monotonic_ns", "VARCHAR"),
            ("payload", "JSON"),
        ),
        lambda layout: _files(layout.trace_dir, "*.jsonl", "*.jsonl.gz"),
    ),
    SourceSpec(
        "usage_events",
        "Usage extension operational events.",
        "metadata",
        (
            ("schemaVersion", "UBIGINT"),
            ("id", "VARCHAR"),
            ("event", "VARCHAR"),
            ("ts", "VARCHAR"),
            ("timestamp", "VARCHAR"),
            ("cachePath", "VARCHAR"),
            ("reason", "VARCHAR"),
            ("elapsedMs", "BIGINT"),
            ("message", "VARCHAR"),
        ),
        lambda layout: _one(layout.agent_dir / "logs" / "usage.jsonl"),
    ),
    SourceSpec(
        "classifier_failures",
        "Prompt classifier failure records without prompt text.",
        "metadata",
        (
            ("schema_version", "UBIGINT"),
            ("id", "VARCHAR"),
            ("ts", "VARCHAR"),
            ("timestamp", "VARCHAR"),
            ("event", "VARCHAR"),
            ("route_decision_id", "VARCHAR"),
            ("prompt_hash", "VARCHAR"),
            ("error", "VARCHAR"),
            ("classifier_mode", "VARCHAR"),
            ("code", "BIGINT"),
            ("prompt_length", "BIGINT"),
            ("elapsed_ms", "BIGINT"),
            ("stdout_length", "BIGINT"),
            ("stderr_length", "BIGINT"),
        ),
        lambda layout: _one(
            layout.repo_root / "pi" / "prompt-routing" / "logs" / "classifier_failures.jsonl"
        ),
    ),
    SourceSpec(
        "workflow_episodes",
        "Workflow command episode envelopes.",
        "metadata",
        (
            ("schema_version", "UBIGINT"),
            ("episode_id", "VARCHAR"),
            ("command", "VARCHAR"),
            ("artifact_path", "VARCHAR"),
            ("repo_root", "VARCHAR"),
            ("started_at", "VARCHAR"),
            ("status", "VARCHAR"),
            ("redaction_status", "VARCHAR"),
        ),
        lambda layout: _one(layout.workflow_telemetry_dir / "episodes.jsonl"),
    ),
    SourceSpec(
        "workflow_events",
        "Workflow phase and runtime events.",
        "metadata",
        (
            ("schema_version", "UBIGINT"),
            ("episode_id", "VARCHAR"),
            ("event_id", "VARCHAR"),
            ("phase_id", "VARCHAR"),
            ("event_type", "VARCHAR"),
            ("command_line", "VARCHAR"),
            ("status", "VARCHAR"),
            ("evidence", "VARCHAR"),
            ("data", "JSON"),
            ("created_at", "VARCHAR"),
        ),
        lambda layout: _files(layout.workflow_telemetry_dir, "events.jsonl"),
    ),
    SourceSpec(
        "friction_interactions",
        "Workflow-friction interaction measurements.",
        "metadata",
        (
            ("schemaVersion", "UBIGINT"),
            ("interactionId", "VARCHAR"),
            ("sessionId", "VARCHAR"),
            ("mode", "VARCHAR"),
            ("startedAt", "VARCHAR"),
            ("settledAt", "VARCHAR"),
            ("durationMs", "BIGINT"),
            ("selected", "BOOLEAN"),
            ("selectionReasons", "JSON"),
            ("toolCount", "BIGINT"),
            ("toolFailureCount", "BIGINT"),
            ("validationCount", "BIGINT"),
            ("subagentCount", "BIGINT"),
            ("failedSubagentCount", "BIGINT"),
            ("fileMutationCount", "BIGINT"),
        ),
        lambda layout: _one(layout.workflow_friction_dir / "interactions.jsonl"),
    ),
    SourceSpec(
        "friction_reviews",
        "Workflow-friction review outcomes.",
        "metadata",
        (
            ("schemaVersion", "UBIGINT"),
            ("interactionId", "VARCHAR"),
            ("sessionId", "VARCHAR"),
            ("reviewedAt", "VARCHAR"),
            ("startedAt", "VARCHAR"),
            ("durationMs", "BIGINT"),
            ("subagentStartedAt", "VARCHAR"),
            ("mode", "VARCHAR"),
            ("selectionReasons", "JSON"),
            ("status", "VARCHAR"),
            ("error", "VARCHAR"),
            ("review", "JSON"),
        ),
        lambda layout: _one(layout.workflow_friction_dir / "reviews.jsonl"),
    ),
    SourceSpec(
        "friction_experiments",
        "Workflow-friction experiment definitions.",
        "metadata",
        (
            ("schemaVersion", "UBIGINT"),
            ("experimentId", "VARCHAR"),
            ("recordedAt", "VARCHAR"),
            ("sessionId", "VARCHAR"),
            ("pattern", "VARCHAR"),
            ("treatment", "VARCHAR"),
            ("surfaces", "JSON"),
        ),
        lambda layout: _one(layout.workflow_friction_dir / "experiments.jsonl"),
    ),
    SourceSpec(
        "friction_learning_decisions",
        "Approved or skipped workflow-friction learning decisions.",
        "metadata",
        (
            ("schemaVersion", "UBIGINT"),
            ("candidateId", "VARCHAR"),
            ("decidedAt", "VARCHAR"),
            ("decision", "VARCHAR"),
            ("decisionText", "VARCHAR"),
            ("approvedText", "VARCHAR"),
            ("targetPaths", "JSON"),
            ("validation", "VARCHAR"),
            ("rollback", "VARCHAR"),
            ("reason", "VARCHAR"),
            ("experimentId", "VARCHAR"),
        ),
        lambda layout: _one(layout.workflow_friction_dir / "learning-decisions.jsonl"),
    ),
    SourceSpec(
        "routing_classifier_events",
        "Prompt-router classifier decisions; prompt text is intentionally omitted.",
        "metadata",
        (
            ("ts", "DOUBLE"),
            ("timestamp", "VARCHAR"),
            ("prompt_hash", "VARCHAR"),
            ("route_decision_id", "VARCHAR"),
            ("primary", "JSON"),
            ("confidence", "DOUBLE"),
            ("elapsed_us", "DOUBLE"),
            ("schema_version", "VARCHAR"),
        ),
        lambda layout: _one(
            layout.repo_root / "pi" / "prompt-routing" / "logs" / "routing_log.jsonl"
        ),
    ),
    SourceSpec(
        "damage_control_judgments",
        "Damage-control shadow-judge outcomes.",
        "metadata",
        (
            ("schemaVersion", "UBIGINT"),
            ("id", "VARCHAR"),
            ("ts", "VARCHAR"),
            ("eventId", "VARCHAR"),
            ("verdict", "VARCHAR"),
            ("reason", "VARCHAR"),
            ("model", "VARCHAR"),
            ("latencyMs", "BIGINT"),
            ("recordedAt", "VARCHAR"),
        ),
        lambda layout: _one(layout.operator_dir / "damage-control" / "judge.jsonl"),
    ),
    SourceSpec(
        "coms_audit_events",
        "Coms LAN redacted audit records.",
        "metadata",
        (
            ("schemaVersion", "UBIGINT"),
            ("id", "VARCHAR"),
            ("ts", "VARCHAR"),
            ("type", "VARCHAR"),
            ("nodeId", "VARCHAR"),
            ("remoteNodeId", "VARCHAR"),
            ("messageId", "VARCHAR"),
            ("result", "VARCHAR"),
            ("reason", "VARCHAR"),
        ),
        lambda layout: _files(layout.coms_lan_dir, "audit.jsonl", "audit.jsonl.*"),
    ),
)


def _quoted_identifier(value: str) -> str:
    return f'"{value.replace(chr(34), chr(34) * 2)}"'


def _create_empty_source(connection: duckdb.DuckDBPyConnection, spec: SourceSpec) -> None:
    definitions = ", ".join(
        f"{_quoted_identifier(name)} {data_type}" for name, data_type in spec.columns
    )
    connection.execute(
        f"CREATE TABLE {_quoted_identifier(spec.name)} ({definitions}, filename VARCHAR)"
    )


def register_source_views(
    connection: duckdb.DuckDBPyConnection,
    layout: SourceLayout,
    ignore_errors: bool = False,
) -> dict[str, list[Path]]:
    source_paths: dict[str, list[Path]] = {}
    for spec in SOURCES:
        paths = spec.resolve_paths(layout)
        source_paths[spec.name] = paths
        if not paths:
            _create_empty_source(connection, spec)
            continue
        relation = connection.read_json(
            [str(path) for path in paths],
            columns=dict(spec.columns),
            format="newline_delimited",
            filename=True,
            ignore_errors=ignore_errors,
        )
        relation.create_view(spec.name)
    return source_paths


DERIVED_VIEWS_SQL = r"""
CREATE VIEW session_inventory AS
SELECT
  filename AS source_file,
  max(CASE WHEN type = 'session' THEN id END) AS session_id,
  max(CASE WHEN type = 'session' THEN cwd END) AS cwd,
  min(try_cast(timestamp AS TIMESTAMPTZ)) AS started_at,
  max(try_cast(timestamp AS TIMESTAMPTZ)) AS last_event_at,
  count(*) AS entry_count,
  count_if(type = 'message') AS message_entries,
  count_if(type = 'message' AND json_extract_string(message, '$.role') = 'user')
    AS user_messages,
  count_if(type = 'message' AND json_extract_string(message, '$.role') = 'assistant')
    AS assistant_messages,
  count_if(type = 'message' AND json_extract_string(message, '$.role') = 'toolResult')
    AS tool_results
FROM session_entries
GROUP BY filename;

CREATE VIEW history_inventory AS
SELECT
  filename AS source_file,
  max(CASE WHEN type = 'session' THEN id END) AS session_id,
  max(CASE WHEN type = 'session' THEN cwd END) AS cwd,
  min(try_cast(timestamp AS TIMESTAMPTZ)) AS started_at,
  max(try_cast(timestamp AS TIMESTAMPTZ)) AS last_event_at,
  count(*) AS entry_count
FROM history_entries
GROUP BY filename;

CREATE VIEW metric_event_summary AS
SELECT
  event,
  count(*) AS event_count,
  min(try_cast(ts AS TIMESTAMPTZ)) AS first_seen,
  max(try_cast(ts AS TIMESTAMPTZ)) AS last_seen
FROM metric_events
GROUP BY event;

CREATE VIEW trace_event_summary AS
SELECT
  event_type,
  count(*) AS event_count,
  count(DISTINCT session_id) AS session_count,
  min(try_cast(timestamp AS TIMESTAMPTZ)) AS first_seen,
  max(try_cast(timestamp AS TIMESTAMPTZ)) AS last_seen
FROM trace_events
GROUP BY event_type;

CREATE VIEW trace_routing_decisions AS
SELECT
  session_id,
  turn_id,
  trace_id,
  timestamp,
  json_extract_string(payload, '$.prompt_hash') AS prompt_hash,
  json_extract_string(payload, '$.route_decision_id') AS route_decision_id,
  json_extract_string(payload, '$.applied_route') AS applied_route,
  json_extract_string(payload, '$.selected_model_size') AS selected_model_size,
  json_extract_string(payload, '$.actual_model.provider') AS actual_provider,
  json_extract_string(payload, '$.actual_model.id') AS actual_model_id,
  json_extract_string(payload, '$.rule_fired') AS rule_fired,
  filename
FROM trace_events
WHERE event_type = 'routing_decision';

CREATE VIEW routing_decisions_joined AS
WITH router_ranked AS (
  SELECT
    *,
    CASE
      WHEN route_decision_id IS NULL
        OR regexp_full_match(route_decision_id, 'route-[0-9a-f]{16}')
      THEN NULL
      ELSE route_decision_id
    END AS correlation_id,
    row_number() OVER (
      PARTITION BY prompt_hash
      ORDER BY timestamp NULLS LAST, ts NULLS LAST, filename
    ) AS legacy_occurrence
  FROM routing_classifier_events
  WHERE prompt_hash IS NOT NULL
),
trace_ranked AS (
  SELECT
    *,
    CASE
      WHEN route_decision_id IS NULL
        OR regexp_full_match(route_decision_id, 'route-[0-9a-f]{16}')
      THEN NULL
      ELSE route_decision_id
    END AS correlation_id,
    row_number() OVER (
      PARTITION BY prompt_hash
      ORDER BY timestamp NULLS LAST, filename
    ) AS legacy_occurrence
  FROM trace_routing_decisions
)
SELECT
  r.timestamp AS classifier_timestamp,
  r.prompt_hash,
  r.route_decision_id,
  json_extract_string(r.primary, '$.model_size') AS classifier_model_size,
  json_extract_string(r.primary, '$.effort') AS classifier_effort,
  r.confidence,
  r.elapsed_us,
  t.session_id,
  t.turn_id,
  t.trace_id,
  t.timestamp AS trace_timestamp,
  t.applied_route,
  t.selected_model_size,
  t.actual_provider,
  t.actual_model_id,
  t.rule_fired
FROM router_ranked r
LEFT JOIN trace_ranked t
  ON (
    r.correlation_id IS NOT NULL
    AND t.correlation_id IS NOT NULL
    AND r.correlation_id = t.correlation_id
  )
  OR (
    r.correlation_id IS NULL
    AND t.correlation_id IS NULL
    AND r.prompt_hash = t.prompt_hash
    AND r.legacy_occurrence = t.legacy_occurrence
  );

CREATE VIEW workflow_episode_summary AS
SELECT
  e.episode_id,
  e.command,
  e.repo_root,
  try_cast(e.started_at AS TIMESTAMPTZ) AS started_at,
  count(w.event_id) AS event_count,
  count_if(w.event_type = 'budget_trip') AS budget_trips,
  max(try_cast(w.created_at AS TIMESTAMPTZ)) AS last_event_at
FROM workflow_episodes e
LEFT JOIN workflow_events w ON e.episode_id = w.episode_id
GROUP BY e.episode_id, e.command, e.repo_root, e.started_at;
"""


def connect_with_views(
    layout: SourceLayout,
    ignore_errors: bool = False,
) -> tuple[duckdb.DuckDBPyConnection, dict[str, list[Path]]]:
    connection = duckdb.connect(database=":memory:")
    connection.execute("PRAGMA disable_progress_bar")
    source_paths = register_source_views(connection, layout, ignore_errors=ignore_errors)
    connection.execute(DERIVED_VIEWS_SQL)
    return connection, source_paths


def source_catalog(layout: SourceLayout) -> list[tuple[object, ...]]:
    rows: list[tuple[object, ...]] = []
    for spec in SOURCES:
        paths = spec.resolve_paths(layout)
        rows.append(
            (
                spec.name,
                len(paths),
                sum(path.stat().st_size for path in paths),
                spec.sensitivity,
                spec.description,
            )
        )
    return rows


def validate_source(
    spec: SourceSpec, layout: SourceLayout
) -> tuple[int, int, list[tuple[object, ...]]]:
    total = 0
    malformed = 0
    issues: list[tuple[object, ...]] = []
    for path in spec.resolve_paths(layout):
        opener = gzip.open if path.suffix == ".gz" else open
        with opener(path, "rb") as handle:
            for line_number, line in enumerate(handle, 1):
                if not line.strip():
                    continue
                total += 1
                try:
                    json.loads(line.decode("utf-8"))
                except (json.JSONDecodeError, UnicodeDecodeError) as exc:
                    malformed += 1
                    if len(issues) < MAX_VALIDATION_ISSUES:
                        issues.append((str(path), line_number, type(exc).__name__, str(exc)))
    return total, malformed, issues


def execute_bounded_query(
    connection: duckdb.DuckDBPyConnection, query: str, limit: int
) -> duckdb.DuckDBPyRelation:
    if limit < 1 or limit > MAX_QUERY_ROWS:
        raise ValueError(f"limit must be between 1 and {MAX_QUERY_ROWS}")
    statements = connection.extract_statements(query)
    if len(statements) != 1 or statements[0].type != duckdb.StatementType.SELECT:
        raise ValueError("query must contain exactly one read-only SELECT statement")
    normalized = statements[0].query.rstrip().removesuffix(";")
    return connection.sql(f"SELECT * FROM ({normalized}) AS pi_query LIMIT {limit}")


def _cell(value: object) -> str:
    rendered = "" if value is None else str(value)
    if len(rendered) <= TABLE_CELL_CHARS:
        return rendered
    return f"{rendered[: TABLE_CELL_CHARS - 3]}..."


def emit_rows(headers: Sequence[str], rows: Sequence[Sequence[object]], output_format: str) -> None:
    if output_format == "csv":
        writer = csv.writer(sys.stdout, lineterminator="\n")
        writer.writerow(headers)
        writer.writerows(rows)
        return
    if output_format == "jsonl":
        for row in rows:
            print(json.dumps(dict(zip(headers, row)), default=str, ensure_ascii=True))
        return
    if not rows:
        print("No rows.")
        return
    rendered = [[_cell(value) for value in row] for row in rows]
    widths = [len(header) for header in headers]
    for row in rendered:
        for index, value in enumerate(row):
            widths[index] = max(widths[index], len(value))
    print(" | ".join(header.ljust(widths[index]) for index, header in enumerate(headers)))
    print("-+-".join("-" * width for width in widths))
    for row in rendered:
        print(" | ".join(value.ljust(widths[index]) for index, value in enumerate(row)))


def _layout_from_args(args: argparse.Namespace) -> SourceLayout:
    return default_layout(
        repo_root=args.repo_root,
        agent_dir=args.agent_dir,
        metrics_dir=args.metrics_dir,
        trace_dir=args.trace_dir,
        workflow_telemetry_dir=args.workflow_telemetry_dir,
        coms_lan_dir=args.coms_lan_dir,
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, help="dotfiles repository root")
    parser.add_argument("--agent-dir", type=Path, help="Pi agent state root")
    parser.add_argument("--metrics-dir", type=Path, help="structured metrics root")
    parser.add_argument("--trace-dir", type=Path, help="transcript trace root")
    parser.add_argument("--workflow-telemetry-dir", type=Path, help="workflow telemetry root")
    parser.add_argument("--coms-lan-dir", type=Path, help="Coms LAN state root")
    parser.add_argument(
        "--ignore-malformed",
        action="store_true",
        help="explicitly omit malformed JSONL rows after reporting the risk",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    catalog = subparsers.add_parser("catalog", help="list registered sources without scanning rows")
    catalog.add_argument("--format", choices=("table", "csv", "jsonl"), default="table")

    validate = subparsers.add_parser(
        "validate", help="validate one source without printing record content"
    )
    validate.add_argument("source", choices=tuple(spec.name for spec in SOURCES))
    validate.add_argument("--format", choices=("table", "csv", "jsonl"), default="table")

    views = subparsers.add_parser("views", help="list source and derived views")
    views.add_argument("--format", choices=("table", "csv", "jsonl"), default="table")

    query = subparsers.add_parser("query", help="run one bounded read-only SELECT")
    query.add_argument("sql", help="DuckDB SELECT statement")
    query.add_argument("--limit", type=int, default=50)
    query.add_argument("--format", choices=("table", "csv", "jsonl"), default="table")
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    layout = _layout_from_args(args)
    if args.command == "catalog":
        emit_rows(
            ("source", "files", "bytes", "sensitivity", "description"),
            source_catalog(layout),
            args.format,
        )
        return 0
    if args.command == "validate":
        spec = next(spec for spec in SOURCES if spec.name == args.source)
        total, malformed, issues = validate_source(spec, layout)
        emit_rows(("file", "line", "error", "detail"), issues, args.format)
        print(
            f"validated_rows={total} malformed_rows={malformed} reported_issues={len(issues)}",
            file=sys.stderr,
        )
        return 1 if malformed else 0

    if args.ignore_malformed:
        print(
            "warning: --ignore-malformed omits malformed JSONL rows; validate and report them",
            file=sys.stderr,
        )
    connection, _ = connect_with_views(layout, ignore_errors=args.ignore_malformed)
    if args.command == "views":
        result = connection.sql(
            """
            SELECT table_name, table_type
            FROM information_schema.tables
            WHERE table_schema = 'main'
            ORDER BY table_name
            """
        )
    else:
        try:
            result = execute_bounded_query(connection, args.sql, args.limit)
        except (ValueError, duckdb.Error) as exc:
            print(f"query error: {exc}", file=sys.stderr)
            return 2
    headers = [column[0] for column in result.description]
    emit_rows(headers, result.fetchall(), args.format)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
