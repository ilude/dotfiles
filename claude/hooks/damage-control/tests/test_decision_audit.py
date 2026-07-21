"""Shared Claude decision logging and ask-correlation tests."""

from __future__ import annotations

import importlib.util
import json
import sys
import time
from pathlib import Path

HOOK_DIR = Path(__file__).parent.parent
REPO_ROOT = HOOK_DIR.parents[2]


def load_audit():
    name = f"decision_audit_test_{time.time_ns()}"
    spec = importlib.util.spec_from_file_location(name, HOOK_DIR / "decision_audit.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def payload(tool_use_id: str, event: str = "PreToolUse") -> dict[str, object]:
    return {
        "session_id": "claude-session",
        "tool_use_id": tool_use_id,
        "tool_name": "Bash",
        "hook_event_name": event,
    }


def read_rows(root: Path) -> list[dict[str, object]]:
    paths = list(root.glob("decisions-*.jsonl"))
    if not paths:
        return []
    return [json.loads(line) for line in paths[0].read_text(encoding="utf-8").splitlines()]


def test_records_allow_and_block_as_final_outcomes(shared_decision_log_dir: Path) -> None:
    audit = load_audit()

    assert audit.record_pretool_decision(
        payload("allow-1"),
        engine_action="allow",
        action_summary="pwd",
        started_at=time.perf_counter(),
    )
    assert audit.record_pretool_decision(
        payload("block-1"),
        engine_action="block",
        action_summary="rm -rf /",
        rule_id="root-delete",
        matched_pattern="root-delete",
        started_at=time.perf_counter(),
    )

    rows = read_rows(shared_decision_log_dir)
    assert [(row["engineAction"], row["userDecision"]) for row in rows] == [
        ("allow", "not_applicable"),
        ("block", "not_present"),
    ]
    assert {row["sessionId"] for row in rows} == {"claude-session"}


def test_correlates_approved_ask_and_scrubs_pending_secret(
    shared_decision_log_dir: Path,
) -> None:
    audit = load_audit()
    secret = "x" * 40

    assert audit.record_pretool_decision(
        payload("ask-approved"),
        engine_action="ask",
        action_summary=f"token={secret}",
        rule_id="force-push",
        started_at=time.perf_counter(),
    )
    pending_text = next((shared_decision_log_dir / ".pending-claude").glob("*.json")).read_text(
        encoding="utf-8"
    )
    assert secret not in pending_text
    assert "[REDACTED]" in pending_text

    post = payload("ask-approved", "PostToolUse")
    post["duration_ms"] = 0
    assert audit.settle_posttool(post)

    row = read_rows(shared_decision_log_dir)[0]
    assert (row["engineAction"], row["userDecision"]) == ("ask", "approved")
    assert row["latencyKind"] == "exact"
    assert secret not in json.dumps(row)
    assert not list((shared_decision_log_dir / ".pending-claude").glob("*.json"))


def test_session_end_marks_unmatched_ask_conservatively(
    shared_decision_log_dir: Path,
) -> None:
    audit = load_audit()
    assert audit.record_pretool_decision(
        payload("ask-unmatched"),
        engine_action="ask",
        action_summary="git reset --hard",
        rule_id="semantic_git",
        started_at=time.perf_counter(),
    )

    assert audit.settle_session({"session_id": "claude-session"}) == 1

    row = read_rows(shared_decision_log_dir)[0]
    assert (row["engineAction"], row["userDecision"]) == (
        "ask",
        "denied_or_abandoned",
    )
    assert row["latencyKind"] == "estimated"


def test_settings_register_all_correlation_events() -> None:
    settings = json.loads((REPO_ROOT / "claude" / "settings.json").read_text(encoding="utf-8"))
    hooks = settings["hooks"]
    command = "python $HOME/.claude/hooks/damage-control/decision_audit.py"

    for entry in hooks["PostToolUse"]:
        assert command in [hook["command"] for hook in entry["hooks"]]
    assert hooks["PostToolUseFailure"][0]["matcher"] == "Bash|Edit|Write"
    assert hooks["PostToolUseFailure"][0]["hooks"][0]["command"] == command
    assert any(
        command in [hook["command"] for hook in entry["hooks"]] for entry in hooks["SessionEnd"]
    )


def test_logging_failure_never_changes_hook_outcome(
    shared_decision_log_dir: Path,
    monkeypatch,
) -> None:
    occupied = shared_decision_log_dir / "occupied"
    occupied.parent.mkdir(parents=True, exist_ok=True)
    occupied.write_text("not a directory", encoding="utf-8")
    monkeypatch.setenv("DAMAGE_CONTROL_DECISION_DIR", str(occupied))
    audit = load_audit()

    assert (
        audit.record_pretool_decision(
            payload("allow-fail-open"),
            engine_action="allow",
            action_summary="pwd",
            started_at=time.perf_counter(),
        )
        is False
    )
    assert (
        audit.record_pretool_decision(
            payload("block-fail-open"),
            engine_action="block",
            action_summary="rm -rf /",
            rule_id="root-delete",
            started_at=time.perf_counter(),
        )
        is False
    )
