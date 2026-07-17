#!/usr/bin/env python
"""Maintain Claude Code's shared worktree occupancy lease."""

from __future__ import annotations

import importlib.util
import json
import os
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

CLIENT = "claude"


def load_helper() -> ModuleType:
    helper_path = Path(__file__).resolve().parents[2] / "scripts" / "agent_instance_lease.py"
    spec = importlib.util.spec_from_file_location("agent_instance_lease", helper_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load lease helper: {helper_path}")
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    return helper


def parent_pid() -> int:
    value = os.environ.get("CLAUDE_AGENT_PARENT_PID")
    return int(value) if value else os.getppid()


def warning(other_count: int) -> str:
    noun = "session occupies" if other_count == 1 else "sessions occupy"
    return (
        f"{other_count} other active agent {noun} this Git worktree. "
        "Further modifying work should move to a separate Git worktree."
    )


def other_leases(records: list[dict[str, Any]], session_id: str) -> list[dict[str, Any]]:
    return [
        record
        for record in records
        if record.get("client") != CLIENT or record.get("sessionId") != session_id
    ]


def register(payload: dict[str, Any]) -> dict[str, Any]:
    helper = load_helper()
    session_id = str(payload["session_id"])
    worktree = helper.discover_worktree(Path(payload["cwd"]))
    return helper.register_lease(worktree, CLIENT, session_id, parent_pid())


def release(payload: dict[str, Any]) -> bool:
    helper = load_helper()
    session_id = str(payload["session_id"])
    worktree = helper.discover_worktree(Path(payload["cwd"]))
    path = helper.lease_path(worktree, CLIENT, session_id)
    if not path.exists():
        return False
    record = helper.read_record(path)
    return helper.release_lease(worktree, CLIENT, session_id, record["pid"])


def status_occupancy(payload: dict[str, Any]) -> tuple[str, str | None]:
    helper = load_helper()
    session_id = str(payload.get("session_id", ""))
    cwd = payload.get("workspace", {}).get("current_dir") or payload.get("cwd")
    if not session_id or not cwd:
        return "", None
    worktree = helper.discover_worktree(Path(cwd))
    path = helper.lease_path(worktree, CLIENT, session_id)
    if path.exists():
        record = helper.read_record(path)
        result = helper.register_lease(worktree, CLIENT, session_id, record["pid"])
    else:
        result = helper.scan_leases(worktree)
    others = other_leases(result["active"], session_id)
    total = len(others) + (1 if path.exists() else 0)
    label = f"instances {total}{' !' if others else ''}" if total else ""
    return label, warning(len(others)) if others else None


def hook_output(payload: dict[str, Any]) -> dict[str, Any]:
    event_name = payload.get("hook_event_name")
    if event_name in {"SessionStart", "UserPromptSubmit"}:
        result = register(payload)
        others = other_leases(result["active"], str(payload["session_id"]))
        if not others:
            return {}
        return {
            "hookSpecificOutput": {
                "hookEventName": event_name,
                "additionalContext": warning(len(others)),
            }
        }
    if event_name == "SessionEnd":
        release(payload)
    return {}


def main() -> int:
    payload = json.load(sys.stdin)
    try:
        output = hook_output(payload)
    except (OSError, RuntimeError, ValueError, KeyError, json.JSONDecodeError) as error:
        print(f"agent instance lease: {error}", file=sys.stderr)
        output = {}
    print(json.dumps(output, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
