# /// script
# requires-python = ">=3.9"
# dependencies = []
# ///
"""
Claude Code Path Normalization Hook - Simplified with pathlib
"""

import json
import os
import re
import sys
from pathlib import Path

HOOK_NAME = "path-normalization"
BACKSLASH = chr(92)  # Use chr() to avoid escaping issues


def is_hook_disabled() -> bool:
    disabled_hooks = os.environ.get("CLAUDE_DISABLE_HOOKS", "")
    return HOOK_NAME in [h.strip() for h in disabled_hooks.split(",")]


def get_home_path() -> Path:
    userprofile = os.environ.get("USERPROFILE")
    if userprofile:
        return Path(userprofile)
    return Path.home()


def to_windows_path(path_str: str) -> str:
    msys_match = re.match(r'^/([a-zA-Z])/(.*)', path_str)
    if msys_match:
        return f"{msys_match.group(1).upper()}:/{msys_match.group(2)}"
    wsl_match = re.match(r'^/mnt/([a-zA-Z])/(.*)', path_str)
    if wsl_match:
        return f"{wsl_match.group(1).upper()}:/{wsl_match.group(2)}"
    return path_str


def resolve_path(path_str: str) -> Path:
    return Path(to_windows_path(path_str)).resolve()


def is_absolute_path(file_path: str) -> bool:
    if not file_path:
        return False
    path = file_path.strip()
    # Windows: C:/ or C:\
    if len(path) >= 3 and path[1] == ':' and path[2] in ('/', BACKSLASH):
        if path[0].isalpha():
            return True
    # MSYS/Git Bash: /c/
    if re.match(r'^/[A-Za-z]/', path):
        return True
    # WSL: /mnt/c/
    if re.match(r'^/mnt/[A-Za-z]/', path):
        return True
    # UNC: //server/share or \server\share
    if len(path) >= 2 and path[0] in ('/', BACKSLASH) and path[1] in ('/', BACKSLASH):
        return True
    # Unix absolute (but allow /tmp, /dev, etc.)
    if path.startswith('/') and not path.startswith('./'):
        allowed = ['/dev/', '/proc/', '/tmp/', '/var/']
        if not any(path.startswith(p) for p in allowed):
            if path.count('/') > 1:
                return True
    return False


def has_backslashes(file_path: str) -> bool:
    return BACKSLASH in file_path


def is_within_directory(file_path: Path, directory: Path) -> bool:
    try:
        return file_path.resolve().is_relative_to(directory.resolve())
    except (ValueError, OSError):
        return False


def get_relative_path(file_path: Path, base_dir: Path) -> str:
    try:
        relative = file_path.resolve().relative_to(base_dir.resolve())
        return str(relative).replace(BACKSLASH, '/')
    except ValueError:
        return file_path.name


def main() -> None:
    if is_hook_disabled():
        sys.exit(0)

    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(f"Invalid JSON: {e}", file=sys.stderr)
        sys.exit(1)

    tool_name = input_data.get("tool_name", "")
    tool_input = input_data.get("tool_input", {})

    if tool_name not in ("Edit", "Write"):
        sys.exit(0)

    file_path_str = tool_input.get("file_path", "")
    if not file_path_str:
        sys.exit(0)

    project_dir = Path(to_windows_path(os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())))
    home_dir = get_home_path()

    is_abs = is_absolute_path(file_path_str)
    uses_backslashes = has_backslashes(file_path_str)

    # CASE 1: Relative path with backslashes
    if not is_abs and uses_backslashes:
        suggestion = file_path_str.replace(BACKSLASH, '/')
        print(f"Use forward slashes: '{suggestion}'", file=sys.stderr)
        sys.exit(2)

    # CASE 2: Clean relative path - allow
    if not is_abs:
        sys.exit(0)

    file_path = resolve_path(file_path_str)

    # CASE 3: Absolute within project
    if is_within_directory(file_path, project_dir):
        if uses_backslashes:
            suggestion = get_relative_path(file_path, project_dir)
            print(f"Use relative path: '{suggestion}'", file=sys.stderr)
            sys.exit(2)
        sys.exit(0)

    # CASE 4: Absolute within home directory - allow
    if is_within_directory(file_path, home_dir):
        sys.exit(0)

    # CASE 5: Absolute outside allowed areas - block
    suggestion = get_relative_path(file_path, project_dir)
    print(f"Use relative path: '{suggestion}'", file=sys.stderr)
    sys.exit(2)


if __name__ == "__main__":
    main()
