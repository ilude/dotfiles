#!/usr/bin/env python
"""Pre-approve a command pattern for the current Claude Code session.

Identifies the damage-control ask pattern that would match the given command,
then writes it to the session allowlist so subsequent invocations skip the
confirmation prompt.

Usage:
    python dc-allow.py <command_string>

Environment:
    CLAUDE_SESSION_ID - Required. The current Claude Code session ID.

Example:
    python dc-allow.py "docker compose down"
"""

import importlib.util
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path


def _import_hook():
    """Import the main hook module (hyphenated filename needs importlib)."""
    hook_path = Path(__file__).parent / "bash-tool-damage-control.py"
    spec = importlib.util.spec_from_file_location("bash_tool_damage_control", hook_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python dc-allow.py <command>", file=sys.stderr)
        return 1

    command = " ".join(sys.argv[1:])

    session_id = os.environ.get("CLAUDE_SESSION_ID")
    if not session_id:
        print("Error: CLAUDE_SESSION_ID not set", file=sys.stderr)
        return 1

    hook = _import_hook()
    config = hook.get_compiled_config()

    # Run check_command to identify which pattern matches
    is_blocked, should_ask, reason, pattern_matched, _, _ = hook.check_command(command, config)

    if is_blocked:
        print(f"Cannot pre-approve: command is hard-blocked ({reason})", file=sys.stderr)
        return 1

    if not should_ask:
        print(f"No ask pattern matches '{command}' — already allowed", file=sys.stderr)
        return 0

    # Extract pattern text from config
    pattern_text = hook._get_pattern_text(pattern_matched, config)
    if not pattern_text:
        print(f"Could not extract pattern text for {pattern_matched}", file=sys.stderr)
        return 1

    # Load existing session data and add explicit allow
    data = hook.load_session_data()
    data.setdefault("session_id", session_id)
    data.setdefault("created", datetime.now().isoformat())
    data.setdefault("explicit_allows", [])
    data.setdefault("session_memory", [])

    # Check for duplicate
    for entry in data["explicit_allows"]:
        if entry.get("pattern_id") == pattern_matched:
            print(f"Already pre-approved: {pattern_matched} ({reason})")
            return 0

    data["explicit_allows"].append({
        "pattern_id": pattern_matched,
        "pattern_text": pattern_text,
        "reason": reason,
        "added": datetime.now().isoformat(),
        "source": "dc-allow",
    })

    if hook.write_session_data(data):
        print(f"Pre-approved: {reason}")
        print(f"  Pattern: {pattern_matched}")
        print(f"  Regex: {pattern_text}")
        return 0
    else:
        print("Error: Failed to write session file", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
