---
description: Ingest, search, list, or fetch YouTube content through menos
argument-hint: "<request>"
---

# Pi /yt workflow

YouTube request: $ARGUMENTS

Use this workflow to ingest, search, list, fetch content, or fetch transcripts for YouTube videos through menos.

## Ingest default

1. Extract the YouTube video ID or URL from the request.
2. Attempt menos first; `~/.claude/state/menos_status.json` is a display hint and never gates the attempt.

```bash
cd ~/.claude/commands/yt && unset VIRTUAL_ENV && uv run --isolated --frozen ingest_video.py "{url_or_video_id}"
```

3. On success, report `title`, `content_id`, and `job_id`.
4. On connection errors or 5xx responses only, locally fall back:

```bash
cd ~/.claude/commands/yt-local && unset VIRTUAL_ENV && uv run --script fetch_transcript.py "{url_or_video_id}"
cd ~/.claude/commands/yt-local && unset VIRTUAL_ENV && uv run --script fetch_metadata.py "{url_or_video_id}"
```

The local fetchers write `~/.dotfiles/yt/<video_id>/` and `.complete`. Tell the user the video was cached locally and will be background-backfilled when menos is available. Do not fall back for 4xx auth or validation errors.

The status file is a display hint only. If useful, mention `checked_at` / `available` as context.

## Other subcommands

- `channel <@handle_or_url>`: run `cd ~/.dotfiles/pi/skills/workflow/yt && unset VIRTUAL_ENV && uv run channel_videos.py "{handle_or_url}" --limit {n}` and render the results to the user. Supports `@name` and `https://www.youtube.com/@name`. The script calls menos first and falls back to the local YouTube Data API when menos is unreachable, returns 5xx, or the deployed menos version does not have the channel endpoint yet. The local fallback requires `YOUTUBE_API_KEY`.
- `list [n]`: run `cd ~/.claude/commands/yt && unset VIRTUAL_ENV && uv run --isolated --frozen list_videos.py {n}` and render the results to the user. No local fallback if menos is unreachable.
- `search <query>`: run `cd ~/.claude/commands/yt && unset VIRTUAL_ENV && uv run --isolated --frozen search.py {query}` and render scores/IDs/snippets. No local fallback if menos is unreachable.
- `content <content_id>`: run `cd ~/.claude/commands/yt && unset VIRTUAL_ENV && uv run --isolated --frozen get_content.py {content_id} --json`. No local fallback if menos is unreachable.
- `transcript <video_id_or_url>`: first run `cd ~/.claude/commands/yt && unset VIRTUAL_ENV && uv run --isolated --frozen find_content.py {video_id_or_url}`, then `cd ~/.claude/commands/yt && unset VIRTUAL_ENV && uv run --isolated --frozen get_content.py {content_id} --transcript-only`. If menos is unreachable and `~/.dotfiles/yt/<video_id>/transcript.txt` exists, display the local transcript.

## Manual local upload

For a completed local cache, upload it explicitly with:

```bash
cd ~/.claude/commands/yt && unset VIRTUAL_ENV && uv run --isolated --frozen ingest_video.py "{video_id}" --from-local
```
