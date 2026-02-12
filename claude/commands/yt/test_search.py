#!/usr/bin/env python
"""Test the menos search API."""

import json
import sys
from pathlib import Path

import httpx

from api_config import get_api_base, get_api_host
from signing import RequestSigner


def main():
    query = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "RAG document understanding"

    # Load SSH key
    key_path = Path.home() / ".ssh" / "id_ed25519"
    signer = RequestSigner.from_file(key_path)

    # Prepare request
    api_base = get_api_base()
    host = get_api_host()
    body = json.dumps({"query": query, "limit": 6}).encode()
    path = "/api/v1/search"

    # Sign
    sig_headers = signer.sign_request("POST", path, host, body)

    headers = {
        "Content-Type": "application/json",
        **sig_headers,
    }

    print(f"Searching: {query}\n")

    resp = httpx.post(f"{api_base}/search", content=body, headers=headers, timeout=60)

    if resp.status_code != 200:
        print(f"Error: {resp.status_code}")
        print(resp.text)
        return

    data = resp.json()
    print(f"Found {data['total']} results:\n")

    for r in data["results"]:
        print(f"{r['score']:.4f} | {r['id']}")
        snippet = r.get("snippet", "")[:80] if r.get("snippet") else ""
        print(f"  {snippet}...")
        print()


if __name__ == "__main__":
    main()
