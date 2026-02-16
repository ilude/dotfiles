# YouTube Ingest & Retrieval

Ingest YouTube videos via menos API and return ingest status/job information.

## Usage

The user wants to run: `/yt $ARGUMENTS`

Parse the arguments to determine the subcommand:

### Subcommand: `list [n]`

If the first argument is `list`, show recently ingested videos.

- **Optional**: number of videos to show (default: 10, max: 100)

Run:
```bash
cd ~/.claude/commands/yt && unset VIRTUAL_ENV && uv run list_videos.py {n}
```

**IMPORTANT**: The script output is NOT visible to the user — only you can see it. You MUST read the script output, then format and display it back to the user as a markdown table or formatted list. Do not just run the command and say "here are the results" — the user cannot see tool output. Reproduce the full list in your response.

Stop after displaying. No further steps needed.

### Subcommand: ingest (default)

If the first argument is NOT `list`, treat it as an ingest request.

- **Required**: YouTube URL or video ID (e.g., `dQw4w9WgXcQ` or `https://youtube.com/watch?v=dQw4w9WgXcQ`)
- **Optional flags**: `--wait` (poll job to terminal state), `--verbose` (show full job fields when polling)

## Execution Steps

### 1. Extract Video ID

Extract the 11-character video ID from the URL or use directly if already an ID.

### 2. Call menos API

```bash
cd ~/.claude/commands/yt && unset VIRTUAL_ENV && uv run ingest_video.py "{url_or_video_id}"
```

This command calls the unified ingest endpoint: `POST /api/v1/ingest`.

The API will:
- Fetch the transcript via server-side proxy
- Store transcript in MinIO at `youtube/{video_id}/transcript.txt`
- Store metadata in MinIO at `youtube/{video_id}/metadata.json`
- Enqueue unified pipeline processing (summary/tags/entities/quality are asynchronous)

### 3. Return Results

Show ingest response fields (`video_id`, `title`, `job_id`, chunk/transcript counts).

If `job_id` exists, tell the user pipeline processing is asynchronous and that `--wait` can be used for completion polling.

Include storage note:
```
Files stored in MinIO (menos bucket):
- youtube/{video_id}/transcript.txt
- youtube/{video_id}/metadata.json

To browse files: rclone mount menos:menos L: --vfs-cache-mode full
```

## Follow-Up Questions

When the user asks detailed questions about the video:
- Use `GET /api/v1/youtube/{video_id}` for transcript + pipeline output fields
- Use `GET /api/v1/youtube/{video_id}/transcript` for raw text only
- If ingest just ran, poll `GET /api/v1/jobs/{job_id}` until terminal before expecting summary/tags/topics/entities

## Environment Setup

Required:
- SSH key at `~/.ssh/id_ed25519` (for API auth)
- menos API running at `192.168.16.241:8000`

Optional (for local file browsing):
- rclone configured with `menos` remote
- Mount: `rclone mount menos:menos L: --vfs-cache-mode full`

## Example Session

User: `/yt dQw4w9WgXcQ`

1. Run: `cd ~/.claude/commands/yt && unset VIRTUAL_ENV && uv run ingest_video.py dQw4w9WgXcQ`
2. API fetches transcript and creates/queues pipeline job
3. Display ingest result and job_id
4. Note where transcript/metadata are stored

User: "What does the video say about X?"

1. Use API or rclone to access transcript
2. Search/read relevant sections
