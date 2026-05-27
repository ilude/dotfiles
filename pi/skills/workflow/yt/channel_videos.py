#!/usr/bin/env python
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "cryptography>=42.0.0",
#     "google-api-python-client>=2.0.0",
#     "httpx>=0.27.0",
# ]
# ///
"""List videos from a YouTube channel via menos, with local fallback."""

import argparse
import io
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlencode

import httpx
from api_config import get_api_base, get_api_host, load_secrets_file
from signing import RequestSigner

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "buffer"):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


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


def _resolve_channel_id(youtube, channel: str) -> str:
    channel = channel.strip().rstrip("/")
    match = re.search(r"youtube\.com/channel/([^/?#]+)", channel)
    if match:
        return match.group(1)
    if "youtube.com/@" in channel:
        handle = channel.split("youtube.com/@", 1)[1].split("/", 1)[0]
    elif channel.startswith("@"):
        handle = channel[1:]
    else:
        raise ValueError("channel must be an @handle or https://www.youtube.com/@handle")

    response = youtube.search().list(
        part="snippet",
        q=handle,
        type="channel",
        maxResults=1,
    ).execute()
    if not response.get("items"):
        raise ValueError(f"No channel found for @{handle}")
    return response["items"][0]["snippet"]["channelId"]


def _format_duration(duration: str) -> str:
    match = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", duration)
    if not match:
        return duration
    hours, minutes, seconds = match.groups()
    hours = int(hours) if hours else 0
    minutes = int(minutes) if minutes else 0
    seconds = int(seconds) if seconds else 0
    if hours > 0:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes}:{seconds:02d}"


def _local_channel_videos(channel: str, limit: int) -> dict:
    load_secrets_file()
    api_key = os.getenv("YOUTUBE_API_KEY")
    if not api_key:
        raise ValueError("YOUTUBE_API_KEY environment variable is not set")
    from googleapiclient.discovery import build

    youtube = build("youtube", "v3", developerKey=api_key)
    channel_id = _resolve_channel_id(youtube, channel)
    channels_response = youtube.channels().list(
        part="contentDetails",
        id=channel_id,
    ).execute()
    if not channels_response.get("items"):
        raise ValueError(f"No channel found with ID: {channel_id}")
    playlist_id = channels_response["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]

    video_ids = []
    titles = {}
    published = {}
    page_token = None
    while len(video_ids) < limit:
        response = youtube.playlistItems().list(
            part="snippet,contentDetails",
            playlistId=playlist_id,
            maxResults=min(50, limit - len(video_ids)),
            pageToken=page_token,
        ).execute()
        for item in response.get("items", []):
            video_id = item["contentDetails"]["videoId"]
            video_ids.append(video_id)
            titles[video_id] = item["snippet"]["title"]
            published[video_id] = item["snippet"]["publishedAt"]
        page_token = response.get("nextPageToken")
        if not page_token:
            break

    videos = []
    for index in range(0, len(video_ids), 50):
        batch = video_ids[index:index + 50]
        details = youtube.videos().list(
            part="snippet,statistics,contentDetails",
            id=",".join(batch),
        ).execute()
        by_id = {item["id"]: item for item in details.get("items", [])}
        for video_id in batch:
            item = by_id.get(video_id)
            duration = None
            view_count = None
            title = titles[video_id]
            if item:
                title = item["snippet"]["title"]
                duration = _format_duration(item["contentDetails"]["duration"])
                stats = item.get("statistics", {})
                view_count = int(stats["viewCount"]) if "viewCount" in stats else None
            videos.append({
                "video_id": video_id,
                "title": title,
                "url": f"https://www.youtube.com/watch?v={video_id}",
                "published_at": published[video_id],
                "duration": duration,
                "view_count": view_count,
            })
    return {"channel": channel, "count": len(videos), "videos": videos, "source": "local"}


def _menos_channel_videos(channel: str, limit: int) -> dict:
    signer = _load_signer()
    api_base = get_api_base()
    host = get_api_host()
    query = urlencode({"channel": channel, "limit": limit})
    path = f"/api/v1/youtube/channel?{query}"
    url = f"{api_base}/youtube/channel?{query}"
    headers = signer.sign_request("GET", path, host)
    with httpx.Client(timeout=60.0) as client:
        response = client.get(url, headers=headers)
        if response.status_code == 404:
            raise httpx.RequestError(
                "API endpoint not found; deployed menos does not support channel listing yet"
            )
        if response.status_code >= 500:
            raise httpx.RequestError(
                f"API returned {response.status_code}: {response.text}"
            )
        if response.status_code != 200:
            print(f"Error: API returned {response.status_code}", file=sys.stderr)
            print(response.text, file=sys.stderr)
            sys.exit(1)
        data = response.json()
        data["source"] = "menos"
        return data


def _print_text(data: dict) -> None:
    source = data.get("source", "unknown")
    videos = data.get("videos", [])
    print(f"Found {len(videos)} videos via {source}:\n")
    for i, video in enumerate(videos, 1):
        published = (video.get("published_at") or "")[:10]
        duration = video.get("duration") or "n/a"
        views = video.get("view_count")
        views_text = f"  views: {views}" if views is not None else ""
        print(f"  {i:>3}. {video.get('title', 'Untitled')}")
        print(
            f"       {video.get('url')}  published: {published}  "
            f"duration: {duration}{views_text}"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="List videos from a YouTube channel")
    parser.add_argument("channel", help="YouTube @handle or https://www.youtube.com/@handle")
    parser.add_argument("--limit", type=int, default=50, help="Number of videos to list")
    parser.add_argument("--json", action="store_true", dest="json_output")
    args = parser.parse_args()

    limit = min(max(args.limit, 1), 500)
    try:
        data = _menos_channel_videos(args.channel, limit)
    except httpx.RequestError as e:
        print(
            f"Warning: menos unavailable, falling back to local YouTube API: {e}",
            file=sys.stderr,
        )
        try:
            data = _local_channel_videos(args.channel, limit)
        except Exception as local_error:
            print(f"Error: local fallback failed: {local_error}", file=sys.stderr)
            sys.exit(1)

    if args.json_output:
        print(json.dumps(data, indent=2))
    else:
        _print_text(data)


if __name__ == "__main__":
    main()
