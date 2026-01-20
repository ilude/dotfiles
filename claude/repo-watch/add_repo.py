# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "pyyaml>=6.0",
# ]
# ///
"""Add a repo to tracking with auto-detected category."""

from __future__ import annotations

import argparse
import json
import subprocess
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


def get_repo_files(owner: str, repo: str) -> list[str]:
    """Get list of files from repo using gh API."""
    try:
        # Get root tree
        result = subprocess.run(
            ["gh", "api", f"repos/{owner}/{repo}/git/trees/HEAD", "--jq", ".tree[].path"],
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout.strip().split("\n")
    except subprocess.CalledProcessError:
        return []


def get_repo_description(owner: str, repo: str) -> str:
    """Get repo description from GitHub."""
    try:
        result = subprocess.run(
            ["gh", "api", f"repos/{owner}/{repo}", "--jq", ".description // empty"],
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError:
        return ""


def detect_category(files: list[str], category_mappings: dict[str, Any]) -> tuple[str, float]:
    """Detect repo category based on files present.

    Returns (category, confidence) where confidence is 0.0-1.0.
    """
    scores: dict[str, int] = {}

    for cat_name, cat_config in category_mappings.items():
        indicators = cat_config.get("indicators", [])
        matched = 0
        for indicator in indicators:
            for file in files:
                if indicator in file or file.startswith(indicator.rstrip("/")):
                    matched += 1
                    break
        if matched > 0:
            scores[cat_name] = matched

    if not scores:
        return "unknown", 0.0

    best_cat = max(scores, key=lambda k: scores[k])
    confidence = min(1.0, scores[best_cat] / 3)  # 3+ matches = 100% confidence

    return best_cat, confidence


def add_repo(url: str, category: str | None = None, description: str | None = None) -> dict[str, Any]:
    """Add repo to tracking.

    Returns dict with repo info for JSON output.
    """
    config = load_repos()
    repos = config.get("repos", [])
    category_mappings = config.get("category_mappings", {})

    # Check if already tracked
    for existing in repos:
        if existing["url"] == url:
            return {"error": f"Repo already tracked: {url}", "existing": existing}

    owner, repo = parse_repo_url(url)

    # Get repo info from GitHub
    files = get_repo_files(owner, repo)
    gh_description = get_repo_description(owner, repo)

    # Auto-detect category if not provided
    detected_category = None
    confidence = 0.0
    if not category:
        detected_category, confidence = detect_category(files, category_mappings)
        category = detected_category if detected_category != "unknown" else None

    # Use provided description, or GitHub description
    final_description = description or gh_description

    result = {
        "owner": owner,
        "repo": repo,
        "url": url,
        "category": category,
        "detected_category": detected_category,
        "detection_confidence": confidence,
        "description": final_description,
        "key_files": files[:20],  # First 20 files
    }

    if not category:
        # Don't add if we couldn't determine category
        result["error"] = "Could not auto-detect category. Please specify --category."
        return result

    # Add to config
    new_entry = {
        "url": url,
        "category": category,
        "description": final_description,
        "last_reviewed_commit": None,
        "last_reviewed_at": None,
        "ignored_features": [],
    }
    repos.append(new_entry)
    config["repos"] = repos

    save_repos(config)
    result["added"] = True

    return result


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Add a repo to tracking")
    parser.add_argument("url", help="GitHub repo URL")
    parser.add_argument("--category", help="Category (auto-detected if not provided)")
    parser.add_argument("--description", help="Description (uses GitHub description if not provided)")
    args = parser.parse_args()

    result = add_repo(args.url, args.category, args.description)
    print(json.dumps(result, indent=2))

    if result.get("error"):
        sys.exit(1)


if __name__ == "__main__":
    main()
