---
description: Fetch YouTube video transcript and/or metadata
argument-hint: <url-or-id>
---

# YouTube Transcript & Metadata

Ingest YouTube videos via menos API with automatic summary generation.

## Usage

The user wants to run: `/yt $ARGUMENTS`

Parse the arguments:
- **Required**: YouTube URL or video ID (e.g., `dQw4w9WgXcQ` or `https://youtube.com/watch?v=dQw4w9WgXcQ`)

## Execution Steps

### 1. Extract Video ID

Extract the 11-character video ID from the URL or use directly if already an ID.

### 2. Call menos API

```bash
cd ~/.dotfiles/claude/commands/yt && uv run ingest_video.py "{url_or_video_id}"
```

The API will:
- Fetch the transcript via server-side proxy
- Store transcript in MinIO at `youtube/{video_id}/transcript.txt`
- Store metadata in MinIO at `youtube/{video_id}/metadata.json`
- Generate summary using qwen3 LLM
- Store summary in MinIO at `youtube/{video_id}/summary.md`
- Create embeddings for semantic search

### 3. Return Results

Present the summary returned by the API to the user.

Include storage note:
```
Files stored in MinIO (menos bucket):
- youtube/{video_id}/transcript.txt
- youtube/{video_id}/metadata.json
- youtube/{video_id}/summary.md

To browse files: rclone mount menos:menos L: --vfs-cache-mode full
```

## Follow-Up Questions

When the user asks detailed questions about the video:
- The transcript is stored on the menos server
- Use the menos API `/youtube/{video_id}` endpoint to retrieve info
- Or browse files via rclone mount

## Environment Setup

Required:
- SSH key at `~/.ssh/id_ed25519` (for API auth)
- menos API running at `192.168.16.241:8000`

Optional (for local file browsing):
- rclone configured with `menos` remote
- Mount: `rclone mount menos:menos L: --vfs-cache-mode full`

## Example Session

User: `/yt dQw4w9WgXcQ`

1. Run: `cd ~/.dotfiles/claude/commands/yt && uv run ingest_video.py dQw4w9WgXcQ`
2. API fetches transcript, generates summary
3. Display summary to user
4. Note files stored in MinIO

User: "What does the video say about X?"

1. Use API or rclone to access transcript
2. Search/read relevant sections
