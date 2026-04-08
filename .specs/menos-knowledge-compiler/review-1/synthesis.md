---
date: 2026-04-07
status: synthesis-complete
---

# Plan Review Synthesis: menos-knowledge-compiler

## Review Panel

| Reviewer | Role | Findings | Verified Issues |
|---|---|---|---|
| R1 | Completeness & Explicitness | 8 | 3 confirmed (R1-1 CRITICAL, R1-8 HIGH, R1-2 HIGH) |
| R2 | Adversarial / Red Team | 8 | 3 confirmed (R2-1 HIGH, R2-3 HIGH, R2-2 MEDIUM) |
| R3 | Outside-the-Box / Simplicity | 8 | 2 confirmed (R3-1 MEDIUM, R3-7 MEDIUM) |
| R4 | Security & Privacy | 8 | 3 confirmed (R4-1 HIGH, R4-2 HIGH, R4-5 MEDIUM) |
| R5 | ML / Retrieval | 8 | 3 confirmed (R5-1 HIGH, R5-2 HIGH, R5-7 MEDIUM) |
| R6 | SRE / Operational | 8 | 4 confirmed (R6-1 HIGH, R6-2 HIGH, R6-3 MEDIUM, R6-4 MEDIUM) |

## Outside-the-Box Assessment

The plan is well-architected and correctly leverages existing menos primitives. The biggest structural risk is the mandatory Wave 0 eval harness blocking all value delivery when the baseline is measured against a corpus that doesn't yet contain the new content types. The 7-wave structure is proportionate for the intended longevity of the system, but Waves 6 (lint/digest) and 7 (clustering) should be explicitly optional. The core capture → compile → inject loop (Waves 1–5) is the right MVP. No fundamental architectural changes are recommended — fix the bugs, harden the operational details, and ship.

---

## Bugs (must fix before executing)

### CRITICAL

**BUG-1: `SessionEnd` hook event does not exist — use `Stop`**
- Flagged by: R1 (Completeness)
- Verification: `claude/settings.json` uses `"Stop"` (line 130) for the existing session-history hook. There is no `"SessionEnd"` event type in Claude Code. The existing hook system confirms `Stop` fires at session end.
- Impact: T3.1 and T3.2 hooks will never fire. No sessions will be captured.
- Fix: Replace all references to `SessionEnd` with `Stop` in T3.1, T3.2, and success criterion 2. Update `settings.json` hook registration to use `"Stop"` key.

---

### HIGH

**BUG-2: `LinkExtractor` runs in the content router, not in `storage.py`**
- Flagged by: R1 (Completeness), R2 (Red Team)
- Verification: `menos/api/menos/routers/content.py` lines 430–431 call `LinkExtractor()` during the HTTP upload path. `services/storage.py` has no link extraction. The compile service (T4.1) writes concepts via `storage.py` directly, bypassing the router entirely.
- Impact: Concepts will have no `[[wiki-link]]` backlinks resolved. The backlink graph will be empty for all compiled concepts. The acceptance criterion for T4.1 ("wiki-links resolve to backlinks") will fail silently.
- Fix: T4.1 must either (a) POST concepts through the existing `/api/v1/content` HTTP endpoint (same path as regular uploads, triggering link extraction automatically), or (b) explicitly call `LinkExtractor` and `repo.save_links()` after writing each concept item to storage.

**BUG-3: Memory hook dependency isolation not addressed**
- Flagged by: R2 (Red Team)
- Verification: Filesystem confirms `claude/hooks/damage-control/.venv/`, `claude/hooks/quality-validation/.venv/`, `claude/hooks/session-history/.venv/` — each hook has an isolated virtual environment. The project CLAUDE.md states "hooks use bare `python` rather than `uv run`" and that "hook dependencies are pre-installed in system Python via `install.ps1`." The plan creates a `memory/` package with dependencies (`pyyaml`, `anthropic`/Claude Agent SDK) but does not specify how they are installed.
- Impact: On any machine (or after a fresh install), hooks will fail with `ModuleNotFoundError` for `yaml`, `anthropic`, or other imports. No session will ever be captured.
- Fix: Add an explicit section to T2.1–T2.4 specifying which packages must be pre-installed in system Python and how. Update `install.ps1` (and `install` for Linux) to include: `uv tool run pip install pyyaml anthropic` (or equivalent). Alternatively, create `claude/hooks/memory/.venv/` and adjust hook invocation commands accordingly — but this requires revisiting the "no uv run" constraint documented in CLAUDE.md.

**BUG-4: Compile service bypasses `UnifiedPipelineService`, producing incomplete concept items**
- Flagged by: R2 (Red Team)
- Verification: The existing pipeline (confirmed in `services/unified_pipeline.py` and `routers/content.py`) sets `tier`, `quality_score`, `processing_status`, `pipeline_version`, `topics`, and `entities`. Writing concepts directly via `storage.py` will produce items without these fields.
- Impact: Concepts will be invisible to tier-filtered search (`tier_min` parameter), won't appear in usage/cost tracking, and won't have entity edges. The eval harness may not compare them fairly against other content types.
- Fix: Document the intent explicitly in T4.1. If concepts are intentionally exempt from quality scoring (reasonable for compiled artifacts), note that they will not be returned by tier-filtered queries and add `content_type="concept"` as an implicit filter to the compile preview endpoint and injection path.

**BUG-5: No compile-time concept deduplication — duplicates accumulate until lint runs**
- Flagged by: R5 (ML/Retrieval)
- Verification: The plan places cosine ≥ 0.92 dedup in the lint service (Wave 6), not in the compile service (Wave 4). Nightly compiles over overlapping session windows will generate duplicate concepts each night with no check.
- Impact: By the time lint runs, dozens of near-identical concepts may exist. Lint marks them but doesn't merge or delete them — the vault becomes cluttered.
- Fix: Extract the cosine similarity check into a shared `is_duplicate_concept()` function. Call it in `CompilerService.compile()` before writing each new concept: embed the draft concept, query existing concept embeddings, skip if similarity ≥ 0.92 to any existing concept. Lint retains the check as a second-pass validator for anything that slipped through.

**BUG-6: APScheduler with multiple uvicorn workers causes double-execution of compile/lint/digest**
- Flagged by: R6 (SRE)
- Verification: `pyproject.toml` does not specify worker count. The existing `main.py` lifespan already starts a scheduler (`pricing_service.start_scheduler()`). If menos is ever started with `--workers 2`, all scheduled jobs fire from both workers simultaneously.
- Impact: Duplicate concept items created per compile run; duplicate lint annotations; duplicate digest items.
- Fix: Add to T4.3: (1) Document that menos must run `--workers 1` for scheduler correctness. (2) Add a startup guard: `if int(os.environ.get('WEB_CONCURRENCY', '1')) > 1: logger.error('APScheduler requires single-worker mode')`.

**BUG-7: New APScheduler must be registered in existing `lifespan()` finally block**
- Flagged by: R6 (SRE)
- Verification: `main.py` lines 151–167 show the only lifespan handler. The existing scheduler (`pricing_service.start_scheduler()`) is started inside the lifespan and stopped in the `finally` block. If the new compile scheduler is started outside lifespan (e.g., at module level), it will not be stopped on SIGTERM, causing uvicorn to hang.
- Impact: menos will not shut down cleanly after Wave 4. SIGTERM during a nightly compile will hang the process.
- Fix: T4.3 must explicitly state: "Add `scheduler.start()` inside the `lifespan()` async context manager body (after `pricing_service.start_scheduler()`), and `await scheduler.shutdown(wait=False)` inside the `finally:` block, alongside `pricing_service.stop_scheduler()`." Show the exact insertion point in `main.py`.

**BUG-8: NDCG@5 regression threshold (±5%) is statistically meaningless with 10 queries**
- Flagged by: R5 (ML/Retrieval)
- Verification: Standard error of NDCG@5 with 10 queries is approximately σ/√10 ≈ 0.05–0.15 depending on score variance. A ±5% (±0.05) threshold cannot distinguish signal from noise at this sample size.
- Impact: V1, V4, and the success criterion 5 will pass or fail randomly, providing no reliable regression signal. The eval harness gates can mislead the operator into thinking compile is regressing when it is not (or vice versa).
- Fix: Either (a) increase to 30–50 hand-labeled queries (still feasible for one user), or (b) change the threshold to ±15% (±0.15) to match the actual confidence interval, or (c) change the regression check to query-level: flag if >2 individual queries drop by >0.2 NDCG. Document the chosen approach in T0.1.

---

## Hardening Suggestions (optional improvements)

**H1: Add first-capture warning for new repos (default-allow posture)**
- Flagged by: R4 (Security)
- Assessment: Proportionate. A single log line costs nothing.
- Action: In `session_end.py`, track repos that have been captured before (a `seen_repos.txt` list or a query against existing `project:X` tags in menos). On first capture for any new repo, emit prominently: `[memory] FIRST CAPTURE for {repo} — add to ignore.yaml if sensitive`.

**H2: Disable SDK logging in summarizer subprocess to prevent un-redacted intermediates**
- Flagged by: R4 (Security)
- Assessment: Important for the privacy guarantee. The plan claims redaction protects the output, but SDK debug logs are written before redaction runs.
- Action: In T2.3, set `ANTHROPIC_LOG=none` and `CLAUDE_CODE_LOG_LEVEL=error` (or equivalent) in the subprocess env dict alongside `CLAUDE_MEMORY_HOOK_INVOKED=1`.

**H3: Increase SessionEnd/Stop hook timeout to 30 seconds**
- Flagged by: R6 (SRE)
- Assessment: The current 15s budget leaves zero margin. Worst-case: SDK cold start (8s) + git context (1s) + POST with retries (5s) = 14s. Any added latency causes timeout.
- Action: In T3.2, set the `Stop` hook timeout to 30 seconds. Document this choice.

**H4: Specify separate connect and read timeouts for circuit breaker**
- Flagged by: R6 (SRE)
- Assessment: Easy fix, prevents subtle hung-server scenario.
- Action: In T3.1, specify `httpx.Client(timeout=httpx.Timeout(connect=3.0, read=5.0, write=5.0, pool=1.0))` rather than a single `timeout=5`.

**H5: Use server-side `created_at` for compile windowing, not hook-side timestamps**
- Flagged by: R6 (SRE)
- Assessment: Prevents clock-skew gaps after laptop hibernation (common in developer workflows).
- Action: T4.1/T4.3: The compile `since` parameter queries `content.created_at` (set by menos on receipt), not `metadata.started_at` or `metadata.ended_at` from the hook payload.

**H6: Add eval harness prerequisite: user must review and approve ground truth**
- Flagged by: R2 (Red Team), R3 (OtB)
- Assessment: Proportionate gate that prevents a builder-authored baseline from becoming canonical.
- Action: Add to V0 checks: "Ground truth file reviewed and approved by user (not builder agent). Each query is genuinely representative of the user's information needs."

**H7: Cap concept/connection items at Ollama context window**
- Flagged by: R5 (ML/Retrieval)
- Assessment: Ollama silently truncates; concept bodies over ~16KB will have semantically incomplete embeddings.
- Action: In T1.1, add a content-type constraint: concept and connection bodies are capped at 8000 chars. Log a warning if compile would exceed the cap and truncate deterministically.

**H8: Add `digest` to default search exclusion list**
- Flagged by: R3 (OtB)
- Assessment: Digest items will return for informational queries and pollute results.
- Action: In T6.2, tag digest items with both `digest` and `weekly`. Document that users should add `digest` to `exclude_tags` defaults (or add it to the same default-exclusion logic that filters `test`-tagged content).

**H9: Reorder eval harness to post-Wave 3**
- Flagged by: R3 (OtB)
- Assessment: Computing NDCG@5 baseline before session_logs exist measures an irrelevant corpus state. The baseline is most useful when measured against the content types that will actually be tested.
- Action: Move T0.1 dependency to after V3 is complete (or run a "pre-capture baseline" in Wave 0 and a "post-capture baseline" after Wave 3, keeping both for comparison). If the eval-first constraint is non-negotiable, document explicitly: "Wave 0 baseline measures only existing YouTube/markdown corpus; session_log and concept content types are not present."

**H10: Prompt injection defense in summarizer and injection path**
- Flagged by: R4 (Security)
- Assessment: Risk is real but requires prior successful delivery of adversarial content into a session. Low likelihood, moderate impact.
- Action: In T2.3, wrap transcript content in a clear delimiter in the prompt template (`---BEGIN TRANSCRIPT---` / `---END TRANSCRIPT---`). In T5.2 `sanitize_for_injection()`, strip lines matching `^You are` / `^Ignore previous` / `^SYSTEM:` before injecting concepts.

---

## Dismissed Findings

**D1: `PipelineJob.data_tier` is required and has no valid value for compile jobs**
- Flagged by: R1
- Reason: Dismissed. `PipelineJob.data_tier` has a default value of `DataTier.COMPACT` (confirmed: `models.py` line 66: `data_tier: DataTier = DataTier.COMPACT`). Compile jobs can use this default without a migration. No bug.

**D2: `ignore.yaml` `.ssh/*` default pattern is ineffective**
- Flagged by: R2
- Reason: Dismissed as LOW/cosmetic. The `.ssh/*` default is a template placeholder to show the format, not a functional security control. The user will customize the file. Not a plan defect.

**D3: `python -m claude.hooks.memory.summarize` requires PYTHONPATH**
- Flagged by: R1
- Reason: Downgraded to documentation note. The test/verification commands in acceptance criteria are illustrative. The hook invocations in `settings.json` will use `$HOME`-absolute paths. The module invocation path issue only affects manual testing — worth a note in T2.3 but not a plan defect.

**D4: HDBSCAN at 200 docs threshold may be too low**
- Flagged by: R3
- Reason: Wave 7 is already explicitly marked optional in the plan's Handoff Notes. The threshold is a config value, not hardcoded. Low severity, no action required.

**D5: Time decay not applied to compile input selection**
- Flagged by: R5
- Reason: The compile windowing is date-bounded (last N days) which already provides recency bias. Time decay on search is a separate feature. Not a defect — the plan is intentionally narrow here.

---

## Positive Notes

- The plan correctly identifies that `LinkExtractor` exists and is already a first-class primitive — the bug (BUG-2) is a gap in specifying HOW to invoke it from the compile path, not a wrong assumption about its existence.
- `_run_purge()` exists exactly as described in `main.py` (lines 72–120), is synchronous, and uses the same SurrealQL DELETE pattern the plan assumes. T1.2 is a clean, low-risk mechanical extension.
- The `resource_key` deduplication pattern is already implemented in `services/jobs.py` (confirmed: `find_active_job_by_resource_key()`). T4.2's reuse of this pattern is correct.
- The RFC 9421 signing module (`claude/commands/yt/signing.py`) exists and is reusable exactly as the plan describes.
- The recursion guard concept (`CLAUDE_MEMORY_HOOK_INVOKED=1`) is the correct approach — the hardening suggestions just add belt-and-suspenders to an otherwise sound design.
- The hybrid LLM-only → cluster-first transition is well-reasoned and the fallback pattern (HDBSCAN → KMeans) is appropriate.
- The circuit breaker constraint (fail fast, never queue) is the right choice for a hook that must not block session exit, and the plan consistently honors it throughout.
- The path-blinding requirement (home directory → `~/`) in the redactor is a thoughtful privacy control that will make stored summaries portable across machines.
