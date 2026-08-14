#!/usr/bin/env python
"""List recently ingested YouTube videos via Onclave API."""

import argparse
import sys
from datetime import datetime
from typing import Optional

import httpx
from onclave_client import OnclaveClient


def _fmt_date(iso_str: Optional[str]) -> str:
    """Format an ISO datetime string to a short date."""
    if not iso_str:
        return "n/a"
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return dt.strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        return iso_str[:10] if len(iso_str) >= 10 else iso_str


def _tag_suffix(args: argparse.Namespace) -> str:
    if args.all:
        return "&exclude_tags="
    if args.test:
        return "&tags=test&exclude_tags="
    return ""


def _print_item(index: int, item: dict) -> None:
    title = (item.get("title") or "Untitled")[:70]
    metadata = item.get("metadata", {})
    video_id = metadata.get("video_id", "unknown")
    chunks = item.get("chunk_count", 0)
    ingested = _fmt_date(item.get("created_at"))
    published = _fmt_date(metadata.get("published_at"))
    tags = item.get("tags") or metadata.get("tags") or []
    tags_str = f" [{', '.join(tags)}]" if tags else ""
    print(f"  {index:>3}. {title}{tags_str}")
    print(
        f"       https://youtube.com/watch?v={video_id}  "
        f"({chunks} chunks)  ingested: {ingested}  published: {published}"
    )


def run(args: argparse.Namespace) -> None:
    limit = min(max(args.limit, 1), 100)
    path = f"/content?content_type=youtube&limit=100{_tag_suffix(args)}"
    with OnclaveClient(timeout=30.0) as client:
        response = client.get(path)
    if response.status_code != 200:
        print(f"Error: API returned {response.status_code}", file=sys.stderr)
        print(response.text, file=sys.stderr)
        sys.exit(1)
    data = response.json()
    items = data.get("items", [])
    items.sort(key=lambda item: item.get("created_at", ""), reverse=True)
    items = items[:limit]
    if not items:
        print("No videos found.")
        return
    print(f"Last {len(items)} ingested videos:\n")
    for index, item in enumerate(items, 1):
        _print_item(index, item)
    total = data.get("total", len(items))
    print(f"\nShowing {len(items)} of {total} videos")


def main(argv: Optional[list[str]] = None) -> None:
    parser = argparse.ArgumentParser(description="List recently ingested YouTube videos")
    parser.add_argument("limit", nargs="?", type=int, default=10, help="Number of videos to show")
    tag_group = parser.add_mutually_exclusive_group()
    tag_group.add_argument("--all", action="store_true", help="Include test-tagged content")
    tag_group.add_argument("--test", action="store_true", help="Show only test-tagged content")
    try:
        run(parser.parse_args(argv))
    except (RuntimeError, httpx.RequestError) as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
