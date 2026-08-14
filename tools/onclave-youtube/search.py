#!/usr/bin/env python
"""Semantic search across ingested content via Onclave API."""

import argparse
import json
import sys
from typing import Optional

import httpx
from onclave_client import OnclaveClient


def run(args: argparse.Namespace) -> None:
    query = " ".join(args.query)
    payload = {"query": query, "limit": args.limit}
    client = OnclaveClient(timeout=60.0)
    print(f"Searching: {query}\n")

    with client:
        response = client.post_json("/search", payload)
    if response.status_code != 200:
        print(f"Error: API returned {response.status_code}", file=sys.stderr)
        print(response.text, file=sys.stderr)
        sys.exit(1)

    data = response.json()
    if args.json_output:
        print(json.dumps(data, indent=2))
        return
    print(f"Found {data['total']} results:\n")
    for result in data["results"]:
        print(f"{result['score']:.4f} | {result['id']}")
        snippet = result.get("snippet", "")[:80] if result.get("snippet") else ""
        print(f"  {snippet}...")
        print()


def main(argv: Optional[list[str]] = None) -> None:
    parser = argparse.ArgumentParser(description="Search ingested content via Onclave API")
    parser.add_argument("query", nargs="+", help="Search query text")
    parser.add_argument("--limit", type=int, default=6, help="Maximum number of results")
    parser.add_argument("--json", action="store_true", dest="json_output", help="Output JSON")
    try:
        run(parser.parse_args(argv))
    except httpx.RequestError as error:
        print(f"Error: Request failed: {error}", file=sys.stderr)
        sys.exit(1)
    except RuntimeError as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
