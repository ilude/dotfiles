# Pi /yt workflow

Use this skill when the user asks Pi to ingest, search, list, fetch content, or fetch transcripts for YouTube videos through menos.

## Ingest default

1. Extract the YouTube video ID or URL from the request.
2. Always attempt menos first; do not gate on `~/.claude/state/menos_status.json`.

```bash
cd ~/.claude/commands/yt && unset VIRTUAL_ENV && uv run ingest_video.py "{url_or_video_id}"
```

3. On success, report `title`, `content_id`, and `job_id`.
4. On connection errors or 5xx responses only, locally fall back:

```bash
cd ~/.claude/commands/yt-local && uv run fetch_transcript.py "{url_or_video_id}"
cd ~/.claude/commands/yt-local && uv run fetch_metadata.py "{url_or_video_id}"
```

The local fetchers write `~/.dotfiles/yt/<video_id>/` and `.complete`. Tell the user the video was cached locally and will be background-backfilled when menos is available. Do not fall back for 4xx auth or validation errors.

The status file is a display hint only. If useful, mention `checked_at` / `available` as context.

## Other subcommands

- `list [n]`: run `cd ~/.claude/commands/yt && unset VIRTUAL_ENV && uv run list_videos.py {n}` and render the results to the user. No local fallback if menos is unreachable.
- `search <query>`: run `cd ~/.claude/commands/yt && unset VIRTUAL_ENV && uv run search.py {query}` and render scores/IDs/snippets. No local fallback if menos is unreachable.
- `content <content_id>`: run `cd ~/.claude/commands/yt && unset VIRTUAL_ENV && uv run get_content.py {content_id} --json`. No local fallback if menos is unreachable.
- `transcript <video_id_or_url>`: first try menos via `find_content.py` then `get_content.py --transcript-only`. If menos is unreachable and `~/.dotfiles/yt/<video_id>/transcript.txt` exists, display the local transcript.

## Manual local upload

For a completed local cache, upload it explicitly with:

```bash
cd ~/.claude/commands/yt && unset VIRTUAL_ENV && uv run ingest_video.py "{video_id}" --from-local
```
