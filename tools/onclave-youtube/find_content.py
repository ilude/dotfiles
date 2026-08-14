#!/usr/bin/env python
"""Resolve a YouTube video ID to an Onclave content ID."""

import argparse
import sys
from typing import Optional

import httpx
from api_config import extract_video_id
from onclave_client import OnclaveClient


def _find_match(items: list, video_id: str) -> Optional[dict]:
    for item in items:
        if item.get("metadata", {}).get("video_id") == video_id:
            return item
    return None


def run(video_id: str) -> None:
    offset = 0
    with OnclaveClient(timeout=30.0) as client:
        while True:
            path = f"/content?content_type=youtube&limit=100&offset={offset}&exclude_tags="
            response = client.get(path)
            if response.status_code != 200:
                print(f"Error: API returned {response.status_code}", file=sys.stderr)
                print(response.text, file=sys.stderr)
                sys.exit(1)
            data = response.json()
            items = data.get("items", [])
            match = _find_match(items, video_id)
            if match:
                print(f"Content ID: {match.get('id', 'unknown')}")
                print(f"Title: {match.get('title', 'Untitled')}")
                print(f"Status: {match.get('status', 'unknown')}")
                return
            offset += len(items)
            total = data.get("total")
            if not items or len(items) < 100 or (isinstance(total, int) and offset >= total):
                break
    print(f"Error: No content found for video ID: {video_id}", file=sys.stderr)
    sys.exit(1)


def main(argv: Optional[list[str]] = None) -> None:
    parser = argparse.ArgumentParser(
        description="Resolve a YouTube video ID to an Onclave content ID"
    )
    parser.add_argument("video_id", help="YouTube video ID or URL")
    args = parser.parse_args(argv)
    try:
        run(extract_video_id(args.video_id))
    except (RuntimeError, ValueError, httpx.RequestError) as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
