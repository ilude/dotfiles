"""Shared protection core for Claude Code Edit and Write hooks."""

from __future__ import annotations

import fnmatch
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Optional

import yaml


def get_log_path() -> Path:
    """Get the path to the daily JSONL audit log."""
    logs_dir = Path(os.path.expanduser("~")) / ".claude" / "logs" / "damage-control"
    logs_dir.mkdir(parents=True, exist_ok=True)
    return logs_dir / f"{datetime.now().strftime('%Y-%m-%d')}.log"


def log_decision(
    tool_name: str,
    file_path: str,
    decision: str,
    reason: str = "",
    context: str | None = None,
) -> None:
    """Log a security decision to the audit log in JSONL format."""
    try:
        log_path = get_log_path()
        file_path_truncated = file_path[:200]
        if len(file_path) > 200:
            file_path_truncated += "..."

        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "tool": tool_name,
            "file_path": file_path_truncated,
            "decision": decision,
            "reason": reason,
            "context": context,
            "user": os.getenv("USER", "unknown"),
            "cwd": os.getcwd(),
        }

        with open(log_path, "a") as f:
            f.write(json.dumps(log_entry) + "\n")
    except Exception as e:
        print(f"Warning: Failed to write audit log: {e}", file=sys.stderr)


def spawn_log_rotation() -> None:
    """Start debounced log rotation without blocking the hook."""
    rotate_script = Path(__file__).parent / "log_rotate.py"
    if not rotate_script.exists():
        return

    ts_file = Path(__file__).parent / ".last-rotation"
    try:
        if ts_file.exists():
            age = time.time() - ts_file.stat().st_mtime
            if age < 3600:
                return
        ts_file.touch()
    except OSError:
        pass

    try:
        kwargs = {
            "stdout": subprocess.DEVNULL,
            "stderr": subprocess.DEVNULL,
        }
        if sys.platform == "win32":
            kwargs["creationflags"] = subprocess.DETACHED_PROCESS | subprocess.CREATE_NO_WINDOW
        else:
            kwargs["start_new_session"] = True
        subprocess.Popen([sys.executable, str(rotate_script)], **kwargs)
    except OSError:
        pass


def is_glob_pattern(pattern: str) -> bool:
    """Check whether a pattern contains glob wildcards."""
    return "*" in pattern or "?" in pattern or "[" in pattern


def _match_glob_path(expanded_normalized: str, pattern: str, expanded_pattern: str) -> bool:
    """Match a glob against a basename and full path without case sensitivity."""
    basename_lower = os.path.basename(expanded_normalized).lower()
    expanded_pattern_lower = expanded_pattern.lower()
    return (
        fnmatch.fnmatch(basename_lower, expanded_pattern_lower)
        or fnmatch.fnmatch(basename_lower, pattern.lower())
        or fnmatch.fnmatch(expanded_normalized.lower(), expanded_pattern_lower)
    )


def _match_exact_path(expanded_normalized: str, expanded_pattern: str) -> bool:
    """Match an exact path or directory prefix."""
    stripped = expanded_pattern.rstrip("/").rstrip(os.sep)
    if expanded_normalized in (expanded_pattern, stripped):
        return True
    has_trailing_sep = expanded_pattern.endswith("/") or expanded_pattern.endswith(os.sep)
    if has_trailing_sep and expanded_normalized.startswith(expanded_pattern):
        return True
    return expanded_normalized.startswith(expanded_pattern + "/") or expanded_normalized.startswith(
        expanded_pattern + os.sep
    )


def match_path(file_path: str, pattern: str) -> bool:
    """Match a file path against an exact, prefix, or glob pattern."""
    expanded_pattern = os.path.expanduser(pattern)
    expanded_normalized = os.path.expanduser(os.path.normpath(file_path))
    if is_glob_pattern(pattern):
        return _match_glob_path(expanded_normalized, pattern, expanded_pattern)

    trailing_sep = expanded_pattern.endswith("/") or expanded_pattern.endswith(os.sep)
    expanded_pattern = os.path.normpath(expanded_pattern)
    if trailing_sep:
        expanded_pattern += os.sep
    return _match_exact_path(expanded_normalized, expanded_pattern)


def get_config_path() -> Path:
    """Get patterns.yaml from the project or hook installation."""
    project_dir = os.environ.get("CLAUDE_PROJECT_DIR")
    if project_dir:
        project_config = (
            Path(project_dir) / ".claude" / "hooks" / "damage-control" / "patterns.yaml"
        )
        if project_config.exists():
            return project_config

    script_dir = Path(__file__).parent
    local_config = script_dir / "patterns.yaml"
    if local_config.exists():
        return local_config

    skill_root = script_dir.parent.parent / "patterns.yaml"
    if skill_root.exists():
        return skill_root

    return local_config


def load_config() -> dict[str, Any]:
    """Load the file-operation protection configuration."""
    config_path = get_config_path()
    if not config_path.exists():
        return {"zeroAccessPaths": [], "readOnlyPaths": []}

    with open(config_path, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def detect_context(
    tool_name: str, tool_input: dict[str, Any], config: dict[str, Any]
) -> str | None:
    """Detect a configured file-operation context."""
    contexts_config = config.get("contexts", {})
    if tool_name in ("Edit", "Write"):
        doc_ctx = contexts_config.get("documentation", {})
        if doc_ctx.get("enabled", False):
            file_path = tool_input.get("file_path", "")
            extensions = doc_ctx.get("detection", {}).get("file_extensions", [])
            for extension in extensions:
                if file_path.endswith(extension):
                    return "documentation"
    return None


def _check_zero_access(file_path: str, config: dict[str, Any]) -> tuple[bool, str]:
    """Check a path against zero-access rules after exclusions."""
    exclusions = config.get("zeroAccessExclusions", [])
    if any(match_path(file_path, exclusion) for exclusion in exclusions):
        return False, ""
    for zero_path in config.get("zeroAccessPaths", []):
        if match_path(file_path, zero_path):
            return True, f"zero-access path {zero_path} (no operations allowed)"
    return False, ""


def _path_matches_content_scan(file_path: str, config: dict[str, Any]) -> bool:
    """Check whether content written to a path must be scanned."""
    return any(match_path(file_path, path) for path in config.get("contentScanPaths", []))


def _scan_content_for_injections(content: str, config: dict[str, Any]) -> str | None:
    """Return the reason for a matching injection pattern, if any."""
    if not content:
        return None
    for pattern_info in config.get("injectionPatterns", []):
        pattern_str = pattern_info.get("pattern", "")
        if not pattern_str:
            continue
        try:
            if re.search(pattern_str, content, re.IGNORECASE | re.MULTILINE):
                pattern_type = pattern_info.get("type", "unknown")
                return f"Injection pattern detected ({pattern_type}) in content being written"
        except re.error:
            continue
    return None


def _check_write_confirm(file_path: str, config: dict[str, Any]) -> str | None:
    """Return a confirmation reason for a sensitive configuration path."""
    for confirm_path in config.get("writeConfirmPaths", []):
        if match_path(file_path, confirm_path):
            return f"Config file {confirm_path} \u2014 confirm write"
    return None


def check_path(
    file_path: str, config: dict[str, Any], context: str | None = None
) -> tuple[bool, str]:
    """Return whether a file path is blocked and the matching reason."""
    context_config = {}
    if context:
        context_config = config.get("contexts", {}).get(context, {})
    relaxed_checks = set(context_config.get("relaxed_checks", []))

    if "zeroAccessPaths" not in relaxed_checks:
        blocked, reason = _check_zero_access(file_path, config)
        if blocked:
            return True, reason

    if "readOnlyPaths" not in relaxed_checks:
        for readonly in config.get("readOnlyPaths", []):
            if match_path(file_path, readonly):
                return True, f"read-only path {readonly}"

    return False, ""


LogDecision = Callable[[str, str, str, str, Optional[str]], None]


def check_content_injection(
    tool_name: str,
    file_path: str,
    content: str,
    config: dict[str, Any],
    context: str | None,
    log_decision_fn: LogDecision = log_decision,
    spawn_log_rotation_fn: Callable[[], None] = spawn_log_rotation,
) -> None:
    """Emit the existing ask protocol when scanned content contains an injection."""
    if not content or not _path_matches_content_scan(file_path, config):
        return
    reason = _scan_content_for_injections(content, config)
    if reason:
        log_decision_fn(tool_name, file_path, "ask", reason, context)
        spawn_log_rotation_fn()
        print(json.dumps({"permissionDecision": "ask", "reason": reason}))
        sys.exit(0)


def run_file_operation_hook(
    tool_name: str,
    content_field: str,
    operation_name: str,
    load_config_fn: Callable[[], dict[str, Any]] = load_config,
    log_decision_fn: LogDecision = log_decision,
    spawn_log_rotation_fn: Callable[[], None] = spawn_log_rotation,
) -> None:
    """Run an Edit or Write PreToolUse hook with shared protection semantics."""
    config = load_config_fn()

    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON input: {e}", file=sys.stderr)
        sys.exit(1)

    input_tool_name = input_data.get("tool_name", "")
    tool_input = input_data.get("tool_input", {})
    if input_tool_name != tool_name:
        sys.exit(0)

    file_path = tool_input.get("file_path", "")
    if not file_path:
        sys.exit(0)

    context = detect_context(tool_name, tool_input, config)
    confirm_reason = _check_write_confirm(file_path, config)
    if confirm_reason:
        log_decision_fn(tool_name, file_path, "ask", confirm_reason, context)
        spawn_log_rotation_fn()
        print(json.dumps({"permissionDecision": "ask", "reason": confirm_reason}))
        sys.exit(0)

    check_content_injection(
        tool_name,
        file_path,
        tool_input.get(content_field, ""),
        config,
        context,
        log_decision_fn,
        spawn_log_rotation_fn,
    )

    blocked, reason = check_path(file_path, config, context=context)
    if blocked:
        log_decision_fn(tool_name, file_path, "blocked", reason, context)
    else:
        log_decision_fn(tool_name, file_path, "allowed", "", context)

    spawn_log_rotation_fn()
    if blocked:
        print(
            f"SECURITY: Blocked {operation_name} to {reason}: {file_path}",
            file=sys.stderr,
        )
        sys.exit(2)
    sys.exit(0)
