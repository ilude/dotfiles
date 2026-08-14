#!/usr/bin/env python
"""List videos from a YouTube channel via Onclave."""

import argparse
import json
import sys
from typing import Optional
from urllib.parse import urlencode

import httpx
from onclave_client import OnclaveClient


def _onclave_channel_videos(channel: str, limit: int) -> dict:
    query = urlencode({"channel": channel, "limit": limit})
    with OnclaveClient(timeout=60.0) as client:
        response = client.get(f"/youtube/channel?{query}")
    if response.status_code != 200:
        print(f"Error: API returned {response.status_code}", file=sys.stderr)
        print(response.text, file=sys.stderr)
        sys.exit(1)
    data = response.json()
    data["source"] = "onclave"
    return data


def _print_text(data: dict) -> None:
    videos = data.get("videos", [])
    print(f"Found {len(videos)} videos via Onclave:\n")
    for index, video in enumerate(videos, 1):
        published = (video.get("published_at") or "")[:10]
        duration = video.get("duration") or "n/a"
        views = video.get("view_count")
        views_text = f"  views: {views}" if views is not None else ""
        print(f"  {index:>3}. {video.get('title', 'Untitled')}")
        print(
            f"       {video.get('url')}  published: {published}  duration: {duration}{views_text}"
        )


def run(args: argparse.Namespace) -> None:
    limit = min(max(args.limit, 1), 500)
    data = _onclave_channel_videos(args.channel, limit)
    if args.json_output:
        print(json.dumps(data, indent=2))
    else:
        _print_text(data)


def main(argv: Optional[list[str]] = None) -> None:
    parser = argparse.ArgumentParser(description="List videos from a YouTube channel via Onclave")
    parser.add_argument("channel", help="YouTube @handle or https://www.youtube.com/@handle")
    parser.add_argument("--limit", type=int, default=50, help="Number of videos to list")
    parser.add_argument("--json", action="store_true", dest="json_output")
    try:
        run(parser.parse_args(argv))
    except (RuntimeError, httpx.RequestError) as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
