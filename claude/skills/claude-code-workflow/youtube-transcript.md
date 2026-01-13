# YouTube Transcript Fetching

Fetch YouTube transcripts and metadata with proxy support.

**Scripts:**
- `fetch_transcript.py` - Transcripts via youtube-transcript-api (free, uses Webshare proxy)
- `fetch_metadata.py` - Metadata via YouTube Data API v3 (requires API key)

---

## Quick Start

```bash
cd ~/.claude/skills/youtube-transcript

# Fetch transcript (no API key needed)
uv run fetch_transcript.py "https://youtube.com/watch?v=VIDEO_ID"

# Fetch metadata (requires YOUTUBE_API_KEY)
uv run fetch_metadata.py "https://youtube.com/watch?v=VIDEO_ID"

# Extract URLs from description
uv run fetch_metadata.py VIDEO_ID --urls-only
```

---

## Environment Variables

Store in `~/.dotfiles/.secrets` (auto-loaded by scripts):

```bash
# Transcript proxy (avoids rate limits)
export WEBSHARE_PROXY_USERNAME=your_username
export WEBSHARE_PROXY_PASSWORD=your_password

# Metadata API (required for fetch_metadata.py)
export YOUTUBE_API_KEY=your_api_key
```

Get credentials:
- Webshare: https://www.webshare.io/
- YouTube API: https://console.cloud.google.com/apis/credentials

---

## Transcript Fetching

### CLI Options

```bash
# Plain text
uv run fetch_transcript.py VIDEO_ID

# With timestamps
uv run fetch_transcript.py VIDEO_ID --timed

# JSON output
uv run fetch_transcript.py VIDEO_ID --json

# Timed JSON (for chunking/processing)
uv run fetch_transcript.py VIDEO_ID --timed --json

# Multiple language fallback
uv run fetch_transcript.py VIDEO_ID --languages "en,en-US,en-GB"

# Disable proxy
uv run fetch_transcript.py VIDEO_ID --no-proxy
```

```
--timed               Include timestamps
--json                Output as JSON
--languages LANGS     Comma-separated language codes (default: en)
--no-proxy            Disable Webshare proxy
```

---

## Metadata Fetching

### CLI Options

```bash
# Full metadata (human-readable)
uv run fetch_metadata.py VIDEO_ID

# Full metadata as JSON
uv run fetch_metadata.py VIDEO_ID --json

# Description only
uv run fetch_metadata.py VIDEO_ID --description-only

# Extract URLs from description
uv run fetch_metadata.py VIDEO_ID --urls-only

# URLs as JSON
uv run fetch_metadata.py VIDEO_ID --urls-only --json
```

### Metadata Fields

JSON output includes:
```json
{
  "video_id": "dQw4w9WgXcQ",
  "title": "Rick Astley - Never Gonna Give You Up",
  "description": "Full description text...",
  "description_urls": ["https://...", "https://..."],
  "published_at": "2009-10-25T06:57:33Z",
  "channel_id": "UCuAXFkgsw1L7xaCfnd5JJOw",
  "channel_title": "Rick Astley",
  "duration": "PT3M33S",
  "duration_seconds": 213,
  "duration_formatted": "3:33",
  "view_count": 1500000000,
  "like_count": 16000000,
  "comment_count": 3000000,
  "tags": ["rick", "astley", "never", "gonna"],
  "category_id": "10",
  "thumbnails": {...},
  "fetched_at": "2024-01-15T10:30:00.000000"
}
```

---

## Programmatic Usage

```python
import os
import sys
sys.path.insert(0, os.path.expanduser("~/.claude/skills/youtube-transcript"))

# Transcript
from fetch_transcript import YouTubeTranscriptService, extract_video_id

video_id = extract_video_id("https://youtube.com/watch?v=dQw4w9WgXcQ")
service = YouTubeTranscriptService()
transcript = service.fetch_transcript(video_id)
timed = service.fetch_timed_transcript(video_id)

# Metadata
from fetch_metadata import YouTubeMetadataService, extract_urls

meta_service = YouTubeMetadataService()
metadata, error = meta_service.fetch_metadata_safe(video_id)
if metadata:
    print(metadata["title"])
    print(metadata["description_urls"])

# URL extraction standalone
urls = extract_urls("Check https://example.com and https://docs.com")
```

---

## Files

```
~/.claude/skills/youtube-transcript/
├── SKILL.md                    # This documentation
├── pyproject.toml              # Dependencies (uv)
├── fetch_transcript.py         # Transcript fetching script
├── fetch_metadata.py           # Metadata fetching script
├── test_fetch_transcript.py    # Transcript tests (21)
└── test_fetch_metadata.py      # Metadata tests (30)
```

---

## Testing

```bash
cd ~/.claude/skills/youtube-transcript

# Install dev dependencies
uv sync --group dev

# Run all tests (51 total)
uv run pytest -v

# Run specific test files
uv run pytest test_fetch_transcript.py -v
uv run pytest test_fetch_metadata.py -v
```

---

## Best Practices

1. **Use proxy for batch transcript operations** - YouTube rate limits aggressively
2. **Cache both transcripts and metadata** - Data rarely changes
3. **Use --urls-only** to extract links for further processing
4. **Use --timed --json** for transcript chunking/search indexing
5. **Fall back to multiple languages** if primary transcript unavailable

---

## See Also

- youtube-transcript-api: https://github.com/jdepoix/youtube-transcript-api
- YouTube Data API v3: https://developers.google.com/youtube/v3
- Webshare proxy: https://www.webshare.io/
