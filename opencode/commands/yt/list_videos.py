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
    path = f"/api/v1/youtube?limit={limit}"
    url = f"{api_base}/youtube?limit={limit}"

    sig_headers = signer.sign_request("GET", path, host)

    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.get(url, headers=sig_headers)

            if response.status_code != 200:
                print(f"Error: API returned {response.status_code}", file=sys.stderr)
                print(response.text, file=sys.stderr)
                sys.exit(1)

            videos = response.json()

            if not videos:
                print("No videos found.")
                return

            print(f"Last {len(videos)} ingested videos:\n")
            for i, v in enumerate(videos, 1):
                title = (v.get("title") or "Untitled")[:70]
                video_id = v.get("video_id", "unknown")
                chunks = v.get("chunk_count", 0)
                ingested = _fmt_date(v.get("created_at"))
                published = _fmt_date(v.get("published_at"))
                print(f"  {i:>3}. {title}")
                print(
                    f"       https://youtube.com/watch?v={video_id}  "
                    f"({chunks} chunks)  ingested: {ingested}  published: {published}"
                )

            print(f"\nTotal: {len(videos)} videos")

    except httpx.RequestError as e:
        print(f"Error: Request failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
