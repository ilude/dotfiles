#!/usr/bin/env python
"""Ingest a YouTube video via the Onclave unified ingest endpoint."""

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Optional

import httpx
from api_config import extract_video_id
from job_utils import poll_job
from onclave_client import OnclaveClient


def _load_local_payload(video_id: str) -> dict[str, Any]:
    video_dir = Path.home() / ".dotfiles" / "yt" / video_id
    marker = video_dir / ".complete"
    transcript_path = video_dir / "transcript.txt"
    if not marker.exists():
        raise RuntimeError(f"local cache is not complete: {marker}")
    try:
        complete = json.loads(marker.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise RuntimeError(f"invalid .complete marker: {error}") from error
    if not complete.get("transcript"):
        raise RuntimeError("local cache marker does not have transcript=true")
    if not transcript_path.exists():
        raise RuntimeError(f"missing local transcript: {transcript_path}")
    transcript_text = transcript_path.read_text(encoding="utf-8")
    if not transcript_text.strip():
        raise RuntimeError(f"empty local transcript: {transcript_path}")
    metadata_path = video_dir / "metadata.json"
    metadata = None
    if metadata_path.exists():
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            raise RuntimeError(f"invalid local metadata.json: {error}") from error
    return {
        "url": f"https://youtube.com/watch?v={video_id}",
        "transcript_text": transcript_text,
        "transcript_format": "plain",
        "metadata": metadata,
    }


def run(args: argparse.Namespace) -> None:
    video_id = extract_video_id(args.video)
    path = "/ingest"
    if args.test:
        path += "?tags=test"
    body_data = (
        _load_local_payload(video_id)
        if args.from_local
        else {"url": f"https://youtube.com/watch?v={video_id}"}
    )
    client = OnclaveClient(timeout=180.0)
    print(f"Ingesting video: {video_id}")
    if args.from_local:
        print("Source: local transcript cache")
    print(f"API: {client.api_base}{path}")
    print()

    with client:
        response = client.post_json(path, body_data)
        if response.status_code != 200:
            print(f"Error: API returned {response.status_code}", file=sys.stderr)
            print(response.text, file=sys.stderr)
            sys.exit(1)
        data = response.json()
        print(f"Video ID: {video_id}")
        print(f"Title: {data.get('title', 'N/A')}")
        print(f"Content ID: {data.get('content_id', 'N/A')}")
        print(f"Content Type: {data.get('content_type', 'N/A')}")
        print(f"Job ID: {data.get('job_id', 'N/A')}")
        print()
        job_id = data.get("job_id")
        if args.wait and job_id:
            poll_job(client, job_id, verbose=args.verbose)


def main(argv: Optional[list[str]] = None) -> None:
    parser = argparse.ArgumentParser(description="Ingest a YouTube video via Onclave API")
    parser.add_argument("video", help="YouTube URL or video ID")
    parser.add_argument("--wait", action="store_true", help="Poll job status until completion")
    parser.add_argument(
        "--verbose", action="store_true", help="Show all fields when polling completes"
    )
    parser.add_argument("--test", action="store_true", help="Tag this video as test content")
    parser.add_argument(
        "--from-local",
        action="store_true",
        help="Upload transcript/metadata from ~/.dotfiles/yt/<video_id>/",
    )
    try:
        run(parser.parse_args(argv))
    except httpx.RequestError as error:
        print(f"Error: Request failed: {error}", file=sys.stderr)
        sys.exit(1)
    except (RuntimeError, ValueError) as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
