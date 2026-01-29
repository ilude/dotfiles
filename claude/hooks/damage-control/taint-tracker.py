# /// script
# requires-python = ">=3.8"
# dependencies = ["pyyaml"]
# ///
"""
Taint Tracking Module for Damage Control
=========================================

Tracks sensitive file reads and checks for potential exfiltration when
network commands are executed. Implements a session-based taint tracking
system that persists across tool invocations.

Usage:
  - mark_tainted(file_path, content_hash) - Mark a file as tainted
  - check_exfiltration(command) - Check if command could exfiltrate tainted data
  - clear_session() - Clear all taint tracking data
  - get_tainted_files() - Get list of currently tainted files

The taint tracker is used by:
  - PostToolUse:Read - to mark sensitive files when read
  - PreToolUse:Bash - to check for exfiltration before network commands
"""

import hashlib
import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import yaml

# ============================================================================
# CONFIGURATION
# ============================================================================

DEFAULT_STATE_DIR = Path(os.path.expanduser("~")) / ".claude" / "state"
DEFAULT_STATE_FILE = DEFAULT_STATE_DIR / "taint-session.json"
DEFAULT_MAX_ENTRIES = 100
DEFAULT_EXPIRY_SECONDS = 3600  # 1 hour


def get_config_path() -> Path:
    """Get path to taint-config.yaml."""
    script_dir = Path(__file__).parent
    return script_dir / "taint-config.yaml"


def load_config() -> Dict[str, Any]:
    """Load taint tracking configuration."""
    config_path = get_config_path()

    if not config_path.exists():
        return {
            "sensitivePaths": [],
            "networkCommands": [],
            "session": {
                "state_file": "state/taint-session.json",
                "max_entries": DEFAULT_MAX_ENTRIES,
                "taint_expiry_seconds": DEFAULT_EXPIRY_SECONDS,
            },
        }

    with open(config_path, "r") as f:
        return yaml.safe_load(f) or {}


def get_state_path(config: Dict[str, Any]) -> Path:
    """Get path to session state file."""
    session_config = config.get("session", {})
    state_file = session_config.get("state_file", "state/taint-session.json")

    # Resolve relative to ~/.claude/
    claude_dir = Path(os.path.expanduser("~")) / ".claude"
    return claude_dir / state_file


# ============================================================================
# STATE MANAGEMENT
# ============================================================================


def load_state(config: Dict[str, Any]) -> Dict[str, Any]:
    """Load session state from file."""
    state_path = get_state_path(config)

    if not state_path.exists():
        return {"tainted_files": {}, "last_cleanup": time.time()}

    try:
        with open(state_path, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return {"tainted_files": {}, "last_cleanup": time.time()}


def save_state(config: Dict[str, Any], state: Dict[str, Any]) -> None:
    """Save session state to file."""
    state_path = get_state_path(config)

    # Ensure directory exists
    state_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        with open(state_path, "w") as f:
            json.dump(state, f, indent=2)
    except IOError as e:
        print(f"Warning: Failed to save taint state: {e}", file=sys.stderr)


def cleanup_expired(config: Dict[str, Any], state: Dict[str, Any]) -> Dict[str, Any]:
    """Remove expired taint entries."""
    session_config = config.get("session", {})
    expiry_seconds = session_config.get("taint_expiry_seconds", DEFAULT_EXPIRY_SECONDS)
    max_entries = session_config.get("max_entries", DEFAULT_MAX_ENTRIES)

    current_time = time.time()
    tainted = state.get("tainted_files", {})

    # Remove expired entries
    tainted = {
        path: info
        for path, info in tainted.items()
        if current_time - info.get("timestamp", 0) < expiry_seconds
    }

    # Trim to max entries (remove oldest)
    if len(tainted) > max_entries:
        sorted_entries = sorted(tainted.items(), key=lambda x: x[1].get("timestamp", 0))
        tainted = dict(sorted_entries[-max_entries:])

    state["tainted_files"] = tainted
    state["last_cleanup"] = current_time

    return state


# ============================================================================
# PATTERN MATCHING
# ============================================================================


def is_sensitive_path(file_path: str, config: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Check if file path matches sensitive patterns.

    Returns pattern info if match found, None otherwise.
    """
    sensitive_patterns = config.get("sensitivePaths", [])

    for pattern_info in sensitive_patterns:
        pattern = pattern_info.get("pattern", "")
        if not pattern:
            continue

        try:
            if re.search(pattern, file_path, re.IGNORECASE):
                return pattern_info
        except re.error:
            continue

    return None


def is_network_command(command: str, config: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Check if command matches network command patterns.

    Returns pattern info if match found, None otherwise.
    """
    network_patterns = config.get("networkCommands", [])

    for pattern_info in network_patterns:
        pattern = pattern_info.get("pattern", "")
        if not pattern:
            continue

        try:
            if re.search(pattern, command, re.IGNORECASE):
                return pattern_info
        except re.error:
            continue

    return None


# ============================================================================
# TAINT OPERATIONS
# ============================================================================


def compute_content_hash(content: str) -> str:
    """Compute SHA-256 hash of content for tracking."""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()[:16]


def mark_tainted(file_path: str, content: str = "", config: Optional[Dict[str, Any]] = None) -> bool:
    """Mark a file as tainted after it has been read.

    Args:
        file_path: Path to the file that was read
        content: File content (used for hash tracking)
        config: Optional config dict (loaded if not provided)

    Returns:
        True if file was marked as tainted (sensitive), False otherwise
    """
    if config is None:
        config = load_config()

    # Check if this is a sensitive file
    pattern_match = is_sensitive_path(file_path, config)
    if not pattern_match:
        return False

    # Load current state
    state = load_state(config)
    state = cleanup_expired(config, state)

    # Add taint entry
    tainted = state.get("tainted_files", {})
    tainted[file_path] = {
        "timestamp": time.time(),
        "content_hash": compute_content_hash(content) if content else "",
        "type": pattern_match.get("type", "unknown"),
        "sensitivity": pattern_match.get("sensitivity", "high"),
    }

    state["tainted_files"] = tainted
    save_state(config, state)

    return True


def check_exfiltration(command: str, config: Optional[Dict[str, Any]] = None) -> Tuple[bool, str]:
    """Check if command could exfiltrate tainted data.

    Args:
        command: Bash command to check
        config: Optional config dict (loaded if not provided)

    Returns:
        Tuple of (is_dangerous, reason)
        - is_dangerous: True if command could exfiltrate tainted data
        - reason: Human-readable explanation
    """
    if config is None:
        config = load_config()

    # Check if this is a network command
    network_match = is_network_command(command, config)
    if not network_match:
        return False, ""

    # Load current state
    state = load_state(config)
    state = cleanup_expired(config, state)

    tainted = state.get("tainted_files", {})
    if not tainted:
        return False, ""

    # We have tainted files and a network command - potential exfiltration
    critical_files = [
        path
        for path, info in tainted.items()
        if info.get("sensitivity") == "critical"
    ]

    if critical_files:
        files_str = ", ".join(critical_files[:3])
        if len(critical_files) > 3:
            files_str += f" (+{len(critical_files) - 3} more)"

        return True, (
            f"Network command ({network_match.get('type', 'unknown')}) detected after "
            f"reading sensitive files: {files_str}. "
            "This could be a data exfiltration attempt."
        )

    # Non-critical tainted files - warn but don't block
    return False, ""


def get_tainted_files(config: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """Get list of currently tainted files.

    Returns:
        List of taint entries with file_path and metadata
    """
    if config is None:
        config = load_config()

    state = load_state(config)
    state = cleanup_expired(config, state)

    tainted = state.get("tainted_files", {})

    return [
        {"file_path": path, **info}
        for path, info in tainted.items()
    ]


def clear_session(config: Optional[Dict[str, Any]] = None) -> None:
    """Clear all taint tracking data."""
    if config is None:
        config = load_config()

    state = {"tainted_files": {}, "last_cleanup": time.time()}
    save_state(config, state)


# ============================================================================
# CLI INTERFACE (for testing)
# ============================================================================


def main() -> None:
    """CLI interface for taint tracker testing."""
    import argparse

    parser = argparse.ArgumentParser(description="Taint Tracker CLI")
    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # mark command
    mark_parser = subparsers.add_parser("mark", help="Mark a file as tainted")
    mark_parser.add_argument("file_path", help="Path to file")

    # check command
    check_parser = subparsers.add_parser("check", help="Check if command could exfiltrate")
    check_parser.add_argument("bash_command", help="Bash command to check")

    # list command
    subparsers.add_parser("list", help="List tainted files")

    # clear command
    subparsers.add_parser("clear", help="Clear taint session")

    args = parser.parse_args()

    if args.command == "mark":
        result = mark_tainted(args.file_path)
        print(f"Tainted: {result}")

    elif args.command == "check":
        is_dangerous, reason = check_exfiltration(args.bash_command)
        print(f"Dangerous: {is_dangerous}")
        if reason:
            print(f"Reason: {reason}")

    elif args.command == "list":
        tainted = get_tainted_files()
        if tainted:
            for entry in tainted:
                print(f"  {entry['file_path']} ({entry.get('type', 'unknown')})")
        else:
            print("No tainted files")

    elif args.command == "clear":
        clear_session()
        print("Session cleared")

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
