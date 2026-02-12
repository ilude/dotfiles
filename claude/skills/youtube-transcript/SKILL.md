---
name: youtube-transcript
description: Activate when working with YouTube transcripts, video_id references, YouTube URLs, mentions of video metadata/pipeline results, the /yt command, or fetch_video script usage.
---

# YouTube Video Data Access

**Auto-activate when:** Working with YouTube video IDs, YouTube URLs, video transcripts, video metadata, pipeline results, the `/yt` command, or `fetch_video.py` script usage.

## API Endpoints

All endpoints require RFC 9421 signed requests. Base URL from `API_BASE_URL` in `.env`.

### YouTube-Specific

| Method | Path | Returns |
|--------|------|---------|
| `GET` | `/api/v1/youtube/{video_id}` | Full video detail: transcript, pipeline results (summary, tags, topics, entities, quality), YouTube metadata (channel, duration, views, likes) |
| `GET` | `/api/v1/youtube/{video_id}/transcript` | Raw transcript as `text/plain` |
| `GET` | `/api/v1/youtube` | List all ingested videos (filter: `?channel_id=`) |
| `GET` | `/api/v1/youtube/channels` | List channels with video counts |
| `POST` | `/api/v1/youtube/ingest` | Ingest new video by URL |

### Content (works for any content type including YouTube)

| Method | Path | Returns |
|--------|------|---------|
| `GET` | `/api/v1/content/{content_id}` | Enriched metadata with pipeline results (summary, quality, topics, entities) |
| `GET` | `/api/v1/content/{content_id}/download` | Raw file download |
| `GET` | `/api/v1/content/{content_id}/entities` | Linked entities with edge types and confidence |
| `GET` | `/api/v1/content/{content_id}/chunks` | Text chunks (add `?include_embeddings=true` for vectors) |
| `GET` | `/api/v1/content/stats` | Aggregate counts by processing status and content type |
| `POST` | `/api/v1/search/agentic` | Semantic search across all content |

## CLI Scripts

Run from `api/` directory in the menos project:

### fetch_video.py — Primary video access tool

```bash
# Full video detail (metadata + transcript + pipeline results)
PYTHONPATH=. uv run python scripts/fetch_video.py VIDEO_ID

# From YouTube URL
PYTHONPATH=. uv run python scripts/fetch_video.py "https://youtube.com/watch?v=VIDEO_ID"

# Raw transcript only
PYTHONPATH=. uv run python scripts/fetch_video.py VIDEO_ID --transcript-only

# Save to local directory
PYTHONPATH=. uv run python scripts/fetch_video.py VIDEO_ID --save /tmp/

# JSON output for piping
PYTHONPATH=. uv run python scripts/fetch_video.py VIDEO_ID --json

# Preview (first 2000 chars of transcript)
PYTHONPATH=. uv run python scripts/fetch_video.py VIDEO_ID --preview
```

### signed_request.py — Generic API access

```bash
# List all videos
PYTHONPATH=. uv run python scripts/signed_request.py GET /api/v1/youtube

# Get video detail
PYTHONPATH=. uv run python scripts/signed_request.py GET /api/v1/youtube/VIDEO_ID

# Search across content
PYTHONPATH=. uv run python scripts/signed_request.py POST /api/v1/search/agentic '{"query": "search term"}'

# Content stats
PYTHONPATH=. uv run python scripts/signed_request.py GET /api/v1/content/stats
```

## Context Efficiency Strategy

**CRITICAL:** Do NOT load full transcripts into main context. Transcripts can be 20K+ tokens.

### When analyzing a video's content:

1. **Save locally first** using `fetch_video.py --save DIR`
2. **Use Task tool with `subagent_type=Explore`** to read and analyze the saved transcript
3. The Explore agent reads the transcript, answers questions, and extracts relevant sections
4. Keep main context usage minimal (~500 tokens per video)

### Pattern

```
User: "What did they say about authentication in video XYZ?"

Steps:
1. Run: PYTHONPATH=. uv run python scripts/fetch_video.py XYZ --save /tmp/
2. Task(subagent_type=Explore, prompt="Read /tmp/XYZ_transcript.txt and find all mentions of authentication. Provide quotes with timestamps.")
3. Answer user with specific quotes and timestamps from the Explore agent's response
```

### For quick lookups (metadata only, no transcript):

```
User: "What's the quality score for video XYZ?"

Steps:
1. Run: PYTHONPATH=. uv run python scripts/fetch_video.py XYZ --json
2. Parse the JSON output for quality_tier, quality_score, summary
3. Answer directly (small payload, safe for main context)
```

## Response Fields Reference

The `GET /youtube/{video_id}` response includes:

| Field | Type | Source |
|-------|------|--------|
| `video_id` | string | YouTube |
| `content_id` | string | SurrealDB |
| `title` | string | YouTube |
| `channel_title` | string | YouTube |
| `duration_seconds` | int | YouTube |
| `view_count` | int | YouTube |
| `transcript` | string | MinIO |
| `summary` | string | Pipeline |
| `tags` | list[str] | Pipeline |
| `topics` | list[str] | Pipeline |
| `entities` | list[str] | Pipeline |
| `quality_tier` | string (S/A/B/C/D) | Pipeline |
| `quality_score` | int (1-100) | Pipeline |
| `description_urls` | list[str] | YouTube |
| `chunk_count` | int | SurrealDB |
| `processing_status` | string | Pipeline |
