# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "pyyaml>=6.0",
# ]
# ///
"""Analyze a repo and output features for review."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml


def get_repos_yaml_path() -> Path:
    """Get path to repos.yaml."""
    return Path(__file__).parent / "repos.yaml"


def get_cache_dir() -> Path:
    """Get cache directory for cloned repos."""
    cache = Path(os.path.expanduser("~/.cache/repo-watch"))
    cache.mkdir(parents=True, exist_ok=True)
    return cache


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


def clone_or_update_repo(url: str, owner: str, repo: str) -> Path:
    """Clone or update repo in cache."""
    cache_dir = get_cache_dir()
    repo_dir = cache_dir / owner / repo

    if repo_dir.exists():
        # Update existing
        subprocess.run(
            ["git", "-C", str(repo_dir), "fetch", "--quiet"],
            check=True,
            capture_output=True,
        )
        subprocess.run(
            ["git", "-C", str(repo_dir), "reset", "--hard", "origin/HEAD", "--quiet"],
            check=True,
            capture_output=True,
        )
    else:
        # Clone new
        repo_dir.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            ["git", "clone", "--depth=1", "--quiet", url, str(repo_dir)],
            check=True,
            capture_output=True,
        )

    return repo_dir


def get_current_commit(repo_dir: Path) -> str:
    """Get current commit SHA."""
    result = subprocess.run(
        ["git", "-C", str(repo_dir), "rev-parse", "HEAD"],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def get_repo_files(repo_dir: Path) -> list[str]:
    """Get list of all files in repo."""
    result = subprocess.run(
        ["git", "-C", str(repo_dir), "ls-files"],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip().split("\n")


def review_repo(repo_identifier: str, mark_reviewed: bool = False) -> dict[str, Any]:
    """Analyze repo and return info for Claude to review.

    Args:
        repo_identifier: Either owner/repo or full URL
        mark_reviewed: If True, update last_reviewed fields

    Returns:
        Dict with repo info, files, and ignored_features to filter.
    """
    config = load_repos()
    repos = config.get("repos", [])

    # Parse identifier
    if "github.com" in repo_identifier:
        owner, repo = parse_repo_url(repo_identifier)
        url = repo_identifier
    else:
        parts = repo_identifier.split("/")
        if len(parts) != 2:
            return {"error": f"Invalid repo identifier: {repo_identifier}"}
        owner, repo = parts
        url = f"https://github.com/{owner}/{repo}"

    # Find in config
    repo_config = find_repo_config(repos, owner, repo)
    if not repo_config:
        return {"error": f"Repo not tracked: {owner}/{repo}. Use add_repo.py first."}

    # Clone or update
    try:
        repo_dir = clone_or_update_repo(url, owner, repo)
    except subprocess.CalledProcessError as e:
        return {"error": f"Failed to clone/update repo: {e}"}

    current_commit = get_current_commit(repo_dir)
    files = get_repo_files(repo_dir)

    result = {
        "owner": owner,
        "repo": repo,
        "url": url,
        "category": repo_config.get("category"),
        "description": repo_config.get("description"),
        "local_path": str(repo_dir),
        "current_commit": current_commit,
        "last_reviewed_commit": repo_config.get("last_reviewed_commit"),
        "files": files,
        "ignored_features": repo_config.get("ignored_features", []),
    }

    if mark_reviewed:
        # Update config
        repo_config["last_reviewed_commit"] = current_commit
        repo_config["last_reviewed_at"] = datetime.now(timezone.utc).isoformat()
        save_repos(config)
        result["marked_reviewed"] = True

    return result


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Review a tracked repo")
    parser.add_argument("repo", help="Repo identifier (owner/repo or URL)")
    parser.add_argument(
        "--mark-reviewed", action="store_true", help="Mark as reviewed after output"
    )
    args = parser.parse_args()

    result = review_repo(args.repo, mark_reviewed=args.mark_reviewed)
    print(json.dumps(result, indent=2))

    if result.get("error"):
        sys.exit(1)


if __name__ == "__main__":
    main()
