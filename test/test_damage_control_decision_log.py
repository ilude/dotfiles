from __future__ import annotations

import gzip
import importlib.util
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from types import ModuleType

import pytest

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "shared" / "damage-control" / "decision_log.py"
SCHEMA_PATH = ROOT / "shared" / "damage-control" / "decision.schema.json"
NOW = datetime(2026, 7, 17, 12, 0, tzinfo=timezone.utc)


def load_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("damage_control_decision_log", MODULE_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def decision_log(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> ModuleType:
    monkeypatch.setenv("DAMAGE_CONTROL_DECISION_DIR", str(tmp_path))
    return load_module()


def decision_values() -> dict[str, object]:
    return {
        "client": "claude",
        "sessionId": "session-1",
        "toolUseId": "tool-1",
        "tool": "Bash",
        "ruleId": "dangerous-rm",
        "matchedPattern": "rm recursive",
        "actionSummary": f"api_key={'x' * 40} {'a' * 700}",
        "engineAction": "ask",
        "userDecision": "denied_or_abandoned",
        "latencyMs": 12.5,
        "latencyKind": "estimated",
    }


def test_writes_schema_aligned_secret_scrubbed_monthly_row(
    decision_log: ModuleType,
) -> None:
    assert decision_log.record_decision(decision_values(), NOW) is True

    path = decision_log.decision_log_path(NOW)
    row = json.loads(path.read_text(encoding="utf-8"))
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    assert set(schema["required"]) <= set(row)
    assert row["schemaVersion"] == 1
    assert row["timestamp"] == "2026-07-17T12:00:00Z"
    assert row["client"] == "claude"
    assert row["userDecision"] == "denied_or_abandoned"
    assert "[REDACTED]" in row["actionSummary"]
    assert len(row["actionSummary"]) <= 500
    assert path.name == "decisions-2026-07.jsonl"


def test_fails_open_for_invalid_rows_and_unwritable_destination(
    decision_log: ModuleType,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    invalid = decision_values()
    invalid["sessionId"] = ""
    assert decision_log.record_decision(invalid, NOW) is False

    file_root = tmp_path / "not-a-directory"
    file_root.write_text("occupied", encoding="utf-8")
    monkeypatch.setenv("DAMAGE_CONTROL_DECISION_DIR", str(file_root))
    assert decision_log.record_decision(decision_values(), NOW) is False


def test_compresses_old_logs_without_losing_content(
    decision_log: ModuleType,
    tmp_path: Path,
) -> None:
    source = tmp_path / "decisions-2026-05.jsonl"
    source.write_text('{"schemaVersion":1}\n', encoding="utf-8")
    old = datetime(2026, 5, 1, tzinfo=timezone.utc).timestamp()
    os.utime(source, (old, old))

    compressed = decision_log.compress_old_logs(NOW)

    target = source.with_suffix(".jsonl.gz")
    assert compressed == [target]
    assert not source.exists()
    with gzip.open(target, "rt", encoding="utf-8") as stream:
        assert stream.read() == '{"schemaVersion":1}\n'
