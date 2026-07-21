# /// script
# requires-python = ">=3.8"
# dependencies = ["pyyaml"]
# ///
"""
Claude Code Edit Tool Damage Control
=====================================

Blocks edits to protected files via PreToolUse hook on Edit tool.
Loads zeroAccessPaths and readOnlyPaths from patterns.yaml.

Exit codes:
  0 = Allow edit
  2 = Block edit (stderr fed back to Claude)
"""

import fnmatch
import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import yaml

# ============================================================================
# AUDIT LOGGING
# ============================================================================


def get_log_path() -> Path:
    """Get path to daily audit log file.

    Creates ~/.claude/logs/damage-control/ directory if it doesn't exist.
    Returns path in format: ~/.claude/logs/damage-control/YYYY-MM-DD.log

    All entries for a given day are appended to the same file (JSONL format).
    """
    logs_dir = Path(os.path.expanduser("~")) / ".claude" / "logs" / "damage-control"
    logs_dir.mkdir(parents=True, exist_ok=True)

    date_str = datetime.now().strftime("%Y-%m-%d")
    filename = f"{date_str}.log"

    return logs_dir / filename


def log_decision(
    tool_name: str,
    file_path: str,
    decision: str,
    reason: str = "",
    context: Optional[str] = None,
) -> None:
    """Log security decision to audit log in JSONL format.

    Args:
        tool_name: Name of the tool (e.g., "Edit", "Write").
        file_path: Path to the file being accessed.
        decision: Security decision ("blocked" or "allowed").
        reason: Human-readable reason for blocking (if applicable).
        context: Context name if applicable (e.g., "documentation").
    """
    try:
        log_path = get_log_path()

        # Truncate file_path to 200 chars for display
        file_path_truncated = file_path[:200]
        if len(file_path) > 200:
            file_path_truncated += "..."

        # Get context information
        user = os.getenv("USER", "unknown")
        cwd = os.getcwd()

        # Build JSONL record
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "tool": tool_name,
            "file_path": file_path_truncated,
            "decision": decision,
            "reason": reason,
            "context": context,
            "user": user,
            "cwd": cwd,
        }

        # Write as JSONL (one JSON object per line)
        with open(log_path, "a") as f:
            f.write(json.dumps(log_entry) + "\n")

    except Exception as e:
        # Never crash the hook due to logging failure
        print(f"Warning: Failed to write audit log: {e}", file=sys.stderr)


def spawn_log_rotation() -> None:
    """Fire-and-forget log rotation. Non-blocking, cross-platform.

    Debounced: only spawns the rotation subprocess if >1 hour has elapsed
    since the last rotation attempt. This prevents spawning dozens of
    useless processes per hour (logs only rotate after 30 days).
    """
    rotate_script = Path(__file__).parent / "log_rotate.py"
    if not rotate_script.exists():
        return
    # Debounce: check timestamp file to avoid spawning on every hook call
    ts_file = Path(__file__).parent / ".last-rotation"
    try:
        if ts_file.exists():
            age = time.time() - ts_file.stat().st_mtime
            if age < 3600:  # 1 hour
                return
        ts_file.touch()
    except OSError:
        pass  # Continue even if timestamp check fails
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
        pass  # Don't crash hook if rotation fails to spawn


def is_glob_pattern(pattern: str) -> bool:
    """Check if pattern contains glob wildcards."""
    return "*" in pattern or "?" in pattern or "[" in pattern


def _match_glob_path(expanded_normalized: str, pattern: str, expanded_pattern: str) -> bool:
    """Glob match: check basename and full path (case-insensitive)."""
    basename_lower = os.path.basename(expanded_normalized).lower()
    expanded_pattern_lower = expanded_pattern.lower()
    return (
        fnmatch.fnmatch(basename_lower, expanded_pattern_lower)
        or fnmatch.fnmatch(basename_lower, pattern.lower())
        or fnmatch.fnmatch(expanded_normalized.lower(), expanded_pattern_lower)
    )


def _match_exact_path(expanded_normalized: str, expanded_pattern: str) -> bool:
    """Exact or directory-prefix match."""
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
    """Match file path against pattern, supporting both prefix and glob matching."""
    expanded_pattern = os.path.expanduser(pattern)
    expanded_normalized = os.path.expanduser(os.path.normpath(file_path))
    if is_glob_pattern(pattern):
        return _match_glob_path(expanded_normalized, pattern, expanded_pattern)
    # Normalize pattern path separators (Windows: forward slash -> backslash).
    # Preserve trailing-slash semantics by re-appending sep after normpath strips it.
    trailing_sep = expanded_pattern.endswith("/") or expanded_pattern.endswith(os.sep)
    expanded_pattern = os.path.normpath(expanded_pattern)
    if trailing_sep:
        expanded_pattern += os.sep
    return _match_exact_path(expanded_normalized, expanded_pattern)


def get_config_path() -> Path:
    """Get path to patterns.yaml, checking multiple locations."""
    # 1. Check project hooks directory (installed location)
    project_dir = os.environ.get("CLAUDE_PROJECT_DIR")
    if project_dir:
        project_config = (
            Path(project_dir) / ".claude" / "hooks" / "damage-control" / "patterns.yaml"
        )
        if project_config.exists():
            return project_config

    # 2. Check script's own directory (installed location)
    script_dir = Path(__file__).parent
    local_config = script_dir / "patterns.yaml"
    if local_config.exists():
        return local_config

    # 3. Check skill root directory (development location)
    skill_root = script_dir.parent.parent / "patterns.yaml"
    if skill_root.exists():
        return skill_root

    return local_config  # Default, even if it doesn't exist


def load_config() -> dict[str, Any]:
    """Load config from YAML."""
    config_path = get_config_path()

    if not config_path.exists():
        return {"zeroAccessPaths": [], "readOnlyPaths": []}

    with open(config_path, encoding="utf-8") as f:
        config = yaml.safe_load(f) or {}

    return config


def detect_context(
    tool_name: str, tool_input: dict[str, Any], config: dict[str, Any]
) -> Optional[str]:
    """Detect if we're in a special context that allows relaxed checks.

    For Edit/Write tools, this checks file extensions against documentation context.

    Args:
        tool_name: Name of the tool being invoked ("Edit", "Write").
        tool_input: Tool input parameters (file_path).
        config: Loaded configuration from patterns.yaml.

    Returns:
        Context name (e.g., 'documentation') or None if no context detected.
    """
    contexts_config = config.get("contexts", {})

    # Check for documentation context (file extension based)
    if tool_name in ("Edit", "Write"):
        doc_ctx = contexts_config.get("documentation", {})
        if doc_ctx.get("enabled", False):
            file_path = tool_input.get("file_path", "")
            extensions = doc_ctx.get("detection", {}).get("file_extensions", [])
            for ext in extensions:
                if file_path.endswith(ext):
                    return "documentation"

    return None


def _check_zero_access(file_path: str, config: dict[str, Any]) -> tuple[bool, str]:
    """Check if file_path matches a zero-access pattern (after exclusions)."""
    exclusions = config.get("zeroAccessExclusions", [])
    if any(match_path(file_path, excl) for excl in exclusions):
        return False, ""
    for zero_path in config.get("zeroAccessPaths", []):
        if match_path(file_path, zero_path):
            return True, f"zero-access path {zero_path} (no operations allowed)"
    return False, ""


def _path_matches_content_scan(file_path: str, config: dict[str, Any]) -> bool:
    """Check if file_path is in contentScanPaths (should have content scanned)."""
    for scan_path in config.get("contentScanPaths", []):
        if match_path(file_path, scan_path):
            return True
    return False


def _scan_content_for_injections(content: str, config: dict[str, Any]) -> Optional[str]:
    """Scan content for injection patterns. Returns reason string or None."""
    import re

    if not content:
        return None
    for pattern_info in config.get("injectionPatterns", []):
        pattern_str = pattern_info.get("pattern", "")
        if not pattern_str:
            continue
        try:
            if re.search(pattern_str, content, re.IGNORECASE | re.MULTILINE):
                ptype = pattern_info.get("type", "unknown")
                return f"Injection pattern detected ({ptype}) in content being written"
        except re.error:
            continue
    return None


def _check_content_injection(
    file_path: str,
    content: str,
    config: dict[str, Any],
    context: Optional[str],
) -> None:
    """If content matches an injection pattern in a scan path, emit ask and exit."""
    if not content or not _path_matches_content_scan(file_path, config):
        return
    reason = _scan_content_for_injections(content, config)
    if reason:
        log_decision("Edit", file_path, "ask", reason, context)
        spawn_log_rotation()
        print(json.dumps({"permissionDecision": "ask", "reason": reason}))
        sys.exit(0)


def _check_write_confirm(file_path: str, config: dict[str, Any]) -> Optional[str]:
    """Check if file_path matches a writeConfirmPaths pattern. Returns reason or None."""
    for confirm_path in config.get("writeConfirmPaths", []):
        if match_path(file_path, confirm_path):
            return f"Config file {confirm_path} \u2014 confirm write"
    return None


def check_path(
    file_path: str, config: dict[str, Any], context: Optional[str] = None
) -> tuple[bool, str]:
    """Check if file_path is blocked. Returns (blocked, reason).

    Args:
        file_path: Path to file being edited.
        config: Loaded configuration from patterns.yaml.
        context: Optional context name that may relax certain checks.
    """
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


def main() -> None:
    config = load_config()

    # Read hook input from stdin
    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON input: {e}", file=sys.stderr)
        sys.exit(1)

    tool_name = input_data.get("tool_name", "")
    tool_input = input_data.get("tool_input", {})

    # Only check Edit tool
    if tool_name != "Edit":
        sys.exit(0)

    file_path = tool_input.get("file_path", "")
    if not file_path:
        sys.exit(0)

    # Detect context (e.g., documentation)
    context = detect_context(tool_name, tool_input, config)

    # Config sentinel: soft-ask for sensitive config files
    confirm_reason = _check_write_confirm(file_path, config)
    if confirm_reason:
        log_decision("Edit", file_path, "ask", confirm_reason, context)
        spawn_log_rotation()
        print(json.dumps({"permissionDecision": "ask", "reason": confirm_reason}))
        sys.exit(0)

    # Content injection scanning for sensitive paths (T6)
    # Runs after writeConfirmPaths check (T5) to avoid double-prompting.
    _check_content_injection(file_path, tool_input.get("new_string", ""), config, context)

    # Check if file is blocked with context awareness
    blocked, reason = check_path(file_path, config, context=context)

    # Log decision
    if blocked:
        log_decision("Edit", file_path, "blocked", reason, context)
    else:
        log_decision("Edit", file_path, "allowed", "", context)

    # Spawn log rotation (fire-and-forget)
    spawn_log_rotation()

    if blocked:
        print(f"SECURITY: Blocked edit to {reason}: {file_path}", file=sys.stderr)
        sys.exit(2)

    sys.exit(0)


if __name__ == "__main__":
    main()
