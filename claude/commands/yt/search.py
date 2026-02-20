#!/usr/bin/env python
"""Semantic search across ingested content via menos API.

Usage:
    uv run search.py <query> [--limit N] [--json]
"""

import argparse
import json
import sys
from pathlib import Path

import httpx

from api_config import get_api_base, get_api_host
from signing import RequestSigner


def main():
    parser = argparse.ArgumentParser(
        description="Semantic search across ingested content via menos API"
    )
    parser.add_argument(
        "query",
        nargs="+",
        help="Search query text"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=6,
        help="Maximum number of results (default: 6)"
    )
    parser.add_argument(
        "--json",
        action="store_true",
        dest="json_output",
        help="Output full JSON response"
    )

    args = parser.parse_args()
    query = " ".join(args.query)

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

    body = json.dumps({"query": query, "limit": args.limit}).encode()
    path = "/api/v1/search"

    sig_headers = signer.sign_request("POST", path, host, body)
    headers = {
        "Content-Type": "application/json",
        **sig_headers,
    }

    print(f"Searching: {query}\n")

    try:
        with httpx.Client(timeout=60.0) as client:
            response = client.post(
                f"{api_base}/search", content=body, headers=headers
            )

            if response.status_code != 200:
                print(f"Error: API returned {response.status_code}", file=sys.stderr)
                print(response.text, file=sys.stderr)
                sys.exit(1)

            data = response.json()

            if args.json_output:
                print(json.dumps(data, indent=2))
            else:
                print(f"Found {data['total']} results:\n")
                for r in data["results"]:
                    print(f"{r['score']:.4f} | {r['id']}")
                    snippet = r.get("snippet", "")[:80] if r.get("snippet") else ""
                    print(f"  {snippet}...")
                    print()

    except httpx.RequestError as e:
        print(f"Error: Request failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
