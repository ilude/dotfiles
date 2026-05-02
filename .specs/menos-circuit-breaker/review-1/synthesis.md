---
date: 2026-05-02
status: synthesis-complete
---

# Plan Review Synthesis: menos Circuit Breaker

## Review Panel

| Reviewer | Role | Findings | Verified Issues |
|---|---|---|---|
| Completeness & Explicitness | Unprimed-executor gaps | 6 | 4 |
| Adversarial / Red Team | Failure modes | 6 | 4 |
| Outside-the-Box / Simplicity | Right approach? | 4 | 3 |
| Operational Risk / SRE | Hook lifecycle, state races | 6 | 5 |
| Security & Access Control | Signed uploads, status file | 5 | 3 |
| API Integration | Endpoint contract evolution | 6 | 5 |

Reviews run in-context against the codebase; CRITICAL/HIGH findings verified with Read/Grep/Bash before inclusion.

## Outside-the-Box Assessment

The architecture is sound for the stated personal-use, low-volume case: a probe + status file + offline-first upload queue is a textbook circuit-breaker / outbox pattern. However, the plan substantially over-specifies the runtime:

- Two runtimes (Claude + Pi) sharing one status file with mutual probes is more coupling than needed; the file is small and the probe is cheap, but the lifecycle drawing here is more complex than a stateless "try menos, on failure fall back" pattern would be.
- The `transcript_text` server endpoint addition is a meaningful contract fork (server-fetched vs client-supplied) when an alternative -- write the local files exactly where the server would have written them, then let the existing flow run -- might not be available because the server fetches transcripts itself, so this addition IS justified.
- Scope is otherwise proportionate; verdict: APPROACH IS CORRECT, but several execution details are wrong (see Bugs).

## Bugs (must fix before executing)

### B1. CRITICAL -- Wrong request shape for /api/v1/ingest (API Integration, Completeness)
**Verified.** `menos/api/menos/routers/ingest.py` defines `IngestRequest` with a single field `url: AnyHttpUrl`. There is no `video_id`, `transcript_text`, `transcript_format`, or `metadata` field today; `ingest_video.py` posts `{"url": "https://youtube.com/watch?v=<id>"}`. The plan documents the new payload as `{"video_id": ..., "transcript_text": ..., ...}` -- this would *replace* the existing field.

**Fix:** State explicitly that the schema gains optional fields *alongside* `url`: keep `url` required, add `transcript_text: str | None`, `transcript_format: Literal["plain","timed"] | None = "plain"`, `metadata: dict | None`. Document that `video_id` is still extracted from `url` server-side, and `transcript_text`+`metadata` are short-circuit overrides. Update `ingest_video.py --from-local` to send the URL plus the override fields, not a video_id-only payload. Update Phase 0 acceptance test (curl) to demonstrate the additive shape.

### B2. CRITICAL -- /health is unauthenticated; signing wastes work and may fail (Security, Adversarial)
**Verified.** `menos/api/menos/routers/health.py` `GET /health` takes no auth dependency. Plan says probe pings `GET /health` with "RFC 9421 signed". Signing an unauthenticated endpoint is harmless but pointless and adds complexity (loading SSH key on every session start). Worse, on a machine without `~/.ssh/id_ed25519`, `_load_signer()` would `sys.exit(1)` -- silently failing the probe and incorrectly marking menos `available=false` even when it is up.

**Fix:** Probe `/health` UNSIGNED. Remove the signing step from `probe.py`. Keep signing only for `backfill.py` (which needs it for `/api/v1/ingest` and `/api/v1/content`). Add an explicit precondition: backfill no-ops when SSH key missing, but probe is independent of key state.

### B3. CRITICAL -- Pi extensions are TS, cannot symlink from `claude/hooks/` (Completeness, SRE)
**Verified.** `pi/extensions/session-hooks.ts` is TypeScript and uses the `ExtensionAPI`. The plan says "Symlinked from Pi as needed. Single source of truth, called by both runtimes." Pi cannot import a Python file as an extension; it must `pi.exec("python", [...])` to spawn it, which is fine, but the *location* matters: `~/.claude/hooks/menos-circuit/` only exists because `claude/` is symlinked to `~/.claude`. Pi's working environment has no symlink to that path on every host (verify per host); referencing by absolute `$HOME/.claude/hooks/...` is the only safe form. Also: `pi/extensions/session-hooks.ts` is *already* doing other work (model restore, git fetch, transcript runtime) -- the plan must specify it AMENDS the existing file, not creates one.

**Fix:** Restate Component 5 as "amend existing `pi/extensions/session-hooks.ts` `pi.on('session_start', ...)` handler to add a probe step (foreground, awaited, 3s timeout via `pi.exec` with abort) and a backfill spawn (detached child)." Reference scripts by `path.join(os.homedir(), '.claude/hooks/menos-circuit/probe.py')`. State plainly that there is no symlink and both runtimes call the same on-disk Python files.

### B4. HIGH -- `bash -c '... &'` in SessionStart is fragile on Windows (SRE, Adversarial)
**Verified-ish.** Existing `claude/settings.json` uses `python $HOME/.claude/hooks/...` directly (no `bash -c` wrapper). Adding `bash -c 'python ... &'` introduces: (a) dependency on bash being on PATH (Git Bash/WSL on Windows), (b) detachment via `&` in a sub-bash that exits immediately, leaving the python child reparented to whatever spawned bash -- on Windows this can keep the conhost alive (the very issue documented in `claude/CLAUDE.md` Known Issues), reintroducing the console-flash bug the codebase already worked around.

**Fix:** Either (a) write `backfill.py` to fork itself into a detached background process internally (POSIX `os.fork`+`setsid` won't work on Windows; use `subprocess.Popen([...], creationflags=DETACHED_PROCESS|CREATE_NEW_PROCESS_GROUP)` on win32, `start_new_session=True` on POSIX) and have settings.json invoke `python .../backfill.py --detach` directly; or (b) skip background backfill entirely on SessionStart and run it on `Stop`/idle hook. Option (a) preserves the existing "no bash, no flashing" pattern.

### B5. HIGH -- Backfill scan target `~/.dotfiles/yt/<video_id>/` lacks completeness check (Adversarial, SRE)
**Verified.** `~/.dotfiles/yt/iFLaeWXRSlY/` contains `description.txt description_urls.txt metadata.json transcript.txt`. There is no marker file indicating "fetch completed cleanly". A partial fetch (network drop mid-write of `transcript.txt`) leaves a directory that backfill will happily upload as truth, then verify+delete -- silently corrupting the menos record.

**Fix:** Either (a) require a `.complete` marker file written atomically by the local fetch scripts after all writes succeed, and have backfill skip directories without the marker; or (b) at minimum, validate `transcript.txt` is non-empty AND `metadata.json` parses as JSON before upload. State this contract in the plan.

### B6. HIGH -- Verify-then-delete uses wrong oracle: `find_content.py` returns content_id from listing, not indexing status (API, Adversarial)
**Verified.** `find_content.py` queries `GET /api/v1/content?content_type=youtube&limit=100` and matches by `metadata.video_id`. Returning a `content_id` proves the *record* exists in SurrealDB; it does NOT prove the pipeline (chunking, embeddings, summary) has completed -- per `menos/.claude/rules/schema.md`, `processing_status` is a separate field on `content`. The plan asserts deletion is safe once `find_content.py` returns an id; this can delete the local copy before pipeline completion, and if the server-side pipeline fails (`processing_status=failed`), the local source is gone.

**Fix:** Change verification oracle to require `processing_status == "completed"` (poll `GET /api/v1/content/{id}` and check the status field, OR use `GET /api/v1/jobs/{job_id}` with status=completed). Update Risks table accordingly.

## Hardening Suggestions (optional improvements)

### H1. MEDIUM -- TTL-based stale-status pattern is more complex than needed
A 600s TTL with inline re-probe means each `/yt` invocation can do its own probe anyway. A simpler model: `/yt` ALWAYS attempts the menos call directly; on connection error/timeout, falls back. The status file becomes a *cache hint* for the prompt ("menos was up 4 minutes ago"), not authoritative gating. Eliminates TOCTOU between read and use entirely. **Proportional? Yes** -- removes a class of bugs (status file out of sync, orphaned writes, lock contention) for no real cost on a single-user system. Recommendation: Consider this for v2; current design is acceptable but not minimum-viable.

### H2. MEDIUM -- No log rotation on `~/.dotfiles/yt/.backfill.log`
Plan specifies append-only logging with no cap. Idempotent re-runs every session start will grow indefinitely. Add a 1MB cap with rotate-on-write, or use `logging.handlers.RotatingFileHandler`.

### H3. MEDIUM -- Concurrent SessionStart of two clients can race the status file
Two Claude sessions or Claude+Pi starting within the same second both run probe.py and both atomic-write the status file. Atomic rename on Windows is not atomic in the same sense as POSIX -- a reader can see ENOENT briefly. Consumers should retry-once on missing file. Document this in the consumer logic.

### H4. MEDIUM -- Backfill should bound its own runtime
With N completed local videos and a 60s verify poll each, backfill could run for many minutes. Add a wall-clock cap (e.g., 5 minutes) that exits cleanly and lets the next session pick up the rest.

### H5. LOW -- `.backfill.log` and the status file location should be aligned
Plan puts status at `~/.claude/state/menos_status.json` (which doesn't exist yet -- mkdir needed) and log at `~/.dotfiles/yt/.backfill.log`. Pi has no `~/.claude/`. Either canonicalize on `~/.config/menos-circuit/` or document both paths and the mkdir step.

### H6. LOW -- Server-side rate/size limits for client-supplied transcripts
With a `transcript_text` field accepted from any signed key, a misbehaving client could submit a 10MB transcript. Add a reasonable size cap (e.g., 5MB) and document it in the API change.

### H7. LOW -- Status file readable but not protected
`~/.claude/state/menos_status.json` will be world-readable on Linux without a chmod 600 explicit step. The file leaks endpoint IP at most -- low impact on a single-user box, but worth a one-line `os.chmod` for hygiene.

## Dismissed Findings

- **"Plan must specify Python version / uv vs system python"** -- DISMISSED. `claude/CLAUDE.md` already mandates bare `python` and pre-installed deps for hooks. Plan defers to existing pattern.
- **"Hooks could mass-delete user data via a buggy backfill"** -- DISMISSED as overstated. Verify-then-delete is gated on a successful API call returning a content_id; the worst-case bug is *failure to delete* (zombie state), not mass deletion. (B6 still applies: verification oracle is wrong, but blast radius for incorrect deletion is bounded to one video at a time.)
- **"Status file integrity -- attacker writes available=false"** -- DISMISSED. Threat model is single-user local machine; an attacker with write access to `~/.claude/state/` already owns the SSH key.
- **"Plan needs API version bump"** -- DISMISSED. The change is purely additive optional fields per OpenAPI/SemVer; existing clients are unaffected. `menos/.claude/rules/versioning.md` calls this a `minor` bump, which the plan's Phase 0 implicitly covers via the standard deploy flow.
- **"Probe will block session start"** -- DISMISSED. Plan specifies 3s probe timeout inside a 5s hook timeout; existing hooks already run heavier work (git fetch). Latency budget is acceptable.

## Positive Notes

- Atomic status-file write + TTL is correct in concept.
- Idempotent backfill semantics ("re-running re-uploads any locally-present videos") correctly leverage existing menos dedup via `resource_key` (`yt:<video_id>`) -- verified in `ingest.py` `_resolve_existing_youtube`.
- Phasing is sane: API change first, fallback second, ingest flag third, backfill last.
- The naming choice ("menos circuit breaker", not "yt") is forward-looking and right.
- Risks table addresses the obvious failure modes; gaps are in execution detail, not awareness.
- Existing `yt-local` skill and `~/.dotfiles/yt/<id>/` layout already produce exactly the artifacts the plan needs -- no upstream changes required for the local fetcher.
