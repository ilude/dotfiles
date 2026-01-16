# /// script
# requires-python = ">=3.9"
# dependencies = []
# ///
"""
Session History Stop Hook

Finalizes session history when Claude Code session ends:
1. Detects session ID and project name
2. Appends session_end entry if missing
3. Validates JSONL format

Event: Stop (called when conversation/tool execution stops)

Exit codes:
  0 = Success (always - never block Stop)
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def get_session_id() -> str:
    """Get current session ID from environment or debug files.

    Priority:
    1. CLAUDE_SESSION_ID environment variable
    2. Most recently modified file in ~/.claude/debug/
    3. Fallback to "unknown"
    """
    # Try environment variable first
    session_id = os.getenv("CLAUDE_SESSION_ID", "")
    if session_id:
        return session_id[:8]

    # Try debug directory
    debug_dir = Path(os.path.expanduser("~")) / ".claude" / "debug"
    if debug_dir.exists():
        try:
            debug_files = sorted(
                debug_dir.glob("*.txt"),
                key=lambda f: f.stat().st_mtime,
                reverse=True,
            )
            if debug_files:
                # Filename is UUID.txt
                return debug_files[0].stem[:8]
        except Exception:
            pass

    return "unknown"


def get_instance_id() -> str:
    """Get instance ID from IDE lock file."""
    port = os.getenv("CLAUDE_CODE_SSE_PORT", "")
    if not port:
        return "unknown"

    lock_file = Path(os.path.expanduser("~")) / ".claude" / "ide" / f"{port}.lock"
    if lock_file.exists():
        try:
            with open(lock_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                auth_token = data.get("authToken", "")
                if auth_token:
                    return auth_token[:8]
        except Exception:
            pass

    return "unknown"


def get_project_name() -> str:
    """Detect project name from git or directory.

    Priority:
    1. Git repo name
    2. Directory name from CLAUDE_PROJECT_DIR or cwd
    3. Fallback to "_global"
    """
    cwd = os.getenv("CLAUDE_PROJECT_DIR", os.getcwd())

    # Try git repo name
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            name = Path(result.stdout.strip()).name
            return name.lower().replace(" ", "-")
    except Exception:
        pass

    # Fallback to directory name
    name = Path(cwd).name
    return name.lower().replace(" ", "-") if name else "_global"


def get_history_path(project: str) -> Path:
    """Get path to history file for project."""
    history_dir = Path(os.path.expanduser("~")) / ".claude" / "history"
    history_dir.mkdir(parents=True, exist_ok=True)
    return history_dir / f"{project}.jsonl"


def validate_jsonl(file_path: Path) -> tuple[bool, list[str]]:
    """Validate JSONL file format. Returns (valid, errors)."""
    errors: list[str] = []
    if not file_path.exists():
        return True, []

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                    # Validate required fields
                    if "ts" not in entry:
                        errors.append(f"Line {line_num}: missing 'ts' field")
                    if "type" not in entry:
                        errors.append(f"Line {line_num}: missing 'type' field")
                    if "summary" not in entry:
                        errors.append(f"Line {line_num}: missing 'summary' field")
                except json.JSONDecodeError as e:
                    errors.append(f"Line {line_num}: invalid JSON - {e}")
    except Exception as e:
        errors.append(f"File read error: {e}")

    return len(errors) == 0, errors


def session_end_exists(history_path: Path, session_id: str) -> bool:
    """Check if session_end entry already exists for this session."""
    if not history_path.exists():
        return False

    try:
        with open(history_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                    if entry.get("sid") == session_id and entry.get("type") == "session_end":
                        return True
                except json.JSONDecodeError:
                    continue
    except Exception:
        pass

    return False


def append_session_end(history_path: Path, session_id: str, project: str) -> None:
    """Append session_end entry if not already present."""
    if session_end_exists(history_path, session_id):
        return

    entry = {
        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sid": session_id,
        "type": "session_end",
        "summary": "Session ended",
        "project": project,
        "iid": get_instance_id(),
    }

    try:
        with open(history_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception:
        pass  # Never fail on Stop hook


def log_validation_errors(errors: list[str], project: str) -> None:
    """Log validation errors to stderr (visible in debug logs)."""
    if errors:
        print(f"HISTORY VALIDATION ({project}): {len(errors)} error(s)", file=sys.stderr)
        for error in errors[:5]:  # Limit to first 5
            print(f"  - {error}", file=sys.stderr)


def main() -> None:
    """Main hook entry point."""
    # Read hook input (Stop hook receives minimal data)
    try:
        json.load(sys.stdin)
    except json.JSONDecodeError:
        pass  # Proceed anyway - never block on Stop

    # Get identifiers
    session_id = get_session_id()
    project = get_project_name()
    history_path = get_history_path(project)

    # Append session_end if needed
    append_session_end(history_path, session_id, project)

    # Validate JSONL format
    valid, errors = validate_jsonl(history_path)
    log_validation_errors(errors, project)

    # Always exit 0 - never block Stop
    sys.exit(0)


if __name__ == "__main__":
    main()
