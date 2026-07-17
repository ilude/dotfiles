"""Shared decision logging and Claude hook correlation."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from types import ModuleType
from typing import Any


def _load_writer() -> ModuleType | None:
    candidates = [
        Path(__file__).resolve().parents[3] / "shared" / "damage-control" / "decision_log.py",
        Path.home() / ".dotfiles" / "shared" / "damage-control" / "decision_log.py",
    ]
    for path in candidates:
        if not path.is_file():
            continue
        try:
            spec = importlib.util.spec_from_file_location("shared_damage_control_log", path)
            if spec is None or spec.loader is None:
                continue
            module = importlib.util.module_from_spec(spec)
            sys.modules[spec.name] = module
            spec.loader.exec_module(module)
            return module
        except (ImportError, OSError, RuntimeError, SyntaxError):
            continue
    return None


_WRITER = _load_writer()


def _pending_dir() -> Path | None:
    if _WRITER is None:
        return None
    return _WRITER.decision_log_dir() / ".pending-claude"


def _correlation_name(session_id: str, tool_use_id: str) -> str:
    digest = hashlib.sha256(f"{session_id}\0{tool_use_id}".encode()).hexdigest()
    return f"{digest}.json"


def _pending_path(session_id: str, tool_use_id: str) -> Path | None:
    root = _pending_dir()
    return root / _correlation_name(session_id, tool_use_id) if root else None


def _identity(payload: dict[str, Any]) -> tuple[str, str, str]:
    return (
        str(payload.get("session_id") or "claude-unknown"),
        str(payload.get("tool_use_id") or "tool-unknown"),
        str(payload.get("tool_name") or "unknown"),
    )


def _record(values: dict[str, Any]) -> bool:
    if _WRITER is None:
        return False
    return bool(_WRITER.record_decision(values))


def record_pretool_decision(
    payload: dict[str, Any],
    *,
    engine_action: str,
    action_summary: str,
    rule_id: str = "none",
    matched_pattern: str | None = None,
    started_at: float | None = None,
) -> bool:
    """Record a final allow/block or stage an ask for post-tool correlation."""
    try:
        session_id, tool_use_id, tool = _identity(payload)
        elapsed_ms = max(0.0, (time.perf_counter() - (started_at or time.perf_counter())) * 1000)
        base = {
            "client": "claude",
            "sessionId": session_id,
            "toolUseId": tool_use_id,
            "tool": tool,
            "ruleId": rule_id or "none",
            "matchedPattern": matched_pattern,
            "actionSummary": action_summary,
            "engineAction": engine_action,
            "latencyMs": elapsed_ms,
            "latencyKind": "exact",
        }
        if engine_action == "allow":
            return _record({**base, "userDecision": "not_applicable"})
        if engine_action == "block":
            return _record({**base, "userDecision": "not_present"})
        if engine_action != "ask" or _WRITER is None:
            return False
        target = _pending_path(session_id, tool_use_id)
        if target is None:
            return False
        target.parent.mkdir(parents=True, exist_ok=True)
        pending = {
            **base,
            "actionSummary": _WRITER.sanitize_summary(action_summary),
            "askedAt": time.time(),
        }
        temporary = target.with_suffix(target.suffix + f".{os.getpid()}.tmp")
        temporary.write_text(json.dumps(pending, separators=(",", ":")), encoding="utf-8")
        temporary.replace(target)
        return True
    except (OSError, TypeError, ValueError):
        return False


def _settle(payload: dict[str, Any], user_decision: str) -> bool:
    try:
        session_id, tool_use_id, _tool = _identity(payload)
        target = _pending_path(session_id, tool_use_id)
        if target is None or not target.is_file():
            return False
        pending = json.loads(target.read_text(encoding="utf-8"))
        elapsed_ms = max(0.0, (time.time() - float(pending.pop("askedAt"))) * 1000)
        duration_ms = payload.get("duration_ms")
        latency_kind = "estimated"
        if isinstance(duration_ms, (int, float)) and duration_ms >= 0:
            elapsed_ms = max(0.0, elapsed_ms - float(duration_ms))
            latency_kind = "exact"
        pending["userDecision"] = user_decision
        pending["latencyMs"] = elapsed_ms
        pending["latencyKind"] = latency_kind
        written = _record(pending)
        if written:
            target.unlink(missing_ok=True)
        return written
    except (OSError, TypeError, ValueError, json.JSONDecodeError):
        return False


def settle_posttool(payload: dict[str, Any]) -> bool:
    """A post-tool event proves that the user approved the staged ask."""
    return _settle(payload, "approved")


def settle_session(payload: dict[str, Any]) -> int:
    """Settle unmatched asks conservatively when their Claude session ends."""
    session_id = str(payload.get("session_id") or "claude-unknown")
    root = _pending_dir()
    if root is None or not root.is_dir():
        return 0
    settled = 0
    try:
        for target in sorted(root.glob("*.json")):
            try:
                pending = json.loads(target.read_text(encoding="utf-8"))
                if pending.get("sessionId") != session_id:
                    continue
                pending["userDecision"] = "denied_or_abandoned"
                pending["latencyMs"] = max(
                    0.0, (time.time() - float(pending.pop("askedAt"))) * 1000
                )
                pending["latencyKind"] = "estimated"
                if _record(pending):
                    target.unlink(missing_ok=True)
                    settled += 1
            except (OSError, TypeError, ValueError, json.JSONDecodeError):
                continue
    except OSError:
        return settled
    return settled


def hook_main() -> None:
    """Handle PostToolUse, PostToolUseFailure, or SessionEnd input fail-open."""
    try:
        payload = json.load(sys.stdin)
        event = payload.get("hook_event_name")
        if event in {"PostToolUse", "PostToolUseFailure"}:
            settle_posttool(payload)
        elif event == "SessionEnd":
            settle_session(payload)
        if _WRITER is not None:
            _WRITER.compress_old_logs(datetime.now(timezone.utc))
    except (OSError, TypeError, ValueError, json.JSONDecodeError):
        pass


if __name__ == "__main__":
    hook_main()
