#!/usr/bin/env python
"""YouTube metadata fetcher using YouTube Data API v3.

Usage:
    uv run fetch_metadata.py <youtube_url_or_video_id> [--json] [--urls-only]
    uv run fetch_metadata.py https://youtube.com/watch?v=dQw4w9WgXcQ
    uv run fetch_metadata.py dQw4w9WgXcQ --json
    uv run fetch_metadata.py dQw4w9WgXcQ --output metadata.json

Environment variables:
    YOUTUBE_API_KEY - YouTube Data API v3 key (required)
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional


def load_secrets_file() -> None:
    """Load secrets from ~/.dotfiles/.env if env vars not set."""
    secrets_path = Path.home() / ".dotfiles" / ".env"
    if not secrets_path.exists():
        secrets_path = Path.home() / ".dotfiles" / ".secrets"
    if not secrets_path.exists():
        return

    for line in secrets_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        match = re.match(r'^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$', line)
        if match:
            name, value = match.groups()
            value = value.strip('\'"')
            if name not in os.environ:
                os.environ[name] = value


# Load secrets before anything else
load_secrets_file()


def extract_video_id(url_or_id: str) -> str:
    """Extract video ID from YouTube URL or return as-is if already an ID."""
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


def extract_urls(text: str) -> list[str]:
    """Extract all URLs from text (e.g., video description).

    Args:
        text: Text to extract URLs from

    Returns:
        List of URLs (deduplicated, preserving order)
    """
    url_pattern = r'https?://[^\s<>"{}|\\^`\[\]]+'
    urls = re.findall(url_pattern, text)

    # Clean trailing punctuation
    cleaned_urls = []
    for url in urls:
        url = url.rstrip(".,;:!?)")
        if url.endswith(")") and url.count("(") < url.count(")"):
            url = url.rstrip(")")
        cleaned_urls.append(url)

    # Deduplicate while preserving order
    seen = set()
    unique_urls = []
    for url in cleaned_urls:
        if url not in seen:
            seen.add(url)
            unique_urls.append(url)

    return unique_urls


def parse_duration_to_seconds(duration: str) -> int:
    """Parse ISO 8601 duration to seconds.

    Args:
        duration: ISO 8601 duration (e.g., "PT15M33S", "PT1H2M3S")

    Returns:
        Duration in seconds
    """
    match = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', duration)
    if not match:
        return 0

    hours, minutes, seconds = match.groups()
    hours = int(hours) if hours else 0
    minutes = int(minutes) if minutes else 0
    seconds = int(seconds) if seconds else 0

    return hours * 3600 + minutes * 60 + seconds


def format_duration(duration: str) -> str:
    """Format ISO 8601 duration to human-readable format.

    Args:
        duration: ISO 8601 duration (e.g., "PT15M33S")

    Returns:
        Human-readable duration (e.g., "15:33" or "1:02:03")
    """
    match = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', duration)
    if not match:
        return duration

    hours, minutes, seconds = match.groups()
    hours = int(hours) if hours else 0
    minutes = int(minutes) if minutes else 0
    seconds = int(seconds) if seconds else 0

    if hours > 0:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes}:{seconds:02d}"


class YouTubeMetadataService:
    """Service for fetching YouTube video metadata using Data API v3."""

    def __init__(self, api_key: Optional[str] = None):
        """Initialize metadata service.

        Args:
            api_key: YouTube Data API v3 key (uses YOUTUBE_API_KEY env var if not provided)
        """
        self.api_key = api_key or os.getenv("YOUTUBE_API_KEY")

        if not self.api_key:
            raise ValueError(
                "YouTube API key not provided and YOUTUBE_API_KEY environment variable not set"
            )

        from googleapiclient.discovery import build
        self.youtube = build("youtube", "v3", developerKey=self.api_key)

    def fetch_metadata(self, video_id: str) -> dict:
        """Fetch metadata for a YouTube video.

        Args:
            video_id: YouTube video ID (11 characters)

        Returns:
            Dict with metadata fields:
                - video_id: str
                - title: str
                - description: str (full text)
                - description_urls: list[str] (URLs extracted from description)
                - published_at: str (ISO 8601 timestamp)
                - channel_id: str
                - channel_title: str
                - duration: str (ISO 8601)
                - duration_seconds: int
                - duration_formatted: str (e.g., "15:33")
                - view_count: int
                - like_count: int | None
                - comment_count: int | None
                - tags: list[str]
                - category_id: str
                - thumbnails: dict
                - fetched_at: str (ISO 8601 timestamp)

        Raises:
            HttpError: If API request fails
            ValueError: If video not found
        """
        from googleapiclient.errors import HttpError

        request = self.youtube.videos().list(
            part="snippet,statistics,contentDetails",
            id=video_id,
        )
        response = request.execute()

        if not response.get("items"):
            raise ValueError(f"Video not found: {video_id}")

        video = response["items"][0]
        snippet = video["snippet"]
        statistics = video.get("statistics", {})
        content_details = video["contentDetails"]

        duration_iso = content_details["duration"]
        duration_seconds = parse_duration_to_seconds(duration_iso)
        description = snippet.get("description", "")

        metadata = {
            "video_id": video_id,
            "title": snippet["title"],
            "description": description,
            "description_urls": extract_urls(description),
            "published_at": snippet["publishedAt"],
            "channel_id": snippet["channelId"],
            "channel_title": snippet["channelTitle"],
            "duration": duration_iso,
            "duration_seconds": duration_seconds,
            "duration_formatted": format_duration(duration_iso),
            "view_count": int(statistics.get("viewCount", 0)),
            "like_count": int(statistics["likeCount"]) if "likeCount" in statistics else None,
            "comment_count": int(statistics["commentCount"]) if "commentCount" in statistics else None,
            "tags": snippet.get("tags", []),
            "category_id": snippet.get("categoryId"),
            "thumbnails": snippet.get("thumbnails", {}),
            "fetched_at": datetime.now().isoformat(),
        }

        return metadata

    def fetch_metadata_safe(self, video_id: str) -> tuple[Optional[dict], Optional[str]]:
        """Fetch metadata with error handling.

        Returns:
            Tuple of (metadata_dict, error_string)
        """
        from googleapiclient.errors import HttpError

        try:
            metadata = self.fetch_metadata(video_id)
            return metadata, None
        except HttpError as e:
            return None, f"YouTube API error: {e}"
        except ValueError as e:
            return None, str(e)
        except Exception as e:
            return None, f"Unexpected error: {e}"


def main():
    parser = argparse.ArgumentParser(
        description="Fetch YouTube video metadata using Data API v3"
    )
    parser.add_argument(
        "video",
        help="YouTube URL or video ID"
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output as JSON (default: human-readable)"
    )
    parser.add_argument(
        "--urls-only",
        action="store_true",
        help="Only extract and print URLs from description"
    )
    parser.add_argument(
        "--description-only",
        action="store_true",
        help="Only print the video description"
    )
    parser.add_argument(
        "--output",
        help="Write metadata to JSON file"
    )

    args = parser.parse_args()

    try:
        video_id = extract_video_id(args.video)

        service = YouTubeMetadataService()
        metadata, error = service.fetch_metadata_safe(video_id)

        if error:
            print(f"Error: {error}", file=sys.stderr)
            sys.exit(1)

        if args.output:
            output_path = Path(args.output)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with output_path.open("w", encoding="utf-8") as f:
                json.dump(metadata, f, indent=2)
            print(f"Metadata saved to: {args.output}", file=sys.stderr)
            return

        if args.urls_only:
            urls = metadata["description_urls"]
            if args.json:
                print(json.dumps({"video_id": video_id, "urls": urls}, indent=2))
            else:
                for url in urls:
                    print(url)
            return

        if args.description_only:
            if args.json:
                print(json.dumps({
                    "video_id": video_id,
                    "description": metadata["description"],
                    "urls": metadata["description_urls"]
                }, indent=2))
            else:
                print(metadata["description"])
            return

        if args.json:
            print(json.dumps(metadata, indent=2))
        else:
            # Human-readable output
            print(f"Title: {metadata['title']}")
            print(f"Channel: {metadata['channel_title']}")
            print(f"Duration: {metadata['duration_formatted']}")
            print(f"Views: {metadata['view_count']:,}")
            if metadata['like_count']:
                print(f"Likes: {metadata['like_count']:,}")
            print(f"Published: {metadata['published_at']}")
            if metadata['tags']:
                print(f"Tags: {', '.join(metadata['tags'][:10])}")
            print(f"\nDescription:\n{metadata['description'][:500]}...")
            if metadata['description_urls']:
                print(f"\nURLs in description ({len(metadata['description_urls'])}):")
                for url in metadata['description_urls'][:10]:
                    print(f"  {url}")
                if len(metadata['description_urls']) > 10:
                    print(f"  ... and {len(metadata['description_urls']) - 10} more")

    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error fetching metadata: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
