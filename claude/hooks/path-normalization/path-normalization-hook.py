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

BEHAVIOR:
- Deterministic fixes (backslashes, absolute within project/home): Uses
  `updatedInput` to transparently fix the path with zero retry latency.
- Ambiguous cases (absolute outside project): Blocks and suggests filename,
  requiring Claude to clarify intent.

SIMPLE RULES:
1. ~\\... → ~/...  (fix backslashes in home-relative paths)
2. UNC within project → relative to cwd (string-based, no network I/O)
3. UNC outside project → block with filename suggestion
4. Absolute within cwd → relative to cwd (transparent fix)
5. Absolute within home → ~/ path (transparent fix)
6. Absolute outside both → block with filename suggestion

This hook uses the PreToolUse `updatedInput` feature to transparently fix paths
where the correction is unambiguous, avoiding retry loops. For ambiguous cases,
it blocks and provides context via `additionalContext`.

Exit codes:
  0 = Allow/Fix (path format is safe or was transparently fixed)
  1 = Error (invalid JSON input)
  2 = Block (stderr fed back to Claude with correct path suggestion)

References:
  - https://code.claude.com/docs/en/hooks (updatedInput feature)
  - https://github.com/anthropics/claude-code/issues/4368 (feature request)
"""

import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

HOOK_NAME = "path-normalization"
BACKSLASH = chr(92)

# Pre-compiled regex patterns for performance (~40% faster than inline re.match)
WINDOWS_DRIVE_RE = re.compile(r"^([A-Za-z]):")
MSYS_WSL_CYGWIN_RE = re.compile(r"^(?:/mnt|/cygdrive)?/([a-zA-Z])/(.*)")
UNC_RE = re.compile(r"^[/\\]{2}")


# ============================================================================
# AUDIT LOGGING
# ============================================================================


def get_log_path() -> Path:
    """Get path to daily audit log file.

    Creates ~/.claude/logs/path-normalization/ directory if it doesn't exist.
    Returns path in format: ~/.claude/logs/path-normalization/YYYY-MM-DD.log
    """
    logs_dir = Path(os.path.expanduser("~")) / ".claude" / "logs" / "path-normalization"
    logs_dir.mkdir(parents=True, exist_ok=True)
    date_str = datetime.now().strftime("%Y-%m-%d")
    return logs_dir / f"{date_str}.log"


def log_decision(
    tool_name: str,
    file_path: str,
    decision: str,
    reason: str = "",
    suggested_path: str = "",
) -> None:
    """Log path normalization decision to audit log in JSONL format.

    Args:
        tool_name: Name of the tool (Edit or Write).
        file_path: Original file path from tool input.
        decision: "allowed", "fixed", or "blocked".
        reason: Why the path was fixed/blocked.
        suggested_path: Corrected path (if fixed/blocked).
    """
    try:
        log_path = get_log_path()
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "tool": tool_name,
            "file_path": file_path,
            "decision": decision,
            "reason": reason,
            "suggested_path": suggested_path,
            "cwd": os.getcwd(),
            "session_id": os.getenv("CLAUDE_SESSION_ID", ""),
        }
        with open(log_path, "a") as f:
            f.write(json.dumps(log_entry) + "\n")
    except Exception:
        pass  # Never crash the hook due to logging failure


def is_hook_disabled() -> bool:
    disabled = os.environ.get("CLAUDE_DISABLE_HOOKS", "")
    return HOOK_NAME in [h.strip() for h in disabled.split(",")]


def normalize_separators(path_str: str) -> str:
    """Convert backslashes to forward slashes for consistent path handling.

    Critical for Unix/WSL: Path("C:\\path\\file").name returns the entire string
    because backslashes aren't recognized as separators. Normalizing first ensures
    Path operations work correctly regardless of input format.
    """
    return path_str.replace(BACKSLASH, "/")


def to_windows_path(path_str: str) -> str:
    """Convert MSYS (/c/), WSL (/mnt/c/), Cygwin (/cygdrive/c/), or backslash paths
    to Windows (C:/).

    Also normalizes backslashes to forward slashes for consistent handling.
    """
    # First normalize backslashes to forward slashes
    normalized = normalize_separators(path_str)
    # Handle MSYS/WSL/Cygwin style paths (uses pre-compiled regex)
    match = MSYS_WSL_CYGWIN_RE.match(normalized)
    return f"{match.group(1).upper()}:/{match.group(2)}" if match else normalized


def get_windows_home(win_path: str) -> Path:
    """Get the Windows home directory for path comparison.

    When running in WSL, os.path.expanduser('~') returns the WSL home (/home/user),
    not the Windows home (C:/Users/user). This function detects the correct home
    based on the path being checked and environment variables.

    Priority:
    1. USERPROFILE environment variable (set by Windows)
    2. WINHOME environment variable (set by dotfiles for WSL)
    3. Extract from path if it contains /Users/ pattern
    4. Fall back to os.path.expanduser('~')
    """
    # Try USERPROFILE first (Windows sets this)
    userprofile = os.environ.get("USERPROFILE")
    if userprofile:
        return Path(to_windows_path(userprofile)).resolve()

    # Try WINHOME (set by dotfiles zsh config for WSL)
    winhome = os.environ.get("WINHOME")
    if winhome:
        return Path(to_windows_path(winhome)).resolve()

    # Extract from the path itself if it contains Windows user directory pattern
    # Matches: C:/Users/username/..., /mnt/c/Users/username/..., /c/Users/username/...
    normalized = normalize_separators(win_path)
    user_match = re.match(r"^(?:[A-Za-z]:|/mnt/[a-z]|/[a-z])?/[Uu]sers/([^/]+)/", normalized)
    if user_match:
        username = user_match.group(1)
        # Determine the drive letter from the path
        drive_match = re.match(r"^([A-Za-z]):", normalized)
        if drive_match:
            drive = drive_match.group(1).upper()
        else:
            # Default to C: for MSYS/WSL paths
            drive = "C"
        return Path(f"{drive}:/Users/{username}").resolve()

    # Fall back to standard expanduser (works correctly on native Windows)
    return Path(os.path.expanduser("~")).resolve()


def is_unc_path(path: str) -> bool:
    """Check if path is UNC (//server or \\\\server) without triggering network I/O."""
    if len(path) < 3:
        return False
    # Uses pre-compiled regex for consistency (though simple check is fine here)
    return UNC_RE.match(path) is not None


def is_absolute(path: str) -> bool:
    """Check if path is absolute (Windows, MSYS, WSL, UNC).

    Uses pre-compiled regex patterns for ~40% faster detection.
    """
    if not path:
        return False
    # UNC paths (//server or \\server)
    if UNC_RE.match(path):
        return True
    # Windows drive letter (C:/ or C:\) - must check explicitly because
    # Path("C:/...").is_absolute() returns False on Unix/WSL
    if WINDOWS_DRIVE_RE.match(path):
        return True
    return Path(to_windows_path(path)).is_absolute()


def is_within(child: Path, parent: Path) -> bool:
    """Check if child path is within parent directory (case-insensitive on Windows)."""
    try:
        child_norm = os.path.normcase(str(child.resolve()))
        parent_norm = os.path.normcase(str(parent.resolve()))
        return child_norm.startswith(parent_norm + os.sep) or child_norm == parent_norm
    except (ValueError, OSError):
        return False


def fix_and_allow(tool_name: str, file_path: str, fixed_path: str, reason: str) -> None:
    """Transparently fix the path using updatedInput and allow the operation.

    This avoids retry loops by fixing deterministic path issues in-place.
    Uses the PreToolUse `updatedInput` feature (Claude Code v2.0.10+).

    Args:
        tool_name: Name of the tool (Edit or Write).
        file_path: Original file path from tool input.
        fixed_path: Corrected path to use.
        reason: Why the path was fixed (for logging).
    """
    log_decision(tool_name, file_path, "fixed", reason, fixed_path)
    output = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "allow",
            "permissionDecisionReason": f"Path auto-corrected: {reason}",
            "updatedInput": {"file_path": fixed_path},
            "additionalContext": (
                f"Path '{file_path}' was auto-corrected to '{fixed_path}' ({reason})."
            ),
        }
    }
    print(json.dumps(output))
    sys.exit(0)


def block(tool_name: str, file_path: str, reason: str, suggested: str) -> None:
    """Exit with block status and error message, logging the decision.

    Used for ambiguous cases where we can't deterministically fix the path
    (e.g., absolute path outside project - we don't know where user wants it).
    Includes additionalContext to help Claude understand why.
    """
    log_decision(tool_name, file_path, "blocked", reason, suggested)
    # Format message based on the type of issue
    if "backslash" in reason:
        msg = f"Use forward slashes: '{suggested}'"
    elif suggested.startswith("~/"):
        msg = f"Use home-relative path: '{suggested}'"
    elif "UNC" in reason:
        msg = f"UNC paths not supported. Use relative path: '{suggested}'"
    else:
        msg = f"Use relative path: '{suggested}'"
    print(msg, file=sys.stderr)
    sys.exit(2)


def _build_project_roots() -> tuple[list[Path], Path]:
    """Return (project_roots, cwd_resolved) for absolute path resolution."""
    project_dir = os.environ.get("CLAUDE_PROJECT_DIR", "")
    actual_cwd = os.getcwd()
    roots: list[Path] = []
    if project_dir:
        roots.append(Path(to_windows_path(project_dir)).resolve())
    cwd_resolved = Path(to_windows_path(actual_cwd)).resolve()
    if not roots or cwd_resolved != roots[0]:
        roots.append(cwd_resolved)
    return roots, cwd_resolved


def _is_within_any(fp: Path, roots: list[Path]) -> bool:
    return any(is_within(fp, root) for root in roots)


def _best_root(fp: Path, roots: list[Path], fallback: Path) -> Path:
    for root in reversed(roots):
        if is_within(fp, root):
            return root
    return fallback


def _handle_unc(tool_name: str, path_str: str) -> None:
    """CASE 3: UNC paths — fix if within project, block otherwise."""
    normalized = normalize_separators(path_str)
    cwd_str = normalize_separators(os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())).rstrip("/")
    if normalized.lower().startswith(cwd_str.lower() + "/"):
        relative = normalized[len(cwd_str) + 1 :]
        if not relative or relative == "/":
            log_decision(tool_name, path_str, "allowed", "UNC path is project root")
            sys.exit(0)
        fix_and_allow(tool_name, path_str, relative, "UNC path within project")
    filename = normalized.rsplit("/", 1)[-1]
    block(tool_name, path_str, "UNC path outside project", filename)


def _handle_absolute_in_home(
    tool_name: str,
    path_str: str,
    file_path: Path,
    home: Path,
    roots: list[Path],
    cwd: Path,
) -> None:
    """Handle absolute path that is within the home directory."""
    home_relative = str(file_path.relative_to(home)).replace(BACKSLASH, "/")
    if home_relative.startswith("."):
        fix_and_allow(tool_name, path_str, f"~/{home_relative}", "absolute dotfile path")
    if _is_within_any(file_path, roots):
        root = _best_root(file_path, roots, cwd)
        relative = str(file_path.relative_to(root)).replace(BACKSLASH, "/")
        if "/" not in relative:
            log_decision(tool_name, path_str, "allowed", "file in cwd (filename only)")
            sys.exit(0)
        fix_and_allow(tool_name, path_str, relative, "absolute path within project")
    fix_and_allow(tool_name, path_str, f"~/{home_relative}", "absolute path within home")


def _handle_absolute(tool_name: str, path_str: str) -> None:
    """CASE 6: Absolute path — fix if within project/home, block if outside."""
    win_path = to_windows_path(path_str)
    file_path = Path(win_path).resolve()
    home = get_windows_home(win_path)
    roots, cwd = _build_project_roots()

    if is_within(file_path, home):
        _handle_absolute_in_home(tool_name, path_str, file_path, home, roots, cwd)

    if _is_within_any(file_path, roots):
        root = _best_root(file_path, roots, cwd)
        relative = str(file_path.relative_to(root)).replace(BACKSLASH, "/")
        if "/" not in relative:
            log_decision(tool_name, path_str, "allowed", "file in cwd (filename only)")
            sys.exit(0)
        fix_and_allow(tool_name, path_str, relative, "absolute path within project")

    normalized = normalize_separators(path_str)
    filename = normalized.rsplit("/", 1)[-1]
    block(tool_name, path_str, "absolute path outside project/home", filename)


def _parse_hook_input() -> tuple[str, str]:
    """Parse stdin JSON and return (tool_name, path_str), or exit on invalid input."""
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(1)
    tool_name = data.get("tool_name", "")
    if tool_name not in ("Edit", "Write"):
        sys.exit(0)
    tool_input = data.get("tool_input")
    if not isinstance(tool_input, dict):
        sys.exit(0)
    path_str = tool_input.get("file_path", "")
    if not path_str or not isinstance(path_str, str):
        sys.exit(0)
    return tool_name, path_str


def _handle_plan_file(tool_name: str, path_str: str, normalized: str) -> None:
    """CASE 0: Allow plan files without normalization."""
    if ".claude/plans/" in normalized or normalized.endswith(".claude/plans"):
        log_decision(tool_name, path_str, "allowed", "plan file path")
        sys.exit(0)


def _handle_home_relative(tool_name: str, path_str: str, has_backslash: bool) -> None:
    """CASE 1: Home-relative paths (~/ or ~\\)."""
    if not (path_str.startswith("~/") or path_str.startswith("~" + BACKSLASH)):
        return
    if has_backslash:
        fix_and_allow(
            tool_name,
            path_str,
            path_str.replace(BACKSLASH, "/"),
            "backslash in home-relative path",
        )
    log_decision(tool_name, path_str, "allowed", "home-relative path")
    sys.exit(0)


def _handle_unix_system(tool_name: str, path_str: str) -> None:
    """CASE 2: Unix system paths — allow for WSL compatibility."""
    if path_str.startswith(("/dev/", "/proc/", "/tmp/", "/var/")):
        log_decision(tool_name, path_str, "allowed", "unix system path")
        sys.exit(0)


def _handle_relative_backslash(
    tool_name: str, path_str: str, is_abs: bool, has_backslash: bool
) -> None:
    """CASE 4: Relative path with backslashes — fix transparently."""
    if not is_abs and has_backslash:
        fix_and_allow(
            tool_name,
            path_str,
            path_str.replace(BACKSLASH, "/"),
            "backslash in relative path",
        )


def main() -> None:
    if is_hook_disabled():
        sys.exit(0)

    tool_name, path_str = _parse_hook_input()
    normalized = normalize_separators(path_str)
    has_backslash = BACKSLASH in path_str

    _handle_plan_file(tool_name, path_str, normalized)
    _handle_home_relative(tool_name, path_str, has_backslash)
    _handle_unix_system(tool_name, path_str)

    is_abs = is_absolute(path_str)

    if is_unc_path(path_str):
        _handle_unc(tool_name, path_str)

    _handle_relative_backslash(tool_name, path_str, is_abs, has_backslash)

    if not is_abs:
        log_decision(tool_name, path_str, "allowed", "clean relative path")
        sys.exit(0)

    _handle_absolute(tool_name, path_str)


if __name__ == "__main__":
    main()
