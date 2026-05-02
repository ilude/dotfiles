---
description: Fetch YouTube transcript and metadata locally (no menos required)
argument-hint: <url-or-id> [--json] [--timed] [--urls-only]
---

Local YouTube fetcher -- standalone fallback for when the menos API is unavailable.
Uses `youtube-transcript-api` (with optional Webshare proxy) and YouTube Data API v3.

## Usage

```bash
cd ~/.claude/commands/yt-local

# Transcript (no API key needed; Webshare proxy optional)
uv run fetch_transcript.py "$ARGUMENTS"

# Transcript with timestamps / JSON
uv run fetch_transcript.py "$ARGUMENTS" --timed --json

# Metadata (requires YOUTUBE_API_KEY)
uv run fetch_metadata.py "$ARGUMENTS"

# Extract only URLs from the description
uv run fetch_metadata.py "$ARGUMENTS" --urls-only
```

## Environment

Both scripts auto-load `~/.dotfiles/.secrets`. Expected vars:

- `WEBSHARE_PROXY_USERNAME` / `WEBSHARE_PROXY_PASSWORD` -- optional, avoids transcript rate limits
- `YOUTUBE_API_KEY` -- required for `fetch_metadata.py`

## Execution

Given `$ARGUMENTS` (a YouTube URL or 11-char video ID):

1. Run `uv run ~/.claude/commands/yt-local/fetch_transcript.py "$ARGUMENTS"` to get the transcript.
2. If metadata is needed, run `uv run ~/.claude/commands/yt-local/fetch_metadata.py "$ARGUMENTS"`.
3. Summarize transcript and surface any URLs from the description.

If menos comes back online, prefer `/yt` (server-side ingestion + pipeline). This command is a local-only fallback.
