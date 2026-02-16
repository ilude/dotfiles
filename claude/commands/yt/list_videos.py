#!/usr/bin/env python
"""List recently ingested YouTube videos via menos API."""

import argparse
import sys
from datetime import datetime
from pathlib import Path

import httpx

from api_config import get_api_base, get_api_host
from signing import RequestSigner


def _fmt_date(iso_str: str | None) -> str:
    """Format an ISO datetime string to a short date."""
    if not iso_str:
        return "n/a"
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return dt.strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        return iso_str[:10] if len(iso_str) >= 10 else iso_str


def main():
    parser = argparse.ArgumentParser(description="List recently ingested YouTube videos")
    parser.add_argument(
        "limit", nargs="?", type=int, default=10,
        help="Number of videos to show (default: 10, max: 100)",
    )

    # Tag filtering flags
    tag_group = parser.add_mutually_exclusive_group()
    tag_group.add_argument(
        "--all", action="store_true",
        help="Include test-tagged content (default: test content excluded)",
    )
    tag_group.add_argument(
        "--test", action="store_true",
        help="Show only test-tagged content",
    )

    args = parser.parse_args()
    limit = min(max(args.limit, 1), 100)

    # Load SSH key
    ssh_key_path = Path.home() / ".ssh" / "id_ed25519"
    if not ssh_key_path.exists():
        print(f"Error: SSH key not found at {ssh_key_path}", file=sys.stderr)
        sys.exit(1)

    try:
        signer = RequestSigner.from_file(ssh_key_path)
    except Exception as e:
        print(f"Error loading SSH key: {e}", file=sys.stderr)
        sys.exit(1)

    api_base = get_api_base()
    host = get_api_host()

    # Fetch max from API (it doesn't support ORDER BY), sort client-side,
    # then truncate to requested limit
    fetch_limit = 100
    path = f"/api/v1/content?content_type=youtube&limit={fetch_limit}"
    if args.all:
        path += "&exclude_tags="
    elif args.test:
        path += "&tags=test&exclude_tags="
    # Default: exclude_tags=test (handled by API default)

    url = f"{api_base}/content?content_type=youtube&limit={fetch_limit}"
    if args.all:
        url += "&exclude_tags="
    elif args.test:
        url += "&tags=test&exclude_tags="

    sig_headers = signer.sign_request("GET", path, host)

    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.get(url, headers=sig_headers)

            if response.status_code != 200:
                print(f"Error: API returned {response.status_code}", file=sys.stderr)
                print(response.text, file=sys.stderr)
                sys.exit(1)

            data = response.json()
            items = data.get("items", [])

            # Sort by ingest date (newest first), then truncate to requested limit
            items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
            items = items[:limit]

            if not items:
                print("No videos found.")
                return

            print(f"Last {len(items)} ingested videos:\n")
            for i, item in enumerate(items, 1):
                title = (item.get("title") or "Untitled")[:70]
                metadata = item.get("metadata", {})
                video_id = metadata.get("video_id", "unknown")
                chunks = item.get("chunk_count", 0)
                ingested = _fmt_date(item.get("created_at"))
                published = _fmt_date(metadata.get("published_at"))

                # Display tags if present
                tags = item.get("tags") or metadata.get("tags") or []
                tags_str = f" [{', '.join(tags)}]" if tags else ""

                print(f"  {i:>3}. {title}{tags_str}")
                print(
                    f"       https://youtube.com/watch?v={video_id}  "
                    f"({chunks} chunks)  ingested: {ingested}  published: {published}"
                )

            total = data.get("total", len(items))
            print(f"\nShowing {len(items)} of {total} videos")

    except httpx.RequestError as e:
        print(f"Error: Request failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
