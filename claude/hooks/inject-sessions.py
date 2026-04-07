#!/usr/bin/env python
"""
UserPromptSubmit hook to auto-inject session context for /pickup and /snapshot commands.
Windows-safe using os.path for all file operations.
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path


def _parse_instance_header(line):
    """Extract (tag, title) from a ## [tag] title header line, or None."""
    if not line.startswith("## ["):
        return None
    if "]" not in line:
        return None
    start = line.find("[")
    end = line.find("]", start)
    if start == -1 or end == -1:
        return None
    return line[start + 1 : end], line[end + 1 :].strip()


def _process_line(line, current_instance, in_right_now, instances):
    """Process one CURRENT.md line; returns (current_instance, in_right_now)."""
    header = _parse_instance_header(line)
    if header is not None:
        if current_instance:
            instances.append(current_instance)
        return {"tag": header[0], "title": header[1], "right_now": None}, False

    if current_instance is None:
        return current_instance, in_right_now

    if line.strip() == "### Right Now":
        return current_instance, True

    if in_right_now and line.strip() and not line.startswith("#"):
        current_instance["right_now"] = line.strip()
        return current_instance, False

    return current_instance, in_right_now


def parse_instances_from_current(current_file):
    """Parse all [instance:session] sections from CURRENT.md"""
    instances = []
    try:
        with open(current_file, encoding="utf-8") as f:
            lines = f.read().split("\n")

        current_instance = None
        in_right_now = False
        for line in lines:
            current_instance, in_right_now = _process_line(
                line, current_instance, in_right_now, instances
            )
        if current_instance:
            instances.append(current_instance)
    except Exception:
        pass
    return instances


def _build_session_entry(item):
    """Build a session dict for a feature directory item."""
    current_file = item / "CURRENT.md"
    status_file = item / "STATUS.md"

    mtime = None
    if current_file.exists():
        mtime = datetime.fromtimestamp(current_file.stat().st_mtime)
    elif status_file.exists():
        mtime = datetime.fromtimestamp(status_file.stat().st_mtime)

    instances = parse_instances_from_current(current_file) if current_file.exists() else []

    return {
        "name": item.name,
        "mtime": mtime,
        "instances": instances,
        "has_current": current_file.exists(),
        "has_status": status_file.exists(),
    }


def find_sessions(base_dir):
    """Find all active sessions in .session/feature/ (multi-instance aware)"""
    feature_dir = base_dir / ".session" / "feature"
    if not feature_dir.exists():
        return []

    sessions = []
    try:
        for item in feature_dir.iterdir():
            if item.is_dir():
                sessions.append(_build_session_entry(item))
    except Exception:
        return []

    sessions.sort(key=lambda x: x["mtime"] if x["mtime"] else datetime.min, reverse=True)
    return sessions


def format_session_list(sessions):
    """Format sessions for injection into context (multi-instance aware)"""
    if not sessions:
        return "No active sessions found in .session/feature/"

    lines = ["Available active sessions (most recent first):\n"]

    item_num = 1
    for session in sessions:
        feature_name = session["name"]
        mtime_str = session["mtime"].strftime("%Y-%m-%d %H:%M") if session["mtime"] else "unknown"

        if not session["instances"]:
            lines.append(f"{item_num}. **{feature_name}** (updated {mtime_str})")
            item_num += 1
        else:
            for instance in session["instances"]:
                line = f"{item_num}. **{feature_name}** [{instance['tag']}]"
                if instance["title"]:
                    line += f" - {instance['title']}"
                if instance["right_now"]:
                    line += f" - {instance['right_now']}"
                line += f" (updated {mtime_str})"
                lines.append(line)
                item_num += 1

    return "\n".join(lines)


def main():
    try:
        data = json.load(sys.stdin)
        prompt = data.get("prompt", "")
        cwd = Path(data.get("cwd", os.getcwd()))

        if not (prompt.strip().startswith("/pickup") or prompt.strip().startswith("/snapshot")):
            print(json.dumps({}))
            return

        sessions = find_sessions(cwd)
        context = format_session_list(sessions)

        output = {"hookSpecificOutput": {"additionalContext": context}}
        print(json.dumps(output))

    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        print(json.dumps({}))


if __name__ == "__main__":
    main()
