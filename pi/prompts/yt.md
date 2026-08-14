---
description: Ingest, search, list, or fetch YouTube content through Onclave
argument-hint: "<request>"
---

# Pi /yt workflow

YouTube request: $ARGUMENTS

Use this workflow to ingest, search, list, fetch content, or fetch transcripts for YouTube videos through the Onclave vault API.

`ONCLAVE_API_BASE` is the only explicit endpoint override. When it is absent, the client derives `https://onclave.<HOST_DOMAIN>/api/v1` from `HOST_DOMAIN`. It fails clearly when neither value is configured.

Run Onclave operations from `~/.dotfiles/tools/onclave-youtube` with the `onclave-youtube` command. Do not use local fetchers as a fallback. If the Onclave request fails, report the failure clearly. Local transcript or metadata fetching is only available through the explicit `/yt-local` workflow.

## Ingest default

1. Extract the YouTube video ID or URL from the request.
2. Ingest it through Onclave:

```bash
cd ~/.dotfiles/tools/onclave-youtube && unset VIRTUAL_ENV && uv run onclave-youtube ingest "{url_or_video_id}"
```

3. On success, report `title`, `content_id`, and `job_id`.

## Other subcommands

- `channel <@handle_or_url>`: run `cd ~/.dotfiles/tools/onclave-youtube && unset VIRTUAL_ENV && uv run onclave-youtube channel "{handle_or_url}" --limit {n}` and render the results to the user. Supports `@name` and `https://www.youtube.com/@name`.
- `list [n]`: run `cd ~/.dotfiles/tools/onclave-youtube && unset VIRTUAL_ENV && uv run onclave-youtube list {n}` and render the results to the user.
- `search <query>`: run `cd ~/.dotfiles/tools/onclave-youtube && unset VIRTUAL_ENV && uv run onclave-youtube search {query}` and render scores, IDs, and snippets.
- `content <content_id>`: run `cd ~/.dotfiles/tools/onclave-youtube && unset VIRTUAL_ENV && uv run onclave-youtube content {content_id} --json`.
- `transcript <video_id_or_url>`: first run `cd ~/.dotfiles/tools/onclave-youtube && unset VIRTUAL_ENV && uv run onclave-youtube find {video_id_or_url}`, then run `cd ~/.dotfiles/tools/onclave-youtube && unset VIRTUAL_ENV && uv run onclave-youtube content {content_id} --transcript-only`.

## Manual local upload

For a completed local cache created through `/yt-local`, upload it explicitly with:

```bash
cd ~/.dotfiles/tools/onclave-youtube && unset VIRTUAL_ENV && uv run onclave-youtube ingest "{video_id}" --from-local
```
