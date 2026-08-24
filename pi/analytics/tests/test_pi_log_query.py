from __future__ import annotations

import json
from pathlib import Path

import duckdb
import pi_log_query
import pytest

from pi_log_query import (
    MAX_QUERY_ROWS,
    MAX_VALIDATION_ISSUES,
    SOURCES,
    SourceLayout,
    connect_with_views,
    default_layout,
    execute_bounded_query,
    main,
    source_catalog,
    validate_source,
)


def write_jsonl(path: Path, rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "".join(f"{json.dumps(row, separators=(',', ':'))}\n" for row in rows),
        encoding="utf-8",
    )


@pytest.fixture
def layout(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> SourceLayout:
    for name in (
        "PI_WORKFLOW_FRICTION_DIR",
        "PI_OPERATOR_DIR",
        "PI_AGENT_DIR",
        "PI_METRICS_DIR",
        "PI_WORKFLOW_TELEMETRY_DIR",
    ):
        monkeypatch.delenv(name, raising=False)
    repo = tmp_path / "repo"
    agent = tmp_path / "agent"
    workflow = tmp_path / "workflow-telemetry"

    session_rows = [
        {
            "type": "session",
            "version": 3,
            "id": "session-1",
            "timestamp": "2026-07-01T00:00:00Z",
            "cwd": "/repo",
        },
        {
            "type": "message",
            "id": "message-1",
            "parentId": "session-1",
            "timestamp": "2026-07-01T00:00:01Z",
            "message": {"role": "user", "content": "private prompt"},
        },
        {
            "type": "message",
            "id": "message-2",
            "parentId": "message-1",
            "timestamp": "2026-07-01T00:00:02Z",
            "message": {"role": "assistant", "content": [{"type": "text", "text": "reply"}]},
        },
    ]
    write_jsonl(agent / "sessions" / "project" / "session-1.jsonl", session_rows)
    write_jsonl(agent / "history" / "2026-07-01-session-1.jsonl", session_rows)
    write_jsonl(
        agent / "logs" / "metrics-2026-07-01.jsonl",
        [
            {
                "schemaVersion": 1,
                "id": "metric-1",
                "ts": "2026-07-01T00:00:03Z",
                "event": "timing_span",
                "session": "session-1",
                "data": {"schemaVersion": 1, "durationMs": 12},
            },
            {
                "schemaVersion": 1,
                "id": "metric-toolset",
                "ts": "2026-07-01T00:00:04Z",
                "event": "toolset_exposure",
                "session": "session-1",
                "data": {
                    "schemaVersion": 1,
                    "toolsetId": "toolset-1",
                    "activeToolNames": ["read", "tool_search"],
                    "inactiveToolNames": ["web_search"],
                    "reason": "session_start",
                },
            },
            {
                "schemaVersion": 1,
                "id": "metric-search",
                "ts": "2026-07-01T00:00:05Z",
                "event": "tool_search_decision",
                "session": "session-1",
                "data": {
                    "schemaVersion": 1,
                    "queryHash": "query-hash",
                    "queryLength": 10,
                    "termCount": 1,
                    "matchedTools": [{"name": "web_search", "score": 7}],
                    "alreadyActiveTools": [],
                    "activatedTools": ["web_search"],
                    "toolsetIdBefore": "toolset-1",
                    "toolsetIdAfter": "toolset-2",
                },
            },
            {
                "schemaVersion": 1,
                "id": "metric-use",
                "ts": "2026-07-01T00:00:06Z",
                "event": "tool_use",
                "session": "session-1",
                "data": {
                    "schemaVersion": 1,
                    "toolName": "web_search",
                    "toolCallId": "call-1",
                    "toolsetId": "toolset-2",
                },
            },
        ],
    )
    write_jsonl(
        agent / "traces" / "session-1.jsonl",
        [
            {
                "schema_version": "1.1.0",
                "event_id": "event-tool",
                "session_id": "session-1",
                "turn_id": "turn-1",
                "trace_id": "trace-1",
                "event_type": "tool_result",
                "timestamp": "2026-07-01T00:00:06Z",
                "monotonic_ns": "6",
                "payload": {"tool_name": "read"},
            }
        ],
    )
    write_jsonl(
        workflow / "episodes.jsonl",
        [
            {
                "schema_version": 1,
                "episode_id": "episode-1",
                "command": "plan-it",
                "repo_root": "/repo",
                "started_at": "2026-07-01T00:00:00Z",
                "status": "started",
                "redaction_status": "no_sensitive_output",
            }
        ],
    )
    write_jsonl(
        workflow / "episode-1" / "events.jsonl",
        [
            {
                "schema_version": 1,
                "episode_id": "episode-1",
                "event_id": "event-1",
                "phase_id": "dispatch",
                "event_type": "command",
                "status": "recorded",
                "evidence": "dispatched",
                "created_at": "2026-07-01T00:00:01Z",
            }
        ],
    )
    write_jsonl(
        agent / "workflow-friction" / "interactions.jsonl",
        [
            {
                "schemaVersion": 1,
                "interactionId": "interaction-1",
                "sessionId": "session-1",
                "mode": "automatic",
                "startedAt": "2026-07-01T00:00:00Z",
                "settledAt": "2026-07-01T00:00:10Z",
                "durationMs": 10_000,
                "selected": True,
                "selectionReasons": ["complex"],
                "toolCount": 2,
                "toolFailureCount": 0,
                "validationCount": 1,
                "subagentCount": 0,
                "failedSubagentCount": 0,
                "fileMutationCount": 1,
            }
        ],
    )
    write_jsonl(
        agent / "operator" / "damage-control" / "judge.jsonl",
        [
            {
                "schemaVersion": 1,
                "id": "judge-1",
                "ts": "2026-07-01T00:00:07Z",
                "eventId": "event-1",
                "verdict": "allow",
                "reason": "safe",
                "model": "provider/model",
                "latencyMs": 5,
                "recordedAt": "2026-07-01T00:00:07Z",
            }
        ],
    )
    return SourceLayout(repo, agent, agent / "logs", agent / "traces", workflow)


def test_schema_command_reports_exact_view_columns(
    layout: SourceLayout, capsys: pytest.CaptureFixture[str]
) -> None:
    assert (
        main(
            [
                "--repo-root",
                str(layout.repo_root),
                "--agent-dir",
                str(layout.agent_dir),
                "--metrics-dir",
                str(layout.metrics_dir),
                "--workflow-telemetry-dir",
                str(layout.workflow_telemetry_dir),
                "--source",
                "session_entries",
                "schema",
                "session_inventory",
            ]
        )
        == 0
    )
    output = capsys.readouterr().out
    assert "source_file" in output
    assert "session_id" in output


def test_registers_explicit_sources_and_metadata_views(layout: SourceLayout) -> None:
    connection, paths = connect_with_views(layout)

    assert len(paths["session_entries"]) == 1
    assert len(paths["history_entries"]) == 1
    assert connection.sql("SELECT count(*) FROM session_inventory").fetchone() == (1,)
    assert connection.sql(
        "SELECT user_messages, assistant_messages FROM session_inventory"
    ).fetchone() == (
        1,
        1,
    )
    assert connection.sql("SELECT typeof(payload) FROM trace_events LIMIT 1").fetchone() == (
        "JSON",
    )
    assert connection.sql(
        "SELECT event_count FROM metric_event_summary WHERE event = 'timing_span'"
    ).fetchone() == (1,)
    assert connection.sql(
        "SELECT event, tool_name, query_hash FROM tool_discovery_activity ORDER BY occurred_at"
    ).fetchall() == [
        ("toolset_exposure", None, None),
        ("tool_search_decision", None, "query-hash"),
        ("tool_use", "web_search", None),
    ]
    assert connection.sql("SELECT event_count FROM workflow_episode_summary").fetchone() == (1,)
    assert connection.sql("SELECT count(*) FROM damage_control_judgments").fetchone() == (1,)


def test_default_layout_honors_metrics_and_transcript_locations(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    repo = tmp_path / "repo"
    agent = tmp_path / "agent"
    metrics = tmp_path / "custom-metrics"
    traces = tmp_path / "custom-traces"
    agent.mkdir()
    (agent / "settings.json").write_text(
        json.dumps({"transcript": {"path": str(traces)}}), encoding="utf-8"
    )
    monkeypatch.setenv("PI_METRICS_DIR", str(metrics))

    resolved = default_layout(repo_root=repo, agent_dir=agent)

    assert resolved.metrics_dir == metrics.resolve()
    assert resolved.trace_dir == traces.resolve()


def test_subagent_views_flatten_mixed_versions_without_content_or_paths(
    layout: SourceLayout,
) -> None:
    write_jsonl(
        layout.agent_dir / "logs" / "metrics-orchestration.jsonl",
        [
            {
                "schemaVersion": 1,
                "id": "metric-run-v1",
                "ts": "2026-07-01T00:01:00Z",
                "event": "orchestration_run",
                "session": "session-1",
                "data": {
                    "schemaVersion": 1,
                    "orchestrationId": "orchestration-v1",
                    "mode": "single",
                    "status": "completed",
                    "childTextBytes": 10,
                    "parentVisibleBytes": 3,
                    "workers": [
                        {
                            "runId": "worker-v1",
                            "agent": "legacy",
                            "status": "completed",
                            "durationMs": 11,
                            "task": "private task text",
                            "command": "private command",
                            "output": "private output",
                            "workspace": "/private/workspace",
                            "path": "/private/path",
                        }
                    ],
                },
            },
            {
                "schemaVersion": 1,
                "id": "metric-run-v2",
                "ts": "2026-07-01T00:02:00Z",
                "event": "orchestration_run",
                "data": {
                    "schemaVersion": 2,
                    "orchestrationId": "orchestration-v2",
                    "mode": "parallel",
                    "fanOut": 1,
                    "status": "failed",
                    "workers": [
                        {
                            "runId": "worker-v2",
                            "treeId": "tree-v2",
                            "role": "leaf",
                            "agent": "legacy",
                            "status": "failed",
                        }
                    ],
                },
            },
            {
                "schemaVersion": 1,
                "id": "metric-run-v3",
                "ts": "2026-07-01T00:03:00Z",
                "event": "orchestration_run",
                "session": "session-3",
                "data": {
                    "schemaVersion": 3,
                    "orchestrationId": "orchestration-v3",
                    "parentSessionId": "parent-3",
                    "interactionId": "interaction-3",
                    "mode": "parallel",
                    "fanOut": 2,
                    "status": "completed",
                    "durationMs": 123,
                    "childWorkMs": 98,
                    "childTextBytes": 30,
                    "parentVisibleBytes": 26,
                    "artifactBytes": 4,
                    "chainTransferBytes": 2,
                    "inlineBytesNotReturned": 4,
                    "executionKind": "coordinator",
                    "outcomeCode": "partial",
                    "workspaceRootSource": "override",
                    "markerCount": 2,
                    "boundaryCount": 1,
                    "searchCount": 3,
                    "watchdogCount": 4,
                    "pingCount": 5,
                    "interruptionCount": 1,
                    "recoveryCount": 1,
                    "coordinatorBudgetOutcome": "soft_deadline",
                    "legacyAdapterBranch": "single",
                    "legacyAdapterUse": True,
                    "taskLinkSource": "auto",
                    "onclaveEligible": False,
                    "workers": [
                        {
                            "runId": "worker-v3",
                            "treeId": "tree-v3",
                            "parentRunId": "parent-worker",
                            "depth": 1,
                            "role": "leaf",
                            "workflowPhase": "verify",
                            "taskKey": "item-3",
                            "attempt": 2,
                            "retryOrigin": "worker-old",
                            "coordinatorTaskId": "task-3",
                            "taskId": "task-3-leaf",
                            "agent": "specialist",
                            "resolvedModel": "provider/model",
                            "selectedEffort": "high",
                            "advisoryPolicyVersion": "routing-v1",
                            "advisoryTaskClass": "validation",
                            "advisoryRecommendedRoute": "provider/model:high",
                            "advisoryClassification": "preferred",
                            "advisoryTopologyMismatch": False,
                            "experimentId": "experiment-3",
                            "experimentArm": "luna-high",
                            "experimentTaskClass": "subagent-single",
                            "validationOutcome": "passed",
                            "status": "completed",
                            "exitCode": 0,
                            "durationMs": 49,
                            "outputMode": "artifact",
                            "childTextBytes": 30,
                            "parentVisibleBytes": 26,
                            "artifactBytes": 4,
                            "chainTransferBytes": 2,
                            "turns": 3,
                            "usage": {
                                "inputTokens": 10,
                                "outputTokens": 20,
                                "totalTokens": 30,
                                "cacheCreationInputTokens": 1,
                                "cacheReadInputTokens": 2,
                                "processedTokens": 33,
                                "contextPeakTokens": 40,
                                "turns": 3,
                                "costUsd": 0.25,
                                "costSource": "pi-usage",
                            },
                            "executionKind": "write",
                            "outcomeCode": "completed",
                            "workspaceRootSource": "override",
                            "markerCount": 1,
                            "boundaryCount": 1,
                            "searchCount": 2,
                            "watchdogCount": 0,
                            "pingCount": 1,
                            "interruptionCount": 0,
                            "recoveryCount": 0,
                            "coordinatorBudgetOutcome": "not_applicable",
                            "legacyAdapterBranch": "single",
                            "legacyAdapterUse": False,
                            "taskLinkSource": "explicit",
                            "onclaveEligible": False,
                            "command": "private command",
                            "output": "private output",
                            "workspace": "/private/workspace",
                            "path": "/private/path",
                        },
                        {
                            "runId": "worker-v3-2",
                            "agent": "specialist",
                            "status": "cancelled",
                        },
                    ],
                },
            },
            {
                "schemaVersion": 1,
                "id": "metric-intervention-v1",
                "ts": "2026-07-01T00:04:00Z",
                "event": "subagent_intervention",
                "session": "session-3",
                "data": {
                    "schemaVersion": 1,
                    "orchestrationId": "orchestration-v3",
                    "runId": "worker-v3",
                    "code": "interruption",
                    "outcome": "acknowledged",
                    "acknowledged": True,
                    "durationMs": 12,
                    "activeToolDurationMs": 8,
                    "activeToolOutputAgeMs": 7,
                    "activityVersion": 4,
                    "markerCount": 1,
                    "boundaryCount": 1,
                    "searchCount": 2,
                    "watchdogCount": 1,
                    "pingCount": 3,
                    "interruptionCount": 1,
                    "recoveryCount": 1,
                },
            },
        ],
    )

    connection, _ = connect_with_views(layout, selected_sources=("metric_events",))
    run_columns = [row[0] for row in connection.execute("DESCRIBE subagent_runs").fetchall()]
    worker_columns = [row[0] for row in connection.execute("DESCRIBE subagent_workers").fetchall()]
    intervention_columns = [
        row[0] for row in connection.execute("DESCRIBE subagent_interventions").fetchall()
    ]
    view_names = {
        row[0]
        for row in connection.execute(
            "SELECT table_name FROM information_schema.views WHERE table_schema = 'main'"
        ).fetchall()
    }
    assert {name for name in view_names if name.startswith("subagent_")} == {
        "subagent_runs",
        "subagent_workers",
        "subagent_interventions",
    }
    for columns in (run_columns, worker_columns, intervention_columns):
        assert not {"task", "command", "output", "workspace", "path"} & set(columns)

    runs = connection.execute(
        """SELECT schema_version, orchestration_id, inline_bytes_not_returned,
        execution_kind, marker_count, onclave_eligible, worker_count
        FROM subagent_runs ORDER BY orchestration_id"""
    ).fetchall()
    assert runs == [
        (1, "orchestration-v1", 7, None, None, None, 1),
        (2, "orchestration-v2", 0, None, None, None, 1),
        (3, "orchestration-v3", 4, "coordinator", 2, False, 2),
    ]
    assert connection.execute(
        """SELECT typeof(schema_version), typeof(duration_ms), typeof(onclave_eligible)
        FROM subagent_runs WHERE orchestration_id = 'orchestration-v3'"""
    ).fetchone() == ("UBIGINT", "BIGINT", "BOOLEAN")

    worker = connection.execute(
        """SELECT schema_version, run_id, execution_kind, usage_processed_tokens,
        usage_cost_usd, task_key, onclave_eligible
        FROM subagent_workers WHERE run_id = 'worker-v3'"""
    ).fetchone()
    assert worker == (3, "worker-v3", "write", 33, 0.25, "item-3", False)
    assert connection.execute("SELECT count(*) FROM subagent_workers").fetchone() == (4,)

    intervention = connection.execute(
        """SELECT schema_version, orchestration_id, run_id, code, outcome, acknowledged,
        active_tool_duration_ms, recovery_count
        FROM subagent_interventions"""
    ).fetchone()
    assert intervention == (
        1,
        "orchestration-v3",
        "worker-v3",
        "interruption",
        "acknowledged",
        True,
        8,
        1,
    )

    run_dataframe = connection.execute(
        "SELECT orchestration_id, marker_count FROM subagent_runs ORDER BY orchestration_id"
    ).df()
    assert list(run_dataframe.columns) == ["orchestration_id", "marker_count"]
    worker_dataframe = connection.execute(
        """SELECT run_id, status, duration_ms, usage_processed_tokens, usage_cost_usd
        FROM subagent_workers ORDER BY run_id"""
    ).df()
    assert list(worker_dataframe.columns) == [
        "run_id",
        "status",
        "duration_ms",
        "usage_processed_tokens",
        "usage_cost_usd",
    ]
    intervention_dataframe = connection.execute(
        """SELECT orchestration_id, run_id, code, outcome, acknowledged,
        recovery_count FROM subagent_interventions"""
    ).df()
    assert list(intervention_dataframe.columns) == [
        "orchestration_id",
        "run_id",
        "code",
        "outcome",
        "acknowledged",
        "recovery_count",
    ]
    rendered = repr(runs) + repr(worker) + repr(intervention)
    assert all(
        value not in rendered
        for value in (
            "private task text",
            "private command",
            "private output",
            "/private/workspace",
            "/private/path",
        )
    )


def test_query_runner_is_read_only_and_bounded(layout: SourceLayout) -> None:
    connection, _ = connect_with_views(layout)

    rows = execute_bounded_query(
        connection,
        "SELECT type FROM session_entries ORDER BY timestamp",
        2,
    ).fetchall()
    assert rows == [("session",), ("message",)]

    with pytest.raises(ValueError, match="read-only SELECT"):
        execute_bounded_query(connection, "DELETE FROM session_entries", 10)
    with pytest.raises(ValueError, match="exactly one"):
        execute_bounded_query(connection, "SELECT 1; SELECT 2", 10)
    with pytest.raises(ValueError, match="limit"):
        execute_bounded_query(connection, "SELECT 1", MAX_QUERY_ROWS + 1)


def test_catalog_does_not_scan_or_merge_session_corpora(
    layout: SourceLayout,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    rows = {row[0]: row for row in source_catalog(layout)}
    assert rows["session_entries"][1] == 1
    assert rows["history_entries"][1] == 1
    monkeypatch.setattr(
        pi_log_query,
        "connect_with_views",
        lambda *args, **kwargs: pytest.fail("catalog registered row-reading views"),
    )

    result = main(
        [
            "--repo-root",
            str(layout.repo_root),
            "--agent-dir",
            str(layout.agent_dir),
            "--workflow-telemetry-dir",
            str(layout.workflow_telemetry_dir),
            "catalog",
            "--format",
            "jsonl",
        ]
    )
    output = capsys.readouterr().out
    assert result == 0
    assert '"source": "session_entries"' in output
    assert "private prompt" not in output


def test_malformed_jsonl_requires_validation_and_explicit_opt_in(
    layout: SourceLayout, capsys: pytest.CaptureFixture[str]
) -> None:
    bad_path = layout.agent_dir / "logs" / "usage.jsonl"
    bad_path.parent.mkdir(parents=True, exist_ok=True)
    bad_path.write_text(
        '{"schemaVersion":1,"event":"start"}\n' + "not-json\n" * (MAX_VALIDATION_ISSUES + 5),
        encoding="utf-8",
    )

    connection, _ = connect_with_views(layout)
    with pytest.raises(duckdb.InvalidInputException):
        connection.sql("SELECT count(*) FROM usage_events").fetchone()

    spec = next(spec for spec in SOURCES if spec.name == "usage_events")
    total, malformed, issues = validate_source(spec, layout)
    assert total == MAX_VALIDATION_ISSUES + 6
    assert malformed == MAX_VALIDATION_ISSUES + 5
    assert len(issues) == MAX_VALIDATION_ISSUES
    assert issues[0][1:3] == (2, "JSONDecodeError")
    assert "not-json" not in str(issues)

    validate_result = main(
        [
            "--repo-root",
            str(layout.repo_root),
            "--agent-dir",
            str(layout.agent_dir),
            "--workflow-telemetry-dir",
            str(layout.workflow_telemetry_dir),
            "validate",
            "usage_events",
            "--format",
            "csv",
        ]
    )
    validation_output = capsys.readouterr()
    assert validate_result == 1
    assert len(validation_output.out.splitlines()) == MAX_VALIDATION_ISSUES + 1
    assert f"malformed_rows={MAX_VALIDATION_ISSUES + 5}" in validation_output.err
    assert f"reported_issues={MAX_VALIDATION_ISSUES}" in validation_output.err

    result = main(
        [
            "--repo-root",
            str(layout.repo_root),
            "--agent-dir",
            str(layout.agent_dir),
            "--workflow-telemetry-dir",
            str(layout.workflow_telemetry_dir),
            "--ignore-malformed",
            "query",
            "SELECT count(event) AS parsed_events FROM usage_events",
        ]
    )
    captured = capsys.readouterr()
    assert result == 0
    assert "parsed_events" in captured.out
    assert "not-json" not in captured.out
    assert "omits malformed JSONL rows" in captured.err


def test_selected_source_registers_only_selected_tables(layout: SourceLayout) -> None:
    connection, paths = connect_with_views(layout, selected_sources=("session_entries",))

    assert tuple(paths) == ("session_entries",)
    assert connection.sql("SELECT count(*) FROM session_inventory").fetchone() == (1,)
    with pytest.raises(duckdb.CatalogException):
        connection.sql("SELECT count(*) FROM metric_events").fetchone()


def test_files_excludes_reparse_point_directories(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    included = tmp_path / "included"
    excluded = tmp_path / "excluded"
    write_jsonl(included / "included.jsonl", [{"id": "included"}])
    write_jsonl(excluded / "excluded.jsonl", [{"id": "excluded"}])
    excluded_inode = excluded.stat().st_ino
    original = pi_log_query._is_reparse_point
    monkeypatch.setattr(
        pi_log_query,
        "_is_reparse_point",
        lambda file_stat: file_stat.st_ino == excluded_inode or original(file_stat),
    )

    assert pi_log_query._files(tmp_path, "*.jsonl") == [included / "included.jsonl"]


def test_files_propagates_traversal_errors(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    write_jsonl(tmp_path / "source.jsonl", [{"id": "source"}])
    original = pi_log_query.os.scandir

    def denied(path: Path):
        if Path(path) == tmp_path:
            raise PermissionError("denied")
        return original(path)

    monkeypatch.setattr(pi_log_query.os, "scandir", denied)

    with pytest.raises(PermissionError, match="denied"):
        pi_log_query._files(tmp_path, "*.jsonl")


def test_files_from_overrides_discovery_with_relative_jsonl_paths(
    layout: SourceLayout, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    imported = tmp_path / "imported" / "session.jsonl"
    write_jsonl(imported, [{"type": "session", "id": "manifest-session"}])
    manifest = tmp_path / "manifests" / "sources.jsonl"
    manifest.parent.mkdir()
    manifest.write_text(
        "../imported/session.jsonl\n"
        + json.dumps({"filename": "../imported/session.jsonl"})
        + "\n",
        encoding="utf-8",
    )

    result = main(
        [
            "--repo-root",
            str(layout.repo_root),
            "--agent-dir",
            str(layout.agent_dir),
            "--source",
            "session_entries",
            "--files-from",
            f"session_entries={manifest}",
            "query",
            "SELECT id FROM session_entries",
            "--format",
            "jsonl",
        ]
    )

    assert result == 0
    assert json.loads(capsys.readouterr().out) == {"id": "manifest-session"}


def test_thread_default_is_capped_and_connection_honors_explicit_value(
    layout: SourceLayout, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(pi_log_query.os, "cpu_count", lambda: 64)
    assert pi_log_query.build_parser().parse_args(["catalog"]).threads == 4

    connection, _ = connect_with_views(layout, selected_sources=("session_entries",), threads=1)
    assert str(connection.sql("SELECT current_setting('threads')").fetchone()[0]) == "1"


def test_validation_cache_reuses_and_invalidates_files(
    layout: SourceLayout, capsys: pytest.CaptureFixture[str]
) -> None:
    args = [
        "--repo-root",
        str(layout.repo_root),
        "--agent-dir",
        str(layout.agent_dir),
        "validate",
        "session_entries",
        "--format",
        "jsonl",
    ]

    assert main(args) == 0
    assert "checked_files=1 cached_files=0" in capsys.readouterr().err
    assert main(args) == 0
    assert "checked_files=0 cached_files=1" in capsys.readouterr().err

    session_path = layout.agent_dir / "sessions" / "project" / "session-1.jsonl"
    with session_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps({"type": "message", "id": "new-message"}) + "\n")
    assert main(args) == 0
    assert "checked_files=1 cached_files=0" in capsys.readouterr().err


def test_selected_snapshot_metadata_excludes_unselected_sources(
    layout: SourceLayout, tmp_path: Path
) -> None:
    snapshot = tmp_path / "selected.duckdb"
    pi_log_query.refresh_snapshot(
        snapshot,
        layout,
        selected_sources=("session_entries", "history_entries"),
        threads=1,
    )
    connection = pi_log_query._open_snapshot(snapshot, 1, ("session_entries",))
    try:
        assert connection.sql(
            "SELECT DISTINCT source_name FROM pi_log_snapshot_metadata"
        ).fetchall() == [("session_entries",)]
        with pytest.raises(duckdb.CatalogException):
            connection.sql("SELECT count(*) FROM history_entries").fetchone()
    finally:
        connection.close()


def test_snapshot_incrementally_refreshes_and_catalog_uses_metadata(
    layout: SourceLayout, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    snapshot = tmp_path / "snapshot.duckdb"
    base_args = [
        "--repo-root",
        str(layout.repo_root),
        "--agent-dir",
        str(layout.agent_dir),
        "--snapshot-db",
        str(snapshot),
        "--source",
        "session_entries",
    ]

    assert main([*base_args, "snapshot"]) == 0
    capsys.readouterr()
    assert main([*base_args, "query", "SELECT count(*) AS rows FROM session_entries"]) == 0
    assert "3" in capsys.readouterr().out

    session_path = layout.agent_dir / "sessions" / "project" / "session-1.jsonl"
    with session_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps({"type": "message", "id": "snapshot-message"}) + "\n")
    assert main([*base_args, "snapshot"]) == 0
    capsys.readouterr()
    session_path.unlink()
    assert main([*base_args, "catalog", "--format", "jsonl"]) == 0
    catalog = capsys.readouterr().out
    assert '"files": 1' in catalog
    assert main([*base_args, "query", "SELECT count(*) AS rows FROM session_entries"]) == 0
    assert "4" in capsys.readouterr().out
    assert main([*base_args, "snapshot"]) == 0
    capsys.readouterr()
    assert main([*base_args, "catalog", "--format", "jsonl"]) == 0
    assert '"files": 0' in capsys.readouterr().out
    assert main([*base_args, "query", "SELECT count(*) AS rows FROM session_entries"]) == 0
    assert "0" in capsys.readouterr().out


def test_batch_returns_multiple_results_and_rejects_non_select(
    layout: SourceLayout, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    sql_file = tmp_path / "batch.sql"
    sql_file.write_text("SELECT 1 AS first; SELECT 2 AS second;", encoding="utf-8")

    assert (
        main(
            [
                "--agent-dir",
                str(layout.agent_dir),
                "--source",
                "session_entries",
                "batch",
                str(sql_file),
                "--format",
                "jsonl",
            ]
        )
        == 0
    )
    assert [json.loads(line) for line in capsys.readouterr().out.splitlines()] == [
        {"first": 1},
        {"second": 2},
    ]

    sql_file.write_text("SELECT 1; DELETE FROM session_entries;", encoding="utf-8")
    assert (
        main(
            [
                "--agent-dir",
                str(layout.agent_dir),
                "--source",
                "session_entries",
                "batch",
                str(sql_file),
            ]
        )
        == 2
    )
    assert "only read-only SELECT" in capsys.readouterr().err


def test_snapshot_batches_initial_files_and_replaces_only_changed_file(
    layout: SourceLayout, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    first = layout.agent_dir / "sessions" / "project" / "session-1.jsonl"
    second = tmp_path / "sessions" / "session-2.jsonl"
    write_jsonl(second, [{"type": "session", "id": "session-2"}])
    snapshot = tmp_path / "snapshot.duckdb"
    read_calls: list[list[str]] = []
    original_connect = duckdb.connect

    class TrackingConnection:
        def __init__(self, connection: duckdb.DuckDBPyConnection) -> None:
            self.connection = connection

        def read_json(self, paths: list[str], **kwargs: object) -> duckdb.DuckDBPyRelation:
            read_calls.append(paths)
            return self.connection.read_json(paths, **kwargs)

        def __getattr__(self, name: str) -> object:
            return getattr(self.connection, name)

    def tracking_connect(*args: object, **kwargs: object) -> TrackingConnection:
        return TrackingConnection(original_connect(*args, **kwargs))

    monkeypatch.setattr(pi_log_query.duckdb, "connect", tracking_connect)
    monkeypatch.setattr(pi_log_query, "SNAPSHOT_BATCH_MAX_FILES", 1)
    overrides = {"session_entries": [first, second]}
    pi_log_query.refresh_snapshot(
        snapshot, layout, selected_sources=("session_entries",), source_overrides=overrides
    )
    assert read_calls == [[str(first.resolve())], [str(second.resolve())]]

    with first.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps({"type": "message", "id": "replacement-message"}) + "\n")
    pi_log_query.refresh_snapshot(
        snapshot, layout, selected_sources=("session_entries",), source_overrides=overrides
    )
    assert read_calls == [
        [str(first.resolve())],
        [str(second.resolve())],
        [str(first.resolve())],
    ]

    connection = original_connect(str(snapshot), read_only=True)
    try:
        assert connection.execute(
            "SELECT filename, count(*) FROM session_entries GROUP BY filename ORDER BY filename"
        ).fetchall() == [
            (str(first.resolve()), 4),
            (str(second.resolve()), 1),
        ]
        assert connection.execute(
            "SELECT count(*) FROM pi_log_snapshot_metadata WHERE source_name = 'session_entries'"
        ).fetchone() == (2,)
    finally:
        connection.close()


def test_validation_cache_preserves_entries_for_multiple_sources(
    layout: SourceLayout, tmp_path: Path
) -> None:
    cache_path = tmp_path / "validation-cache.json"
    session_spec = next(spec for spec in SOURCES if spec.name == "session_entries")
    metrics_spec = next(spec for spec in SOURCES if spec.name == "metric_events")

    pi_log_query._cached_validation(session_spec, session_spec.resolve_paths(layout), cache_path)
    pi_log_query._cached_validation(metrics_spec, metrics_spec.resolve_paths(layout), cache_path)

    cache = json.loads(cache_path.read_text(encoding="utf-8"))
    assert set(cache["entries"]) == {"session_entries", "metric_events"}
    assert not cache_path.with_name(f".{cache_path.name}.lock").exists()


def test_validation_cache_lock_times_out(
    layout: SourceLayout, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    cache_path = tmp_path / "validation-cache.json"
    lock_path = cache_path.with_name(f".{cache_path.name}.lock")
    lock_path.write_text("held", encoding="utf-8")
    monkeypatch.setattr(pi_log_query, "VALIDATION_CACHE_LOCK_TIMEOUT_SECONDS", 0.0)
    session_spec = next(spec for spec in SOURCES if spec.name == "session_entries")

    with pytest.raises(TimeoutError, match="timed out waiting for validation cache lock"):
        pi_log_query._cached_validation(
            session_spec, session_spec.resolve_paths(layout), cache_path
        )

    assert lock_path.exists()


def test_snapshot_strict_refresh_reingests_unchanged_permissive_source(
    layout: SourceLayout, tmp_path: Path
) -> None:
    snapshot = tmp_path / "snapshot.duckdb"
    usage_path = layout.agent_dir / "logs" / "usage.jsonl"
    usage_path.parent.mkdir(parents=True, exist_ok=True)
    usage_path.write_text('{"schemaVersion":1,"event":"start"}\nnot-json\n', encoding="utf-8")

    pi_log_query.refresh_snapshot(
        snapshot, layout, selected_sources=("usage_events",), ignore_errors=True
    )
    connection = pi_log_query._open_snapshot(snapshot, 1)
    try:
        assert connection.execute("SELECT count(*) FROM usage_events").fetchone() == (2,)
    finally:
        connection.close()

    with pytest.raises(duckdb.InvalidInputException):
        pi_log_query.refresh_snapshot(snapshot, layout, selected_sources=("usage_events",))

    connection = pi_log_query._open_snapshot(snapshot, 1)
    try:
        assert connection.execute("SELECT count(*) FROM usage_events").fetchone() == (2,)
    finally:
        connection.close()


def test_failed_initial_snapshot_refresh_is_not_openable(
    layout: SourceLayout, tmp_path: Path
) -> None:
    snapshot = tmp_path / "snapshot.duckdb"
    usage_path = layout.agent_dir / "logs" / "usage.jsonl"
    usage_path.parent.mkdir(parents=True, exist_ok=True)
    usage_path.write_text('{"schemaVersion":1,"event":"start"}\nnot-json\n', encoding="utf-8")

    with pytest.raises(duckdb.InvalidInputException):
        pi_log_query.refresh_snapshot(snapshot, layout, selected_sources=("usage_events",))

    with pytest.raises(ValueError, match="legacy or incomplete"):
        pi_log_query._open_snapshot(snapshot, 1)

    connection = duckdb.connect(str(snapshot), read_only=True)
    try:
        assert not pi_log_query._snapshot_metadata_exists(connection)
        assert not pi_log_query._snapshot_state_exists(connection)
    finally:
        connection.close()


def test_snapshot_reconciles_files_that_change_during_initial_load(
    layout: SourceLayout, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    snapshot = tmp_path / "snapshot.duckdb"
    session_path = layout.agent_dir / "sessions" / "project" / "session-1.jsonl"
    original = pi_log_query._snapshot_signatures
    calls = 0

    def change_once(paths_by_source):
        nonlocal calls
        calls += 1
        if calls == 2:
            with session_path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps({"type": "message", "id": "late"}) + "\n")
        return original(paths_by_source)

    monkeypatch.setattr(pi_log_query, "_snapshot_signatures", change_once)
    pi_log_query.refresh_snapshot(snapshot, layout, selected_sources=("session_entries",))

    connection = pi_log_query._open_snapshot(snapshot, 1)
    try:
        assert connection.execute("SELECT count(*) FROM session_entries").fetchone() == (4,)
    finally:
        connection.close()


def test_snapshot_fails_when_files_never_stabilize(
    layout: SourceLayout, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    snapshot = tmp_path / "snapshot.duckdb"
    session_path = layout.agent_dir / "sessions" / "project" / "session-1.jsonl"
    original = pi_log_query._snapshot_signatures
    calls = 0

    def keep_changing(paths_by_source):
        nonlocal calls
        calls += 1
        if calls > 1:
            with session_path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps({"type": "message", "id": f"late-{calls}"}) + "\n")
        return original(paths_by_source)

    monkeypatch.setattr(pi_log_query, "_snapshot_signatures", keep_changing)
    with pytest.raises(RuntimeError, match="did not stabilize"):
        pi_log_query.refresh_snapshot(snapshot, layout, selected_sources=("session_entries",))

    with pytest.raises(ValueError, match="legacy or incomplete"):
        pi_log_query._open_snapshot(snapshot, 1)


def test_failed_changed_file_refresh_preserves_committed_snapshot(
    layout: SourceLayout, tmp_path: Path
) -> None:
    snapshot = tmp_path / "snapshot.duckdb"
    pi_log_query.refresh_snapshot(snapshot, layout, selected_sources=("session_entries",))
    session_path = layout.agent_dir / "sessions" / "project" / "session-1.jsonl"
    with session_path.open("a", encoding="utf-8") as handle:
        handle.write("not-json\n")

    with pytest.raises(duckdb.InvalidInputException):
        pi_log_query.refresh_snapshot(snapshot, layout, selected_sources=("session_entries",))

    connection = pi_log_query._open_snapshot(snapshot, 1)
    try:
        assert connection.execute("SELECT count(*) FROM session_entries").fetchone() == (3,)
        assert connection.execute(
            "SELECT format_version, completed FROM pi_log_snapshot_state"
        ).fetchall() == [(pi_log_query.SNAPSHOT_FORMAT_VERSION, True)]
    finally:
        connection.close()


def test_snapshot_rejects_legacy_incomplete_schema(layout: SourceLayout, tmp_path: Path) -> None:
    snapshot = tmp_path / "snapshot.duckdb"
    connection = duckdb.connect(str(snapshot))
    try:
        connection.execute(
            """CREATE TABLE pi_log_snapshot_metadata (
            source_name VARCHAR NOT NULL, path VARCHAR NOT NULL, size UBIGINT NOT NULL,
            mtime_ns UBIGINT NOT NULL, PRIMARY KEY (source_name, path))"""
        )
    finally:
        connection.close()

    with pytest.raises(ValueError, match="legacy or incomplete"):
        pi_log_query.refresh_snapshot(snapshot, layout, selected_sources=("session_entries",))
    with pytest.raises(ValueError, match="legacy or incomplete"):
        pi_log_query._open_snapshot(snapshot, 1)


def test_snapshot_rejects_incompatible_filename_schema_before_refresh(
    layout: SourceLayout, tmp_path: Path
) -> None:
    snapshot = tmp_path / "snapshot.duckdb"
    spec = next(spec for spec in SOURCES if spec.name == "session_entries")
    definitions = ", ".join(
        f"{pi_log_query._quoted_identifier(name)} {data_type}" for name, data_type in spec.columns
    )
    pi_log_query.refresh_snapshot(snapshot, layout, selected_sources=("session_entries",))
    connection = duckdb.connect(str(snapshot))
    try:
        connection.execute("DROP VIEW session_inventory")
        connection.execute("DROP TABLE session_entries")
        connection.execute(f"CREATE TABLE session_entries ({definitions}, filename BIGINT)")
    finally:
        connection.close()

    with pytest.raises(ValueError, match="snapshot schema mismatch for session_entries"):
        pi_log_query.refresh_snapshot(snapshot, layout, selected_sources=("session_entries",))
