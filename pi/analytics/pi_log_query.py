#!/usr/bin/env python
"""Query Pi runtime JSONL through explicit DuckDB views."""

from __future__ import annotations

import argparse
import csv
import fnmatch
import gzip
import json
import os
import stat
import sys
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterator, Mapping, Optional, Sequence

import duckdb

from tool_failure_triage import append_decision, build_report, load_ledger, scan_connection

MAX_QUERY_ROWS = 1_000
MAX_VALIDATION_ISSUES = 100
TABLE_CELL_CHARS = 120
VALIDATION_CACHE_VERSION = 1
VALIDATION_CACHE_LOCK_TIMEOUT_SECONDS = 5.0
VALIDATION_CACHE_LOCK_POLL_SECONDS = 0.05
SNAPSHOT_FORMAT_VERSION = 1
SNAPSHOT_STABILIZATION_ATTEMPTS = 3
SNAPSHOT_BATCH_MAX_FILES = 32
SNAPSHOT_BATCH_MAX_BYTES = 128 * 1024 * 1024
SNAPSHOT_MEMORY_LIMIT = "2GB"

Columns = tuple[tuple[str, str], ...]
PathResolver = Callable[["SourceLayout"], list[Path]]


@dataclass(frozen=True)
class SourceLayout:
    repo_root: Path
    agent_dir: Path
    metrics_dir: Path
    trace_dir: Path
    workflow_telemetry_dir: Path

    @property
    def workflow_friction_dir(self) -> Path:
        override = os.environ.get("PI_WORKFLOW_FRICTION_DIR")
        return Path(override).expanduser() if override else self.agent_dir / "workflow-friction"

    @property
    def operator_dir(self) -> Path:
        override = os.environ.get("PI_OPERATOR_DIR")
        return Path(override).expanduser() if override else self.agent_dir / "operator"

    @property
    def tool_failure_dir(self) -> Path:
        override = os.environ.get("PI_TOOL_FAILURE_DIR")
        return Path(override).expanduser() if override else self.agent_dir / "tool-failures"


@dataclass(frozen=True)
class SourceSpec:
    name: str
    description: str
    sensitivity: str
    columns: Columns
    resolve_paths: PathResolver


def _is_reparse_point(file_stat: os.stat_result) -> bool:
    reparse_flag = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)
    return bool(getattr(file_stat, "st_file_attributes", 0) & reparse_flag)


def _files(root: Path, *patterns: str) -> list[Path]:
    """Return matching regular files using one ordered, non-link traversal."""
    try:
        root_stat = root.stat(follow_symlinks=False)
    except FileNotFoundError:
        return []
    if not root.is_dir() or root.is_symlink() or _is_reparse_point(root_stat):
        return []
    found: list[Path] = []
    pending = [Path(os.path.abspath(root))]
    visited: set[tuple[int, int]] = set()
    while pending:
        directory = pending.pop()
        try:
            directory_stat = directory.stat(follow_symlinks=False)
            identity = (directory_stat.st_dev, directory_stat.st_ino)
            if _is_reparse_point(directory_stat) or identity in visited:
                continue
            visited.add(identity)
            with os.scandir(directory) as entries:
                ordered = sorted(entries, key=lambda entry: entry.name, reverse=True)
        except FileNotFoundError:
            continue
        for entry in ordered:
            try:
                entry_stat = entry.stat(follow_symlinks=False)
                if entry.is_dir(follow_symlinks=False):
                    if not _is_reparse_point(entry_stat):
                        pending.append(Path(entry.path))
                elif entry.is_file(follow_symlinks=False) and any(
                    fnmatch.fnmatchcase(entry.name, pattern) for pattern in patterns
                ):
                    found.append(Path(entry.path))
            except FileNotFoundError:
                continue
    return sorted(found)


def _one(path: Path) -> list[Path]:
    return [Path(os.path.abspath(path))] if path.is_file() and not path.is_symlink() else []


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
    return SourceLayout(
        repo_root=resolved_repo,
        agent_dir=resolved_agent.resolve(),
        metrics_dir=resolved_metrics.expanduser().resolve(),
        trace_dir=resolved_trace.expanduser().resolve(),
        workflow_telemetry_dir=resolved_workflow.expanduser().resolve(),
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
        "tool_failure_decisions",
        "Append-only tool-failure candidate decisions.",
        "metadata",
        (
            ("schemaVersion", "UBIGINT"),
            ("recordId", "VARCHAR"),
            ("candidateId", "VARCHAR"),
            ("fingerprintVersion", "UBIGINT"),
            ("decidedAt", "VARCHAR"),
            ("disposition", "VARCHAR"),
            ("reason", "VARCHAR"),
            ("evidence", "JSON"),
            ("effectiveAfter", "VARCHAR"),
            ("revisitAfter", "VARCHAR"),
        ),
        lambda layout: _one(layout.tool_failure_dir / "decisions.jsonl"),
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
)


def _quoted_identifier(value: str) -> str:
    return f'"{value.replace(chr(34), chr(34) * 2)}"'


def _source_specs(selected_sources: Optional[Sequence[str]] = None) -> tuple[SourceSpec, ...]:
    if selected_sources is None:
        return SOURCES
    selected = set(selected_sources)
    known = {spec.name for spec in SOURCES}
    unknown = selected - known
    if unknown:
        raise ValueError(f"unknown source: {sorted(unknown)[0]}")
    return tuple(spec for spec in SOURCES if spec.name in selected)


def _source_paths(
    layout: SourceLayout,
    specs: Sequence[SourceSpec],
    overrides: Optional[Mapping[str, Sequence[Path]]] = None,
) -> dict[str, list[Path]]:
    return {
        spec.name: list(overrides[spec.name])
        if overrides and spec.name in overrides
        else spec.resolve_paths(layout)
        for spec in specs
    }


def _create_empty_source(
    connection: duckdb.DuckDBPyConnection, spec: SourceSpec, if_not_exists: bool = False
) -> None:
    definitions = ", ".join(
        f"{_quoted_identifier(name)} {data_type}" for name, data_type in spec.columns
    )
    exists = " IF NOT EXISTS" if if_not_exists else ""
    connection.execute(
        f"CREATE TABLE{exists} {_quoted_identifier(spec.name)} ({definitions}, filename VARCHAR)"
    )


def _default_threads() -> int:
    return min(4, os.cpu_count() or 1)


def _configure_connection(connection: duckdb.DuckDBPyConnection, threads: Optional[int]) -> None:
    configured_threads = _default_threads() if threads is None else threads
    if configured_threads < 1:
        raise ValueError("threads must be at least 1")
    connection.execute(f"SET threads TO {configured_threads}")
    connection.execute("PRAGMA disable_progress_bar")


def _configure_snapshot_connection(
    connection: duckdb.DuckDBPyConnection,
    threads: Optional[int],
    snapshot_path: Path,
) -> None:
    _configure_connection(connection, threads)
    temp_directory = snapshot_path.parent / f".{snapshot_path.name}.tmp"
    temp_directory.mkdir(parents=True, exist_ok=True)
    connection.execute("SET memory_limit = ?", [SNAPSHOT_MEMORY_LIMIT])
    connection.execute("SET temp_directory = ?", [str(temp_directory)])


def register_source_views(
    connection: duckdb.DuckDBPyConnection,
    layout: SourceLayout,
    ignore_errors: bool = False,
    selected_sources: Optional[Sequence[str]] = None,
    source_overrides: Optional[Mapping[str, Sequence[Path]]] = None,
) -> dict[str, list[Path]]:
    specs = _source_specs(selected_sources)
    source_paths = _source_paths(layout, specs, source_overrides)
    for spec in specs:
        paths = source_paths[spec.name]
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


DERIVED_VIEWS: tuple[tuple[str, tuple[str, ...], str], ...] = (
    (
        "session_inventory",
        ("session_entries",),
        """CREATE VIEW session_inventory AS
SELECT filename AS source_file, max(CASE WHEN type = 'session' THEN id END) AS session_id,
  max(CASE WHEN type = 'session' THEN cwd END) AS cwd,
  min(try_cast(timestamp AS TIMESTAMPTZ)) AS started_at,
  max(try_cast(timestamp AS TIMESTAMPTZ)) AS last_event_at, count(*) AS entry_count,
  count_if(type = 'message') AS message_entries,
  count_if(type = 'message' AND json_extract_string(message, '$.role') = 'user') AS user_messages,
  count_if(type = 'message' AND json_extract_string(message, '$.role') = 'assistant') AS assistant_messages,
  count_if(type = 'message' AND json_extract_string(message, '$.role') = 'toolResult') AS tool_results
FROM session_entries GROUP BY filename""",
    ),
    (
        "history_inventory",
        ("history_entries",),
        """CREATE VIEW history_inventory AS
SELECT filename AS source_file, max(CASE WHEN type = 'session' THEN id END) AS session_id,
  max(CASE WHEN type = 'session' THEN cwd END) AS cwd,
  min(try_cast(timestamp AS TIMESTAMPTZ)) AS started_at,
  max(try_cast(timestamp AS TIMESTAMPTZ)) AS last_event_at, count(*) AS entry_count
FROM history_entries GROUP BY filename""",
    ),
    (
        "metric_event_summary",
        ("metric_events",),
        """CREATE VIEW metric_event_summary AS
SELECT event, count(*) AS event_count, min(try_cast(ts AS TIMESTAMPTZ)) AS first_seen,
  max(try_cast(ts AS TIMESTAMPTZ)) AS last_seen FROM metric_events GROUP BY event""",
    ),
    (
        "subagent_runs",
        ("metric_events",),
        """CREATE VIEW subagent_runs AS
WITH runs AS (
  SELECT id AS metric_id, try_cast(ts AS TIMESTAMPTZ) AS occurred_at,
    session AS session_id,
    try_cast(json_extract_string(data, '$.schemaVersion') AS UBIGINT) AS schema_version,
    data
  FROM metric_events
  WHERE event = 'orchestration_run'
    AND try_cast(json_extract_string(data, '$.schemaVersion') AS UBIGINT) IN (1, 2, 3)
)
SELECT metric_id, occurred_at, session_id, schema_version,
  json_extract_string(data, '$.orchestrationId') AS orchestration_id,
  json_extract_string(data, '$.parentSessionId') AS parent_session_id,
  json_extract_string(data, '$.interactionId') AS interaction_id,
  json_extract_string(data, '$.mode') AS mode,
  try_cast(json_extract_string(data, '$.fanOut') AS BIGINT) AS fan_out,
  json_extract_string(data, '$.status') AS status,
  try_cast(json_extract_string(data, '$.durationMs') AS BIGINT) AS duration_ms,
  try_cast(json_extract_string(data, '$.childWorkMs') AS BIGINT) AS child_work_ms,
  try_cast(json_extract_string(data, '$.childTextBytes') AS BIGINT) AS child_text_bytes,
  try_cast(json_extract_string(data, '$.parentVisibleBytes') AS BIGINT) AS parent_visible_bytes,
  try_cast(json_extract_string(data, '$.artifactBytes') AS BIGINT) AS artifact_bytes,
  try_cast(json_extract_string(data, '$.chainTransferBytes') AS BIGINT) AS chain_transfer_bytes,
  coalesce(
    try_cast(json_extract_string(data, '$.inlineBytesNotReturned') AS BIGINT),
    greatest(
      0,
      coalesce(try_cast(json_extract_string(data, '$.childTextBytes') AS BIGINT), 0)
      - coalesce(try_cast(json_extract_string(data, '$.parentVisibleBytes') AS BIGINT), 0)
    )
  ) AS inline_bytes_not_returned,
  CASE WHEN schema_version = 3
    THEN json_extract_string(data, '$.executionKind') END AS execution_kind,
  CASE WHEN schema_version = 3
    THEN json_extract_string(data, '$.outcomeCode') END AS outcome_code,
  CASE WHEN schema_version = 3
    THEN json_extract_string(data, '$.workspaceRootSource') END AS workspace_root_source,
  CASE WHEN schema_version = 3
    THEN try_cast(json_extract_string(data, '$.markerCount') AS BIGINT) END AS marker_count,
  CASE WHEN schema_version = 3
    THEN try_cast(json_extract_string(data, '$.boundaryCount') AS BIGINT) END AS boundary_count,
  CASE WHEN schema_version = 3
    THEN try_cast(json_extract_string(data, '$.searchCount') AS BIGINT) END AS search_count,
  CASE WHEN schema_version = 3
    THEN try_cast(json_extract_string(data, '$.watchdogCount') AS BIGINT) END AS watchdog_count,
  CASE WHEN schema_version = 3
    THEN try_cast(json_extract_string(data, '$.pingCount') AS BIGINT) END AS ping_count,
  CASE WHEN schema_version = 3
    THEN try_cast(json_extract_string(data, '$.interruptionCount') AS BIGINT) END AS interruption_count,
  CASE WHEN schema_version = 3
    THEN try_cast(json_extract_string(data, '$.recoveryCount') AS BIGINT) END AS recovery_count,
  CASE WHEN schema_version = 3
    THEN json_extract_string(data, '$.coordinatorBudgetOutcome') END AS coordinator_budget_outcome,
  CASE WHEN schema_version = 3
    THEN json_extract_string(data, '$.legacyAdapterBranch') END AS legacy_adapter_branch,
  CASE WHEN schema_version = 3
    THEN try_cast(json_extract_string(data, '$.legacyAdapterUse') AS BOOLEAN) END AS legacy_adapter_use,
  CASE WHEN schema_version = 3
    THEN json_extract_string(data, '$.taskLinkSource') END AS task_link_source,
  CASE WHEN schema_version = 3
    THEN try_cast(json_extract_string(data, '$.onclaveEligible') AS BOOLEAN) END AS onclave_eligible,
  coalesce(try_cast(json_array_length(json_extract(data, '$.workers')) AS BIGINT), 0)
    AS worker_count
FROM runs""",
    ),
    (
        "subagent_workers",
        ("metric_events",),
        """CREATE VIEW subagent_workers AS
WITH runs AS (
  SELECT id AS metric_id, try_cast(ts AS TIMESTAMPTZ) AS occurred_at,
    session AS session_id,
    try_cast(json_extract_string(data, '$.schemaVersion') AS UBIGINT) AS schema_version,
    json_extract_string(data, '$.orchestrationId') AS orchestration_id,
    data
  FROM metric_events
  WHERE event = 'orchestration_run'
    AND try_cast(json_extract_string(data, '$.schemaVersion') AS UBIGINT) IN (1, 2, 3)
), workers AS (
  SELECT r.metric_id, r.occurred_at, r.session_id, r.schema_version,
    r.orchestration_id, worker.value AS worker_data
  FROM runs r
  CROSS JOIN LATERAL json_each(r.data, '$.workers') AS worker
  WHERE worker.type = 'OBJECT'
)
SELECT metric_id, occurred_at, session_id, schema_version, orchestration_id,
  json_extract_string(worker_data, '$.runId') AS run_id,
  json_extract_string(worker_data, '$.treeId') AS tree_id,
  json_extract_string(worker_data, '$.parentRunId') AS parent_run_id,
  try_cast(json_extract_string(worker_data, '$.depth') AS BIGINT) AS depth,
  json_extract_string(worker_data, '$.role') AS role,
  json_extract_string(worker_data, '$.workflowPhase') AS workflow_phase,
  json_extract_string(worker_data, '$.taskKey') AS task_key,
  try_cast(json_extract_string(worker_data, '$.attempt') AS BIGINT) AS attempt,
  json_extract_string(worker_data, '$.retryOrigin') AS retry_origin,
  json_extract_string(worker_data, '$.coordinatorTaskId') AS coordinator_task_id,
  json_extract_string(worker_data, '$.taskId') AS task_id,
  json_extract_string(worker_data, '$.agent') AS agent,
  json_extract_string(worker_data, '$.resolvedModel') AS resolved_model,
  json_extract_string(worker_data, '$.selectedEffort') AS selected_effort,
  json_extract_string(worker_data, '$.advisoryPolicyVersion') AS advisory_policy_version,
  json_extract_string(worker_data, '$.advisoryTaskClass') AS advisory_task_class,
  json_extract_string(worker_data, '$.advisoryRecommendedRoute') AS advisory_recommended_route,
  json_extract_string(worker_data, '$.advisoryClassification') AS advisory_classification,
  try_cast(json_extract_string(worker_data, '$.advisoryTopologyMismatch') AS BOOLEAN)
    AS advisory_topology_mismatch,
  json_extract_string(worker_data, '$.experimentId') AS experiment_id,
  json_extract_string(worker_data, '$.experimentArm') AS experiment_arm,
  json_extract_string(worker_data, '$.experimentTaskClass') AS experiment_task_class,
  json_extract_string(worker_data, '$.validationOutcome') AS validation_outcome,
  json_extract_string(worker_data, '$.status') AS status,
  try_cast(json_extract_string(worker_data, '$.exitCode') AS BIGINT) AS exit_code,
  try_cast(json_extract_string(worker_data, '$.durationMs') AS BIGINT) AS duration_ms,
  json_extract_string(worker_data, '$.outputMode') AS output_mode,
  try_cast(json_extract_string(worker_data, '$.childTextBytes') AS BIGINT) AS child_text_bytes,
  try_cast(json_extract_string(worker_data, '$.parentVisibleBytes') AS BIGINT) AS parent_visible_bytes,
  try_cast(json_extract_string(worker_data, '$.artifactBytes') AS BIGINT) AS artifact_bytes,
  try_cast(json_extract_string(worker_data, '$.chainTransferBytes') AS BIGINT) AS chain_transfer_bytes,
  try_cast(json_extract_string(worker_data, '$.usage.inputTokens') AS BIGINT) AS usage_input_tokens,
  try_cast(json_extract_string(worker_data, '$.usage.outputTokens') AS BIGINT) AS usage_output_tokens,
  try_cast(json_extract_string(worker_data, '$.usage.totalTokens') AS BIGINT) AS usage_total_tokens,
  try_cast(json_extract_string(worker_data, '$.usage.cacheCreationInputTokens') AS BIGINT)
    AS usage_cache_creation_input_tokens,
  try_cast(json_extract_string(worker_data, '$.usage.cacheReadInputTokens') AS BIGINT)
    AS usage_cache_read_input_tokens,
  try_cast(json_extract_string(worker_data, '$.usage.processedTokens') AS BIGINT)
    AS usage_processed_tokens,
  try_cast(json_extract_string(worker_data, '$.usage.contextPeakTokens') AS BIGINT)
    AS usage_context_peak_tokens,
  try_cast(json_extract_string(worker_data, '$.usage.turns') AS BIGINT) AS usage_turns,
  try_cast(json_extract_string(worker_data, '$.usage.costUsd') AS DOUBLE) AS usage_cost_usd,
  json_extract_string(worker_data, '$.usage.costSource') AS usage_cost_source,
  try_cast(json_extract_string(worker_data, '$.turns') AS BIGINT) AS turns,
  CASE WHEN schema_version = 3
    THEN json_extract_string(worker_data, '$.executionKind') END AS execution_kind,
  CASE WHEN schema_version = 3
    THEN json_extract_string(worker_data, '$.outcomeCode') END AS outcome_code,
  CASE WHEN schema_version = 3
    THEN json_extract_string(worker_data, '$.workspaceRootSource') END AS workspace_root_source,
  CASE WHEN schema_version = 3
    THEN try_cast(json_extract_string(worker_data, '$.markerCount') AS BIGINT) END AS marker_count,
  CASE WHEN schema_version = 3
    THEN try_cast(json_extract_string(worker_data, '$.boundaryCount') AS BIGINT) END AS boundary_count,
  CASE WHEN schema_version = 3
    THEN try_cast(json_extract_string(worker_data, '$.searchCount') AS BIGINT) END AS search_count,
  CASE WHEN schema_version = 3
    THEN try_cast(json_extract_string(worker_data, '$.watchdogCount') AS BIGINT) END AS watchdog_count,
  CASE WHEN schema_version = 3
    THEN try_cast(json_extract_string(worker_data, '$.pingCount') AS BIGINT) END AS ping_count,
  CASE WHEN schema_version = 3
    THEN try_cast(json_extract_string(worker_data, '$.interruptionCount') AS BIGINT) END AS interruption_count,
  CASE WHEN schema_version = 3
    THEN try_cast(json_extract_string(worker_data, '$.recoveryCount') AS BIGINT) END AS recovery_count,
  CASE WHEN schema_version = 3
    THEN json_extract_string(worker_data, '$.coordinatorBudgetOutcome') END AS coordinator_budget_outcome,
  CASE WHEN schema_version = 3
    THEN json_extract_string(worker_data, '$.legacyAdapterBranch') END AS legacy_adapter_branch,
  CASE WHEN schema_version = 3
    THEN try_cast(json_extract_string(worker_data, '$.legacyAdapterUse') AS BOOLEAN) END AS legacy_adapter_use,
  CASE WHEN schema_version = 3
    THEN json_extract_string(worker_data, '$.taskLinkSource') END AS task_link_source,
  CASE WHEN schema_version = 3
    THEN try_cast(json_extract_string(worker_data, '$.onclaveEligible') AS BOOLEAN) END AS onclave_eligible
FROM workers""",
    ),
    (
        "subagent_interventions",
        ("metric_events",),
        """CREATE VIEW subagent_interventions AS
SELECT id AS metric_id, try_cast(ts AS TIMESTAMPTZ) AS occurred_at,
  session AS session_id,
  try_cast(json_extract_string(data, '$.schemaVersion') AS UBIGINT) AS schema_version,
  json_extract_string(data, '$.orchestrationId') AS orchestration_id,
  json_extract_string(data, '$.runId') AS run_id,
  json_extract_string(data, '$.code') AS code,
  json_extract_string(data, '$.outcome') AS outcome,
  try_cast(json_extract_string(data, '$.acknowledged') AS BOOLEAN) AS acknowledged,
  try_cast(json_extract_string(data, '$.durationMs') AS BIGINT) AS duration_ms,
  try_cast(json_extract_string(data, '$.activeToolDurationMs') AS BIGINT)
    AS active_tool_duration_ms,
  try_cast(json_extract_string(data, '$.activeToolOutputAgeMs') AS BIGINT)
    AS active_tool_output_age_ms,
  try_cast(json_extract_string(data, '$.activityVersion') AS BIGINT) AS activity_version,
  try_cast(json_extract_string(data, '$.markerCount') AS BIGINT) AS marker_count,
  try_cast(json_extract_string(data, '$.boundaryCount') AS BIGINT) AS boundary_count,
  try_cast(json_extract_string(data, '$.searchCount') AS BIGINT) AS search_count,
  try_cast(json_extract_string(data, '$.watchdogCount') AS BIGINT) AS watchdog_count,
  try_cast(json_extract_string(data, '$.pingCount') AS BIGINT) AS ping_count,
  try_cast(json_extract_string(data, '$.interruptionCount') AS BIGINT) AS interruption_count,
  try_cast(json_extract_string(data, '$.recoveryCount') AS BIGINT) AS recovery_count
FROM metric_events
WHERE event = 'subagent_intervention'
  AND try_cast(json_extract_string(data, '$.schemaVersion') AS UBIGINT) = 1""",
    ),
    (
        "tool_discovery_activity",
        ("metric_events",),
        """CREATE VIEW tool_discovery_activity AS
SELECT try_cast(ts AS TIMESTAMPTZ) AS occurred_at, session AS session_id, event,
  json_extract_string(data, '$.toolsetId') AS toolset_id,
  json_extract_string(data, '$.toolsetIdBefore') AS toolset_id_before,
  json_extract_string(data, '$.toolsetIdAfter') AS toolset_id_after,
  json_extract_string(data, '$.queryHash') AS query_hash,
  try_cast(json_extract_string(data, '$.queryLength') AS BIGINT) AS query_length,
  try_cast(json_extract_string(data, '$.termCount') AS BIGINT) AS term_count,
  json_extract(data, '$.matchedTools') AS matched_tools,
  json_extract(data, '$.alreadyActiveTools') AS already_active_tools,
  json_extract(data, '$.activatedTools') AS activated_tools,
  json_extract(data, '$.activeToolNames') AS active_tool_names,
  json_extract(data, '$.inactiveToolNames') AS inactive_tool_names,
  json_extract_string(data, '$.reason') AS exposure_reason,
  json_extract_string(data, '$.toolName') AS tool_name,
  json_extract_string(data, '$.toolCallId') AS tool_call_id, filename
FROM metric_events WHERE event IN ('toolset_exposure', 'tool_search_decision', 'tool_use')""",
    ),
    (
        "trace_event_summary",
        ("trace_events",),
        """CREATE VIEW trace_event_summary AS
SELECT event_type, count(*) AS event_count, count(DISTINCT session_id) AS session_count,
  min(try_cast(timestamp AS TIMESTAMPTZ)) AS first_seen,
  max(try_cast(timestamp AS TIMESTAMPTZ)) AS last_seen FROM trace_events GROUP BY event_type""",
    ),
    (
        "workflow_episode_summary",
        ("workflow_episodes", "workflow_events"),
        """CREATE VIEW workflow_episode_summary AS
SELECT e.episode_id, e.command, e.repo_root, try_cast(e.started_at AS TIMESTAMPTZ) AS started_at,
  count(w.event_id) AS event_count, count_if(w.event_type = 'budget_trip') AS budget_trips,
  max(try_cast(w.created_at AS TIMESTAMPTZ)) AS last_event_at
FROM workflow_episodes e LEFT JOIN workflow_events w ON e.episode_id = w.episode_id
GROUP BY e.episode_id, e.command, e.repo_root, e.started_at""",
    ),
)


def rebuild_derived_views(
    connection: duckdb.DuckDBPyConnection, available_sources: Sequence[str]
) -> None:
    available = set(available_sources)
    for name, dependencies, statement in DERIVED_VIEWS:
        if set(dependencies) <= available:
            connection.execute(statement)


def connect_with_views(
    layout: SourceLayout,
    ignore_errors: bool = False,
    selected_sources: Optional[Sequence[str]] = None,
    source_overrides: Optional[Mapping[str, Sequence[Path]]] = None,
    threads: Optional[int] = None,
) -> tuple[duckdb.DuckDBPyConnection, dict[str, list[Path]]]:
    connection = duckdb.connect(database=":memory:")
    _configure_connection(connection, threads)
    source_paths = register_source_views(
        connection, layout, ignore_errors, selected_sources, source_overrides
    )
    rebuild_derived_views(connection, tuple(source_paths))
    return connection, source_paths


def source_catalog(
    layout: SourceLayout,
    selected_sources: Optional[Sequence[str]] = None,
    source_overrides: Optional[Mapping[str, Sequence[Path]]] = None,
) -> list[tuple[object, ...]]:
    specs = _source_specs(selected_sources)
    paths_by_source = _source_paths(layout, specs, source_overrides)
    return [
        (
            spec.name,
            len(paths_by_source[spec.name]),
            sum(path.stat().st_size for path in paths_by_source[spec.name]),
            spec.sensitivity,
            spec.description,
        )
        for spec in specs
    ]


def _validate_paths(paths: Sequence[Path]) -> tuple[int, int, list[tuple[object, ...]]]:
    total = 0
    malformed = 0
    issues: list[tuple[object, ...]] = []
    for path in paths:
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


def validate_source(
    spec: SourceSpec, layout: SourceLayout
) -> tuple[int, int, list[tuple[object, ...]]]:
    """Validate a source directly without consulting the CLI validation cache."""
    return _validate_paths(spec.resolve_paths(layout))


def _file_signature(path: Path) -> tuple[int, int]:
    stat = path.stat()
    return stat.st_size, stat.st_mtime_ns


def _load_validation_cache(path: Path) -> dict[str, object]:
    if not path.exists():
        return {"version": VALIDATION_CACHE_VERSION, "entries": {}}
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"validation cache is corrupt: {path}: {exc}") from exc
    if (
        not isinstance(loaded, dict)
        or loaded.get("version") != VALIDATION_CACHE_VERSION
        or not isinstance(loaded.get("entries"), dict)
    ):
        raise ValueError(f"validation cache is corrupt: {path}")
    return loaded


def _write_validation_cache(path: Path, cache: Mapping[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp")
    try:
        temporary.write_text(
            json.dumps(cache, sort_keys=True, separators=(",", ":")), encoding="utf-8"
        )
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


@contextmanager
def _validation_cache_lock(cache_path: Path) -> Iterator[None]:
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    lock_path = cache_path.with_name(f".{cache_path.name}.lock")
    deadline = time.monotonic() + VALIDATION_CACHE_LOCK_TIMEOUT_SECONDS
    while True:
        try:
            descriptor = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError:
            if time.monotonic() >= deadline:
                raise TimeoutError(f"timed out waiting for validation cache lock: {lock_path}")
            time.sleep(VALIDATION_CACHE_LOCK_POLL_SECONDS)
        else:
            os.close(descriptor)
            break
    try:
        yield
    finally:
        lock_path.unlink()


def _cached_validation(
    spec: SourceSpec, paths: Sequence[Path], cache_path: Optional[Path]
) -> tuple[int, int, list[tuple[object, ...]], int, int]:
    if cache_path is None:
        total, malformed, issues = _validate_paths(paths)
        return total, malformed, issues, len(paths), 0
    with _validation_cache_lock(cache_path):
        cache = _load_validation_cache(cache_path)
        entries = cache["entries"]
        assert isinstance(entries, dict)
        source_entries = entries.get(spec.name, {})
        if not isinstance(source_entries, dict):
            raise ValueError(f"validation cache is corrupt: {cache_path}")
        updated_entries: dict[str, object] = {}
        total = 0
        malformed = 0
        issues: list[tuple[object, ...]] = []
        checked_files = 0
        cached_files = 0
        for path in paths:
            resolved = str(Path(os.path.abspath(path)))
            size, mtime_ns = _file_signature(path)
            entry = source_entries.get(resolved)
            valid_entry = (
                isinstance(entry, dict)
                and isinstance(entry.get("size"), int)
                and isinstance(entry.get("mtime_ns"), int)
                and isinstance(entry.get("total"), int)
                and isinstance(entry.get("malformed"), int)
                and isinstance(entry.get("issues"), list)
                and all(isinstance(issue, list) and len(issue) == 4 for issue in entry["issues"])
            )
            if resolved in source_entries and not valid_entry:
                raise ValueError(f"validation cache is corrupt: {cache_path}")
            if valid_entry and entry["size"] == size and entry["mtime_ns"] == mtime_ns:
                file_total = entry["total"]
                file_malformed = entry["malformed"]
                file_issues = [tuple(issue) for issue in entry["issues"]]
                cached_files += 1
            else:
                file_total, file_malformed, file_issues = _validate_paths([path])
                checked_files += 1
            total += file_total
            malformed += file_malformed
            remaining = MAX_VALIDATION_ISSUES - len(issues)
            if remaining > 0:
                issues.extend(file_issues[:remaining])
            updated_entries[resolved] = {
                "size": size,
                "mtime_ns": mtime_ns,
                "total": file_total,
                "malformed": file_malformed,
                "issues": [list(issue) for issue in file_issues],
            }
        entries[spec.name] = updated_entries
        _write_validation_cache(cache_path, cache)
        return total, malformed, issues, checked_files, cached_files


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


def execute_bounded_batch(
    connection: duckdb.DuckDBPyConnection, query: str, limit: int
) -> list[duckdb.DuckDBPyRelation]:
    if limit < 1 or limit > MAX_QUERY_ROWS:
        raise ValueError(f"limit must be between 1 and {MAX_QUERY_ROWS}")
    statements = connection.extract_statements(query)
    if not statements or any(
        statement.type != duckdb.StatementType.SELECT for statement in statements
    ):
        raise ValueError("batch must contain only read-only SELECT statements")
    return [
        connection.sql(
            f"SELECT * FROM ({statement.query.rstrip().removesuffix(';')}) AS pi_query LIMIT {limit}"
        )
        for statement in statements
    ]


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
    )


def _positive_int(value: str) -> int:
    parsed = int(value)
    if parsed < 1:
        raise argparse.ArgumentTypeError("must be at least 1")
    return parsed


def _manifest_overrides(
    entries: Sequence[str], selected_sources: Optional[Sequence[str]]
) -> dict[str, list[Path]]:
    known = {spec.name for spec in SOURCES}
    selected = set(selected_sources) if selected_sources is not None else known
    overrides: dict[str, list[Path]] = {}
    for entry in entries:
        source, separator, manifest_text = entry.partition("=")
        if not separator or not source or not manifest_text:
            raise ValueError("--files-from must be SOURCE=MANIFEST")
        if source not in known:
            raise ValueError(f"unknown source in --files-from: {source}")
        if source not in selected:
            raise ValueError(f"--files-from source is not selected: {source}")
        manifest = Path(manifest_text).expanduser().resolve()
        if not manifest.is_file():
            raise ValueError(f"manifest does not exist: {manifest}")
        paths = overrides.setdefault(source, [])
        seen = {str(path) for path in paths}
        for line_number, raw_line in enumerate(
            manifest.read_text(encoding="utf-8").splitlines(), 1
        ):
            line = raw_line.strip()
            if not line:
                continue
            source_file: object = line
            if line.startswith("{"):
                try:
                    payload = json.loads(line)
                except json.JSONDecodeError as exc:
                    raise ValueError(
                        f"invalid manifest JSON at {manifest}:{line_number}: {exc}"
                    ) from exc
                if not isinstance(payload, dict):
                    raise ValueError(f"manifest object required at {manifest}:{line_number}")
                source_file = next(
                    (payload[key] for key in ("source_file", "filename", "path") if key in payload),
                    None,
                )
            if not isinstance(source_file, str) or not source_file:
                raise ValueError(f"manifest path required at {manifest}:{line_number}")
            path = Path(source_file).expanduser()
            if not path.is_absolute():
                path = manifest.parent / path
            path = path.resolve()
            if not path.is_file():
                raise ValueError(f"manifest file does not exist: {path}")
            if str(path) not in seen:
                paths.append(path)
                seen.add(str(path))
    return overrides


def _snapshot_default_path(layout: SourceLayout) -> Path:
    return layout.repo_root / ".tmp" / "pi-log-analytics" / "pi-logs.duckdb"


def _snapshot_table_names(connection: duckdb.DuckDBPyConnection) -> set[str]:
    return {
        row[0]
        for row in connection.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'"
        ).fetchall()
    }


def _snapshot_metadata_exists(connection: duckdb.DuckDBPyConnection) -> bool:
    return "pi_log_snapshot_metadata" in _snapshot_table_names(connection)


def _snapshot_state_exists(connection: duckdb.DuckDBPyConnection) -> bool:
    return "pi_log_snapshot_state" in _snapshot_table_names(connection)


def _snapshot_table_schema(
    connection: duckdb.DuckDBPyConnection, table_name: str
) -> tuple[tuple[str, str], ...]:
    rows = connection.execute(
        """SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema = 'main' AND table_name = ? ORDER BY ordinal_position""",
        [table_name],
    ).fetchall()
    return tuple((row[0], " ".join(row[1].upper().split())) for row in rows)


def _ensure_snapshot_table_schema(
    connection: duckdb.DuckDBPyConnection,
    table_name: str,
    expected: tuple[tuple[str, str], ...],
) -> None:
    actual = _snapshot_table_schema(connection, table_name)
    if actual != expected:
        raise ValueError(
            f"snapshot schema mismatch for {table_name}: expected {expected}, found {actual}"
        )


def _create_snapshot_tables(connection: duckdb.DuckDBPyConnection) -> None:
    connection.execute(
        """CREATE TABLE pi_log_snapshot_state (
        format_version UBIGINT NOT NULL, completed BOOLEAN NOT NULL)"""
    )
    connection.execute(
        """CREATE TABLE pi_log_snapshot_metadata (
        source_name VARCHAR NOT NULL, path VARCHAR NOT NULL, size UBIGINT NOT NULL,
        mtime_ns UBIGINT NOT NULL, ignore_errors BOOLEAN NOT NULL,
        PRIMARY KEY (source_name, path))"""
    )
    connection.execute(
        "INSERT INTO pi_log_snapshot_state VALUES (?, FALSE)", [SNAPSHOT_FORMAT_VERSION]
    )


def _ensure_committed_snapshot_state(connection: duckdb.DuckDBPyConnection) -> None:
    if not _snapshot_state_exists(connection):
        raise ValueError("snapshot database format is legacy or incomplete")
    _ensure_snapshot_table_schema(
        connection,
        "pi_log_snapshot_state",
        (("format_version", "UBIGINT"), ("completed", "BOOLEAN")),
    )
    rows = connection.execute(
        "SELECT format_version, completed FROM pi_log_snapshot_state"
    ).fetchall()
    if rows != [(SNAPSHOT_FORMAT_VERSION, True)]:
        raise ValueError("snapshot database has not been materialized")


def _ensure_snapshot_metadata_schema(connection: duckdb.DuckDBPyConnection) -> None:
    if not _snapshot_metadata_exists(connection):
        raise ValueError("snapshot database format is legacy or incomplete")
    _ensure_snapshot_table_schema(
        connection,
        "pi_log_snapshot_metadata",
        (
            ("source_name", "VARCHAR"),
            ("path", "VARCHAR"),
            ("size", "UBIGINT"),
            ("mtime_ns", "UBIGINT"),
            ("ignore_errors", "BOOLEAN"),
        ),
    )


def _snapshot_available_sources(connection: duckdb.DuckDBPyConnection) -> tuple[str, ...]:
    names = _snapshot_table_names(connection)
    return tuple(spec.name for spec in SOURCES if spec.name in names)


def _snapshot_catalog(
    connection: duckdb.DuckDBPyConnection, selected_sources: Optional[Sequence[str]]
) -> list[tuple[object, ...]]:
    counts = {
        row[0]: (row[1], row[2])
        for row in connection.execute(
            """SELECT source_name, count(*), coalesce(sum(size), 0)
            FROM pi_log_snapshot_metadata GROUP BY source_name"""
        ).fetchall()
    }
    return [
        (
            spec.name,
            *counts.get(spec.name, (0, 0)),
            spec.sensitivity,
            spec.description,
        )
        for spec in _source_specs(selected_sources)
    ]


def _snapshot_signatures(
    paths_by_source: Mapping[str, Sequence[Path]],
) -> dict[str, list[tuple[str, int, int]]]:
    return {
        source: [(str(Path(os.path.abspath(path))), *_file_signature(path)) for path in paths]
        for source, paths in paths_by_source.items()
    }


def _ensure_snapshot_source_schema(connection: duckdb.DuckDBPyConnection, spec: SourceSpec) -> None:
    _ensure_snapshot_table_schema(
        connection, spec.name, tuple((*spec.columns, ("filename", "VARCHAR")))
    )


def _snapshot_refresh_batches(
    paths: Sequence[str], signatures: Mapping[str, tuple[int, int]]
) -> Iterator[list[str]]:
    batch: list[str] = []
    batch_bytes = 0
    for path in paths:
        size = signatures[path][0]
        if batch and (
            len(batch) >= SNAPSHOT_BATCH_MAX_FILES or batch_bytes + size > SNAPSHOT_BATCH_MAX_BYTES
        ):
            yield batch
            batch = []
            batch_bytes = 0
        batch.append(path)
        batch_bytes += size
    if batch:
        yield batch


def refresh_snapshot(
    snapshot_path: Path,
    layout: SourceLayout,
    selected_sources: Optional[Sequence[str]] = None,
    source_overrides: Optional[Mapping[str, Sequence[Path]]] = None,
    ignore_errors: bool = False,
    threads: Optional[int] = None,
) -> dict[str, list[Path]]:
    specs = _source_specs(selected_sources)
    paths_by_source = _source_paths(layout, specs, source_overrides)
    before = _snapshot_signatures(paths_by_source)
    snapshot_path.parent.mkdir(parents=True, exist_ok=True)
    connection = duckdb.connect(database=str(snapshot_path))
    transaction_started = False
    try:
        _configure_snapshot_connection(connection, threads, snapshot_path)
        connection.execute("BEGIN")
        transaction_started = True
        table_names = _snapshot_table_names(connection)
        if not table_names:
            _create_snapshot_tables(connection)
        else:
            _ensure_committed_snapshot_state(connection)
            _ensure_snapshot_metadata_schema(connection)
            connection.execute("UPDATE pi_log_snapshot_state SET completed = FALSE")
        for spec in specs:
            _create_empty_source(connection, spec, if_not_exists=True)
            _ensure_snapshot_source_schema(connection, spec)
        connection.execute(
            "CREATE TEMP TABLE pi_log_snapshot_refresh_paths (path VARCHAR PRIMARY KEY)"
        )
        target_signatures = before
        for stabilization_attempt in range(SNAPSHOT_STABILIZATION_ATTEMPTS):
            for spec in specs:
                current = {
                    path: (size, mtime_ns) for path, size, mtime_ns in target_signatures[spec.name]
                }
                stored = {
                    row[0]: (row[1], row[2], row[3])
                    for row in connection.execute(
                        """SELECT path, size, mtime_ns, ignore_errors
                        FROM pi_log_snapshot_metadata WHERE source_name = ?""",
                        [spec.name],
                    ).fetchall()
                }
                removals = set(stored) - set(current)
                mode_mismatch = any(
                    stored_mode != ignore_errors for _, _, stored_mode in stored.values()
                )
                refresh_paths = sorted(
                    current
                    if mode_mismatch
                    else (path for path in current if stored.get(path, ())[:2] != current[path])
                )
                affected_paths = sorted(removals | set(refresh_paths))
                if affected_paths:
                    connection.executemany(
                        "INSERT INTO pi_log_snapshot_refresh_paths VALUES (?)",
                        [(path,) for path in affected_paths],
                    )
                    connection.execute(
                        f"DELETE FROM {_quoted_identifier(spec.name)} WHERE filename IN "
                        "(SELECT path FROM pi_log_snapshot_refresh_paths)"
                    )
                    connection.execute(
                        """DELETE FROM pi_log_snapshot_metadata WHERE source_name = ?
                        AND path IN (SELECT path FROM pi_log_snapshot_refresh_paths)""",
                        [spec.name],
                    )
                    connection.execute("DELETE FROM pi_log_snapshot_refresh_paths")
                for refresh_batch in _snapshot_refresh_batches(refresh_paths, current):
                    relation = connection.read_json(
                        refresh_batch,
                        columns=dict(spec.columns),
                        format="newline_delimited",
                        filename=True,
                        ignore_errors=ignore_errors,
                    )
                    relation.insert_into(spec.name)
                    connection.executemany(
                        """INSERT INTO pi_log_snapshot_metadata
                        (source_name, path, size, mtime_ns, ignore_errors)
                        VALUES (?, ?, ?, ?, ?)""",
                        [
                            (spec.name, path, *current[path], ignore_errors)
                            for path in refresh_batch
                        ],
                    )
            after_paths = _source_paths(layout, specs, source_overrides)
            after_signatures = _snapshot_signatures(after_paths)
            if target_signatures == after_signatures:
                paths_by_source = after_paths
                break
            if stabilization_attempt == SNAPSHOT_STABILIZATION_ATTEMPTS - 1:
                raise RuntimeError("source files did not stabilize during snapshot refresh")
            target_signatures = after_signatures
        for name, _, _ in DERIVED_VIEWS:
            connection.execute(f"DROP VIEW IF EXISTS {_quoted_identifier(name)}")
        rebuild_derived_views(connection, _snapshot_available_sources(connection))
        connection.execute("UPDATE pi_log_snapshot_state SET completed = TRUE")
        connection.execute("COMMIT")
        transaction_started = False
    except Exception:
        if transaction_started:
            connection.execute("ROLLBACK")
        raise
    finally:
        connection.close()
    return paths_by_source


def _open_snapshot(
    snapshot_path: Path, threads: int, selected_sources: Optional[Sequence[str]] = None
) -> duckdb.DuckDBPyConnection:
    if not snapshot_path.is_file():
        raise ValueError(f"snapshot database does not exist: {snapshot_path}")
    snapshot = duckdb.connect(database=str(snapshot_path), read_only=True)
    try:
        _configure_connection(snapshot, threads)
        try:
            _ensure_committed_snapshot_state(snapshot)
            _ensure_snapshot_metadata_schema(snapshot)
        except ValueError as exc:
            raise ValueError(f"{exc}: {snapshot_path}") from exc
        available = _snapshot_available_sources(snapshot)
    except Exception:
        snapshot.close()
        raise
    if selected_sources is None:
        return snapshot
    try:
        selected = _source_specs(selected_sources)
        connection = duckdb.connect(database=":memory:")
        try:
            _configure_connection(connection, threads)
            escaped_path = str(snapshot_path).replace("'", "''")
            connection.execute(f"ATTACH '{escaped_path}' AS pi_snapshot (READ_ONLY)")
            selected_names = ", ".join(f"'{spec.name}'" for spec in selected)
            connection.execute(
                f"""CREATE TEMP TABLE pi_log_snapshot_metadata AS
                SELECT * FROM pi_snapshot.main.pi_log_snapshot_metadata
                WHERE source_name IN ({selected_names})"""
            )
            selected_available = tuple(spec.name for spec in selected if spec.name in available)
            for spec in selected:
                if spec.name in selected_available:
                    connection.execute(
                        f"CREATE VIEW {_quoted_identifier(spec.name)} AS "
                        f"SELECT * FROM pi_snapshot.main.{_quoted_identifier(spec.name)}"
                    )
            rebuild_derived_views(connection, selected_available)
        except Exception:
            connection.close()
            raise
        return connection
    finally:
        snapshot.close()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, help="dotfiles repository root")
    parser.add_argument("--agent-dir", type=Path, help="Pi agent state root")
    parser.add_argument("--metrics-dir", type=Path, help="structured metrics root")
    parser.add_argument("--trace-dir", type=Path, help="transcript trace root")
    parser.add_argument("--workflow-telemetry-dir", type=Path, help="workflow telemetry root")
    parser.add_argument(
        "--source", dest="sources", action="append", choices=tuple(spec.name for spec in SOURCES)
    )
    parser.add_argument("--files-from", action="append", default=[], metavar="SOURCE=MANIFEST")
    parser.add_argument("--threads", type=_positive_int, default=_default_threads())
    parser.add_argument("--snapshot-db", type=Path, help="persistent DuckDB snapshot database")
    parser.add_argument("--validation-cache", type=Path, help="validation cache path")
    parser.add_argument("--no-validation-cache", action="store_true")
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

    schema = subparsers.add_parser("schema", help="show columns for one source or derived view")
    schema.add_argument("view", help="exact source or derived view name")
    schema.add_argument("--format", choices=("table", "csv", "jsonl"), default="table")

    query = subparsers.add_parser("query", help="run one bounded read-only SELECT")
    query.add_argument("sql", help="DuckDB SELECT statement")
    query.add_argument("--limit", type=int, default=50)
    query.add_argument("--format", choices=("table", "csv", "jsonl"), default="table")

    batch = subparsers.add_parser(
        "batch", help="run bounded read-only SELECT statements from a file"
    )
    batch.add_argument("sql_file", type=Path, metavar="SQL_FILE")
    batch.add_argument("--limit", type=int, default=50)
    batch.add_argument("--format", choices=("table", "csv", "jsonl"), default="table")

    snapshot = subparsers.add_parser("snapshot", help="incrementally materialize selected sources")
    snapshot.add_argument("--format", choices=("table", "csv", "jsonl"), default="table")

    failure_scan = subparsers.add_parser(
        "tool-failure-scan", help="screen a selected session snapshot for failure candidates"
    )
    failure_scan.add_argument("--output", type=Path, help="write the sanitized scan as JSON")

    failure_decide = subparsers.add_parser(
        "tool-failure-decide", help="append an addressed or skipped candidate decision"
    )
    failure_decide.add_argument("scan_file", type=Path)
    failure_decide.add_argument("candidate_id")
    failure_decide.add_argument("disposition", choices=("addressed", "skipped"))
    failure_decide.add_argument("--reason", required=True)
    failure_decide.add_argument("--evidence", action="append", default=[])
    failure_decide.add_argument("--effective-after")
    failure_decide.add_argument("--revisit-after")
    failure_decide.add_argument("--ledger", type=Path)

    failure_report = subparsers.add_parser(
        "tool-failure-report", help="render the actionable candidate queue"
    )
    failure_report.add_argument("scan_file", type=Path)
    failure_report.add_argument("--ledger", type=Path)
    return parser


def _emit_result(result: duckdb.DuckDBPyRelation, output_format: str) -> None:
    emit_rows([column[0] for column in result.description], result.fetchall(), output_format)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    layout = _layout_from_args(args)
    selected_sources = tuple(dict.fromkeys(args.sources)) if args.sources else None
    try:
        _source_specs(selected_sources)
        source_overrides = _manifest_overrides(args.files_from, selected_sources)
    except ValueError as exc:
        print(f"source error: {exc}", file=sys.stderr)
        return 2

    if args.command == "validate":
        if selected_sources is not None and args.source not in selected_sources:
            print(f"source error: source is not selected: {args.source}", file=sys.stderr)
            return 2
        spec = next(spec for spec in SOURCES if spec.name == args.source)
        paths = _source_paths(layout, (spec,), source_overrides)[spec.name]
        cache_path = None
        if not args.no_validation_cache:
            cache_path = (
                (
                    args.validation_cache
                    or layout.repo_root / ".tmp" / "pi-log-analytics" / "validation-cache.json"
                )
                .expanduser()
                .resolve()
            )
        try:
            total, malformed, issues, checked_files, cached_files = _cached_validation(
                spec, paths, cache_path
            )
        except (OSError, ValueError) as exc:
            print(f"validation error: {exc}", file=sys.stderr)
            return 2
        emit_rows(("file", "line", "error", "detail"), issues, args.format)
        print(
            f"validated_rows={total} malformed_rows={malformed} reported_issues={len(issues)} "
            f"checked_files={checked_files} cached_files={cached_files}",
            file=sys.stderr,
        )
        return 1 if malformed else 0

    ledger_default = layout.agent_dir / "tool-failures" / "decisions.jsonl"
    if args.command in {"tool-failure-decide", "tool-failure-report"}:
        try:
            scan = json.loads(args.scan_file.read_text(encoding="utf-8"))
            ledger = (args.ledger or ledger_default).expanduser().resolve()
            if args.command == "tool-failure-decide":
                record = append_decision(
                    ledger,
                    scan,
                    args.candidate_id,
                    args.disposition,
                    args.reason,
                    args.evidence,
                    args.effective_after,
                    args.revisit_after,
                )
                print(json.dumps(record, sort_keys=True, ensure_ascii=True))
            else:
                records, diagnostics = load_ledger(ledger)
                report = build_report(scan, records)
                report["ledgerDiagnostics"] = diagnostics
                print(json.dumps(report, sort_keys=True, ensure_ascii=True))
            return 0
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            print(f"tool failure error: {exc}", file=sys.stderr)
            return 2

    snapshot_path = args.snapshot_db.expanduser().resolve() if args.snapshot_db else None
    if args.command == "catalog" and snapshot_path is None:
        rows = source_catalog(layout, selected_sources, source_overrides)
        emit_rows(("source", "files", "bytes", "sensitivity", "description"), rows, args.format)
        return 0
    if args.command == "snapshot":
        snapshot_path = snapshot_path or _snapshot_default_path(layout)
        if args.ignore_malformed:
            print(
                "warning: --ignore-malformed omits malformed JSONL rows; validate and report them",
                file=sys.stderr,
            )
        try:
            refresh_snapshot(
                snapshot_path,
                layout,
                selected_sources,
                source_overrides,
                args.ignore_malformed,
                args.threads,
            )
            connection = _open_snapshot(snapshot_path, args.threads, selected_sources)
            try:
                emit_rows(
                    ("source", "files", "bytes", "sensitivity", "description"),
                    _snapshot_catalog(connection, selected_sources),
                    args.format,
                )
            finally:
                connection.close()
        except (OSError, ValueError, RuntimeError, duckdb.Error) as exc:
            print(f"snapshot error: {exc}", file=sys.stderr)
            return 2
        return 0

    if snapshot_path is not None:
        try:
            connection = _open_snapshot(snapshot_path, args.threads, selected_sources)
        except (OSError, ValueError, duckdb.Error) as exc:
            print(f"snapshot error: {exc}", file=sys.stderr)
            return 2
    else:
        if args.ignore_malformed:
            print(
                "warning: --ignore-malformed omits malformed JSONL rows; validate and report them",
                file=sys.stderr,
            )
        connection, _ = connect_with_views(
            layout,
            args.ignore_malformed,
            selected_sources,
            source_overrides,
            args.threads,
        )
    try:
        if args.command == "catalog":
            emit_rows(
                ("source", "files", "bytes", "sensitivity", "description"),
                _snapshot_catalog(connection, selected_sources),
                args.format,
            )
            return 0
        if args.command == "tool-failure-scan":
            if snapshot_path is None:
                print("tool failure error: --snapshot-db is required", file=sys.stderr)
                return 2
            if selected_sources != ("session_entries",):
                print("tool failure error: select only --source session_entries", file=sys.stderr)
                return 2
            scan = scan_connection(connection)
            rendered = json.dumps(scan, sort_keys=True, indent=2, ensure_ascii=True) + "\n"
            if args.output:
                output = args.output.expanduser().resolve()
                output.parent.mkdir(parents=True, exist_ok=True)
                output.write_text(rendered, encoding="utf-8", newline="\n")
            print(rendered, end="")
            return 0
        if args.command == "views":
            result = connection.sql(
                """SELECT table_name, table_type FROM information_schema.tables
                WHERE table_schema = 'main' ORDER BY table_name"""
            )
            _emit_result(result, args.format)
            return 0
        if args.command == "schema":
            available = {
                row[0]
                for row in connection.execute(
                    """SELECT table_name FROM information_schema.tables
                    WHERE table_schema = 'main'"""
                ).fetchall()
            }
            if args.view not in available:
                print(f"schema error: unknown view: {args.view}", file=sys.stderr)
                return 2
            result = connection.execute(
                """SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_schema = 'main' AND table_name = ?
                ORDER BY ordinal_position""",
                [args.view],
            )
            _emit_result(result, args.format)
            return 0
        try:
            if args.command == "query":
                _emit_result(execute_bounded_query(connection, args.sql, args.limit), args.format)
            else:
                sql = args.sql_file.read_text(encoding="utf-8")
                results = execute_bounded_batch(connection, sql, args.limit)
                for index, result in enumerate(results, 1):
                    if args.format == "table" and len(results) > 1:
                        print(f"Result {index}:")
                    _emit_result(result, args.format)
        except (OSError, ValueError, duckdb.Error) as exc:
            message = str(exc)
            print(f"query error: {message}", file=sys.stderr)
            if "Required module" in message and "failed to import" in message:
                print(
                    "environment error: synchronize the locked analytics environment with "
                    "'uv sync --project pi/analytics --locked', then retry",
                    file=sys.stderr,
                )
            return 2
        return 0
    finally:
        connection.close()


if __name__ == "__main__":
    raise SystemExit(main())
