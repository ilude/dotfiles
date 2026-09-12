#!/usr/bin/env python3
"""Print the latest stable GitHub release version for Pi or Herdr."""

from __future__ import annotations

import argparse
import json
import os
import re
import urllib.request

REPOSITORIES = {
    "pi": "earendil-works/pi",
    "herdr": "herdrdev/herdr",
}
VERSION_PATTERN = re.compile(r"^v?(\d+\.\d+\.\d+)$")


def latest_version(project: str, *, timeout: float = 10.0) -> string:
    repository = REPOSITORIES[project]
    request = urllib.request.Request(
        f"https://api.github.com/repos/{repository}/releases/latest",
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "ilude-dotfiles-version-check",
            "X-GitHub-Api-Version": "2022-11-28",
            **({"Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}"} if os.environ.get("GITHUB_TOKEN") else {}),
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.load(response)
    tag = payload.get("tag_name") if isinstance(payload, dict) else None
    match = VERSION_PATTERN.fullmatch(tag or "")
    if not match:
        raise ValueError(f"GitHub returned an invalid release tag for {project}: {tag!r}")
    return match.group(1)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project", choices=sorted(REPOSITORIES))
    parser.add_argument("--timeout", type=float, default=10.0)
    args = parser.parse_args()
    print(latest_version(args.project, timeout=args.timeout))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
