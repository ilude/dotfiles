#!/usr/bin/env python
# /// script
# requires-python = ">=3.9"
# dependencies = []
# ///
"""
Commit Guard Hook - PostToolUse

Runs after Bash tool calls containing 'git commit'. Checks for untracked
auto-stageable files that should have been included in the commit.

Cannot prevent the commit (PostToolUse runs after), but blocks the tool
output to force the agent to address remaining files before continuing.
"""

import fnmatch
import json
import os
import subprocess
import sys
from pathlib import Path

HOOK_DIR = Path(__file__).parent
SKIP_FILE = HOOK_DIR / "skip-patterns.txt"
LOG_DIR = Path(os.path.expanduser("~")) / ".claude" / "logs" / "commit-guard"

# Extensions considered auto-stageable (source, docs, config)
AUTO_STAGE_EXTENSIONS = {
    ".py", ".js", ".ts", ".tsx", ".jsx",
    ".md", ".rst", ".txt",
    ".yaml", ".yml", ".toml", ".json",
    ".sh", ".bash",
    ".css", ".html",
    ".go", ".rs", ".tf", ".sql",
    ".rb", ".cs", ".csproj", ".sln",
}

# Patterns that should stay untracked (never auto-stage)
EXCLUDE_PATTERNS = [
    ".env", ".env.*",
    "*.log",
    "*.csv", "*.tsv",
    "*.db", "*.sqlite", "*.sqlite3",
    "node_modules/*",
    ".venv/*", "__pycache__/*", "*.pyc",
    "*.egg-info/*", "dist/*", "build/*",
]


def load_skip_patterns():
    """Load user-defined skip patterns from skip-patterns.txt."""
    if not SKIP_FILE.exists():
        return []
    try:
        with open(SKIP_FILE) as f:
            return [
                line.strip()
                for line in f
                if line.strip() and not line.startswith("#")
            ]
    except OSError:
        return []


def is_excluded(file_path, extra_patterns):
    """Check if file matches any exclusion pattern."""
    basename = os.path.basename(file_path)
    for pattern in EXCLUDE_PATTERNS + extra_patterns:
        if fnmatch.fnmatch(basename, pattern):
            return True
        if fnmatch.fnmatch(file_path, pattern):
            return True
    return False


def has_auto_stage_extension(file_path):
    """Check if file has an auto-stageable extension."""
    _, ext = os.path.splitext(file_path)
    return ext.lower() in AUTO_STAGE_EXTENSIONS


def get_untracked_files(cwd):
    """Run git status --porcelain and return untracked file paths."""
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            capture_output=True,
            text=True,
            timeout=5,
            cwd=cwd,
        )
        if result.returncode != 0:
            return []

        untracked = []
        for line in result.stdout.splitlines():
            if line.startswith("?? "):
                # Strip the "?? " prefix and any trailing whitespace
                path = line[3:].strip()
                # Remove trailing slash for directories
                path = path.rstrip("/")
                untracked.append(path)
        return untracked
    except (subprocess.TimeoutExpired, OSError):
        return []


def log_error(message):
    """Log error to error log file."""
    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        log_file = LOG_DIR / "errors.log"
        with open(log_file, "a") as f:
            f.write(f"{message}\n")
    except OSError:
        pass


def main():
    try:
        input_data = json.load(sys.stdin)
    except (json.JSONDecodeError, Exception):
        sys.exit(0)

    # Only trigger on Bash tool calls
    tool_name = input_data.get("tool_name", "")
    if tool_name != "Bash":
        sys.exit(0)

    # Only trigger when command contains 'git commit'
    tool_input = input_data.get("tool_input", {})
    command = tool_input.get("command", "")
    if "git commit" not in command:
        sys.exit(0)

    # Get working directory from hook input
    cwd = input_data.get("cwd", os.getcwd())

    # Get untracked files
    untracked = get_untracked_files(cwd)
    if not untracked:
        sys.exit(0)

    # Load user skip patterns
    skip_patterns = load_skip_patterns()

    # Filter to auto-stageable files that aren't excluded
    missed_files = []
    for file_path in untracked:
        if is_excluded(file_path, skip_patterns):
            continue
        if has_auto_stage_extension(file_path):
            missed_files.append(file_path)

    if not missed_files:
        sys.exit(0)

    # Build block message
    file_list = "\n".join(f"- {f}" for f in sorted(missed_files))
    reason = (
        f"commit-guard: Untracked auto-stageable files remain after commit:\n"
        f"{file_list}\n\n"
        f"You MUST commit ALL auto-stageable files. "
        f"'Not my changes' is not a valid reason to skip.\n"
        f"Either: (1) stage and commit them now, or "
        f"(2) ask the user if they should be .gitignored."
    )

    result = {"decision": "block", "reason": reason}
    print(json.dumps(result))
    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log_error(f"Unhandled exception: {e}")
        sys.exit(0)
