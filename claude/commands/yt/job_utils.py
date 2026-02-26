"""Shared job polling utility for menos API scripts."""

import sys
import time

import httpx
from signing import RequestSigner

TERMINAL_STATUSES = {"completed", "failed", "cancelled"}


def poll_job(
    client: httpx.Client,
    signer: RequestSigner,
    api_base: str,
    host: str,
    job_id: str,
    verbose: bool = False,
) -> None:
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
