"""Shared job polling utility for Onclave API scripts."""

import sys
import time

from onclave_client import OnclaveClient

TERMINAL_STATUSES = {"completed", "failed", "cancelled"}
PIPELINE_STAGES = ("context_fetch", "llm_call", "parse", "chunking", "embedding", "persist")


def _stage_entries(payload: object) -> list[tuple[str, object]]:
    if not isinstance(payload, dict):
        return []
    raw = payload.get("stages", payload.get("pipeline_stages"))
    if isinstance(raw, dict):
        entries = list(raw.items())
    elif isinstance(raw, list):
        entries = []
        for item in raw:
            if isinstance(item, str):
                entries.append((item, None))
            elif isinstance(item, dict):
                name = item.get("name", item.get("stage"))
                if isinstance(name, str):
                    entries.append((name, item.get("status")))
    else:
        return []

    by_name = {name: value for name, value in entries if name in PIPELINE_STAGES}
    return [(name, by_name[name]) for name in PIPELINE_STAGES if name in by_name]


def format_stages(payload: object) -> str | None:
    """Return the optional canonical stage presentation for a job payload."""
    entries = _stage_entries(payload)
    if not entries:
        return None
    rendered = []
    for name, status in entries:
        if isinstance(status, str) and status:
            rendered.append(f"{name}={status}")
        else:
            rendered.append(name)
    return ", ".join(rendered)


def print_job_fields(job_data: dict[str, object]) -> None:
    """Print verbose job fields while rendering optional stages consistently."""
    for key, value in job_data.items():
        if key in {"stages", "pipeline_stages"}:
            stages = format_stages(job_data)
            if stages is not None:
                print(f"  stages: {stages}")
        else:
            print(f"  {key}: {value}")


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
                print_job_fields(job_data)
            else:
                print(f"Final status: {status}")
            return
