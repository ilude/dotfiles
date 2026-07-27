#!/usr/bin/env python
"""Check pipeline job status via menos API.

Usage:
    uv run check_job.py <job_id> [--verbose] [--wait] [--cancel]
    uv run check_job.py <job_id> --wait --verbose
"""

import argparse
import sys
from pathlib import Path

import httpx
from api_config import get_api_base, get_api_host
from job_utils import poll_job
from signing import RequestSigner


def get_job(
    client: httpx.Client,
    signer: RequestSigner,
    api_base: str,
    host: str,
    job_id: str,
    verbose: bool = False,
) -> None:
    """Fetch and display job status."""
    job_path = f"/api/v1/jobs/{job_id}"
    if verbose:
        job_path += "?verbose=true"
    job_url = f"{api_base}/jobs/{job_id}"
    if verbose:
        job_url += "?verbose=true"

    sig_headers = signer.sign_request("GET", job_path, host)
    response = client.get(job_url, headers=sig_headers)

    if response.status_code == 404:
        print(f"Error: Job not found: {job_id}", file=sys.stderr)
        sys.exit(1)
    if response.status_code != 200:
        print(f"Error: API returned {response.status_code}", file=sys.stderr)
        print(response.text, file=sys.stderr)
        sys.exit(1)

    job_data = response.json()

    if verbose:
        for key, value in job_data.items():
            print(f"  {key}: {value}")
    else:
        print(f"Job: {job_id}")
        print(f"Status: {job_data.get('status', 'unknown')}")


def cancel_job(
    client: httpx.Client, signer: RequestSigner, api_base: str, host: str, job_id: str
) -> None:
    """Cancel a job."""
    cancel_path = f"/api/v1/jobs/{job_id}/cancel"
    cancel_url = f"{api_base}/jobs/{job_id}/cancel"

    sig_headers = signer.sign_request("POST", cancel_path, host)
    response = client.post(cancel_url, headers=sig_headers)

    if response.status_code == 404:
        print(f"Error: Job not found: {job_id}", file=sys.stderr)
        sys.exit(1)
    if response.status_code != 200:
        print(f"Error: API returned {response.status_code}", file=sys.stderr)
        print(response.text, file=sys.stderr)
        sys.exit(1)

    data = response.json()
    for key, value in data.items():
        print(f"  {key}: {value}")


def main():
    parser = argparse.ArgumentParser(description="Check pipeline job status via menos API")
    parser.add_argument("job_id", help="Pipeline job ID")
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Show all fields including error details and metadata",
    )
    parser.add_argument("--wait", action="store_true", help="Poll job status until completion")
    parser.add_argument(
        "--cancel", action="store_true", help="Cancel the job instead of checking status"
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

    try:
        with httpx.Client(timeout=30.0) as client:
            if args.cancel:
                cancel_job(client, signer, api_base, host, args.job_id)
            elif args.wait:
                poll_job(client, signer, api_base, host, args.job_id, verbose=args.verbose)
            else:
                get_job(client, signer, api_base, host, args.job_id, verbose=args.verbose)

    except httpx.RequestError as e:
        print(f"Error: Request failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
