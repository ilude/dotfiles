#!/usr/bin/env python
"""Test the menos search API."""

import hashlib
import json
import sys
import time
from base64 import b64encode
from pathlib import Path

import httpx
from cryptography.hazmat.primitives.serialization import load_ssh_private_key

API_BASE = "http://192.168.16.241:8000/api/v1"


def main():
    query = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "RAG document understanding"

    # Load SSH key
    key_path = Path.home() / ".ssh" / "id_ed25519"
    key_data = key_path.read_bytes()
    private_key = load_ssh_private_key(key_data, password=None)

    # Compute key_id
    public_key = private_key.public_key()
    public_bytes = public_key.public_bytes_raw()
    key_type = b"ssh-ed25519"
    key_blob = (
        len(key_type).to_bytes(4, "big")
        + key_type
        + len(public_bytes).to_bytes(4, "big")
        + public_bytes
    )
    key_id = f"SHA256:{hashlib.sha256(key_blob).hexdigest()[:16]}"

    # Prepare request
    body = json.dumps({"query": query, "limit": 6}).encode()
    created = int(time.time())
    path = "/api/v1/search"
    host = "192.168.16.241:8000"

    # Sign
    content_digest = f"sha-256=:{b64encode(hashlib.sha256(body).digest()).decode()}:"
    sig_params = f'("@method" "@path" "@authority" "content-digest");keyid="{key_id}";alg="ed25519";created={created}'
    sig_base = "\n".join([
        '"@method": POST',
        f'"@path": {path}',
        f'"@authority": {host}',
        f'"content-digest": {content_digest}',
        f'"@signature-params": {sig_params}',
    ])
    signature = b64encode(private_key.sign(sig_base.encode())).decode()

    headers = {
        "Content-Type": "application/json",
        "content-digest": content_digest,
        "signature-input": f"sig1={sig_params}",
        "signature": f"sig1=:{signature}:",
    }

    print(f"Searching: {query}\n")

    resp = httpx.post(f"http://{host}{path}", content=body, headers=headers, timeout=60)

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
