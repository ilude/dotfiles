#!/usr/bin/env python
"""Ingest a YouTube video via menos unified ingest endpoint."""

import argparse
import json
import sys
from pathlib import Path

import httpx

from api_config import extract_video_id, get_api_base, get_api_host
from job_utils import poll_job
from signing import RequestSigner


def main():
    parser = argparse.ArgumentParser(description="Ingest a YouTube video via menos API")
    parser.add_argument("video", help="YouTube URL or video ID")
    parser.add_argument(
        "--wait", action="store_true", help="Poll job status until completion"
    )
    parser.add_argument(
        "--verbose", action="store_true", help="Show all fields when polling completes"
    )
    parser.add_argument(
        "--test", action="store_true", help="Tag this video as test content"
    )

    args = parser.parse_args()

    try:
        video_id = extract_video_id(args.video)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

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

    # Prepare request
    api_base = get_api_base()
    host = get_api_host()

    # Build URL with optional test tag
    url = f"{api_base}/ingest"
    path = "/api/v1/ingest"
    if args.test:
        url += "?tags=test"
        path += "?tags=test"

    body_data = {"url": f"https://youtube.com/watch?v={video_id}"}
    body_bytes = json.dumps(body_data).encode()

    # Sign request
    sig_headers = signer.sign_request("POST", path, host, body_bytes)

    headers = {
        "Content-Type": "application/json",
        **sig_headers,
    }

    # Make request
    print(f"Ingesting video: {video_id}")
    print(f"API: {url}")
    print()

    try:
        with httpx.Client(timeout=180.0) as client:
            response = client.post(url, content=body_bytes, headers=headers)

            if response.status_code != 200:
                print(f"Error: API returned {response.status_code}", file=sys.stderr)
                print(response.text, file=sys.stderr)
                sys.exit(1)

            data = response.json()

            print(f"Video ID: {video_id}")
            print(f"Title: {data.get('title', 'N/A')}")
            print(f"Content ID: {data.get('content_id', 'N/A')}")
            print(f"Content Type: {data.get('content_type', 'N/A')}")
            print(f"Job ID: {data.get('job_id', 'N/A')}")
            print()

            job_id = data.get("job_id")
            if args.wait and job_id:
                poll_job(client, signer, api_base, host, job_id, verbose=args.verbose)

    except httpx.RequestError as e:
        print(f"Error: Request failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
