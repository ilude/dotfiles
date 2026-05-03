---
date: 2026-05-02
status: synthesis-complete
---

# Review: menos Circuit Breaker

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle |
|----------|------------|-------------------------|--------------|-------------------|
| Standard completeness | reviewer | Completeness & explicitness reviewer | Mandatory plan-context reviewer | Assume executor has no hidden conversation context |
| Standard red team | security-reviewer | Failure-mode and operational safety reviewer | Mandatory adversarial safety reviewer | Prefer realistic breakage/data-loss paths |
| Standard simplicity | product-manager | Scope and simpler-solution reviewer | Mandatory outside-the-box reviewer | Challenge whether this is overbuilt |
| API reviewer | backend-dev | menos API contract and ingestion state-transition reviewer | Plan changes ingest API and backfill verification | Assume state-transition and compatibility edges are missed |
| Runtime reviewer | python-pro | Cross-platform Python hook/runtime reviewer | Plan adds Python hooks, detach logic, file operations | Assume it breaks on Windows/POSIX boundary cases |
| Rollout reviewer | devops-pro | Session-hook rollout and operational safety reviewer | Plan modifies Claude/Pi startup hooks and background jobs | Assume partial setup, stale deploys, duplicate jobs |
| QA reviewer | qa-engineer | Verification realism and regression coverage reviewer | Plan relies on phased gates and local/manual validation | Assume green tests can still miss unsafe fallback/backfill |

## Standard Reviewer Findings
### reviewer
- The Claude SessionStart snippet does not match the actual `claude/settings.json` hook schema, making execution instructions ambiguous or wrong.
- Several contracts are asserted rather than specified: endpoint discovery, auth/signing source, concurrent backfill safety, and what counts as a valid local cache.
- Acceptance criteria lean on manual `/yt` checks and logs without proving both Claude and Pi dispatch paths use the same fallback behavior.

### security-reviewer
- Local deletion after `processing_status == completed` is safer than immediate delete, but the plan still lacks crash-safe per-video staging/locking around upload, verify, and delete.
- Unsigned health probing is acceptable for availability hints, but the plan must prevent it from authorizing backfill decisions beyond “attempt then handle failure.”
- Background jobs need clearer observability and kill/disable controls to avoid hidden repeated uploads on every session start.

### product-manager
- The plan may be larger than the immediate need: API changes, hooks in two runtimes, local cache markers, and backfill daemon behavior all land together.
- A simpler first increment would be manual `--from-local` upload plus fallback cache, then add automatic session-start backfill only after the API contract is proven.
- Generalizing as a “menos” breaker for future content types is premature unless it changes current implementation decisions.

## Additional Expert Findings
### backend-dev
- The `transcript_format: "timed"` contract is underspecified: the schema only adds `transcript_text: str`, while the plan says `.timed.json` may be read and sent.
- Existing ingest returns `job_id=None` for deduped content; backfill polling must define what content_id endpoint returns for already-existing or metadata-backfilled records.
- Metadata field names are inconsistent with current menos code (`channel_title` etc.) versus plan examples (`channel`).

### python-pro
- Python invocation and PEP 723 assumptions are muddy: the plan says `python <abs-path>` works, but PEP 723 metadata is not honored by plain Python.
- Windows detach details need implementation-level tests; `DETACHED_PROCESS` is not always available unless referenced via `subprocess` constants and stdio is detached.
- Atomic delete via move-to-`.deleted/` needs naming collision and cross-device behavior specified.

### devops-pro
- Rollout can fail if Claude hook JSON is edited with the simplified snippet rather than the existing nested hook shape.
- The plan lacks a simple disable switch for probe/backfill if session startup or menos starts misbehaving.
- Endpoint configuration is not explicit enough for multi-machine use; the status example hard-codes `192.168.16.241:8000`.

### qa-engineer
- Concurrency safety is asserted but lacks tests for Claude and Pi launching backfill simultaneously.
- Tests do not explicitly cover corrupted `.complete`, transcript true/metadata false, malformed metadata with valid transcript, or duplicate directories.
- Manual validation checks deletion but not that menos contains the same transcript/metadata before local removal.

## Suggested Additional Reviewers
- backend-dev -- relevant because the plan changes menos ingest request/response and processing-state assumptions; focus on API compatibility and state transitions.
- python-pro -- relevant because probe/backfill are Python scripts run from hooks; focus on cross-platform subprocess, filesystem, and packaging behavior.
- devops-pro -- relevant because session hooks create background operational behavior; focus on rollout, observability, rollback, and partial setup.
- qa-engineer -- added because validation is a central risk; focus on tests that could pass while fallback/backfill is unsafe.

## Bugs (must fix before execution)
1. **Claude hook instructions use the wrong JSON shape.** The plan’s SessionStart example lists `{ "command": ... }` entries directly, but the actual `claude/settings.json` uses entries containing `hooks: [{ command, timeout, type }]`. Executing the plan literally would likely add nonfunctional hooks.
2. **Timed transcript ingestion is not a real contract yet.** The plan says `--from-local` reads `.timed.json` if present and sends `transcript_format: "timed"`, but the API shape only defines `transcript_text: str`; it does not specify JSON structure, conversion to plain text, server validation, or storage behavior.
3. **Backfill local-cache validity is contradictory.** One section says backfill validates `metadata.json` parseable; another says metadata is preferred but not required when `.complete` has `transcript: true`. This can cause either skipped valid transcript-only caches or attempted uploads with missing files.
4. **Concurrent backfill safety is asserted but not specified.** The plan says Claude and Pi concurrent invocations are safe due to menos dedup, but that only addresses duplicate server records. It does not define per-video locks, claim files, delete staging, or tests for two local processes uploading/deleting the same directory.

## Hardening
1. Add a disable switch such as `MENOS_CIRCUIT_DISABLED=1` or a local config flag for emergency rollback without editing hooks.
2. Specify endpoint configuration source and normalization, including scheme, host, timeout, and whether `endpoint` in the status file is display-only.
3. Replace “PEP 723 so `python <abs-path>` works” with an accurate runtime decision: either no external deps for hook scripts, or invoke via `uv run --script` where metadata matters.
4. Require verification that menos content contains the uploaded transcript/metadata before deleting local cache, not only that pipeline status is completed.
5. Add tests for corrupt `.complete`, metadata missing, metadata malformed, simultaneous backfill processes, and existing-content `job_id=None` responses.
6. Clarify metadata key mapping (`channel` vs `channel_title`, `published_at`, `description`) and precedence rules against current menos metadata fields.

## Simpler Alternatives / Scope Reductions
1. Ship Phase 0 + `ingest_video.py --from-local` first, with manual backfill command, before adding automatic session-start backfill.
2. Make the first automatic behavior only “fallback to local and mark complete”; defer deletion until a separate explicit `backfill --delete-after-completed` command proves safe.
3. Keep the status file as `/yt`-specific until another menos content type actually reuses it.

## Contested or Dismissed Findings
1. **Dismissed as a bug: hook path relies on symlink.** The repo’s `install.conf.yaml` links `~/.claude` to `claude`, so `~/.claude/hooks/...` and repo `claude/hooks/...` are intentionally the same installed tree. The plan should still clarify this despite saying “No symlinks.”
2. **Downgraded: unsigned health probe spoofing.** Since `/yt` attempts menos directly and signed backfill still uses real API calls, spoofing the health hint is not by itself a high-severity issue.
3. **Downgraded: overall over-engineering.** The staged rollout can control scope, but auto-backfill should remain separable from the minimum viable fallback.

## Verification Notes
1. Hook-shape bug confirmed by reading `claude/settings.json`: existing `SessionStart` uses `{ "hooks": [{ "command": "python $HOME/.claude/hooks/team_cleanup.py", "timeout": 5, "type": "command" }] }`, unlike the plan snippet.
2. Timed transcript bug confirmed from the plan’s API schema (`transcript_text: str`, `transcript_format`) and `--from-local` text claiming `.timed.json` support without a payload shape.
3. Cache-validity contradiction confirmed in the plan: `backfill.py` says it validates `metadata.json` parseable, while the `.complete` section says metadata is preferred but not required.
4. Concurrency bug confirmed from plan text: safety is justified by menos dedup on `resource_key=yt:<video_id>`, which does not cover local process locking or deletion races.

## Review Artifact
Wrote full synthesis to: `.specs/menos-circuit-breaker/review-2/synthesis.md`

## Overall Verdict
**Fix bugs first**

## Recommended Next Step
- apply selected review fixes to the plan if requested
- execute via `/do-it C:/Users/mglenn/.dotfiles/.specs/menos-circuit-breaker/plan.md`
