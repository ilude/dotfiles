#!/usr/bin/env python
"""Check pipeline job status via Onclave API."""

import argparse
import sys
from typing import Optional

import httpx
from job_utils import format_stages, poll_job, print_job_fields
from onclave_client import OnclaveClient


def get_job(client: OnclaveClient, job_id: str, verbose: bool = False) -> None:
    """Fetch and display job status."""
    path = f"/jobs/{job_id}"
    if verbose:
        path += "?verbose=true"
    response = client.get(path)
    if response.status_code == 404:
        print(f"Error: Job not found: {job_id}", file=sys.stderr)
        sys.exit(1)
    if response.status_code != 200:
        print(f"Error: API returned {response.status_code}", file=sys.stderr)
        print(response.text, file=sys.stderr)
        sys.exit(1)

    job_data = response.json()
    if verbose:
        print_job_fields(job_data)
    else:
        print(f"Job: {job_id}")
        print(f"Status: {job_data.get('status', 'unknown')}")
        stages = format_stages(job_data)
        if stages is not None:
            print(f"Stages: {stages}")


def list_jobs(client: OnclaveClient) -> None:
    """Fetch and display the optional stage-aware job list."""
    response = client.get("/jobs")
    if response.status_code != 200:
        print(f"Error: API returned {response.status_code}", file=sys.stderr)
        print(response.text, file=sys.stderr)
        sys.exit(1)

    payload = response.json()
    jobs = payload.get("jobs", []) if isinstance(payload, dict) else []
    for job_data in jobs if isinstance(jobs, list) else []:
        if not isinstance(job_data, dict):
            continue
        job_id = job_data.get("job_id", "unknown")
        print(f"Job: {job_id}")
        print(f"Status: {job_data.get('status', 'unknown')}")
        stages = format_stages(job_data)
        if stages is not None:
            print(f"Stages: {stages}")


def cancel_job(client: OnclaveClient, job_id: str) -> None:
    """Cancel a job."""
    response = client.post(f"/jobs/{job_id}/cancel")
    if response.status_code == 404:
        print(f"Error: Job not found: {job_id}", file=sys.stderr)
        sys.exit(1)
    if response.status_code != 200:
        print(f"Error: API returned {response.status_code}", file=sys.stderr)
        print(response.text, file=sys.stderr)
        sys.exit(1)
    for key, value in response.json().items():
        print(f"  {key}: {value}")


def run(args: argparse.Namespace) -> None:
    with OnclaveClient(timeout=30.0) as client:
        if args.list:
            list_jobs(client)
        elif args.cancel:
            cancel_job(client, args.job_id)
        elif args.wait:
            poll_job(client, args.job_id, verbose=args.verbose)
        else:
            get_job(client, args.job_id, verbose=args.verbose)


def main(argv: Optional[list[str]] = None) -> None:
    parser = argparse.ArgumentParser(description="Check pipeline job status via Onclave API")
    parser.add_argument("job_id", nargs="?", help="Pipeline job ID")
    parser.add_argument("--list", action="store_true", help="List pipeline jobs")
    parser.add_argument("--verbose", action="store_true", help="Show all fields")
    parser.add_argument("--wait", action="store_true", help="Poll job status until completion")
    parser.add_argument("--cancel", action="store_true", help="Cancel the job")
    try:
        run(parser.parse_args(argv))
    except (RuntimeError, httpx.RequestError) as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
