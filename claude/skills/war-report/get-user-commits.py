#!/usr/bin/env python
"""
Get git commits for the current user with exact email matching.

Usage:
    python get-user-commits.py <repo_path> <since_date> <until_date>

Example:
    python get-user-commits.py /c/Projects/Work/Gitlab/eisa "2026-01-12" "2026-01-18 23:59:59"
"""

import subprocess
import sys
from pathlib import Path


def get_user_email(repo_path: Path) -> str:
    """Get the git user email from config."""
    result = subprocess.run(
        ["git", "config", "user.email"],
        cwd=repo_path,
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def get_commits(repo_path: Path, since: str, until: str, user_email: str) -> list[str]:
    """
    Get commits from repo with exact email matching.

    Returns list of commit messages (one-line format).
    """
    # Use format that includes email so we can filter exactly
    # Format: hash<TAB>author_email<TAB>subject
    result = subprocess.run(
        [
            "git",
            "log",
            f"--since={since}",
            f"--until={until}",
            "--all",
            "--format=%h\t%ae\t%s",
        ],
        cwd=repo_path,
        capture_output=True,
        text=True,
        check=True,
    )

    # Filter to exact email matches
    commits = []
    for line in result.stdout.strip().split("\n"):
        if not line:
            continue

        parts = line.split("\t", 2)
        if len(parts) != 3:
            continue

        commit_hash, author_email, subject = parts

        # Exact email match only
        if author_email == user_email:
            commits.append(f"{commit_hash} {subject}")

    return commits


def main():
    if len(sys.argv) != 4:
        print("Usage: get-user-commits.py <repo_path> <since_date> <until_date>", file=sys.stderr)
        sys.exit(1)

    repo_path = Path(sys.argv[1])
    since = sys.argv[2]
    until = sys.argv[3]

    if not repo_path.is_dir():
        print(f"Error: {repo_path} is not a directory", file=sys.stderr)
        sys.exit(1)

    try:
        user_email = get_user_email(repo_path)
        commits = get_commits(repo_path, since, until, user_email)

        # Print commits (one per line)
        for commit in commits:
            print(commit)

    except subprocess.CalledProcessError as e:
        print(f"Git command failed: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
