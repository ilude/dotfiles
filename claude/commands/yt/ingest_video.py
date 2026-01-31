#!/usr/bin/env python
"""Ingest a YouTube video via menos API with SSH key authentication."""

import hashlib
import json
import re
import sys
import time
from base64 import b64encode
from pathlib import Path

import httpx
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import load_ssh_private_key

# menos API endpoint
API_BASE = "http://192.168.16.241:8000/api/v1"


class RequestSigner:
    """Signs HTTP requests per RFC 9421."""

    def __init__(self, private_key: Ed25519PrivateKey, key_id: str):
        self.private_key = private_key
        self.key_id = key_id

    @classmethod
    def from_file(cls, path: Path, password: bytes | None = None) -> "RequestSigner":
        """Load signer from SSH private key file."""
        key_data = path.read_bytes()
        private_key = load_ssh_private_key(key_data, password=password)

        if not isinstance(private_key, Ed25519PrivateKey):
            raise ValueError("Only ed25519 keys are supported")

        # Compute key_id from public key
        public_key = private_key.public_key()
        public_bytes = public_key.public_bytes_raw()
        key_type = b"ssh-ed25519"
        key_blob = (
            len(key_type).to_bytes(4, "big")
            + key_type
            + len(public_bytes).to_bytes(4, "big")
            + public_bytes
        )
        digest = hashlib.sha256(key_blob).hexdigest()
        key_id = f"SHA256:{digest[:16]}"

        return cls(private_key, key_id)

    def sign_request(
        self,
        method: str,
        path: str,
        host: str,
        body: bytes | None = None,
    ) -> dict[str, str]:
        """Generate signature headers for a request."""
        created = int(time.time())

        # Components to sign
        components = ['"@method"', '"@path"', '"@authority"']
        if body:
            components.append('"content-digest"')

        # Build signature base
        lines = [
            f'"@method": {method}',
            f'"@path": {path}',
            f'"@authority": {host}',
        ]

        content_digest = None
        if body:
            digest = hashlib.sha256(body).digest()
            digest_b64 = b64encode(digest).decode()
            content_digest = f"sha-256=:{digest_b64}:"
            lines.append(f'"content-digest": {content_digest}')

        # Build signature-input value
        components_str = " ".join(components)
        sig_params = f'({components_str});keyid="{self.key_id}";alg="ed25519";created={created}'
        lines.append(f'"@signature-params": {sig_params}')

        signature_base = "\n".join(lines)

        # Sign
        signature_bytes = self.private_key.sign(signature_base.encode())
        signature_b64 = b64encode(signature_bytes).decode()

        result = {
            "signature-input": f"sig1={sig_params}",
            "signature": f"sig1=:{signature_b64}:",
        }

        if content_digest:
            result["content-digest"] = content_digest

        return result


def extract_video_id(url_or_id: str) -> str:
    """Extract video ID from URL or return as-is if already an ID."""
    # Already an ID (11 chars)
    if re.match(r"^[a-zA-Z0-9_-]{11}$", url_or_id):
        return url_or_id

    # Various YouTube URL formats
    patterns = [
        r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([a-zA-Z0-9_-]{11})",
        r"youtube\.com/shorts/([a-zA-Z0-9_-]{11})",
    ]

    for pattern in patterns:
        match = re.search(pattern, url_or_id)
        if match:
            return match.group(1)

    raise ValueError(f"Could not extract video ID from: {url_or_id}")


def main():
    if len(sys.argv) < 2:
        print("Usage: ingest_video.py <youtube_url_or_id>", file=sys.stderr)
        sys.exit(1)

    url_or_id = sys.argv[1]

    try:
        video_id = extract_video_id(url_or_id)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

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

    # Prepare request
    url = f"{API_BASE}/youtube/ingest"
    body_data = {"url": f"https://youtube.com/watch?v={video_id}"}
    body_bytes = json.dumps(body_data).encode()

    # Parse host from URL
    from urllib.parse import urlparse

    parsed = urlparse(API_BASE)
    host = parsed.netloc

    # Sign request
    path = f"/api/v1/youtube/ingest"
    sig_headers = signer.sign_request("POST", path, host, body_bytes)

    headers = {
        "Content-Type": "application/json",
        **sig_headers,
    }

    # Make request
    print(f"Ingesting video: {video_id}")
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

        print(f"Video ID: {data['video_id']}")
        print(f"Title: {data['title']}")
        print(f"Transcript: {data['transcript_length']} chars")
        print(f"Chunks: {data['chunks_created']}")
        print(f"File: {data['file_path']}")
        print()

        if data.get("summary"):
            print("=== Summary ===")
            print(data["summary"])
        else:
            print("(No summary generated)")

    except httpx.RequestError as e:
        print(f"Error: Request failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
