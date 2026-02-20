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


def main():
    parser = argparse.ArgumentParser(
        description="Fetch content from menos API by content ID"
    )
    parser.add_argument(
        "content_id",
        help="Content ID to fetch"
    )
    parser.add_argument(
        "--transcript-only",
        action="store_true",
        help="Print only the transcript text"
    )
    parser.add_argument(
        "--json",
        action="store_true",
        dest="json_output",
        help="Output full JSON response"
    )

    args = parser.parse_args()

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
                transcript = data.get("transcript", "")
                if not transcript:
                    print("No transcript available.", file=sys.stderr)
                    sys.exit(1)
                print(transcript)
            else:
                # Default: print transcript text
                transcript = data.get("transcript", "")
                if transcript:
                    print(transcript)
                else:
                    # Fall back to showing key fields
                    print(f"Content ID: {data.get('id', args.content_id)}")
                    print(f"Title: {data.get('title', 'N/A')}")
                    print(f"Status: {data.get('status', 'N/A')}")
                    print(f"Content Type: {data.get('content_type', 'N/A')}")
                    metadata = data.get("metadata", {})
                    if metadata.get("video_id"):
                        print(f"Video ID: {metadata['video_id']}")
                    chunks = data.get("chunk_count", 0)
                    print(f"Chunks: {chunks}")
                    print("\nNo transcript text available in response.")

    except httpx.RequestError as e:
        print(f"Error: Request failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
