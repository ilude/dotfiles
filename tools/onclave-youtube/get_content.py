#!/usr/bin/env python
"""Fetch content from Onclave by content ID."""

import argparse
import json
import sys
from typing import Optional

import httpx
from onclave_client import OnclaveClient


def fetch_transcript(client: OnclaveClient, content_id: str) -> str:
    """Fetch transcript text via the download endpoint."""
    response = client.get(f"/content/{content_id}/download")
    return response.text if response.status_code == 200 else ""


def _print_summary(data: dict, client: OnclaveClient, content_id: str) -> None:
    print(f"Title: {data.get('title', 'N/A')}")
    print(f"Content Type: {data.get('content_type', 'N/A')}")
    metadata = data.get("metadata", {})
    if metadata.get("video_id"):
        print(f"Video ID: {metadata['video_id']}")
    if data.get("summary"):
        print(f"\nSummary: {data['summary']}")
    print()
    transcript = fetch_transcript(client, content_id)
    print(transcript if transcript else "No transcript text available.")


def run(args: argparse.Namespace) -> None:
    with OnclaveClient(timeout=30.0) as client:
        response = client.get(f"/content/{args.content_id}")
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
            transcript = fetch_transcript(client, args.content_id)
            if not transcript:
                print("No transcript available.", file=sys.stderr)
                sys.exit(1)
            print(transcript)
        else:
            _print_summary(data, client, args.content_id)


def main(argv: Optional[list[str]] = None) -> None:
    parser = argparse.ArgumentParser(description="Fetch content from Onclave API by content ID")
    parser.add_argument("content_id", help="Content ID to fetch")
    parser.add_argument("--transcript-only", action="store_true", help="Print only transcript text")
    parser.add_argument("--json", action="store_true", dest="json_output", help="Output JSON")
    try:
        run(parser.parse_args(argv))
    except (RuntimeError, httpx.RequestError) as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
