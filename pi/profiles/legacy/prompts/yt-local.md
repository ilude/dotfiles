---
description: Fetch YouTube transcript or metadata locally without Onclave
argument-hint: "<url-or-id> [transcript|metadata] [options]"
---

# Pi /yt-local workflow

Local YouTube request: $ARGUMENTS

Use this workflow only for an explicitly requested local fetch. It writes artifacts under `~/.dotfiles/yt/<video_id>/` and does not ingest them into Onclave.

1. Extract the YouTube video ID or URL and determine whether the user requested transcript, metadata, or both.
2. Run only the requested local operations from `~/.dotfiles/tools/onclave-youtube`.

Transcript:

```bash
cd ~/.dotfiles/tools/onclave-youtube && unset VIRTUAL_ENV && uv run fetch_transcript.py "{url_or_video_id}" {requested_transcript_flags}
```

Metadata:

```bash
cd ~/.dotfiles/tools/onclave-youtube && unset VIRTUAL_ENV && uv run fetch_metadata.py "{url_or_video_id}" {requested_metadata_flags}
```

Supported transcript flags include `--timed` and `--json`; metadata supports `--urls-only`. Metadata requires `YOUTUBE_API_KEY`. Transcript fetching can optionally use `WEBSHARE_PROXY_USERNAME` and `WEBSHARE_PROXY_PASSWORD`.

3. Prefer the persisted files under `~/.dotfiles/yt/<video_id>/` when reading long output.
4. Report which artifacts were written and any retrieval failure clearly. Do not upload or backfill the local cache unless the user explicitly requests it.
