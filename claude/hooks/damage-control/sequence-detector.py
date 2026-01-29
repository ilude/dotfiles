# /// script
# requires-python = ">=3.8"
# dependencies = ["pyyaml"]
# ///
"""
Sequence Detection Module for Damage Control
=============================================

Detects multi-step attack patterns by tracking tool invocation history
and checking for dangerous sequences (e.g., read sensitive file -> network).

Usage:
  - record_tool_use(tool, input_data) - Record a tool invocation
  - check_sequences(tool, input_data) - Check if current tool completes a dangerous sequence
  - clear_history() - Clear tool history

The sequence detector is used by:
  - PreToolUse hooks - to check before tool execution
  - PostToolUse hooks - to record after tool execution
"""

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

DEFAULT_MAX_HISTORY = 50
DEFAULT_EXPIRY_SECONDS = 1800  # 30 minutes


def get_config_path() -> Path:
    """Get path to sequence-patterns.yaml."""
    script_dir = Path(__file__).parent
    return script_dir / "sequence-patterns.yaml"


def load_config() -> Dict[str, Any]:
    """Load sequence detection configuration."""
    config_path = get_config_path()

    if not config_path.exists():
        return {
            "dangerousSequences": [],
            "config": {
                "max_history": DEFAULT_MAX_HISTORY,
                "history_expiry_seconds": DEFAULT_EXPIRY_SECONDS,
                "state_file": "state/sequence-history.json",
            },
        }

    with open(config_path, "r") as f:
        return yaml.safe_load(f) or {}


def get_state_path(config: Dict[str, Any]) -> Path:
    """Get path to history state file."""
    cfg = config.get("config", {})
    state_file = cfg.get("state_file", "state/sequence-history.json")

    # Resolve relative to ~/.claude/
    claude_dir = Path(os.path.expanduser("~")) / ".claude"
    return claude_dir / state_file


# ============================================================================
# STATE MANAGEMENT
# ============================================================================


def load_history(config: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Load tool invocation history from state file."""
    state_path = get_state_path(config)

    if not state_path.exists():
        return []

    try:
        with open(state_path, "r") as f:
            data = json.load(f)
            return data.get("history", [])
    except (json.JSONDecodeError, IOError):
        return []


def save_history(config: Dict[str, Any], history: List[Dict[str, Any]]) -> None:
    """Save tool invocation history to state file."""
    state_path = get_state_path(config)

    # Ensure directory exists
    state_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        with open(state_path, "w") as f:
            json.dump({"history": history, "updated": time.time()}, f, indent=2)
    except IOError as e:
        print(f"Warning: Failed to save sequence history: {e}", file=sys.stderr)


def cleanup_history(config: Dict[str, Any], history: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Remove expired and excess history entries."""
    cfg = config.get("config", {})
    expiry_seconds = cfg.get("history_expiry_seconds", DEFAULT_EXPIRY_SECONDS)
    max_history = cfg.get("max_history", DEFAULT_MAX_HISTORY)

    current_time = time.time()

    # Remove expired entries
    history = [
        entry
        for entry in history
        if current_time - entry.get("timestamp", 0) < expiry_seconds
    ]

    # Trim to max entries (keep most recent)
    if len(history) > max_history:
        history = history[-max_history:]

    return history


# ============================================================================
# PATTERN MATCHING
# ============================================================================


def matches_step(
    entry: Dict[str, Any], step: Dict[str, Any]
) -> bool:
    """Check if a history entry matches a sequence step."""
    # Check tool type
    if entry.get("tool") != step.get("tool"):
        return False

    # Check pattern match
    pattern = step.get("pattern", "")
    if not pattern:
        return True  # No pattern means any invocation of that tool matches

    # Get the value to match against
    match_value = ""
    tool = entry.get("tool", "")

    if tool == "Read":
        match_value = entry.get("input", {}).get("file_path", "")
    elif tool == "Glob":
        match_value = entry.get("input", {}).get("pattern", "")
    elif tool == "Grep":
        match_value = entry.get("input", {}).get("pattern", "")
    elif tool == "Bash":
        match_value = entry.get("input", {}).get("command", "")
    else:
        # Try to find any string in input to match against
        input_data = entry.get("input", {})
        match_value = str(input_data)

    try:
        return bool(re.search(pattern, match_value, re.IGNORECASE))
    except re.error:
        return False


def find_sequence_match(
    history: List[Dict[str, Any]],
    current_entry: Dict[str, Any],
    sequence: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Check if current entry completes a dangerous sequence.

    Args:
        history: List of previous tool invocations
        current_entry: Current tool invocation being checked
        sequence: Sequence pattern to check against

    Returns:
        Match info dict if sequence completed, None otherwise
    """
    steps = sequence.get("steps", [])
    if not steps:
        return None

    window = sequence.get("window", 10)

    # Current entry should match the last step
    last_step = steps[-1]
    if not matches_step(current_entry, last_step):
        return None

    # Check if previous steps are in history (in order, within window)
    if len(steps) == 1:
        # Single-step sequence (just the current entry)
        return {
            "sequence_name": sequence.get("name", "unknown"),
            "reason": sequence.get("reason", "Dangerous sequence detected"),
            "action": sequence.get("action", "ask"),
            "severity": sequence.get("severity", "high"),
            "matched_steps": [current_entry],
        }

    # Look for previous steps in recent history
    remaining_steps = steps[:-1]  # All steps except the last one
    recent_history = history[-window:] if len(history) > window else history

    matched_entries = []
    step_idx = 0

    for entry in recent_history:
        if step_idx >= len(remaining_steps):
            break

        if matches_step(entry, remaining_steps[step_idx]):
            matched_entries.append(entry)
            step_idx += 1

    # Check if all steps were matched
    if step_idx == len(remaining_steps):
        matched_entries.append(current_entry)
        return {
            "sequence_name": sequence.get("name", "unknown"),
            "reason": sequence.get("reason", "Dangerous sequence detected"),
            "action": sequence.get("action", "ask"),
            "severity": sequence.get("severity", "high"),
            "matched_steps": matched_entries,
        }

    return None


# ============================================================================
# PUBLIC API
# ============================================================================


def record_tool_use(
    tool: str,
    input_data: Dict[str, Any],
    config: Optional[Dict[str, Any]] = None,
) -> None:
    """Record a tool invocation in history.

    Args:
        tool: Tool name (Read, Glob, Grep, Bash, etc.)
        input_data: Tool input parameters
        config: Optional config dict (loaded if not provided)
    """
    if config is None:
        config = load_config()

    history = load_history(config)
    history = cleanup_history(config, history)

    # Add new entry
    entry = {
        "tool": tool,
        "input": input_data,
        "timestamp": time.time(),
    }
    history.append(entry)

    save_history(config, history)


def check_sequences(
    tool: str,
    input_data: Dict[str, Any],
    config: Optional[Dict[str, Any]] = None,
) -> Tuple[bool, bool, str]:
    """Check if current tool invocation completes a dangerous sequence.

    Args:
        tool: Tool name (Read, Glob, Grep, Bash, etc.)
        input_data: Tool input parameters
        config: Optional config dict (loaded if not provided)

    Returns:
        Tuple of (should_block, should_ask, reason)
    """
    if config is None:
        config = load_config()

    history = load_history(config)
    history = cleanup_history(config, history)

    sequences = config.get("dangerousSequences", [])

    # Create current entry for matching
    current_entry = {
        "tool": tool,
        "input": input_data,
        "timestamp": time.time(),
    }

    # Check each sequence pattern
    for sequence in sequences:
        match = find_sequence_match(history, current_entry, sequence)
        if match:
            action = match.get("action", "ask")
            reason = match.get("reason", "Dangerous sequence detected")
            severity = match.get("severity", "high")

            # Add sequence context to reason
            full_reason = f"[{severity.upper()}] {reason}"

            if action == "block":
                return True, False, full_reason
            else:
                return False, True, full_reason

    return False, False, ""


def get_history(config: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """Get current tool invocation history.

    Returns:
        List of history entries
    """
    if config is None:
        config = load_config()

    history = load_history(config)
    return cleanup_history(config, history)


def clear_history(config: Optional[Dict[str, Any]] = None) -> None:
    """Clear tool invocation history."""
    if config is None:
        config = load_config()

    save_history(config, [])


# ============================================================================
# CLI INTERFACE (for testing)
# ============================================================================


def main() -> None:
    """CLI interface for sequence detector testing."""
    import argparse

    parser = argparse.ArgumentParser(description="Sequence Detector CLI")
    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # record command
    record_parser = subparsers.add_parser("record", help="Record a tool invocation")
    record_parser.add_argument("tool", help="Tool name (Read, Glob, Bash, etc.)")
    record_parser.add_argument("--file", help="File path (for Read)")
    record_parser.add_argument("--pattern", help="Pattern (for Glob/Grep)")
    record_parser.add_argument("--cmd", help="Command (for Bash)")

    # check command
    check_parser = subparsers.add_parser("check", help="Check if tool completes sequence")
    check_parser.add_argument("tool", help="Tool name")
    check_parser.add_argument("--file", help="File path (for Read)")
    check_parser.add_argument("--pattern", help="Pattern (for Glob/Grep)")
    check_parser.add_argument("--cmd", help="Command (for Bash)")

    # history command
    subparsers.add_parser("history", help="Show tool history")

    # clear command
    subparsers.add_parser("clear", help="Clear history")

    args = parser.parse_args()

    def build_input(args) -> Dict[str, Any]:
        input_data = {}
        if args.file:
            input_data["file_path"] = args.file
        if args.pattern:
            input_data["pattern"] = args.pattern
        if args.cmd:
            input_data["command"] = args.cmd
        return input_data

    if args.command == "record":
        input_data = build_input(args)
        record_tool_use(args.tool, input_data)
        print(f"Recorded: {args.tool}")

    elif args.command == "check":
        input_data = build_input(args)
        should_block, should_ask, reason = check_sequences(args.tool, input_data)
        print(f"Block: {should_block}")
        print(f"Ask: {should_ask}")
        if reason:
            print(f"Reason: {reason}")

    elif args.command == "history":
        history = get_history()
        if history:
            for i, entry in enumerate(history):
                age = time.time() - entry.get("timestamp", 0)
                print(f"  [{i}] {entry.get('tool')} ({age:.0f}s ago)")
                print(f"      Input: {entry.get('input')}")
        else:
            print("No history")

    elif args.command == "clear":
        clear_history()
        print("History cleared")

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
