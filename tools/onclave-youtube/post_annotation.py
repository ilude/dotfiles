#!/usr/bin/env python
"""Post an annotation to a content item via Onclave API."""

import argparse
import sys
from pathlib import Path
from typing import Optional

import httpx
from onclave_client import OnclaveClient


def run(args: argparse.Namespace) -> None:
    text_file = Path(args.text_file)
    if not text_file.exists():
        print(f"Error: {text_file} not found", file=sys.stderr)
        sys.exit(1)
    payload = {
        "text": text_file.read_text(encoding="utf-8"),
        "title": args.title,
        "source_type": "screenshot",
        "tags": args.tags,
    }
    with OnclaveClient(timeout=30.0) as client:
        response = client.post_json(f"/content/{args.content_id}/annotations", payload)
    if response.status_code != 200:
        print(f"Error: API returned {response.status_code}", file=sys.stderr)
        print(response.text, file=sys.stderr)
        sys.exit(1)
    data = response.json()
    print(f"ID: {data['id']}")
    print(f"Title: {data['title']}")
    print(f"Tags: {data.get('tags', [])}")


def main(argv: Optional[list[str]] = None) -> None:
    parser = argparse.ArgumentParser(description="Post an annotation to a content item")
    parser.add_argument("content_id", help="Content ID to annotate")
    parser.add_argument("title", help="Annotation title")
    parser.add_argument("text_file", help="Path to text file containing annotation body")
    parser.add_argument("--tags", nargs="*", default=[], help="Tags to apply")
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
