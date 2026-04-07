# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "pyyaml>=6.0",
# ]
# ///
"""List tracked repos with status from GitHub."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import yaml


def get_repos_yaml_path() -> Path:
    """Get path to repos.yaml."""
    return Path(__file__).parent / "repos.yaml"


def load_repos() -> dict[str, Any]:
    """Load repos.yaml configuration."""
    path = get_repos_yaml_path()
    if not path.exists():
        print(f"Error: {path} not found", file=sys.stderr)
        sys.exit(1)
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def parse_repo_url(url: str) -> tuple[str, str]:
    """Parse GitHub URL into owner/repo."""
    # Handle various GitHub URL formats
    url = url.rstrip("/")
    if url.endswith(".git"):
        url = url[:-4]
    parts = url.split("/")
    return parts[-2], parts[-1]


def get_latest_commit(owner: str, repo: str) -> dict[str, Any] | None:
    """Get latest commit info from GitHub API."""
    try:
        result = subprocess.run(
            [
                "gh",
                "api",
                f"repos/{owner}/{repo}/commits/HEAD",
                "--jq",
                ".sha,.commit.committer.date",
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        lines = result.stdout.strip().split("\n")
        if len(lines) >= 2:
            return {"sha": lines[0], "date": lines[1]}
    except subprocess.CalledProcessError:
        return None
    return None


def format_date(date_str: str | None) -> str:
    """Format ISO date string for display."""
    if not date_str:
        return "never"
    try:
        dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        return dt.strftime("%Y-%m-%d")
    except (ValueError, AttributeError):
        return str(date_str)


def _repo_has_updates(latest: dict[str, Any] | None, last_reviewed: str | None) -> bool:
    if latest and last_reviewed:
        return latest["sha"] != last_reviewed
    return bool(latest)


def _build_repo_result(repo_config: dict[str, Any]) -> dict[str, Any]:
    url = repo_config["url"]
    owner, repo = parse_repo_url(url)
    latest = get_latest_commit(owner, repo)
    last_reviewed = repo_config.get("last_reviewed_commit")
    return {
        "owner": owner,
        "repo": repo,
        "url": url,
        "category": repo_config.get("category", "unknown"),
        "description": repo_config.get("description", ""),
        "last_reviewed_commit": last_reviewed,
        "last_reviewed_at": repo_config.get("last_reviewed_at"),
        "latest_commit": latest["sha"][:8] if latest else None,
        "latest_commit_date": latest["date"] if latest else None,
        "has_updates": _repo_has_updates(latest, last_reviewed),
        "ignored_features_count": len(repo_config.get("ignored_features", [])),
    }


_STATUS_COLORS = {
    "NEW": "\033[33m",
    "UPDATES": "\033[36m",
}
_COLOR_GREEN = "\033[32m"
_COLOR_RESET = "\033[0m"


def _status_str(r: dict[str, Any]) -> str:
    if r["has_updates"] and not r["last_reviewed_commit"]:
        label = "NEW"
    elif r["has_updates"]:
        label = "UPDATES"
    else:
        label = "current"
    color = _STATUS_COLORS.get(label, _COLOR_GREEN)
    return f"{color}{label:<12}{_COLOR_RESET}"


def _print_table(results: list[dict[str, Any]]) -> None:
    if not results:
        print("No repos tracked. Use 'add_repo.py' to add repos.")
        return
    print(f"{'Repo':<40} {'Category':<15} {'Status':<12} {'Last Review':<12} {'Latest':<12}")
    print("-" * 95)
    for r in results:
        name = f"{r['owner']}/{r['repo']}"
        if len(name) > 38:
            name = name[:35] + "..."
        last_review = format_date(r["last_reviewed_at"])
        latest = format_date(r["latest_commit_date"])
        print(f"{name:<40} {r['category']:<15} {_status_str(r)} {last_review:<12} {latest:<12}")
    print()
    print(f"Total: {len(results)} repos tracked")


def list_repos(json_output: bool = False) -> None:
    """List all tracked repos with status."""
    config = load_repos()
    results = [_build_repo_result(rc) for rc in config.get("repos", [])]

    if json_output:
        print(json.dumps(results, indent=2))
        return

    _print_table(results)


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(description="List tracked repos")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    args = parser.parse_args()

    list_repos(json_output=args.json)


if __name__ == "__main__":
    main()
