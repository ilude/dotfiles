#!/usr/bin/env python
"""Reprocess content through the unified pipeline via menos API.

Usage:
    uv run reprocess.py <content_id> [--force] [--wait] [--verbose]
"""

import argparse
import sys
from pathlib import Path

import httpx
from api_config import get_api_base, get_api_host
from job_utils import poll_job
from signing import RequestSigner


def main():
    parser = argparse.ArgumentParser(
        description="Reprocess content through the unified pipeline via menos API"
    )
    parser.add_argument("content_id", help="Content ID to reprocess")
    parser.add_argument(
        "--force", action="store_true", help="Force reprocessing even if already completed"
    )
    parser.add_argument("--wait", action="store_true", help="Poll job status until completion")
    parser.add_argument(
        "--verbose", action="store_true", help="Show all fields when polling completes"
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

    # Build request URL and path
    reprocess_path = f"/api/v1/content/{args.content_id}/reprocess"
    reprocess_url = f"{api_base}/content/{args.content_id}/reprocess"
    if args.force:
        reprocess_path += "?force=true"
        reprocess_url += "?force=true"

    sig_headers = signer.sign_request("POST", reprocess_path, host)

    print(f"Reprocessing content: {args.content_id}")
    if args.force:
        print("Force mode: enabled")
    print()

    try:
        with httpx.Client(timeout=60.0) as client:
            response = client.post(reprocess_url, headers=sig_headers)

            if response.status_code == 404:
                print(f"Error: Content not found: {args.content_id}", file=sys.stderr)
                sys.exit(1)
            if response.status_code != 200:
                print(f"Error: API returned {response.status_code}", file=sys.stderr)
                print(response.text, file=sys.stderr)
                sys.exit(1)

            data = response.json()
            status = data.get("status", "unknown")
            job_id = data.get("job_id")

            print(f"Content ID: {data.get('content_id', args.content_id)}")
            print(f"Status: {status}")
            if job_id:
                print(f"Job ID: {job_id}")
            print()

            if status == "already_completed" and not args.force:
                print("Content already processed. Use --force to reprocess.")
                sys.exit(0)

            if args.wait and job_id:
                poll_job(client, signer, api_base, host, job_id, verbose=args.verbose)

    except httpx.RequestError as e:
        print(f"Error: Request failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
