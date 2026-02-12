#!/usr/bin/env python
"""Ingest a YouTube video via menos API with SSH key authentication."""

import argparse
import json
import sys
import time
from pathlib import Path

import httpx

from api_config import extract_video_id, get_api_base, get_api_host
from signing import RequestSigner

TERMINAL_STATUSES = {"completed", "failed", "cancelled"}


def poll_job(client: httpx.Client, signer: RequestSigner, api_base: str, host: str,
             job_id: str, verbose: bool = False) -> None:
    """Poll a job until it reaches a terminal status."""
    print(f"Waiting for job {job_id}...")

    while True:
        time.sleep(3)

        job_path = f"/api/v1/jobs/{job_id}"
        if verbose:
            job_path += "?verbose=true"
        job_url = f"{api_base}/jobs/{job_id}"
        if verbose:
            job_url += "?verbose=true"

        sig_headers = signer.sign_request("GET", job_path, host)
        response = client.get(job_url, headers=sig_headers)

        if response.status_code != 200:
            print(f"Error polling job: {response.status_code}", file=sys.stderr)
            print(response.text, file=sys.stderr)
            sys.exit(1)

        job_data = response.json()
        status = job_data.get("status", "unknown")
        print(f"  Status: {status}")

        if status in TERMINAL_STATUSES:
            print()
            if verbose:
                for key, value in job_data.items():
                    print(f"  {key}: {value}")
            else:
                print(f"Final status: {status}")
            return


def main():
    parser = argparse.ArgumentParser(
        description="Ingest a YouTube video via menos API"
    )
    parser.add_argument(
        "video",
        help="YouTube URL or video ID"
    )
    parser.add_argument(
        "--wait",
        action="store_true",
        help="Poll job status until completion"
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Show all fields when polling completes"
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
    url = f"{api_base}/youtube/ingest"
    body_data = {"url": f"https://youtube.com/watch?v={video_id}"}
    body_bytes = json.dumps(body_data).encode()

    # Sign request
    path = "/api/v1/youtube/ingest"
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

            print(f"Video ID: {data.get('video_id', 'N/A')}")
            print(f"Title: {data.get('title', 'N/A')}")
            print(f"Transcript: {data.get('transcript_length', 'N/A')} chars")
            print(f"Chunks: {data.get('chunks_created', 'N/A')}")
            print(f"File: {data.get('file_path', 'N/A')}")
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
