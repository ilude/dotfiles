# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "pyyaml>=6.0",
# ]
# ///
"""Update ignored_features for a repo."""

from __future__ import annotations

import argparse
import json
import sys
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


def update_ignored(
    repo_identifier: str,
    add: list[str] | None = None,
    remove: list[str] | None = None,
    set_list: list[str] | None = None,
) -> dict[str, Any]:
    """Update ignored_features for a repo.

    Args:
        repo_identifier: owner/repo
        add: Features to add to ignored list
        remove: Features to remove from ignored list
        set_list: Replace entire list with these features

    Returns:
        Dict with updated ignored_features.
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

    current = set(repo_config.get("ignored_features", []))

    if set_list is not None:
        # Replace entire list
        current = set(set_list)
    else:
        if add:
            current.update(add)
        if remove:
            current -= set(remove)

    # Sort for consistent output
    repo_config["ignored_features"] = sorted(current)
    save_repos(config)

    return {
        "owner": owner,
        "repo": repo,
        "ignored_features": repo_config["ignored_features"],
        "updated": True,
    }


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Update ignored features for a repo")
    parser.add_argument("repo", help="Repo identifier (owner/repo)")
    parser.add_argument("--add", nargs="+", help="Features to add to ignored list")
    parser.add_argument("--remove", nargs="+", help="Features to remove from ignored list")
    parser.add_argument("--set", nargs="+", dest="set_list", help="Replace entire list")
    args = parser.parse_args()

    result = update_ignored(args.repo, add=args.add, remove=args.remove, set_list=args.set_list)
    print(json.dumps(result, indent=2))

    if result.get("error"):
        sys.exit(1)


if __name__ == "__main__":
    main()
