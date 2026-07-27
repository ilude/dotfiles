#!/usr/bin/env python
"""Fetch content from menos by content_id with signed auth.

Usage:
    uv run get_content.py <content_id> [--transcript-only] [--json]
"""

import argparse
import json
import sys
from pathlib import Path

import httpx
from api_config import get_api_base, get_api_host
from signing import RequestSigner


def fetch_transcript(client, signer, api_base, host, content_id):
    """Fetch transcript text via the /download endpoint."""
    download_path = f"/api/v1/content/{content_id}/download"
    download_url = f"{api_base}/content/{content_id}/download"
    sig_headers = signer.sign_request("GET", download_path, host)
    resp = client.get(download_url, headers=sig_headers)
    if resp.status_code == 200:
        return resp.text
    return ""


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


def _print_summary(data: dict, client, signer, api_base: str, host: str, content_id: str) -> None:
    print(f"Title: {data.get('title', 'N/A')}")
    print(f"Content Type: {data.get('content_type', 'N/A')}")
    metadata = data.get("metadata", {})
    if metadata.get("video_id"):
        print(f"Video ID: {metadata['video_id']}")
    if data.get("summary"):
        print(f"\nSummary: {data['summary']}")
    print()
    transcript = fetch_transcript(client, signer, api_base, host, content_id)
    print(transcript if transcript else "No transcript text available.")


def _print_transcript_only(client, signer, api_base: str, host: str, content_id: str) -> None:
    transcript = fetch_transcript(client, signer, api_base, host, content_id)
    if not transcript:
        print("No transcript available.", file=sys.stderr)
        sys.exit(1)
    print(transcript)


def run(args) -> None:
    signer = _load_signer()
    api_base = get_api_base()
    host = get_api_host()
    content_path = f"/api/v1/content/{args.content_id}"
    content_url = f"{api_base}/content/{args.content_id}"
    sig_headers = signer.sign_request("GET", content_path, host)
    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.get(content_url, headers=sig_headers)
            if response.status_code == 404:
                print(f"Error: Content not found: {args.content_id}", file=sys.stderr)
                sys.exit(1)
            if response.status_code != 200:
                print(f"Error: API returned {response.status_code}", file=sys.stderr)
                print(response.text, file=sys.stderr)
                sys.exit(1)
            data = response.json()
            if args.json_output:
                print(json.dumps(data, indent=2))
            elif args.transcript_only:
                _print_transcript_only(client, signer, api_base, host, args.content_id)
            else:
                _print_summary(data, client, signer, api_base, host, args.content_id)
    except httpx.RequestError as e:
        print(f"Error: Request failed: {e}", file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Fetch content from menos API by content ID")
    parser.add_argument("content_id", help="Content ID to fetch")
    parser.add_argument(
        "--transcript-only", action="store_true", help="Print only the transcript text"
    )
    parser.add_argument(
        "--json", action="store_true", dest="json_output", help="Output full JSON response"
    )
    run(parser.parse_args())


if __name__ == "__main__":
    main()
