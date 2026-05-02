#!/usr/bin/env python
"""Ingest a YouTube video via menos unified ingest endpoint."""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import httpx
from api_config import extract_video_id, get_api_base, get_api_host
from job_utils import poll_job
from signing import RequestSigner


def _load_signer() -> RequestSigner:
    ssh_key_path = Path.home() / ".ssh" / "id_ed25519"
    if not ssh_key_path.exists():
        print(f"Error: SSH key not found at {ssh_key_path}", file=sys.stderr)
        sys.exit(1)
    try:
        return RequestSigner.from_file(ssh_key_path)
    except Exception as e:
        print(f"Error loading SSH key: {e}", file=sys.stderr)
        sys.exit(1)


def _load_local_payload(video_id: str) -> dict[str, Any]:
    video_dir = Path.home() / ".dotfiles" / "yt" / video_id
    marker = video_dir / ".complete"
    transcript_path = video_dir / "transcript.txt"
    if not marker.exists():
        print(f"Error: local cache is not complete: {marker}", file=sys.stderr)
        sys.exit(1)
    try:
        complete = json.loads(marker.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"Error: invalid .complete marker: {e}", file=sys.stderr)
        sys.exit(1)
    if not complete.get("transcript"):
        print("Error: local cache marker does not have transcript=true", file=sys.stderr)
        sys.exit(1)
    if not transcript_path.exists():
        print(f"Error: missing local transcript: {transcript_path}", file=sys.stderr)
        sys.exit(1)
    transcript_text = transcript_path.read_text(encoding="utf-8")
    if not transcript_text.strip():
        print(f"Error: empty local transcript: {transcript_path}", file=sys.stderr)
        sys.exit(1)
    metadata_path = video_dir / "metadata.json"
    metadata = None
    if metadata_path.exists():
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            print(f"Error: invalid local metadata.json: {e}", file=sys.stderr)
            sys.exit(1)
    return {
        "url": f"https://youtube.com/watch?v={video_id}",
        "transcript_text": transcript_text,
        "transcript_format": "plain",
        "metadata": metadata,
    }


def run(args) -> None:
    try:
        video_id = extract_video_id(args.video)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    signer = _load_signer()
    api_base = get_api_base()
    host = get_api_host()

    url = f"{api_base}/ingest"
    path = "/api/v1/ingest"
    if args.test:
        url += "?tags=test"
        path += "?tags=test"

    body_data = _load_local_payload(video_id) if args.from_local else {"url": f"https://youtube.com/watch?v={video_id}"}
    body_bytes = json.dumps(body_data).encode()
    sig_headers = signer.sign_request("POST", path, host, body_bytes)
    headers = {"Content-Type": "application/json", **sig_headers}

    print(f"Ingesting video: {video_id}")
    if args.from_local:
        print("Source: local transcript cache")
    print(f"API: {url}")
    print()

    try:
        with httpx.Client(timeout=180.0) as client:
            response = client.post(url, content=body_bytes, headers=headers)
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
                poll_job(client, signer, api_base, host, job_id, verbose=args.verbose)
    except httpx.RequestError as e:
        print(f"Error: Request failed: {e}", file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Ingest a YouTube video via menos API")
    parser.add_argument("video", help="YouTube URL or video ID")
    parser.add_argument("--wait", action="store_true", help="Poll job status until completion")
    parser.add_argument(
        "--verbose", action="store_true", help="Show all fields when polling completes"
    )
    parser.add_argument("--test", action="store_true", help="Tag this video as test content")
    parser.add_argument("--from-local", action="store_true", help="Upload transcript/metadata from ~/.dotfiles/yt/<video_id>/")
    run(parser.parse_args())


if __name__ == "__main__":
    main()
