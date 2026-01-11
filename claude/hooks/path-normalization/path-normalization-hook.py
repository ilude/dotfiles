# /// script
# requires-python = ">=3.8"
# dependencies = []
# ///
"""
Claude Code Path Normalization Hook
====================================

Blocks Edit/Write operations using absolute paths and guides Claude to use
relative paths from the workspace root instead.

Goals:
- Use relative paths: projectfolder/... instead of E:/Projects/projectfolder/...
- Use forward slashes: / not backslashes
- Start from workspace root and use relative paths

Exit codes:
  0 = Allow (path is relative and uses forward slashes)
  2 = Block (stderr fed back to Claude with guidance)

Environment variables:
  CLAUDE_DISABLE_HOOKS - Comma-separated list of hook names to disable
                         Use "path-normalization" to disable this hook

  ┌─────────────────────────────────────────────────────────────────────┐
  │ WARNING FOR AI ASSISTANTS (Claude, Copilot, etc.):                  │
  │                                                                     │
  │ CLAUDE_DISABLE_HOOKS is for HOOK DEVELOPMENT ONLY.                  │
  │                                                                     │
  │ You may ONLY use this variable when ALL conditions are met:         │
  │   1. You are directly modifying THIS hook's code                    │
  │   2. Working directory is ~/.dotfiles OR ~/.claude                  │
  │   3. The hook is blocking edits to itself (circular dependency)     │
  │                                                                     │
  │ NEVER use this to bypass security checks during normal work.        │
  │ If a hook blocks an operation, FIX THE ISSUE instead of disabling.  │
  └─────────────────────────────────────────────────────────────────────┘
"""

import json
import os
import re
import sys
from typing import Tuple

HOOK_NAME = "path-normalization"


def is_hook_disabled() -> bool:
    """Check if this hook is disabled via CLAUDE_DISABLE_HOOKS env var."""
    disabled_hooks = os.environ.get("CLAUDE_DISABLE_HOOKS", "")
    return HOOK_NAME in [h.strip() for h in disabled_hooks.split(",")]

def get_home_directory() -> str:
    """Get user's home directory, handling MSYS2/Git Bash correctly.

    In MSYS2/Git Bash, os.path.expanduser('~') returns /home/Mike
    but we need the Windows home (C:/Users/Mike).
    """
    userprofile = os.environ.get("USERPROFILE")
    if userprofile:
        return userprofile
    return os.environ.get("HOME") or os.path.expanduser("~")



def is_absolute_path(file_path: str) -> Tuple[bool, str]:
    """Check if path is absolute and return reason if so.

    Detects:
    - Windows drive letters: C:/, C:\\, E:/Projects/...
    - MSYS/Git Bash style: /c/, /e/, /mnt/c/
    - UNC paths: //server/share, \\\\server\\share

    Returns:
        Tuple of (is_absolute, reason)
    """
    if not file_path:
        return False, ""

    # Normalize for checking (but preserve original for error message)
    path = file_path.strip()

    # Windows drive letter paths: C:/, C:\, E:/Projects/...
    if re.match(r'^[A-Za-z]:[/\\]', path):
        return True, "Windows absolute path with drive letter"

    # MSYS/Git Bash paths: /c/, /e/Users/...
    if re.match(r'^/[A-Za-z]/', path):
        return True, "MSYS/Git Bash absolute path"

    # WSL mount paths: /mnt/c/, /mnt/d/
    if re.match(r'^/mnt/[A-Za-z]/', path):
        return True, "WSL mount path"

    # UNC paths: //server/share or \\server\share
    if re.match(r'^[/\\]{2}', path):
        return True, "UNC network path"

    # Unix absolute paths starting with /
    # But exclude common relative-looking paths that start with ./
    if path.startswith('/') and not path.startswith('./'):
        # Allow some special paths that might be intentional
        allowed_prefixes = ['/dev/', '/proc/', '/tmp/', '/var/']
        if not any(path.startswith(p) for p in allowed_prefixes):
            # Check if it looks like a project path (has multiple segments)
            # Skip single-segment paths like /Makefile which might be from root
            if path.count('/') > 1:
                return True, "Unix absolute path"

    return False, ""


def has_backslashes(file_path: str) -> bool:
    """Check if path uses backslashes (Windows style)."""
    return '\\' in file_path


def get_relative_suggestion(file_path: str) -> str:
    """Suggest the project-relative portion of an absolute path."""
    project_dir = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())

    norm_path = normalize_path_for_comparison(file_path)
    norm_proj = normalize_path_for_comparison(project_dir)

    if norm_path.startswith(norm_proj + '/'):
        relative = file_path[len(project_dir):].lstrip('/\\')
        return relative.replace('\\', '/')

    return os.path.basename(file_path)


def normalize_path_for_comparison(path: str) -> str:
    """Normalize a path for case-insensitive, slash-insensitive comparison."""
    # Normalize slashes
    normalized = path.replace('\\', '/').lower()

    # Handle MSYS paths like /c/Users/...
    msys_match = re.match(r'^/([a-z])/(.*)', normalized)
    if msys_match:
        normalized = f"{msys_match.group(1)}:/{msys_match.group(2)}"

    return normalized.rstrip('/')


def is_path_within_project(file_path: str, project_dir: str) -> bool:
    """Check if file_path is within or equal to the project directory."""
    norm_file = normalize_path_for_comparison(file_path)
    norm_proj = normalize_path_for_comparison(project_dir)

    # Check if file is within project dir
    return norm_file.startswith(norm_proj + '/') or norm_file == norm_proj


def is_claude_internal_path(file_path: str) -> bool:
    """Check if file_path is within Claude Code's internal directories (~/.claude/)."""
    norm_file = normalize_path_for_comparison(file_path)

    # Get home directory and construct claude config path
    home = get_home_directory()
    claude_dir = normalize_path_for_comparison(os.path.join(home, '.claude'))

    return norm_file.startswith(claude_dir + '/')


def is_within_home_directory(file_path: str) -> bool:
    """Check if file_path is within the user's home directory."""
    norm_file = normalize_path_for_comparison(file_path)
    home = get_home_directory()
    norm_home = normalize_path_for_comparison(home)
    return norm_file.startswith(norm_home + '/')


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

    file_path = tool_input.get("file_path", "")
    if not file_path:
        sys.exit(0)

    project_dir = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())
    is_absolute, _ = is_absolute_path(file_path)
    uses_backslashes = has_backslashes(file_path)

    # CASE 1: Relative path with backslashes - suggest forward slashes
    if not is_absolute and uses_backslashes:
        suggestion = file_path.replace('\\', '/')
        print(f"Use forward slashes: '{suggestion}'", file=sys.stderr)
        sys.exit(2)

    # CASE 2: Clean relative path - allow
    if not is_absolute:
        sys.exit(0)

    # CASE 3: Absolute within project - allow (but enforce forward slashes)
    if is_path_within_project(file_path, project_dir):
        if uses_backslashes:
            suggestion = file_path.replace('\\', '/')
            print(f"Use forward slashes: '{suggestion}'", file=sys.stderr)
            sys.exit(2)
        sys.exit(0)

    # CASE 4: Absolute within home directory - allow
    if is_within_home_directory(file_path):
        sys.exit(0)

    # CASE 5: Absolute outside allowed areas - block
    suggestion = get_relative_suggestion(file_path)
    print(f"Use relative path: '{suggestion}'", file=sys.stderr)
    sys.exit(2)


if __name__ == "__main__":
    main()
