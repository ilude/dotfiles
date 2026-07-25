from __future__ import annotations

import json
from pathlib import Path

import duckdb
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
        "PI_COMS_LAN_DIR",
    ):
        monkeypatch.delenv(name, raising=False)
    repo = tmp_path / "repo"
    agent = tmp_path / "agent"
    workflow = tmp_path / "workflow-telemetry"
    coms = tmp_path / "coms-lan"

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
            }
        ],
    )
    write_jsonl(
        agent / "traces" / "session-1.jsonl",
        [
            {
                "schema_version": "1.1.0",
                "event_id": "event-new",
                "session_id": "session-new",
                "turn_id": "turn-new",
                "trace_id": "trace-new",
                "event_type": "routing_decision",
                "timestamp": "2026-07-01T00:00:06Z",
                "monotonic_ns": "6",
                "payload": {
                    "prompt_hash": "hash-new",
                    "route_decision_id": "route-11111111-1111-4111-8111-111111111111",
                    "applied_route": "core",
                    "selected_model_size": "medium",
                    "actual_model": {"provider": "provider-new", "id": "model-new"},
                    "rule_fired": "classifier",
                },
            },
            {
                "schema_version": "1.0.0",
                "session_id": "session-old-1",
                "turn_id": "turn-old-1",
                "trace_id": "trace-old-1",
                "event_type": "routing_decision",
                "timestamp": "2026-07-01T00:00:04Z",
                "monotonic_ns": "4",
                "payload": {
                    "prompt_hash": "hash-old",
                    "route_decision_id": "route-0123456789abcdef",
                    "applied_route": "mini",
                },
            },
            {
                "schema_version": "1.0.0",
                "session_id": "session-old-2",
                "turn_id": "turn-old-2",
                "trace_id": "trace-old-2",
                "event_type": "routing_decision",
                "timestamp": "2026-07-01T00:00:05Z",
                "monotonic_ns": "5",
                "payload": {
                    "prompt_hash": "hash-old",
                    "route_decision_id": "route-0123456789abcdef",
                    "applied_route": "core",
                },
            },
        ],
    )
    write_jsonl(
        repo / "pi" / "prompt-routing" / "logs" / "classifier_failures.jsonl",
        [
            {
                "schema_version": 1,
                "id": "failure-1",
                "ts": "2026-07-01T00:00:05Z",
                "timestamp": "2026-07-01T00:00:05Z",
                "event": "nonzero_exit",
                "route_decision_id": "route-failed",
                "prompt_hash": "hash-failed",
                "classifier_mode": "confgate",
                "code": 1,
                "prompt_length": 20,
                "elapsed_ms": 10,
                "stdout_length": 0,
                "stderr_length": 12,
                "stderr_preview": "intentionally omitted from view",
            }
        ],
    )
    write_jsonl(
        repo / "pi" / "prompt-routing" / "logs" / "routing_log.jsonl",
        [
            {
                "ts": 1.0,
                "timestamp": "2026-07-01T00:00:04Z",
                "prompt_hash": "hash-old",
                "primary": {"model_size": "small", "effort": "low"},
                "confidence": 0.7,
                "elapsed_us": 10.0,
                "schema_version": "3.0.0",
            },
            {
                "ts": 2.0,
                "timestamp": "2026-07-01T00:00:05Z",
                "prompt_hash": "hash-old",
                "primary": {"model_size": "medium", "effort": "medium"},
                "confidence": 0.8,
                "elapsed_us": 11.0,
                "schema_version": "3.0.0",
            },
            {
                "ts": 3.0,
                "timestamp": "2026-07-01T00:00:06Z",
                "prompt_hash": "hash-new",
                "route_decision_id": "route-11111111-1111-4111-8111-111111111111",
                "primary": {"model_size": "medium", "effort": "high"},
                "confidence": 0.9,
                "elapsed_us": 12.0,
                "schema_version": "3.0.0",
                "prompt": "must not be registered",
            },
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
    write_jsonl(
        coms / "node-1" / "audit.jsonl",
        [
            {
                "schemaVersion": 1,
                "id": "audit-1",
                "ts": "2026-07-01T00:00:08Z",
                "type": "outbound_message",
                "nodeId": "node-1",
                "result": "sent",
            }
        ],
    )
    return SourceLayout(repo, agent, agent / "logs", agent / "traces", workflow, coms)


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
    assert connection.sql("SELECT event_count FROM metric_event_summary").fetchone() == (1,)
    assert connection.sql("SELECT event_count FROM workflow_episode_summary").fetchone() == (1,)
    assert connection.sql("SELECT count(*) FROM damage_control_judgments").fetchone() == (1,)
    assert connection.sql("SELECT count(*) FROM coms_audit_events").fetchone() == (1,)
    assert connection.sql(
        "SELECT schema_version, classifier_mode FROM classifier_failures"
    ).fetchone() == (1, "confgate")

    columns = {row[0] for row in connection.sql("DESCRIBE routing_classifier_events").fetchall()}
    assert "prompt" not in columns
    assert "prompt_excerpt" not in columns


def test_routing_join_uses_unique_ids_and_legacy_occurrence_order(layout: SourceLayout) -> None:
    connection, _ = connect_with_views(layout)

    rows = connection.sql(
        """
        SELECT prompt_hash, classifier_model_size, session_id, applied_route
        FROM routing_decisions_joined
        ORDER BY classifier_timestamp
        """
    ).fetchall()

    assert rows == [
        ("hash-old", "small", "session-old-1", "mini"),
        ("hash-old", "medium", "session-old-2", "core"),
        ("hash-new", "medium", "session-new", "core"),
    ]


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
    layout: SourceLayout, capsys: pytest.CaptureFixture[str]
) -> None:
    rows = {row[0]: row for row in source_catalog(layout)}
    assert rows["session_entries"][1] == 1
    assert rows["history_entries"][1] == 1

    result = main(
        [
            "--repo-root",
            str(layout.repo_root),
            "--agent-dir",
            str(layout.agent_dir),
            "--workflow-telemetry-dir",
            str(layout.workflow_telemetry_dir),
            "--coms-lan-dir",
            str(layout.coms_lan_dir),
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
            "--coms-lan-dir",
            str(layout.coms_lan_dir),
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
            "--coms-lan-dir",
            str(layout.coms_lan_dir),
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
