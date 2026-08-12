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
    assert connection.sql("SELECT count(*) FROM coms_audit_events").fetchone() == (1,)


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
