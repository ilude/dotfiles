---
name: yt-local
description: Fetch YouTube transcript and metadata locally (no menos required)
---

Local YouTube fetcher -- standalone fallback for when the menos API is unavailable.
Uses `youtube-transcript-api` (with optional Webshare proxy) and YouTube Data API v3.

## Input

**URL or video ID**: ${args}

If no input is provided, ask: "What YouTube URL or video ID should I fetch?"

## Scripts

The scripts live at `~/.claude/commands/yt-local/` (cross-platform; `~/.dotfiles/claude/` is linked to `~/.claude`):

- `fetch_transcript.py` -- transcript via `youtube-transcript-api`, optional Webshare proxy
- `fetch_metadata.py` -- video metadata + description URLs via YouTube Data API v3

Both scripts auto-load env vars from `~/.dotfiles/.env` without overriding already-set environment variables:

- `WEBSHARE_PROXY_USERNAME` / `WEBSHARE_PROXY_PASSWORD` -- optional, avoids transcript rate limits
- `YOUTUBE_API_KEY` -- required for metadata

## Execution

1. Run the transcript fetch:

   ```bash
   uv run ~/.claude/commands/yt-local/fetch_transcript.py "${args}"
   ```

   Useful flags: `--timed` (timestamps), `--json`, `--languages en,en-US`, `--no-proxy`.

2. If metadata is needed (title, channel, description URLs), run:

   ```bash
   uv run ~/.claude/commands/yt-local/fetch_metadata.py "${args}"
   ```

   Add `--urls-only` to extract only URLs from the description, or `--json` for the full payload.

3. After each script runs, prefer reading the saved files under `~/.dotfiles/yt/<video_id>/` for summarization, especially for long transcripts. Stdout is still available as a quick preview.
4. Summarize transcript content and surface any URLs from `description_urls.txt` when metadata was fetched.

## Persisted Output

The scripts persist fetched data under:

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

## When to use

- Menos API is down or unreachable.
- Working offline / on a machine without menos credentials.
- Quick one-off transcript or URL extraction without ingesting into the vault.

If menos is available, prefer `/yt` -- it ingests into the content vault and runs the full processing pipeline. `/yt-local` is a fallback that persists local fetched artifacts but does not ingest into the menos vault.
