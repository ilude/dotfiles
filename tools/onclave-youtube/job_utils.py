"""Shared job polling utility for Onclave API scripts."""

import sys
import time

from onclave_client import OnclaveClient

TERMINAL_STATUSES = {"completed", "failed", "cancelled"}


def poll_job(client: OnclaveClient, job_id: str, verbose: bool = False) -> None:
    """Poll a job until it reaches a terminal status."""
    print(f"Waiting for job {job_id}...")

    while True:
        time.sleep(3)
        path = f"/jobs/{job_id}"
        if verbose:
            path += "?verbose=true"

        response = client.get(path)
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
