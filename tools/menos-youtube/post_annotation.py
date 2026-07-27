#!/usr/bin/env python
"""Post an annotation to a content item via menos API.

Usage:
    uv run post_annotation.py <content_id> <title> <text_file> [--tags TAG ...]
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
        description="Post an annotation to a content item via menos API"
    )
    parser.add_argument("content_id", help="Content ID to annotate")
    parser.add_argument("title", help="Annotation title")
    parser.add_argument("text_file", help="Path to text file containing annotation body")
    parser.add_argument("--tags", nargs="*", default=[], help="Tags to apply to the annotation")

    args = parser.parse_args()

    text_file = Path(args.text_file)
    if not text_file.exists():
        print(f"Error: {text_file} not found", file=sys.stderr)
        sys.exit(1)

    text = text_file.read_text(encoding="utf-8")

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

    body = {
        "text": text,
        "title": args.title,
        "source_type": "screenshot",
        "tags": args.tags,
    }
    body_bytes = json.dumps(body).encode()
    path = f"/api/v1/content/{args.content_id}/annotations"
    sig_headers = signer.sign_request("POST", path, host, body_bytes)
    headers = {"Content-Type": "application/json", **sig_headers}

    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.post(
                f"{api_base}/content/{args.content_id}/annotations",
                content=body_bytes,
                headers=headers,
            )

            if response.status_code != 200:
                print(f"Error: API returned {response.status_code}", file=sys.stderr)
                print(response.text, file=sys.stderr)
                sys.exit(1)

            data = response.json()
            print(f"ID: {data['id']}")
            print(f"Title: {data['title']}")
            print(f"Tags: {data.get('tags', [])}")

    except httpx.RequestError as e:
        print(f"Error: Request failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
