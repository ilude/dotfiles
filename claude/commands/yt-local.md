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

Both scripts auto-load `~/.dotfiles/.env` without overriding already-set environment variables. Expected vars:

- `WEBSHARE_PROXY_USERNAME` / `WEBSHARE_PROXY_PASSWORD` -- optional, avoids transcript rate limits
- `YOUTUBE_API_KEY` -- required for `fetch_metadata.py`

## Persisted Output

Both scripts still print their requested output to stdout, but they also persist fetched data under:

```text
~/.dotfiles/yt/<video_id>/
```

Transcript outputs, depending on flags:

```text
transcript.txt
transcript.json
transcript.timed.txt
transcript.timed.json
```

Metadata outputs:

```text
metadata.json
metadata.txt
description.txt
description_urls.txt
```

The `yt/` directory is gitignored and should be treated as local fetched data.

## Execution

Given `$ARGUMENTS` (a YouTube URL or 11-char video ID):

1. Run `uv run ~/.claude/commands/yt-local/fetch_transcript.py "$ARGUMENTS"` to fetch and persist the transcript.
2. If metadata is needed, run `uv run ~/.claude/commands/yt-local/fetch_metadata.py "$ARGUMENTS"` to fetch and persist metadata, description, and description URLs.
3. Prefer reading the saved files in `~/.dotfiles/yt/<video_id>/` for summarization, especially for long transcripts. Use stdout as a quick preview.
4. Summarize transcript content and surface any URLs from `description_urls.txt`.

If menos comes back online, prefer `/yt` (server-side ingestion + pipeline). This command is a local-only fallback that persists local fetched artifacts but does not ingest into the menos vault.
