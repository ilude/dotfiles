#!/usr/bin/env python
"""Post an annotation to a content item via menos API."""

import json
import sys

import httpx
from pathlib import Path
from signing import RequestSigner
from api_config import get_api_base, get_api_host


def main():
    if len(sys.argv) < 4:
        print("Usage: post_annotation.py <content_id> <title> <text_file> [tags...]")
        sys.exit(1)

    content_id = sys.argv[1]
    title = sys.argv[2]
    text_file = Path(sys.argv[3])
    tags = sys.argv[4:] if len(sys.argv) > 4 else []

    if not text_file.exists():
        print(f"Error: {text_file} not found")
        sys.exit(1)

    text = text_file.read_text(encoding="utf-8")

    ssh_key_path = Path.home() / ".ssh" / "id_ed25519"
    signer = RequestSigner.from_file(ssh_key_path)
    api_base = get_api_base()
    host = get_api_host()

    body = {
        "text": text,
        "title": title,
        "source_type": "screenshot",
        "tags": tags,
    }
    body_bytes = json.dumps(body).encode()
    path = f"/api/v1/content/{content_id}/annotations"
    sig_headers = signer.sign_request("POST", path, host, body_bytes)
    headers = {"Content-Type": "application/json", **sig_headers}

    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            f"{api_base}/content/{content_id}/annotations",
            content=body_bytes,
            headers=headers,
        )
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print(f"ID: {data['id']}")
            print(f"Title: {data['title']}")
            print(f"Tags: {data.get('tags', [])}")
        else:
            print(f"Error: {resp.text}")


if __name__ == "__main__":
    main()
