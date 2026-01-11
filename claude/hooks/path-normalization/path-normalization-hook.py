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
"""

import json
import os
import re
import sys
from typing import Tuple


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
    """Suggest how to convert the path to relative.

    Tries to extract the project-relative portion of the path.
    """
    # Get the current working directory for context
    cwd = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())

    # Normalize slashes for comparison
    normalized_path = file_path.replace('\\', '/')
    normalized_cwd = cwd.replace('\\', '/')

    # Handle MSYS paths like /c/Users/...
    msys_match = re.match(r'^/([A-Za-z])/(.*)', normalized_path)
    if msys_match:
        drive = msys_match.group(1).upper()
        rest = msys_match.group(2)
        normalized_path = f"{drive}:/{rest}"

    # Handle Windows paths
    win_match = re.match(r'^([A-Za-z]):[/\\](.*)', normalized_path)
    if win_match:
        drive = win_match.group(1).upper()
        rest = win_match.group(2)
        normalized_path = f"{drive}:/{rest}"

    # Same for cwd
    cwd_msys_match = re.match(r'^/([A-Za-z])/(.*)', normalized_cwd)
    if cwd_msys_match:
        drive = cwd_msys_match.group(1).upper()
        rest = cwd_msys_match.group(2)
        normalized_cwd = f"{drive}:/{rest}"

    cwd_win_match = re.match(r'^([A-Za-z]):[/\\](.*)', normalized_cwd)
    if cwd_win_match:
        drive = cwd_win_match.group(1).upper()
        rest = cwd_win_match.group(2)
        normalized_cwd = f"{drive}:/{rest}"

    # Check if path starts with cwd
    if normalized_path.lower().startswith(normalized_cwd.lower()):
        # Extract relative portion
        relative = normalized_path[len(normalized_cwd):].lstrip('/')
        if relative:
            return relative

    # Try to find a common project folder pattern
    # Look for patterns like: .../Projects/ProjectName/...
    project_patterns = [
        r'[/\\]Projects[/\\]([^/\\]+[/\\].+)$',
        r'[/\\]repos[/\\]([^/\\]+[/\\].+)$',
        r'[/\\]src[/\\]([^/\\]+[/\\].+)$',
        r'[/\\]code[/\\]([^/\\]+[/\\].+)$',
    ]

    for pattern in project_patterns:
        match = re.search(pattern, file_path, re.IGNORECASE)
        if match:
            return match.group(1).replace('\\', '/')

    # Fall back to just the filename
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
    home = os.path.expanduser('~')
    claude_dir = normalize_path_for_comparison(os.path.join(home, '.claude'))

    return norm_file.startswith(claude_dir + '/')


def main() -> None:
    # Read hook input from stdin
    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON input: {e}", file=sys.stderr)
        sys.exit(1)

    tool_name = input_data.get("tool_name", "")
    tool_input = input_data.get("tool_input", {})

    # Only check Edit and Write tools
    if tool_name not in ("Edit", "Write"):
        sys.exit(0)

    file_path = tool_input.get("file_path", "")
    if not file_path:
        sys.exit(0)

    # Get project directory
    project_dir = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())

    # Check for absolute paths
    is_absolute, reason = is_absolute_path(file_path)
    uses_backslashes = has_backslashes(file_path)

    # If path is within the project directory, allow it even if absolute
    # Claude Code internally expands relative paths to absolute
    if is_absolute and is_path_within_project(file_path, project_dir):
        # Still warn about backslashes for consistency
        if uses_backslashes:
            suggestion = file_path.replace('\\', '/')
            print(f"Use forward slashes: '{suggestion}'", file=sys.stderr)
            sys.exit(2)
        sys.exit(0)

    # Also allow Claude Code's internal paths (plans, cache, etc.)
    if is_absolute and is_claude_internal_path(file_path):
        if uses_backslashes:
            suggestion = file_path.replace('\\', '/')
            print(f"Use forward slashes: '{suggestion}'", file=sys.stderr)
            sys.exit(2)
        sys.exit(0)

    if is_absolute or uses_backslashes:
        suggestion = get_relative_suggestion(file_path)
        print(f"Use relative path: '{suggestion}'", file=sys.stderr)
        sys.exit(2)

    sys.exit(0)


if __name__ == "__main__":
    main()
