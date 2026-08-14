#!/usr/bin/env python
"""Reprocess content through the unified Onclave pipeline."""

import argparse
import sys
from typing import Optional

import httpx
from job_utils import poll_job
from onclave_client import OnclaveClient


def _reprocess_path(content_id: str, force: bool) -> str:
    path = f"/content/{content_id}/reprocess"
    return f"{path}?force=true" if force else path


def run(args: argparse.Namespace) -> None:
    print(f"Reprocessing content: {args.content_id}")
    if args.force:
        print("Force mode: enabled")
    print()
    with OnclaveClient(timeout=60.0) as client:
        response = client.post(_reprocess_path(args.content_id, args.force))
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
            return
        if args.wait and job_id:
            poll_job(client, job_id, verbose=args.verbose)


def main(argv: Optional[list[str]] = None) -> None:
    parser = argparse.ArgumentParser(description="Reprocess content through the Onclave pipeline")
    parser.add_argument("content_id", help="Content ID to reprocess")
    parser.add_argument("--force", action="store_true", help="Force reprocessing")
    parser.add_argument("--wait", action="store_true", help="Poll job status until completion")
    parser.add_argument("--verbose", action="store_true", help="Show all polling fields")
    try:
        run(parser.parse_args(argv))
    except (RuntimeError, httpx.RequestError) as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
