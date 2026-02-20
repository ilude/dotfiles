# YouTube Ingest & Retrieval

Ingest YouTube videos via menos API, retrieve transcripts, and search ingested content.

## Usage

The user wants to run: `/yt $ARGUMENTS`

Parse the arguments to determine the subcommand:

### Subcommand: `list [n]`

If the first argument is `list`, show recently ingested videos.

- **Optional**: number of videos to show (default: 10, max: 100)
- **Optional flags**: `--all` (include test content), `--test` (only test content)

Run:
```bash
cd ~/.claude/commands/yt && unset VIRTUAL_ENV && uv run list_videos.py {n}
```

**IMPORTANT**: The script output is NOT visible to the user -- only you can see it. You MUST read the script output, then format and display it back to the user as a markdown table or formatted list. Do not just run the command and say "here are the results" -- the user cannot see tool output. Reproduce the full list in your response.

Stop after displaying. No further steps needed.

### Subcommand: `search <query>`

If the first argument is `search`, perform semantic search across all ingested content.

Run:
```bash
cd ~/.claude/commands/yt && unset VIRTUAL_ENV && uv run search.py {query}
```

**IMPORTANT**: The script output is NOT visible to the user. Format and display the search results back to the user. Include scores, IDs, and snippets.

Stop after displaying. No further steps needed.

### Subcommand: `transcript <video_id_or_url>`

If the first argument is `transcript`, fetch the transcript for a previously ingested video from menos.

This is a two-step pipeline: resolve the video_id to a content_id, then fetch the content.

**Step 1**: Resolve video_id to content_id:
```bash
cd ~/.claude/commands/yt && unset VIRTUAL_ENV && uv run find_content.py "{video_id}"
```

**Step 2**: Fetch the transcript using the content_id from step 1:
```bash
cd ~/.claude/commands/yt && unset VIRTUAL_ENV && uv run get_content.py {content_id} --transcript-only
```

**IMPORTANT**: The script output is NOT visible to the user. Display the transcript text in your response.

If the video has not been ingested yet, tell the user and suggest running `/yt {video_id}` to ingest it first.

### Subcommand: `content <content_id>`

If the first argument is `content`, fetch full content details by menos content_id.

```bash
cd ~/.claude/commands/yt && unset VIRTUAL_ENV && uv run get_content.py {content_id} --json
```

**IMPORTANT**: The script output is NOT visible to the user. Format and display the content details.

### Subcommand: ingest (default)

If the first argument is NOT one of the above subcommands, treat it as an ingest request.

- **Required**: YouTube URL or video ID (e.g., `dQw4w9WgXcQ` or `https://youtube.com/watch?v=dQw4w9WgXcQ`)
- **Optional flags**: `--wait` (poll job to terminal state), `--verbose` (show full job fields when polling), `--test` (tag as test content)

## Execution Steps (Ingest)

### 1. Extract Video ID

Extract the 11-character video ID from the URL or use directly if already an ID.

### 2. Call menos API

```bash
cd ~/.claude/commands/yt && unset VIRTUAL_ENV && uv run ingest_video.py "{url_or_video_id}"
```

This command calls the unified ingest endpoint: `POST /api/v1/ingest`.

The API will:
- Fetch the transcript via server-side proxy
- Store transcript and metadata in S3 (Garage)
- Enqueue unified pipeline processing (summary/tags/entities/quality are asynchronous)

### 3. Return Results

Show ingest response fields (`video_id`, `title`, `content_id`, `job_id`).

If `job_id` exists, tell the user pipeline processing is asynchronous and that `--wait` can be used for completion polling.

## Follow-Up Questions

When the user asks detailed questions about a video after ingestion:

1. **For specific questions**, use semantic search:
   ```bash
   cd ~/.claude/commands/yt && unset VIRTUAL_ENV && uv run search.py "the user's question"
   ```

2. **For full transcript**, use the find + get pipeline:
   ```bash
   cd ~/.claude/commands/yt && unset VIRTUAL_ENV && uv run find_content.py "{video_id}"
   # Then use the content_id from the output:
   cd ~/.claude/commands/yt && unset VIRTUAL_ENV && uv run get_content.py {content_id} --transcript-only
   ```

3. **If ingest just ran**, poll `GET /api/v1/jobs/{job_id}` until terminal before expecting summary/tags/topics/entities:
   ```bash
   cd ~/.claude/commands/yt && unset VIRTUAL_ENV && uv run check_job.py {job_id} --wait
   ```

## Environment Setup

Required:
- SSH key at `~/.ssh/id_ed25519` (for API auth via RFC 9421 signing)
- menos API running at `192.168.16.241:8000`

Optional (for local file browsing):
- rclone configured with `menos` remote
- Mount: `rclone mount menos:menos L: --vfs-cache-mode full`

## Available Scripts

| Script | Purpose |
|---|---|
| `ingest_video.py` | Ingest a YouTube video via POST /api/v1/ingest |
| `list_videos.py` | List ingested YouTube videos |
| `search.py` | Semantic search across all ingested content |
| `find_content.py` | Resolve YouTube video_id to menos content_id |
| `get_content.py` | Fetch content (transcript, metadata) by content_id |
| `check_job.py` | Check/poll/cancel pipeline jobs |
| `reprocess.py` | Reprocess content through the pipeline |
| `post_annotation.py` | Add annotations to content items |

## Example Sessions

### Ingest a video
User: `/yt dQw4w9WgXcQ`
1. Run `ingest_video.py dQw4w9WgXcQ`
2. Display ingest result and job_id

### Get a transcript
User: `/yt transcript dQw4w9WgXcQ`
1. Run `find_content.py dQw4w9WgXcQ` to get content_id
2. Run `get_content.py {content_id} --transcript-only` to get transcript
3. Display transcript text

### Search content
User: `/yt search how to use RAG pipelines`
1. Run `search.py how to use RAG pipelines`
2. Display search results with scores and snippets

### Ask about a video
User: "What does the video say about X?"
1. Run `search.py "X"` for targeted results
2. Or run `find_content.py` + `get_content.py` for full transcript
3. Answer the question based on the content
