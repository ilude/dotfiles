---
description: Fetch YouTube video transcript and/or metadata
argument-hint: <url-or-id>
---

# YouTube Transcript & Metadata

Fetch transcripts and metadata from YouTube videos with context-efficient file storage.

## Usage

The user wants to run: `/yt $ARGUMENTS`

Parse the arguments:
- **Required**: YouTube URL or video ID (e.g., `dQw4w9WgXcQ` or `https://youtube.com/watch?v=dQw4w9WgXcQ`)

## Execution Steps

### 1. Extract Video ID

Extract the 11-character video ID from the URL or use directly if already an ID.

### 2. Create Log Directory

```bash
mkdir -p ~/.dotfiles/claude/logs/yt/{video_id}
```

### 3. Fetch Transcript and Metadata

```bash
cd ~/.dotfiles/claude/commands/yt

# Fetch transcript (always with timestamps for file storage)
uv run fetch_transcript.py "{video_id}" --output ~/.dotfiles/claude/logs/yt/{video_id}/transcript.txt

# Fetch metadata
uv run fetch_metadata.py "{video_id}" --output ~/.dotfiles/claude/logs/yt/{video_id}/metadata.json
```

### 4. Summarize with Haiku Subagent

Use the Task tool with these parameters:
- `subagent_type`: `general-purpose`
- `model`: `haiku`
- `prompt`: Read the transcript and metadata files, then provide:
  - Video title and channel
  - Duration
  - 3-5 bullet point summary of key topics
  - Notable timestamps for important sections

Example Task prompt:
```
Read these files and summarize the YouTube video:
- ~/.dotfiles/claude/logs/yt/{video_id}/transcript.txt
- ~/.dotfiles/claude/logs/yt/{video_id}/metadata.json

Provide:
1. Title and channel name
2. Video duration
3. 3-5 bullet summary of main topics
4. 2-3 notable timestamps with what's discussed

Be concise - this summary replaces loading the full transcript.
```

### 5. Return Results

Present the haiku summary to the user, plus these file paths for follow-up:

```
Files saved:
- claude/logs/yt/{video_id}/transcript.txt
- claude/logs/yt/{video_id}/metadata.json
```

## Follow-Up Questions

When the user asks detailed questions about the video later:
- Use Task tool with `subagent_type=Explore` to search the transcript file
- Do NOT load the full transcript into main context
- Reference specific timestamps from the transcript

## Environment Variables

Required in `~/.dotfiles/.secrets`:
- `WEBSHARE_PROXY_USERNAME` / `WEBSHARE_PROXY_PASSWORD` - Proxy for transcript fetching
- `YOUTUBE_API_KEY` - Required for metadata fetching

## Example Session

User: `/yt dQw4w9WgXcQ`

1. Create directory: `~/.dotfiles/claude/logs/yt/dQw4w9WgXcQ/`
2. Fetch transcript → `transcript.txt`
3. Fetch metadata → `metadata.json`
4. Spawn haiku Task to summarize
5. Return summary + file paths

User: "What does he say about the chorus?"

1. Use Task/Explore to search transcript.txt for "chorus"
2. Return relevant excerpts with timestamps
