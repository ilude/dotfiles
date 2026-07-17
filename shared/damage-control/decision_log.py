"""Fail-open writer for the shared damage-control decision log."""

from __future__ import annotations

import gzip
import json
import os
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA_VERSION = 1
COMPRESS_AFTER_DAYS = 30
MAX_SUMMARY_LENGTH = 500
CLIENTS = {"pi", "claude"}
ENGINE_ACTIONS = {"allow", "ask", "block"}
USER_DECISIONS = {
    "approved",
    "denied",
    "denied_or_abandoned",
    "not_applicable",
    "not_present",
}
LATENCY_KINDS = {"exact", "estimated", "not_available"}
SECRET_PATTERNS = [
    re.compile(
        r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----",
        re.DOTALL,
    ),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"\b(?:ghp|github_pat|sk|xox[baprs])-?[A-Za-z0-9_-]{20,}\b"),
    re.compile(
        r"\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+",
        re.IGNORECASE,
    ),
    re.compile(
        r"\bauthorization\s*:\s*(?:bearer|basic)\s+[^\s,;]+",
        re.IGNORECASE,
    ),
]


def decision_log_dir() -> Path:
    override = os.environ.get("DAMAGE_CONTROL_DECISION_DIR")
    if override:
        return Path(override).expanduser()
    return Path.home() / ".local" / "share" / "damage-control"


def decision_log_path(now: datetime | None = None) -> Path:
    current = now or datetime.now(timezone.utc)
    return decision_log_dir() / f"decisions-{current:%Y-%m}.jsonl"


def sanitize_summary(value: str) -> str:
    sanitized = value
    for pattern in SECRET_PATTERNS:
        sanitized = pattern.sub("[REDACTED]", sanitized)
    return sanitized.replace("\x00", "")[:MAX_SUMMARY_LENGTH]


def _bounded(value: object, limit: int) -> str | None:
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    if not stripped:
        return None
    return stripped[:limit]


def build_decision(values: dict[str, Any], now: datetime | None = None) -> dict[str, Any]:
    current = now or datetime.now(timezone.utc)
    client = values.get("client")
    engine_action = values.get("engineAction")
    user_decision = values.get("userDecision")
    latency_kind = values.get("latencyKind")
    latency_ms = values.get("latencyMs")
    session_id = _bounded(values.get("sessionId"), 120)
    tool = _bounded(values.get("tool"), 80)
    rule_id = _bounded(values.get("ruleId"), 240)
    if client not in CLIENTS:
        raise ValueError("client must be pi or claude")
    if engine_action not in ENGINE_ACTIONS:
        raise ValueError("invalid engineAction")
    if user_decision not in USER_DECISIONS:
        raise ValueError("invalid userDecision")
    if latency_kind not in LATENCY_KINDS:
        raise ValueError("invalid latencyKind")
    if not isinstance(latency_ms, (int, float)) or latency_ms < 0:
        raise ValueError("latencyMs must be nonnegative")
    if not session_id or not tool or not rule_id:
        raise ValueError("sessionId, tool, and ruleId are required")
    decision: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "timestamp": current.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        "client": client,
        "sessionId": session_id,
        "tool": tool,
        "ruleId": rule_id,
        "actionSummary": sanitize_summary(str(values.get("actionSummary", ""))),
        "engineAction": engine_action,
        "userDecision": user_decision,
        "latencyMs": float(latency_ms),
        "latencyKind": latency_kind,
    }
    tool_use_id = _bounded(values.get("toolUseId"), 120)
    matched_pattern = _bounded(values.get("matchedPattern"), 240)
    if tool_use_id:
        decision["toolUseId"] = tool_use_id
    if matched_pattern:
        decision["matchedPattern"] = matched_pattern
    return decision


def record_decision(values: dict[str, Any], now: datetime | None = None) -> bool:
    """Append one decision and return false on validation or I/O failure."""
    try:
        decision = build_decision(values, now)
        target = decision_log_path(now)
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("a", encoding="utf-8", newline="\n") as stream:
            stream.write(json.dumps(decision, separators=(",", ":")) + "\n")
        return True
    except (OSError, TypeError, ValueError):
        return False


def compress_old_logs(now: datetime | None = None) -> list[Path]:
    """Compress old monthly JSONL files and never delete their compressed form."""
    current = now or datetime.now(timezone.utc)
    cutoff = current.timestamp() - COMPRESS_AFTER_DAYS * 24 * 60 * 60
    compressed: list[Path] = []
    try:
        root = decision_log_dir()
        if not root.is_dir():
            return []
        for source in sorted(root.glob("decisions-????-??.jsonl")):
            if source.stat().st_mtime >= cutoff:
                continue
            target = source.with_suffix(source.suffix + ".gz")
            if target.exists():
                continue
            temporary = target.with_suffix(target.suffix + f".{os.getpid()}.tmp")
            with source.open("rb") as input_stream, gzip.open(temporary, "wb") as output_stream:
                shutil.copyfileobj(input_stream, output_stream)
            temporary.replace(target)
            source.unlink()
            compressed.append(target)
    except OSError:
        return compressed
    return compressed
