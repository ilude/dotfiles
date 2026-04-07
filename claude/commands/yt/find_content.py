#!/usr/bin/env python
"""Resolve a YouTube video_id to a menos content_id.

Usage:
    uv run find_content.py <video_id>
"""

import argparse
import sys
from pathlib import Path

import httpx
from api_config import extract_video_id, get_api_base, get_api_host
from signing import RequestSigner


def _load_signer() -> RequestSigner:
    ssh_key_path = Path.home() / ".ssh" / "id_ed25519"
    if not ssh_key_path.exists():
        print(f"Error: SSH key not found at {ssh_key_path}", file=sys.stderr)
        sys.exit(1)
    try:
        return RequestSigner.from_file(ssh_key_path)
    except Exception as e:
        print(f"Error loading SSH key: {e}", file=sys.stderr)
        sys.exit(1)


def _find_match(items: list, video_id: str) -> dict | None:
    for item in items:
        if item.get("metadata", {}).get("video_id") == video_id:
            return item
    return None


def run(video_id: str) -> None:
    signer = _load_signer()
    api_base = get_api_base()
    host = get_api_host()
    path = "/api/v1/content?content_type=youtube&limit=100&exclude_tags="
    url = f"{api_base}/content?content_type=youtube&limit=100&exclude_tags="
    sig_headers = signer.sign_request("GET", path, host)
    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.get(url, headers=sig_headers)
            if response.status_code != 200:
                print(f"Error: API returned {response.status_code}", file=sys.stderr)
                print(response.text, file=sys.stderr)
                sys.exit(1)
            data = response.json()
            match = _find_match(data.get("items", []), video_id)
            if not match:
                print(f"Error: No content found for video ID: {video_id}", file=sys.stderr)
                sys.exit(1)
            print(f"Content ID: {match.get('id', 'unknown')}")
            print(f"Title: {match.get('title', 'Untitled')}")
            print(f"Status: {match.get('status', 'unknown')}")
    except httpx.RequestError as e:
        print(f"Error: Request failed: {e}", file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Resolve a YouTube video ID to a menos content ID")
    parser.add_argument("video_id", help="YouTube video ID or URL")
    args = parser.parse_args()
    try:
        video_id = extract_video_id(args.video_id)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    run(video_id)


if __name__ == "__main__":
    main()
