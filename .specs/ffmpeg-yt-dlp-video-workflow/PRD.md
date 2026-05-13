---
created: 2026-05-13
status: draft-follow-up-discussion
---

# PRD: FFmpeg and yt-dlp Video Workflow

## Problem

Our current `/yt` and Menos workflows are strong for transcript-centric ingestion, durable storage, metadata, and semantic search. They do not currently inspect what happens visually in a video. The reviewed `bradautomates/claude-video` project highlights a focused workflow using `yt-dlp` and `ffmpeg` to download/probe videos, extract bounded frames, and combine those frames with transcript context for immediate multimodal analysis.

This PRD captures the discovery for follow-up discussion. If we add anything, it should be around the `ffmpeg`/`yt-dlp` workflow pieces, not a wholesale replacement of `/yt` or Menos.

## Users / Jobs To Be Done

- Primary user: dotfiles/Pi operator using `/yt`, Menos, and local agent workflows.
- Job/story: When a video contains important visual context, inspect selected frames alongside transcript text without manually watching/scrubbing the video.
- Current workaround: Use transcript-only `/yt`/Menos ingestion, manually watch the video, or rely on external `/watch`-style tooling.

## Goals

1. Explore a lightweight video-inspection workflow based on `yt-dlp` and `ffmpeg`.
2. Preserve Menos as the durable transcript/search/knowledge layer.
3. Support visual inspection for targeted segments, local files, and screen recordings without ingesting raw frames by default.

## Non-Goals

- Replace Menos or the existing `/yt` ingest/search flow.
- Store every extracted frame permanently by default.
- Build a full video model or depend on expensive video-analysis APIs.
- Make Whisper transcription the default path for YouTube videos that already have captions.

## Requirements

### Functional Requirements

- Provide a follow-up design option for a command such as:
  ```bash
  /yt watch <url-or-file> [question] [--start ...] [--end ...] [--max-frames ...] [--resolution ...]
  ```
- Use `yt-dlp` for public URL download/caption extraction where applicable.
- Use `ffmpeg`/`ffprobe` for duration probing, segment clipping, audio extraction, and screenshot extraction.
- Apply duration-aware frame budgeting with hard caps to avoid runaway token/context usage.
- Support focused `--start` / `--end` analysis so long videos can be inspected by segment.
- Prefer existing caption/transcript sources before Whisper-style transcription.
- Treat local video files as first-class inputs for bug repros and demos.
- Keep extracted frames ephemeral unless the user explicitly asks to save derived notes/artifacts.
- Optionally allow saving a generated visual-summary markdown artifact into Menos later, not raw frames by default.

### Non-Functional Requirements

- KISS: implement as a small inspection layer beside `/yt`, not a new parallel knowledge system.
- Cross-platform viability matters: Windows, Git Bash/MSYS2, WSL, and Linux should have clear dependency checks.
- Fail clearly when `yt-dlp`, `ffmpeg`, or captions are unavailable.
- Avoid secret persistence; any API-key fallback for transcription must use existing safe config patterns.
- Keep token and disk usage bounded by defaults.

## Acceptance Criteria

1. [ ] A follow-up design can explain exactly where this lives relative to Pi `/yt`, Claude `/yt`, and Menos.
   - Verify: Review proposed command surface and ownership.
   - Pass: Menos remains durable storage/search; video inspection is separate or explicitly optional.
   - Fail: Proposal replaces Menos or blends command surfaces without clear ownership.

2. [ ] A prototype can inspect a bounded video segment using `yt-dlp` and `ffmpeg`.
   - Verify: Run against one public YouTube URL and one local sample file if available.
   - Pass: Produces timestamped frame paths and transcript/caption context for a selected segment.
   - Fail: Requires whole-video processing for focused questions.

3. [ ] Frame extraction has safe defaults.
   - Verify: Test short, medium, and long video duration calculations.
   - Pass: Frame count and FPS are capped; long videos trigger sparse/focused-mode guidance.
   - Fail: Defaults can emit unbounded frames or excessive image context.

4. [ ] Transcript behavior remains cheap-first.
   - Verify: Test a captioned YouTube video.
   - Pass: Captions are used before any Whisper/API fallback.
   - Fail: Captioned YouTube videos invoke paid transcription by default.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Keep transcript-only `/yt` and Menos | Simple, durable, already works | Misses visual context | Keep as baseline |
| Adopt `claude-video` wholesale | Fast access to existing implementation | May not match Pi/Menos ownership, storage, or cross-platform conventions | Do not adopt wholesale yet |
| Add lightweight `yt-dlp`/`ffmpeg` inspection layer | Addresses visual gap while preserving Menos | Needs dependency checks and token budgeting | Preferred follow-up direction |
| Persist all frames in Menos | Searchable visual archive later | Storage bloat, noisy artifacts, unclear value | Non-goal by default |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Token/context blowups from images | Expensive or failed sessions | Hard frame caps, focused segment mode, sparse-scan warnings |
| Command-surface confusion | Users unsure whether to use `/yt`, `/yt watch`, or Menos | Document Menos as durable layer and watch as ephemeral inspection |
| Cross-platform dependency drift | Works on one shell but not another | Add preflight checks and platform-specific install guidance |
| Overbuilding permanent media storage | More complexity than value | Start ephemeral; only save generated notes with explicit user action |
| Caption/transcription edge cases | Missing or low-quality transcript context | Prefer captions, provide no-transcript/frames-only behavior, defer Whisper fallback policy |

## Open Questions

- Should this be a Pi-first `/yt watch` command, a separate `/watch` skill, or a Claude/OpenCode shared command update?
- Should prototype code live under `pi/`, `claude/commands/yt`, or a shared script directory?
- What default frame budget should we use for short clips, 1-10 minute videos, and long videos?
- Should generated visual notes be optionally uploaded to Menos as markdown content?
- What dependency installation policy should we use on Windows: `winget`, `uvx`, bundled checks, or documentation only?

## Plan Handoff

- Recommended next command:
  ```bash
  /plan-it .specs/ffmpeg-yt-dlp-video-workflow/PRD.md
  ```
- Review command:
  ```bash
  /review-it .specs/ffmpeg-yt-dlp-video-workflow/PRD.md
  ```
- Notes for planner:
  - This PRD is intentionally marked for follow-up discussion.
  - Focus planning on the `ffmpeg`/`yt-dlp` workflow pieces only.
  - Do not plan a Menos replacement.
  - Favor a small prototype that proves bounded frame extraction and focused segment analysis before broader integration.
