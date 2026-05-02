# menos Circuit Breaker -- Plan

> **Revised after review-1.** All 6 bugs and 7 hardening suggestions applied. See `review-1/synthesis.md` for the verification trail.

## Goal

When menos is unreachable, `/yt` (Claude + Pi) automatically falls back to local transcript/metadata fetch. When menos returns, locally-fetched videos are uploaded into menos in the background and their local copies removed only after the menos pipeline reports `processing_status == "completed"`. State is shared between Claude and Pi via a single status file used as a *cache hint*, not an authoritative gate.

The breaker is named "menos" (not "yt"): future menos-backed content types (PDFs, articles, etc.) will reuse the same status file and probe.

## Architecture

```
                           SessionStart (Claude + Pi)
                                    |
                                    v
                          probe.py  (foreground, <3s, unsigned GET /health)
                                    |
                       writes ~/.claude/state/menos_status.json
                                    |
                                    v
                          backfill.py --detach (self-detached child)
                          if available=true:
                            scans ~/.dotfiles/yt/<id>/ for `.complete` marker
                            uploads + verifies (processing_status=completed) + deletes

  /yt invocation
    -> always attempts menos call first
    -> on connection error / 5xx: fall back to yt-local
    -> status file consulted only as a hint for the user-facing message
```

### Status file -- `~/.claude/state/menos_status.json`

```json
{
  "checked_at": "2026-05-02T18:00:00Z",
  "available": true,
  "endpoint": "192.168.16.241:8000",
  "last_error": null
}
```

- **Use:** *cache hint only* for what to tell the user. `/yt` does not gate on this -- it tries menos directly and falls back on connection error. (H1 applied.)
- Atomic write (tmp file + rename in same directory).
- File mode `0600` set explicitly after write. (H7 applied.)
- Path: `~/.claude/state/` for both runtimes; `lib.py` does `mkdir -p` of the parent on every write. (H5 applied.) Pi resolves the same path via `path.join(os.homedir(), '.claude', 'state', 'menos_status.json')`. Both runtimes create `~/.claude/state/` if missing -- no symlink dependency.
- **Read race:** consumers (`/yt`, lib helpers) retry once on `ENOENT` after a 50ms sleep to absorb the atomic-rename window on Windows. (H3 applied.)

## Components

### 1. menos API change -- `menos/` submodule

**Existing endpoint:** `POST /api/v1/ingest` accepts `IngestRequest { url: AnyHttpUrl }` (verified in `menos/api/menos/routers/ingest.py`).

**Change:** keep `url` required; add three optional sibling fields. Pure additive.

```python
class IngestRequest(BaseModel):
    url: AnyHttpUrl                                          # unchanged, required
    transcript_text: str | None = None                       # NEW -- short-circuits server fetch
    transcript_format: Literal["plain"] = "plain"            # NEW -- timed upload deferred until a JSON contract exists
    metadata: dict | None = None                             # NEW -- merged with server-fetched; use menos field names (`channel_title`, not `channel`)
```

**Behavior:**
- `video_id` continues to be extracted server-side from `url` (no client-supplied video_id).
- If `transcript_text` is present, skip the server-side `youtube-transcript-api` call and use the supplied transcript verbatim. Transcript content is bounded server-side at **5 MB** -- requests over the cap return `413 Payload Too Large`. (H6 applied.)
- If `metadata` is present, merge with any server-fetched metadata, preferring client values for canonical menos fields (`title`, `channel_title`, `published_at`, `description`, and other documented keys after explicit mapping).
- Existing flow (no `transcript_text`) is unchanged.

**Files:**
- `menos/api/menos/routers/ingest.py` -- accept new fields, route the short-circuit
- `menos/api/menos/schemas/ingest.py` (or wherever `IngestRequest` lives -- verify) -- pydantic update
- `menos/api/tests/test_ingest_from_local.py` -- new test covering: (a) existing URL-only flow unchanged, (b) URL + transcript_text skips fetch, (c) oversize transcript returns 413, (d) malformed transcript returns 422, (e) metadata merge precedence

**Versioning:** additive optional fields = minor bump per `menos/.claude/rules/versioning.md`.

### 2. Probe + backfill scripts -- shared Python

**Location:** `~/.dotfiles/claude/hooks/menos-circuit/`. **No symlinks.** Both Claude (via `settings.json`) and Pi (via `session-hooks.ts`) reference these by absolute `$HOME/.claude/hooks/menos-circuit/<script>.py`. (B3 applied.)

**Files:**
- `probe.py` -- pings `GET /health` **unsigned** (the endpoint takes no auth; verified in `menos/api/menos/routers/health.py`). 3s timeout. Writes status file. Exit 0 always. **Independent of SSH key state** -- works on machines without `~/.ssh/id_ed25519`. (B2 applied.)
- `backfill.py` -- signed (loads SSH key like existing `signing.py`). Reads status file as a hint; aborts this run if `available=false`, but `available=true` never replaces real signed API error handling. Scans `~/.dotfiles/yt/<video_id>/` for directories containing a valid `.complete` marker file (B5). For each video it first acquires a per-video claim file `~/.dotfiles/yt/<video_id>/.backfill.lock` using exclusive create; if the lock already exists and is younger than 30 minutes, skip; if stale, replace it. It validates `transcript.txt` is non-empty. `metadata.json` is optional: if present it must parse; if absent, upload proceeds with `metadata: null` and logs that metadata was unavailable. Uploads via `POST /api/v1/ingest` with override fields, verifies via `GET /api/v1/content/{id}` polling until `processing_status == "completed"` (B6), then fetches the menos content/transcript detail needed to confirm the stored transcript length/hash and metadata keys match the local upload. Deletes local dir only after that verification succeeds. Logs to `~/.dotfiles/yt/.backfill.log` via `RotatingFileHandler` (1 MB, 3 backups). (H2.) Wall-clock cap **5 minutes** -- exits cleanly, next session picks up remainder. (H4.)
- `backfill.py --detach` -- when invoked with `--detach`, re-execs itself as a fully detached child via `subprocess.Popen` with `creationflags=DETACHED_PROCESS|CREATE_NEW_PROCESS_GROUP` on win32 / `start_new_session=True` on POSIX, then exits the parent. (B4 applied -- replaces `bash -c '... &'`.)
- `lib.py` -- shared helpers: status-file atomic write + `chmod 600`, mkdir-parent, read-with-retry-on-ENOENT, signing wrapper (used by backfill only), http client, atomic delete (rename claimed dir to a unique `.deleted/<video_id>-<timestamp>-<pid>/` path on the same filesystem, then unlink; on cross-device or collision errors, leave original dir in place and log).
- `tests/test_probe.py` -- probe success, probe timeout, probe network error, missing SSH key DOES NOT fail probe.
- `tests/test_backfill.py` -- skip-when-status-down, skip-dir-without-.complete, corrupt-.complete-skips, transcript-true-metadata-false-uploads-with-null-metadata, metadata-true-but-missing-or-malformed-skips, skip-dir-with-empty-transcript, simultaneous-backfill-processes-one-claims-video, existing-content-job-id-none-still-polls-content, upload-success-then-poll-then-verify-content-then-delete, upload-success-but-pipeline-fails-keeps-local, verify-poll-times-out-keeps-local, runtime-cap-exits-cleanly.
- Hook scripts must run with bare `python <abs-path>` and therefore may only depend on the Python standard library plus modules already vendored/importable from this repo. Do not rely on PEP 723 metadata for hook execution; if future dependencies are required, change hook commands explicitly to `uv run --script` and update both Claude/Pi hook tests.

**Behavior contracts:**
- `probe.py` is idempotent and side-effect-free except for the status file. Safe on every session start. Never crashes session start (exit 0 on all errors).
- `backfill.py` is idempotent: re-running re-uploads any locally-present videos. Already-deleted dirs are skipped silently. Concurrent invocations across runtimes are safe through two layers: a local per-video exclusive `.backfill.lock` prevents simultaneous local upload/delete work, and menos dedups server records on `resource_key=yt:<video_id>` (verified via `ingest.py:_resolve_existing_youtube`).
- Backfill failure for one video logs and skips; never aborts the whole run.
- Local deletion happens **only after** `GET /api/v1/content/{id}` returns `processing_status == "completed"`. Poll up to 60s with exponential backoff (250ms, 500ms, 1s, 2s, 4s, 8s, 16s, 30s caps). On timeout: leave local copy, log, move on.

### 3. ingest_video.py -- `--from-local` flag

**File:** `~/.dotfiles/claude/commands/yt/ingest_video.py`

```bash
uv run ingest_video.py <video_id_or_url> --from-local
```

When `--from-local`:
- Resolve `video_id` from input.
- Read `~/.dotfiles/yt/<video_id>/transcript.txt`. Timed transcript upload is explicitly out of scope for this pass: if `.timed.json` exists, ignore it for menos upload and send `transcript_format: "plain"`.
- Read `~/.dotfiles/yt/<video_id>/metadata.json` if present.
- POST to `/api/v1/ingest` with `{"url": "https://youtube.com/watch?v=<id>", "transcript_text": "...", "transcript_format": "plain", "metadata": {...}}`. (B1 applied -- still sends `url`, the new fields are siblings.)
- Fail loudly if local files are missing or `.complete` marker absent (no silent fallback to server fetch).

### 4. Claude SessionStart hook -- `claude/settings.json`

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "command": "python $HOME/.claude/hooks/menos-circuit/probe.py",
            "timeout": 5,
            "type": "command"
          }
        ]
      },
      {
        "hooks": [
          {
            "command": "python $HOME/.claude/hooks/menos-circuit/backfill.py --detach",
            "timeout": 2,
            "type": "command"
          }
        ]
      }
    ]
  }
}
```

- No `bash -c`, no `&`. (B4 applied.)
- Probe is foreground, capped at 5s hook timeout (3s probe timeout inside).
- Backfill is invoked with `--detach`; the script self-forks and the parent returns in <100ms. The hook's 2s timeout is safety margin only.
- Bare `python` per the existing Windows console-flashing workaround.

### 5. Pi session hook -- AMEND existing `pi/extensions/session-hooks.ts`

The file already has a `pi.on('session_start', ...)` handler doing model restore / git fetch / transcript runtime work. **Amend** that handler -- do not create a new one.

```ts
// inside the existing session_start handler
const homedir = require('os').homedir();
const path = require('path');
const probePath = path.join(homedir, '.claude', 'hooks', 'menos-circuit', 'probe.py');
const backfillPath = path.join(homedir, '.claude', 'hooks', 'menos-circuit', 'backfill.py');

// foreground probe, awaited, 3s budget
await pi.exec('python', [probePath], { timeoutMs: 3000 }).catch(() => {});

// detached backfill -- script self-detaches via subprocess.Popen
pi.exec('python', [backfillPath, '--detach'], { detached: true }).catch(() => {});
```

(B3 applied.) Both runtimes call the same on-disk Python files via absolute path. No symlinks involved.

### 6. /yt instructions update (Claude + Pi)

**Claude:** edit `~/.dotfiles/claude/shared/yt-instructions.md`
**Pi:** new `~/.dotfiles/pi/skills/workflow/yt.md` (mirrors Claude's, adapted for Pi conventions)

Dispatch logic for the **ingest** subcommand (H1 applied -- direct attempt, not status-gated):

```
1. Attempt menos ingest via `ingest_video.py <url>`.
2. On success: report job_id and content_id as today.
3. On connection error or 5xx: fall back to yt-local (fetch_transcript.py + fetch_metadata.py),
   then write the `.complete` marker after both succeed.
4. Surface the cached status file's `checked_at` to the user only as context
   ("menos last seen up at <ts>") -- it does NOT control the dispatch path.
```

For non-ingest subcommands (`search`, `list`, `content`, `transcript`):
- Try menos directly. On connection error: report "menos unreachable -- this operation has no local fallback" and suggest retrying.
- Exception: `transcript <video_id>` falls back to reading `~/.dotfiles/yt/<video_id>/transcript.txt` if it exists.

### 7. Local fetch script `.complete` marker (B5)

**Files modified:** `~/.dotfiles/claude/commands/yt-local/fetch_transcript.py`, `fetch_metadata.py`.

After all writes succeed (and only then), write a marker file `.complete` containing a JSON timestamp:

```json
{"completed_at": "2026-05-02T18:00:00Z", "transcript": true, "metadata": true}
```

Both fetchers read+update the same marker (so a transcript-only run sets `transcript: true`; later metadata run sets `metadata: true`). Backfill requires `transcript: true` at minimum. If `metadata: true`, `metadata.json` must exist and parse; if `metadata: false` or absent, backfill proceeds with `metadata: null`. Corrupt `.complete` means skip and log.

## File Inventory

### New
- `~/.dotfiles/claude/hooks/menos-circuit/probe.py`
- `~/.dotfiles/claude/hooks/menos-circuit/backfill.py`
- `~/.dotfiles/claude/hooks/menos-circuit/lib.py`
- `~/.dotfiles/claude/hooks/menos-circuit/pyproject.toml`
- `~/.dotfiles/claude/hooks/menos-circuit/tests/test_probe.py`
- `~/.dotfiles/claude/hooks/menos-circuit/tests/test_backfill.py`
- `~/.dotfiles/pi/skills/workflow/yt.md`
- `~/.dotfiles/.specs/menos-circuit-breaker/plan.md` (this file)
- `~/.dotfiles/.specs/menos-circuit-breaker/review-1/synthesis.md`

### Modified
- `~/.dotfiles/claude/settings.json` -- add SessionStart hooks (no bash wrapper)
- `~/.dotfiles/claude/shared/yt-instructions.md` -- direct-attempt dispatch logic
- `~/.dotfiles/claude/commands/yt/ingest_video.py` -- `--from-local` flag (sends url + override siblings)
- `~/.dotfiles/claude/commands/yt/api_config.py` -- if needed for new fields
- `~/.dotfiles/claude/commands/yt-local/fetch_transcript.py` -- write `.complete` marker
- `~/.dotfiles/claude/commands/yt-local/fetch_metadata.py` -- write `.complete` marker
- `~/.dotfiles/pi/extensions/session-hooks.ts` -- amend existing `session_start` handler
- `~/.dotfiles/pi/skills/workflow/yt-local.md` -- read status file (informational)
- `~/.dotfiles/.gitignore` -- ensure `~/.claude/state/menos_status.json` path stays untracked (likely already is)

### menos submodule (separate PR)
- `menos/api/menos/routers/ingest.py`
- `menos/api/menos/schemas/ingest.py` (verify path)
- `menos/api/tests/test_ingest_from_local.py`

## Phased Rollout

**Phase 0 -- menos API change**
1. Add optional `transcript_text` / `transcript_format` / `metadata` siblings to existing `IngestRequest`. Keep `url` required.
2. Server-side 5 MB cap on `transcript_text` (413 on overrun).
3. Tests: existing URL-only flow unchanged; URL + transcript_text skips fetch; oversize â†’ 413; malformed â†’ 422; metadata merge precedence.
4. Deploy menos. Verify via curl:
   ```bash
   curl -X POST ${MENOS_BASE_URL}/api/v1/ingest \
     -H "Content-Type: application/json" \
     -d '{"url":"https://youtube.com/watch?v=dQw4w9WgXcQ","transcript_text":"hello","transcript_format":"plain"}'
   ```
*Gate:* menos accepts the additive payload; existing URL-only ingestion unaffected. `MENOS_BASE_URL` is the normalized endpoint source of truth (scheme + host + port, no trailing slash); the status file `endpoint` is display-only.

**Phase 1 -- probe + status file**
1. Implement `probe.py` (unsigned `GET /health`), `lib.py` (atomic write, chmod 600, mkdir-parent, read-with-retry).
2. Add Claude SessionStart probe hook (probe only, no backfill yet) using the existing nested Claude hook schema (`SessionStart[] -> hooks[] -> command/timeout/type`), not the simplified direct command shape.
3. Amend Pi `session-hooks.ts` to invoke the same probe.
4. Update `/yt` instructions (Claude + Pi) to attempt menos directly and fall back on error.
5. Manual test: stop menos service, start session, run `/yt <url>` -- confirm yt-local path runs and `.complete` marker is written.
*Gate:* fallback works in both directions without backfill; probe never fails on a host without SSH key.

**Phase 2 -- ingest_video.py --from-local**
1. Add flag and local-file reader (with `.complete` marker enforcement).
2. Test against deployed menos: ingest a previously-locally-fetched video using `--from-local`.
*Gate:* the upload returns a content_id and the menos pipeline starts.

**Phase 3 -- backfill**
1. Implement `backfill.py` with `--detach`, scan + `.complete` check + upload + processing_status poll + delete.
2. Wire into Claude SessionStart and Pi session-hooks (both call `--detach`). Also add an emergency disable switch: if `MENOS_CIRCUIT_DISABLED=1` is present, probe/backfill exit 0 without work; document this as the rollback path.
3. Add `RotatingFileHandler` for `.backfill.log`.
4. Test: pre-populate `~/.dotfiles/yt/` with 2-3 completed videos, start session, confirm uploads + `processing_status=completed` polls + post-completion transcript/metadata verification + deletions + log entries within the 5-min cap.
*Gate:* full circle -- offline fetch, then online backfill, leaves no local copies; pipeline failure leaves the local copy intact.

**Phase 4 -- Pi /yt parity**
1. Create `pi/skills/workflow/yt.md` mirroring Claude's instructions.
2. Verify Pi can invoke `claude/commands/yt/ingest_video.py` directly (it's Python; should work).
*Gate:* `/yt <url>` works identically in Claude and Pi.

## Validation

Per phase, run from a clean session:

```bash
# Probe-only (must work without SSH key on test host)
test -f ~/.claude/state/menos_status.json && jq . ~/.claude/state/menos_status.json
ls -l ~/.claude/state/menos_status.json    # mode 0600

# Down-mode dispatch
# (stop menos service)
# /yt <url> in Claude -> should run yt-local, persist to ~/.dotfiles/yt/<id>/
test -f ~/.dotfiles/yt/<id>/.complete

# Backfill
# (start menos service, start new session)
tail -f ~/.dotfiles/yt/.backfill.log
# Confirm: log shows claim-lock acquisition + upload + poll + processing_status=completed + transcript/metadata verification + deletion
test ! -d ~/.dotfiles/yt/<id>    # dir gone

# Cross-runtime
# Same flow in Pi session
```

Lint/type/test gates per `AGENTS.md`. New tests: `pytest claude/hooks/menos-circuit/tests/`.

## Execution Status

Partial execution completed on 2026-05-02.

Implemented code changes and automated validation passed:
- `cd menos/api && uv run pytest tests/unit/test_ingest_router.py -q` -- `27 passed`
- `cd menos/api && uv run ruff check menos/routers/ingest.py tests/unit/test_ingest_router.py` -- passed
- `python -m py_compile` for the new hook scripts and modified yt scripts -- passed
- `python -m json.tool claude/settings.json` -- passed
- Smoke checks: `python claude/hooks/menos-circuit/probe.py` and `MENOS_CIRCUIT_DISABLED=1 python claude/hooks/menos-circuit/backfill.py` -- passed

Remaining live/manual validation before archive:
- Stop menos and confirm `/yt <url>` in Claude falls back to yt-local and writes `~/.dotfiles/yt/<id>/transcript.txt` plus `.complete`.
- Restart menos and confirm probe/backfill uploads the local cache, verifies `processing_status == "completed"` plus transcript/metadata, then deletes the local directory.
- Verify the same fallback/backfill behavior from a Pi session.

Do not archive this plan until the remaining live/manual validation passes.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Status file stale (menos went down mid-session) | `/yt` attempts menos directly and falls back on error -- status file is hint-only. (H1) |
| Backfill races with manual `/yt` or another runtime | Local exclusive `.backfill.lock` ensures only one backfill process owns upload/delete for a video; menos also dedups on `resource_key=yt:<video_id>` and second ingest returns existing content_id. Backfill skips video_ids whose dir is missing a valid `.complete` marker. |
| Verify-poll hangs forever on a stuck pipeline | 60s exponential-backoff cap per video; 5-min wall-clock cap on the whole run. On timeout, leave local copy in place and log. |
| Local delete loses data if menos pipeline corrupts | Verify step requires `processing_status == "completed"` plus a post-completion content/transcript/metadata check against menos. Pipeline or verification failures keep the local copy. (B6) |
| Partial local fetch uploaded as truth | Backfill skips dirs without a valid `.complete` marker; validates transcript non-empty; requires parseable `metadata.json` only when marker says `metadata: true`; otherwise uploads with `metadata: null`. (B5) |
| Probe falsely reports down on host without SSH key | Probe is unsigned; doesn't load the key. Status is display/cache hint only, never authorization for deletion. (B2) |
| Hook adds session-start latency | Probe 3s timeout in 5s hook; backfill self-detaches in <100ms. |
| Windows console flashing on hook spawn | Bare `python`, no `bash -c`, no `&`. Backfill self-detaches via `subprocess.Popen(creationflags=DETACHED_PROCESS|...)`. (B4) |
| Two runtimes race the status file write | Atomic rename + read-with-retry-once on ENOENT. (H3) |
| `.backfill.log` grows unbounded | `RotatingFileHandler` 1 MB, 3 backups. (H2) |
| Pi vs Claude shell-out drift | Both use absolute path `$HOME/.claude/hooks/menos-circuit/<script>.py` and bare `python`. The repo installer links `~/.claude` to the tracked `claude/` tree; no additional menos-specific symlink is created. (B3) |
| `~/.claude/state/` doesn't exist | `lib.py` does `mkdir -p` of the parent on every status-file write. (H5) |
| Status file world-readable | `chmod 0600` after atomic rename. (H7) |
| Oversized transcript_text DoS | Server-side 5 MB cap â†’ 413. (H6) |

## Open Questions
None pending after review-2; timed transcript upload is intentionally deferred until a concrete JSON contract is designed.

## Out of Scope

- Generalizing the breaker beyond menos. Status file is named for menos; current consumer is `/yt` only. Future content types reuse this file when added.
- Retry policy beyond "next session retries failed backfills." If volume grows, revisit with a `.backfill_failed` ledger and exponential backoff.
- Timed transcript upload from `.timed.json`; this pass uploads plain transcript text only.
- UI/notification surface for "menos came back online, X videos imported." User reads `.backfill.log` if curious.
- Multi-host coordination (e.g., backfill from one host's local cache to a peer's). Single-host model only.
