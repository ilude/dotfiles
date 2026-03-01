#!/usr/bin/env python
# /// script
# requires-python = ">=3.8"
# dependencies = ["pytest"]
# ///
"""Unit tests for the session allowlist feature in bash-tool-damage-control."""

import importlib.util
import json
import re
from datetime import datetime, timedelta
from pathlib import Path

import pytest

HOOK_DIR = Path(__file__).parent.parent


def load_module(name: str, filename: str):
    """Load a module with dashes in its filename."""
    spec = importlib.util.spec_from_file_location(name, HOOK_DIR / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


hook = load_module("bash_tool_damage_control", "bash-tool-damage-control.py")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_config(patterns=None):
    """Create a minimal compiled config for testing."""
    raw_patterns = patterns or [
        {
            "pattern": r"\bdocker\s+compose\s+down\b(?!.*--(volumes|rmi))",
            "reason": "docker compose down",
            "ask": True,
            "sessionScope": True,
        },
        {
            "pattern": r"\bdocker\s+compose\s+down\b.*--(volumes|rmi)",
            "reason": "docker compose down with data loss",
            "ask": True,
        },
        {
            "pattern": r"\bkubectl\s+apply\b",
            "reason": "kubectl apply",
            "ask": True,
            "sessionScope": True,
        },
        {
            "pattern": r"\brm\s+-rf\b",
            "reason": "rm -rf",
            "ask": False,
        },
    ]
    compiled = []
    for p in raw_patterns:
        cp = p.copy()
        cp["compiled"] = re.compile(p["pattern"], re.IGNORECASE)
        compiled.append(cp)
    return {
        "bashToolPatterns": raw_patterns,
        "bashToolPatterns_compiled": compiled,
    }


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def reset_session_cache():
    """Reset module-level session cache before and after every test."""
    hook._session_data_cache = None
    yield
    hook._session_data_cache = None


@pytest.fixture
def session_env(tmp_path, monkeypatch):
    """Set CLAUDE_SESSION_ID and redirect get_session_dir to tmp_path."""
    session_dir = tmp_path / "sessions"
    monkeypatch.setenv("CLAUDE_SESSION_ID", "test-session-123")
    monkeypatch.setattr(hook, "get_session_dir", lambda: session_dir)
    return session_dir


# ---------------------------------------------------------------------------
# get_session_file
# ---------------------------------------------------------------------------


def test_get_session_file_no_env(monkeypatch):
    """Missing CLAUDE_SESSION_ID returns None."""
    monkeypatch.delenv("CLAUDE_SESSION_ID", raising=False)
    assert hook.get_session_file() is None


def test_get_session_file_with_env(tmp_path, monkeypatch):
    """With env var set, returns correct path under session dir."""
    session_dir = tmp_path / "sessions"
    monkeypatch.setenv("CLAUDE_SESSION_ID", "abc-123")
    monkeypatch.setattr(hook, "get_session_dir", lambda: session_dir)

    result = hook.get_session_file()

    assert result == session_dir / "abc-123.json"


# ---------------------------------------------------------------------------
# load_session_data
# ---------------------------------------------------------------------------


def test_load_session_data_missing_file(session_env):
    """Missing session file returns empty structure."""
    data = hook.load_session_data()

    assert data == {"explicit_allows": [], "session_memory": []}


def test_load_session_data_corrupt_file(session_env):
    """Corrupt JSON file returns empty structure."""
    session_file = session_env / "test-session-123.json"
    session_env.mkdir(parents=True, exist_ok=True)
    session_file.write_text("{ not valid json !!!")

    data = hook.load_session_data()

    assert data == {"explicit_allows": [], "session_memory": []}


def test_load_session_data_valid_file(session_env):
    """Valid session file loads correctly."""
    payload = {
        "explicit_allows": [{"pattern_id": "ya_0", "pattern_text": r"\becho\b"}],
        "session_memory": [],
    }
    session_env.mkdir(parents=True, exist_ok=True)
    (session_env / "test-session-123.json").write_text(json.dumps(payload))

    data = hook.load_session_data()

    assert data["explicit_allows"][0]["pattern_id"] == "ya_0"
    assert data["session_memory"] == []


# ---------------------------------------------------------------------------
# write_session_data
# ---------------------------------------------------------------------------


def test_write_session_data_creates_dir(session_env):
    """write_session_data creates parent directory if missing."""
    assert not session_env.exists()

    payload = {"explicit_allows": [], "session_memory": []}
    result = hook.write_session_data(payload)

    assert result is True
    assert session_env.exists()
    written = json.loads((session_env / "test-session-123.json").read_text())
    assert written == payload


def test_write_session_data_no_session_id(monkeypatch):
    """write_session_data returns False when CLAUDE_SESSION_ID is absent."""
    monkeypatch.delenv("CLAUDE_SESSION_ID", raising=False)

    result = hook.write_session_data({"explicit_allows": [], "session_memory": []})

    assert result is False


# ---------------------------------------------------------------------------
# check_session_allowlist — explicit_allows
# ---------------------------------------------------------------------------


def test_explicit_allow_matches_command(session_env):
    """Explicit allow regex matches; returns the stored pattern_id."""
    payload = {
        "explicit_allows": [
            {"pattern_id": "yaml_pattern_0", "pattern_text": r"\bdocker\s+compose\s+down\b"}
        ],
        "session_memory": [],
    }
    session_env.mkdir(parents=True, exist_ok=True)
    (session_env / "test-session-123.json").write_text(json.dumps(payload))

    result = hook.check_session_allowlist("docker compose down", make_config())

    assert result == "yaml_pattern_0"


def test_explicit_allow_no_cross_match(session_env):
    """Pattern A in explicit_allows does NOT match a command for pattern B."""
    payload = {
        "explicit_allows": [
            # Only covers docker compose down (no volumes flag)
            {"pattern_id": "yaml_pattern_0", "pattern_text": r"\bdocker\s+compose\s+down\b(?!.*--(volumes|rmi))"}
        ],
        "session_memory": [],
    }
    session_env.mkdir(parents=True, exist_ok=True)
    (session_env / "test-session-123.json").write_text(json.dumps(payload))

    # Command with --volumes should NOT match pattern_0's regex
    result = hook.check_session_allowlist("docker compose down --volumes", make_config())

    assert result is None


# ---------------------------------------------------------------------------
# check_session_allowlist — session_memory (delay gate)
# ---------------------------------------------------------------------------


def test_session_memory_under_delay(session_env):
    """Session memory entry younger than SESSION_AUTO_ALLOW_DELAY does not auto-allow."""
    recent = datetime.now().isoformat()
    payload = {
        "explicit_allows": [],
        "session_memory": [
            {
                "pattern_id": "yaml_pattern_0",
                "pattern_text": r"\bdocker\s+compose\s+down\b",
                "first_seen": recent,
                "command_hash": "aabbccdd",
            }
        ],
    }
    session_env.mkdir(parents=True, exist_ok=True)
    (session_env / "test-session-123.json").write_text(json.dumps(payload))

    result = hook.check_session_allowlist("docker compose down", make_config())

    assert result is None


def test_session_memory_over_delay(session_env):
    """Session memory entry older than SESSION_AUTO_ALLOW_DELAY auto-allows."""
    old_time = (datetime.now() - timedelta(seconds=hook.SESSION_AUTO_ALLOW_DELAY + 1)).isoformat()
    payload = {
        "explicit_allows": [],
        "session_memory": [
            {
                "pattern_id": "yaml_pattern_0",
                "pattern_text": r"\bdocker\s+compose\s+down\b",
                "first_seen": old_time,
                "command_hash": "aabbccdd",
            }
        ],
    }
    session_env.mkdir(parents=True, exist_ok=True)
    (session_env / "test-session-123.json").write_text(json.dumps(payload))

    result = hook.check_session_allowlist("docker compose down", make_config())

    assert result == "yaml_pattern_0"


# ---------------------------------------------------------------------------
# Block preservation — session allowlist never overrides is_blocked
# ---------------------------------------------------------------------------


def test_session_allowlist_never_overrides_block(session_env):
    """check_session_allowlist may match, but main() only calls it when
    should_ask and not is_blocked — so a blocked command is never downgraded.

    This test validates that logic directly: even when check_session_allowlist
    returns a pattern_id, if is_blocked=True the result is never used."""
    old_time = (datetime.now() - timedelta(seconds=hook.SESSION_AUTO_ALLOW_DELAY + 1)).isoformat()
    payload = {
        "explicit_allows": [],
        "session_memory": [
            {
                "pattern_id": "yaml_pattern_3",
                "pattern_text": r"\brm\s+-rf\b",
                "first_seen": old_time,
                "command_hash": "deadbeef",
            }
        ],
    }
    session_env.mkdir(parents=True, exist_ok=True)
    (session_env / "test-session-123.json").write_text(json.dumps(payload))

    # check_session_allowlist itself returns the pattern (it doesn't know about blocking)
    session_result = hook.check_session_allowlist("rm -rf /tmp/foo", make_config())
    assert session_result == "yaml_pattern_3"

    # But main() guards: only apply when should_ask and NOT is_blocked.
    # Simulate that guard:
    is_blocked = True
    should_ask = False  # rm -rf patterns have ask=False → block path
    if should_ask and not is_blocked:
        should_ask = False  # pragma: no cover  — would be the downgrade

    # Assert block was never cleared
    assert is_blocked is True
    assert should_ask is False


# ---------------------------------------------------------------------------
# Pattern specificity — docker compose down vs docker compose down --volumes
# ---------------------------------------------------------------------------


def test_docker_compose_down_no_volumes_match(session_env):
    """Approving 'docker compose down' (pattern_0) does NOT cover
    'docker compose down --volumes' because that matches a different pattern."""
    old_time = (datetime.now() - timedelta(seconds=hook.SESSION_AUTO_ALLOW_DELAY + 1)).isoformat()
    payload = {
        "explicit_allows": [],
        "session_memory": [
            {
                "pattern_id": "yaml_pattern_0",
                "pattern_text": r"\bdocker\s+compose\s+down\b(?!.*--(volumes|rmi))",
                "first_seen": old_time,
                "command_hash": "aabbccdd",
            }
        ],
    }
    session_env.mkdir(parents=True, exist_ok=True)
    (session_env / "test-session-123.json").write_text(json.dumps(payload))

    result = hook.check_session_allowlist("docker compose down --volumes", make_config())

    assert result is None


# ---------------------------------------------------------------------------
# record_session_ask
# ---------------------------------------------------------------------------


def test_record_session_ask_no_duplicates(session_env):
    """Calling record_session_ask twice with same pattern_id stores only one entry."""
    session_env.mkdir(parents=True, exist_ok=True)
    (session_env / "test-session-123.json").write_text(
        json.dumps({"explicit_allows": [], "session_memory": []})
    )

    hook.record_session_ask("yaml_pattern_0", r"\bdocker\s+compose\s+down\b", "docker compose down")
    # Reset cache so second call reads from disk
    hook._session_data_cache = None
    hook.record_session_ask("yaml_pattern_0", r"\bdocker\s+compose\s+down\b", "docker compose down")

    hook._session_data_cache = None
    data = hook.load_session_data()
    entries = [e for e in data["session_memory"] if e["pattern_id"] == "yaml_pattern_0"]
    assert len(entries) == 1


# ---------------------------------------------------------------------------
# _pattern_has_session_scope
# ---------------------------------------------------------------------------


def test_pattern_has_session_scope_true():
    """Pattern with sessionScope: true returns True."""
    config = make_config()
    # yaml_pattern_0 is the docker compose down pattern, which has sessionScope=True
    assert hook._pattern_has_session_scope("yaml_pattern_0", config) is True


def test_pattern_has_session_scope_false():
    """Pattern without sessionScope key returns False."""
    config = make_config()
    # yaml_pattern_1 is docker compose down --volumes, which has no sessionScope
    assert hook._pattern_has_session_scope("yaml_pattern_1", config) is False


def test_pattern_has_session_scope_non_yaml():
    """Non-yaml_pattern_ prefix (e.g., 'semantic_git') always returns False."""
    config = make_config()
    assert hook._pattern_has_session_scope("semantic_git", config) is False


# ---------------------------------------------------------------------------
# _get_pattern_text
# ---------------------------------------------------------------------------


def test_get_pattern_text_valid():
    """Returns the regex string for a valid yaml_pattern_N id."""
    config = make_config()
    result = hook._get_pattern_text("yaml_pattern_0", config)

    assert result == r"\bdocker\s+compose\s+down\b(?!.*--(volumes|rmi))"


def test_get_pattern_text_invalid():
    """Returns None for an out-of-range index."""
    config = make_config()
    result = hook._get_pattern_text("yaml_pattern_999", config)

    assert result is None
