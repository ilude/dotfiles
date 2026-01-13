#!/usr/bin/env python
"""YouTube transcript fetcher with Webshare proxy support.

Usage:
    uv run fetch_transcript.py <youtube_url_or_video_id> [--timed] [--json]
    uv run fetch_transcript.py https://youtube.com/watch?v=dQw4w9WgXcQ
    uv run fetch_transcript.py dQw4w9WgXcQ --timed --json

Environment variables:
    WEBSHARE_PROXY_USERNAME - Webshare proxy username
    WEBSHARE_PROXY_PASSWORD - Webshare proxy password
    YOUTUBE_TRANSCRIPT_USE_PROXY - Set to "false" to disable proxy (default: true)
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Optional


def load_secrets_file() -> None:
    """Load secrets from ~/.dotfiles/.secrets if env vars not set.

    Parses bash-style export VAR=value lines and sets them as env vars.
    This allows the script to work even when not run from a shell that sourced .secrets.
    """
    secrets_path = Path.home() / ".dotfiles" / ".secrets"
    if not secrets_path.exists():
        return

    for line in secrets_path.read_text().splitlines():
        line = line.strip()
        # Skip comments and empty lines
        if not line or line.startswith("#"):
            continue
        # Parse: export VAR=value or VAR=value
        match = re.match(r'^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$', line)
        if match:
            name, value = match.groups()
            # Remove surrounding quotes if present
            value = value.strip('\'"')
            # Only set if not already in environment
            if name not in os.environ:
                os.environ[name] = value


# Load secrets before anything else
load_secrets_file()


def extract_video_id(url_or_id: str) -> str:
    """Extract video ID from YouTube URL or return as-is if already an ID."""
    # If it's already an 11-character ID, return it
    if re.match(r'^[0-9A-Za-z_-]{11}$', url_or_id):
        return url_or_id

    patterns = [
        r'(?:v=|\/)([0-9A-Za-z_-]{11}).*',
        r'youtu\.be\/([0-9A-Za-z_-]{11})',
    ]

    for pattern in patterns:
        match = re.search(pattern, url_or_id)
        if match:
            return match.group(1)

    raise ValueError(f"Could not extract video ID from: {url_or_id}")


class YouTubeTranscriptService:
    """YouTube transcript fetcher with Webshare proxy support."""

    def __init__(
        self,
        proxy_username: Optional[str] = None,
        proxy_password: Optional[str] = None,
        use_proxy: Optional[bool] = None,
    ):
        from youtube_transcript_api import YouTubeTranscriptApi
        from youtube_transcript_api.proxies import WebshareProxyConfig

        self.proxy_username = proxy_username or os.getenv("WEBSHARE_PROXY_USERNAME")
        self.proxy_password = proxy_password or os.getenv("WEBSHARE_PROXY_PASSWORD")

        if use_proxy is None:
            use_proxy_env = os.getenv("YOUTUBE_TRANSCRIPT_USE_PROXY", "true").lower()
            use_proxy = use_proxy_env in ("true", "1", "yes")

        self.use_proxy = use_proxy
        self.proxy_config = None
        self._proxy_configured = False

        if self.use_proxy and self.proxy_username and self.proxy_password:
            self.proxy_config = WebshareProxyConfig(
                proxy_username=self.proxy_username,
                proxy_password=self.proxy_password,
            )
            self._proxy_configured = True

    def _get_api(self):
        from youtube_transcript_api import YouTubeTranscriptApi

        if self._proxy_configured:
            return YouTubeTranscriptApi(proxy_config=self.proxy_config)
        return YouTubeTranscriptApi()

    def fetch_transcript(self, video_id: str, languages: Optional[list[str]] = None) -> str:
        """Fetch transcript as single string."""
        if languages is None:
            languages = ["en"]

        api = self._get_api()
        fetched = api.fetch(video_id, languages=languages)
        return " ".join(snippet.text for snippet in fetched.snippets)

    def fetch_timed_transcript(
        self, video_id: str, languages: Optional[list[str]] = None
    ) -> list[dict]:
        """Fetch transcript with timestamps."""
        if languages is None:
            languages = ["en"]

        api = self._get_api()
        fetched = api.fetch(video_id, languages=languages)

        return [
            {"text": snippet.text, "start": snippet.start, "duration": snippet.duration}
            for snippet in fetched.snippets
        ]

    def is_proxy_configured(self) -> bool:
        return self._proxy_configured


def main():
    parser = argparse.ArgumentParser(
        description="Fetch YouTube video transcript with proxy support"
    )
    parser.add_argument(
        "video",
        help="YouTube URL or video ID"
    )
    parser.add_argument(
        "--timed",
        action="store_true",
        help="Include timestamps in output"
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output as JSON"
    )
    parser.add_argument(
        "--languages",
        default="en",
        help="Comma-separated language codes (default: en)"
    )
    parser.add_argument(
        "--no-proxy",
        action="store_true",
        help="Disable proxy even if credentials are set"
    )

    args = parser.parse_args()

    try:
        video_id = extract_video_id(args.video)
        languages = [lang.strip() for lang in args.languages.split(",")]

        service = YouTubeTranscriptService(
            use_proxy=not args.no_proxy
        )

        # Show proxy status on stderr
        if service.is_proxy_configured():
            print("Using Webshare proxy", file=sys.stderr)
        else:
            print("No proxy configured (direct connection)", file=sys.stderr)

        if args.timed:
            result = service.fetch_timed_transcript(video_id, languages)
            if args.json:
                print(json.dumps(result, indent=2))
            else:
                for segment in result:
                    print(f"[{segment['start']:.1f}s] {segment['text']}")
        else:
            result = service.fetch_transcript(video_id, languages)
            if args.json:
                print(json.dumps({"video_id": video_id, "transcript": result}))
            else:
                print(result)

    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error fetching transcript: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
