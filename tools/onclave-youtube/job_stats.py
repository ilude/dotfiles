#!/usr/bin/env python
"""Display aggregate Onclave job statistics."""

import argparse
import json
import sys
from typing import Any, Optional

import httpx
from onclave_client import OnclaveClient

STAT_FIELDS = (
    "total_jobs",
    "completed_jobs",
    "failed_jobs",
    "cancelled_jobs",
    "average_completion_seconds",
)


def _format_stats(stats: dict[str, Any]) -> str:
    return "\n".join(f"{field}: {stats[field]}" for field in STAT_FIELDS)


def run(args: argparse.Namespace) -> None:
    with OnclaveClient(timeout=30.0) as client:
        response = client.get("/jobs/stats")
    if response.status_code != 200:
        print(f"Error: API returned {response.status_code}", file=sys.stderr)
        print(response.text, file=sys.stderr)
        sys.exit(1)

    stats = response.json()
    if args.json_output:
        print(json.dumps(stats, indent=2))
    else:
        print(_format_stats(stats))


def main(argv: Optional[list[str]] = None) -> None:
    parser = argparse.ArgumentParser(description="Display aggregate Onclave job statistics")
    parser.add_argument("--json", action="store_true", dest="json_output")
    try:
        run(parser.parse_args(argv))
    except (RuntimeError, httpx.RequestError) as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
