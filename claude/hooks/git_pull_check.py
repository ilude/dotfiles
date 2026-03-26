#!/usr/bin/env python
# SessionStart hook: warn about repo sync status and uncommitted changes
import json
import os
import subprocess
import sys


def run(args: list, cwd: str = None, timeout: int = 10) -> tuple[int, str]:
    try:
        r = subprocess.run(args, capture_output=True, text=True, cwd=cwd, timeout=timeout)
        return r.returncode, r.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return 1, ""


def main() -> None:
    try:
        json.load(sys.stdin)
    except Exception:
        pass

    cwd = os.getcwd()

    # Skip if not in a git repo
    rc, _ = run(["git", "rev-parse", "--is-inside-work-tree"], cwd=cwd)
    if rc != 0:
        return

    rc, branch = run(["git", "symbolic-ref", "--short", "HEAD"], cwd=cwd)
    if rc != 0:
        return

    warnings = []

    # Check for uncommitted local changes
    _, staged = run(["git", "diff", "--cached", "--name-only"], cwd=cwd)
    _, unstaged = run(["git", "diff", "--name-only"], cwd=cwd)
    _, untracked_out = run(["git", "ls-files", "--others", "--exclude-standard"], cwd=cwd)

    n_staged = len(staged.splitlines()) if staged else 0
    n_unstaged = len(unstaged.splitlines()) if unstaged else 0
    n_untracked = len(untracked_out.splitlines()) if untracked_out else 0

    if n_staged or n_unstaged or n_untracked:
        parts = []
        if n_staged:
            parts.append(f"{n_staged} staged")
        if n_unstaged:
            parts.append(f"{n_unstaged} modified")
        if n_untracked:
            parts.append(f"{n_untracked} untracked")
        summary = ", ".join(parts)
        warnings.append(
            f"Uncommitted changes on '{branch}': {summary}."
            " Consider committing before starting new work."
        )

    # Fetch remote state (quiet, 10s timeout)
    run(["git", "fetch", "--quiet"], cwd=cwd, timeout=10)

    # Check if branch is behind/ahead of remote
    rc, upstream = run(["git", "rev-parse", "--abbrev-ref", "@{upstream}"], cwd=cwd)
    if rc == 0 and upstream:
        _, local_hash = run(["git", "rev-parse", "HEAD"], cwd=cwd)
        _, remote_hash = run(["git", "rev-parse", upstream], cwd=cwd)

        if remote_hash and local_hash != remote_hash:
            _, behind_out = run(["git", "rev-list", "--count", f"HEAD..{upstream}"], cwd=cwd)
            _, ahead_out = run(["git", "rev-list", "--count", f"{upstream}..HEAD"], cwd=cwd)
            behind = int(behind_out) if behind_out.isdigit() else 0
            ahead = int(ahead_out) if ahead_out.isdigit() else 0

            if behind > 0 and ahead > 0:
                warnings.append(
                    f"Branch '{branch}' has diverged from '{upstream}'"
                    f" ({ahead} ahead, {behind} behind). Consider: git pull --rebase"
                )
            elif behind > 0:
                warnings.append(
                    f"Branch '{branch}' is {behind} commit(s) behind '{upstream}'. Run: git pull"
                )

    for w in warnings:
        print(f"\u26a0\ufe0f  {w}")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
