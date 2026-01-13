# /// script
# requires-python = ">=3.9"
# dependencies = []
# ///
"""
Claude Code Path Normalization Hook

WORKAROUND FOR CLAUDE CODE BUGS:
Claude Code's Edit tool has bugs with path handling:
1. Absolute paths (C:/..., /c/..., /mnt/c/...) cause false "File has been
   unexpectedly modified" errors, even when the file hasn't changed.
2. Backslash separators (\\) cause similar issues.

Using relative paths with forward slashes works correctly.

This hook blocks problematic path formats and suggests the correct alternative:
- Relative paths with forward slashes: "claude/skills/test/SKILL.md" ✓
- Home-relative paths with forward slashes: "~/.claude/skills/test.md" ✓
- Absolute paths: "C:/Users/.../file.py" ✗ (blocked)
- Backslash separators: "claude\\skills\\test.md" ✗ (blocked)

Note: Path traversal (../) in relative paths is intentionally allowed. This hook
works around Edit tool bugs, not project boundary enforcement. Claude Code has
separate security checks for file access.

Exit codes:
  0 = Allow (path format is safe)
  1 = Error (invalid JSON input)
  2 = Block (stderr fed back to Claude with correct path suggestion)

See git log for this file's history - commit dba41d9 incorrectly loosened
the rules to allow absolute paths, which re-enabled the buggy code path.
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
    """Convert MSYS (/c/), WSL (/mnt/c/), or Cygwin (/cygdrive/c/) to Windows (C:/)."""
    match = re.match(r'^(?:/mnt|/cygdrive)?/([a-zA-Z])/(.*)', path_str)
    return f"{match.group(1).upper()}:/{match.group(2)}" if match else path_str


def is_unc_path(path: str) -> bool:
    """Check if path is UNC (//server or \\\\server) without triggering network I/O."""
    if len(path) < 3:
        return False
    return path[0] in ('/', BACKSLASH) and path[1] in ('/', BACKSLASH)


def is_absolute(path: str) -> bool:
    """Check if path is absolute (Windows, MSYS, WSL, UNC)."""
    if not path:
        return False
    # UNC paths (//server or \server)
    if len(path) >= 2 and path[0] in ('/', BACKSLASH) and path[1] in ('/', BACKSLASH):
        return True
    return Path(to_windows_path(path)).is_absolute()


def is_within(child: Path, parent: Path) -> bool:
    """Check if child path is within parent directory (case-insensitive on Windows)."""
    try:
        child_norm = os.path.normcase(str(child.resolve()))
        parent_norm = os.path.normcase(str(parent.resolve()))
        return (child_norm.startswith(parent_norm + os.sep) or
                child_norm == parent_norm)
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

    # Type validation - handle malformed input gracefully
    tool_input = data.get("tool_input")
    if not isinstance(tool_input, dict):
        sys.exit(0)

    path_str = tool_input.get("file_path", "")
    if not path_str or not isinstance(path_str, str):
        sys.exit(0)

    has_backslash = BACKSLASH in path_str

    # CASE 1: Home-relative paths (~/...) - ALLOW if using forward slashes
    if path_str.startswith('~/'):
        if has_backslash:
            block(f"Use forward slashes: '{path_str.replace(BACKSLASH, '/')}'")
        sys.exit(0)

    # CASE 2: Unix system paths - ALLOW (for WSL compatibility)
    if path_str.startswith(('/dev/', '/proc/', '/tmp/', '/var/')):
        sys.exit(0)

    is_abs = is_absolute(path_str)

    # CASE 3: UNC paths - BLOCK early to avoid network I/O from resolve()
    if is_unc_path(path_str):
        filename = path_str.rsplit('/', 1)[-1].rsplit(BACKSLASH, 1)[-1]
        block(f"UNC paths not supported. Use relative path: '{filename}'")

    # CASE 4: Relative path with backslashes - BLOCK, suggest forward slashes
    if not is_abs and has_backslash:
        block(f"Use forward slashes: '{path_str.replace(BACKSLASH, '/')}'")

    # CASE 5: Clean relative path (forward slashes, no absolute) - ALLOW
    if not is_abs:
        sys.exit(0)

    # CASE 6: Absolute path - BLOCK, suggest relative path
    # This is the key fix: absolute paths cause Claude Code Edit bugs
    file_path = Path(to_windows_path(path_str)).resolve()
    project = Path(to_windows_path(os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd()))).resolve()
    home = Path(os.environ.get("USERPROFILE") or Path.home()).resolve()

    # Absolute within project -> suggest project-relative path
    if is_within(file_path, project):
        relative = str(file_path.relative_to(project)).replace(BACKSLASH, '/')
        block(f"Use relative path: '{relative}'")

    # Absolute within home -> suggest home-relative path (~/)
    if is_within(file_path, home):
        relative = str(file_path.relative_to(home)).replace(BACKSLASH, '/')
        block(f"Use home-relative path: '~/{relative}'")

    # Outside allowed areas -> suggest filename only (user must determine location)
    block(f"Use relative path: '{file_path.name}'")


if __name__ == "__main__":
    main()
