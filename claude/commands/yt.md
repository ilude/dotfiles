---
description: Fetch YouTube video transcript and/or metadata
argument-hint: <url-or-id> [--meta] [--timed] [--urls]
---

# YouTube Transcript & Metadata

Fetch transcripts and metadata from YouTube videos.

## Usage

The user wants to run: `/yt $ARGUMENTS`

Parse the arguments:
- **Required**: YouTube URL or video ID (e.g., `dQw4w9WgXcQ` or `https://youtube.com/watch?v=dQw4w9WgXcQ`)
- **Optional flags**:
  - `--meta` - Also fetch video metadata (title, description, duration, etc.)
  - `--timed` - Include timestamps in transcript
  - `--urls` - Extract URLs from video description (implies `--meta`)
  - `--json` - Output as JSON instead of plain text

## Execution

Run from the command directory:

```bash
cd ~/.dotfiles/claude/commands/yt

# Transcript (default)
uv run fetch_transcript.py "<video-url-or-id>" [--timed] [--json]

# Metadata
uv run fetch_metadata.py "<video-url-or-id>" [--json]

# URLs only from description
uv run fetch_metadata.py "<video-url-or-id>" --urls-only [--json]
```

## Examples

- `/yt dQw4w9WgXcQ` - Get transcript
- `/yt https://youtube.com/watch?v=abc123 --timed` - Transcript with timestamps
- `/yt abc123 --meta` - Transcript + metadata
- `/yt abc123 --urls` - Extract URLs from description
- `/yt abc123 --meta --json` - Full data as JSON

## Environment Variables

Required in `~/.dotfiles/.secrets`:
- `WEBSHARE_PROXY_USERNAME` / `WEBSHARE_PROXY_PASSWORD` - Proxy for rate limit avoidance
- `YOUTUBE_API_KEY` - Required for metadata fetching (--meta, --urls)

## Output

Present the transcript/metadata to the user. For long transcripts, summarize key points unless they request the full text.
