---
status: superseded-research-note
source: ../../../../../.specs/research/menos-research-integration-plan.md
---

# Menos Research Storage (Superseded Proposal)

This historical proposal is not current implementation guidance. The active product contract is [the Menos knowledge compiler PRD](../../../../../.specs/menos-knowledge-compiler/PRD.md); current vault context lives in [menos](menos.md) and [menos Knowledge Compiler](../workflow-ideas/menos-knowledge-compiler.md).

## Current State at Time of Proposal

- `/research` skill saves findings to `~/.claude/research/<topic-slug>.md` (local markdown files)
- `/yt` skill uses the menos API (`192.168.16.241:8000`) for YouTube transcript ingest and storage
- menos stores data in MinIO with structured paths (e.g., `youtube/{video_id}/transcript.txt`)

## Proposed Integration

Store research outputs in menos alongside YouTube content, enabling search and cross-referencing.

### Storage Model

```
research/{topic-slug}/
├── findings.md          # Main research output
├── sources.json         # Structured source list (URL, title, category, date accessed)
└── metadata.json        # Topic, date, goals, familiarity level, format
```

### API Changes Needed (menos side)

1. `POST /api/v1/ingest` — extend to accept `type: "research"` alongside `type: "youtube"`
2. Research ingest would store findings + sources + metadata in MinIO
3. Pipeline could extract entities, tags, and summaries (same as YouTube pipeline)
4. `GET /api/v1/research/{topic-slug}` — retrieve research by topic
5. `GET /api/v1/search` — unified search across YouTube transcripts AND research findings

### Skill Changes Needed (/research)

1. After Phase 5 (present + save), add Phase 6: Ingest to menos
2. Use same `signing.py` and `api_config.py` from `/yt` for authenticated requests
3. Structure sources as JSON for menos (currently markdown only)
4. Add `--no-ingest` flag to skip menos storage

### Benefits

- Cross-reference research with YouTube transcripts ("what videos cover this topic?")
- Unified search across all knowledge sources
- Structured source metadata enables deduplication and freshness checks
- Pipeline processing adds entity extraction and auto-tagging

### Open Questions

- Should research be versioned? (re-running /research on same topic = update or new entry?)
- What's the MinIO bucket structure? (separate `research/` prefix or mixed with youtube?)
- Should the pipeline generate embeddings for semantic search?
- How to handle research that references YouTube content? (link by video_id?)

### Estimated Scope

- menos API: New ingest type + storage path + retrieval endpoint
- /research skill: New Phase 6 + JSON source formatting
- Shared: Reuse signing.py, api_config.py from /yt

## KISS recommendation

Do not implement this proposal. Use the current Menos product contract and preserve this note only as historical context.

