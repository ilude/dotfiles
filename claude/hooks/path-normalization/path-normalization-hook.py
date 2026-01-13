# /// script
# requires-python = ">=3.9"
# dependencies = []
# ///
"""
Claude Code Path Normalization Hook

Blocks Edit/Write operations using absolute paths outside home/project,
and guides Claude to use forward slashes instead of backslashes.

Exit codes:
  0 = Allow
  2 = Block (stderr fed back to Claude with guidance)
"""

import json
import os
import re
import sys
from pathlib import Path

HOOK_NAME = "path-normalization"
BACKSLASH = chr(92)


def is_hook_disabled() -> bool:
    disabled = os.environ.get("CLAUDE_DISABLE_HOOKS", "")
    return HOOK_NAME in [h.strip() for h in disabled.split(",")]


def to_windows_path(path_str: str) -> str:
    """Convert MSYS (/c/) or WSL (/mnt/c/) paths to Windows (C:/)."""
    match = re.match(r'^(?:/mnt)?/([a-zA-Z])/(.*)', path_str)
    return f"{match.group(1).upper()}:/{match.group(2)}" if match else path_str


def is_absolute(path: str) -> bool:
    """Check if path is absolute (Windows, MSYS, WSL, UNC)."""
    if not path:
        return False
    # UNC paths (//server or \server)
    if len(path) >= 2 and path[0] in ('/', BACKSLASH) and path[1] in ('/', BACKSLASH):
        return True
    return Path(to_windows_path(path)).is_absolute()


def is_within(child: Path, parent: Path) -> bool:
    """Check if child path is within parent directory."""
    try:
        return child.resolve().is_relative_to(parent.resolve())
    except (ValueError, OSError):
        return False


def block(message: str) -> None:
    """Exit with block status and error message."""
    print(message, file=sys.stderr)
    sys.exit(2)


def main() -> None:
    if is_hook_disabled():
        sys.exit(0)

    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(1)

    if data.get("tool_name") not in ("Edit", "Write"):
        sys.exit(0)

    path_str = data.get("tool_input", {}).get("file_path", "")
    if not path_str:
        sys.exit(0)

    # Allow Unix system paths (for WSL compatibility)
    if path_str.startswith(('/dev/', '/proc/', '/tmp/', '/var/')):
        sys.exit(0)

    has_backslash = BACKSLASH in path_str
    is_abs = is_absolute(path_str)

    # Relative path with backslashes -> suggest forward slashes
    if not is_abs and has_backslash:
        block(f"Use forward slashes: '{path_str.replace(BACKSLASH, '/')}'")

    # Clean relative path -> allow
    if not is_abs:
        sys.exit(0)

    # Resolve absolute path and get boundaries
    file_path = Path(to_windows_path(path_str)).resolve()
    project = Path(to_windows_path(os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd()))).resolve()
    home = Path(os.environ.get("USERPROFILE") or Path.home()).resolve()

    # Absolute within project
    if is_within(file_path, project):
        if has_backslash:
            relative = str(file_path.relative_to(project)).replace(BACKSLASH, '/')
            block(f"Use relative path: '{relative}'")
        sys.exit(0)

    # Absolute within home -> allow
    if is_within(file_path, home):
        sys.exit(0)

    # Outside allowed areas -> block
    block(f"Use relative path: '{file_path.name}'")


if __name__ == "__main__":
    main()
