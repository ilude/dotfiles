# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "pyyaml>=6.0",
# ]
# ///
"""Mark a repo as reviewed at the current commit."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
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


def save_repos(config: dict[str, Any]) -> None:
    """Save repos.yaml configuration."""
    path = get_repos_yaml_path()
    path.write_text(yaml.dump(config, default_flow_style=False, sort_keys=False), encoding="utf-8")


def parse_repo_url(url: str) -> tuple[str, str]:
    """Parse GitHub URL into owner/repo."""
    url = url.rstrip("/")
    if url.endswith(".git"):
        url = url[:-4]
    parts = url.split("/")
    return parts[-2], parts[-1]


def find_repo_config(repos: list[dict[str, Any]], owner: str, repo: str) -> dict[str, Any] | None:
    """Find repo config by owner/repo."""
    search = f"{owner}/{repo}".lower()
    for r in repos:
        o, n = parse_repo_url(r["url"])
        if f"{o}/{n}".lower() == search:
            return r
    return None


def get_latest_commit(owner: str, repo: str) -> str | None:
    """Get latest commit SHA from GitHub."""
    try:
        result = subprocess.run(
            ["gh", "api", f"repos/{owner}/{repo}/commits/HEAD", "--jq", ".sha"],
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError:
        return None


def mark_reviewed(repo_identifier: str, commit: str | None = None) -> dict[str, Any]:
    """Mark repo as reviewed.

    Args:
        repo_identifier: owner/repo
        commit: Optional specific commit SHA. If not provided, uses latest from GitHub.

    Returns:
        Dict with update status.
    """
    config = load_repos()
    repos = config.get("repos", [])

    # Parse identifier
    parts = repo_identifier.split("/")
    if len(parts) != 2:
        return {"error": f"Invalid repo identifier: {repo_identifier}"}
    owner, repo = parts

    # Find in config
    repo_config = find_repo_config(repos, owner, repo)
    if not repo_config:
        return {"error": f"Repo not tracked: {owner}/{repo}"}

    # Get commit
    if not commit:
        commit = get_latest_commit(owner, repo)
        if not commit:
            return {"error": f"Could not get latest commit for {owner}/{repo}"}

    # Update
    repo_config["last_reviewed_commit"] = commit
    repo_config["last_reviewed_at"] = datetime.now(timezone.utc).isoformat()
    save_repos(config)

    return {
        "owner": owner,
        "repo": repo,
        "last_reviewed_commit": commit,
        "last_reviewed_at": repo_config["last_reviewed_at"],
        "updated": True,
    }


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Mark a repo as reviewed")
    parser.add_argument("repo", help="Repo identifier (owner/repo)")
    parser.add_argument("--commit", help="Specific commit SHA (default: latest from GitHub)")
    args = parser.parse_args()

    result = mark_reviewed(args.repo, commit=args.commit)
    print(json.dumps(result, indent=2))

    if result.get("error"):
        sys.exit(1)


if __name__ == "__main__":
    main()
