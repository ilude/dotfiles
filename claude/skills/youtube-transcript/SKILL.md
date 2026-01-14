---
name: youtube-transcript
description: YouTube transcript context management. Trigger keywords: YouTube, video_id, transcript, yt. Auto-activate when working with YouTube transcripts, video_id references, or files in claude/logs/yt/ directory. Uses file-based storage with haiku summarization for context efficiency.
---

# YouTube Transcript Context Management

**Auto-activate when:** Working with YouTube transcripts, `video_id` references, files in `claude/logs/yt/` directory, or when user mentions YouTube videos, transcripts, or the `/yt` command.

## File Structure

YouTube transcript data is stored in a structured directory format:

- `claude/logs/yt/{video_id}/transcript.txt` - Full transcript with timestamps
- `claude/logs/yt/{video_id}/metadata.json` - Video metadata (title, channel, duration, etc.)

## Context Efficiency Strategy

**CRITICAL:** Do NOT load full transcripts into main context. Transcripts can be 20K+ tokens.

### When User Asks Questions About a YouTube Video

1. **Use Task tool with `subagent_type=Explore`** to read and analyze the transcript file
2. The Explore agent will:
   - Read the transcript file
   - Answer specific questions
   - Extract relevant sections with timestamps
3. Provide answers to the user with timestamps when available
4. Keep main context usage minimal (~500 tokens per video)

### Pattern Example

```
User: "What did they say about authentication in that video?"

Your response:
1. Use Task(subagent_type=Explore, prompt="Read claude/logs/yt/{video_id}/transcript.txt and find all mentions of authentication. Provide quotes with timestamps.")
2. Receive summary from Explore agent
3. Answer user with specific quotes and timestamps
```

## File Location Pattern

Glob pattern for finding transcript files:
```bash
~/.dotfiles/claude/logs/yt/*/transcript.txt
~/.dotfiles/claude/logs/yt/*/metadata.json
```

## Integration with /yt Command

The `/yt` command (defined in `claude/commands/yt.md`) handles:
- Fetching transcripts and metadata
- Saving to the file structure above
- Providing initial summaries

This skill handles:
- Using stored transcripts efficiently
- Answering detailed questions without context bloat
- Providing timestamp-specific information

## Best Practices

- Always prefer Task tool over direct file reading for transcripts
- Cite timestamps when providing quotes from transcripts
- Keep summaries concise in main context
- Full transcript details stay in Explore agent context
