---
created: 2026-09-10
status: ready
completed: null
---

# Make log analytics cheap for small questions and complete for large ones

## Goal and scope

- Make the default-profile `log_analytics` tool perform work proportional to the question. Targeted discovery and a few examples must not materialize the corpus. Explicit full-period investigations must have a practical path to finish beyond one invocation's input or memory budget.
- User-approved decisions (2026-09-10): change default implementation only, preserve reads of default and legacy history, permit a small on-demand persistent metadata cache if measurements justify it, and permit temporary disk use for large SQL queries. No background indexing or copied persistent message content.
- Representative questions: the user's added acceptance case is **"find tool call failures from the last week"**. The preceding complete three-month workflow investigation remains the large-scan case. A targeted content lookup supplies the contrasting cheap case, not a new research project.
- Planning is authorized; runtime implementation is not yet authorized. The operator separately authorized the read-only fallback skill clarification, implemented during planning. Subsequent execution of this plan includes its dedicated worktree, local commits, archival and merge into the originating `main` checkout. No push or deployment permission.
- Non-goals: editing/testing legacy code, restoring legacy analytics/report commands, changing log writers, a permanent transcript projection or full-text index, semantic search/model calls inside analytics, a new CLI/service, general SQL partition planning, automatic incident diagnosis, or implementing Strategist/Steward. Actual historical research findings are a separate deliverable, not implementation acceptance.

## Fresh-context handoff

All repository paths below are relative to `C:/Users/mglenn/.dotfiles`. Read applicable `AGENTS.md` before acting.

- Owner: dotfiles, `pi/profiles/default/`. No submodule work.
- Planning inspection: 2026-09-10, `main` at `47c5907c`; working tree clean before this plan and task feedback entries. Planning profile verified through `PI_CODING_AGENT_DIR`: `C:/Users/mglenn/.dotfiles/pi/profiles/default`. Intended execution profile: default. No new runtime behavior has been tested during planning.
- Proposed worktree: `C:/Users/mglenn/.dotfiles-worktrees/query-driven-log-analytics`; proposed branch: `feat/query-driven-log-analytics`; integration target: originating `C:/Users/mglenn/.dotfiles`, `main`. Record actual values before implementation. Recheck status and preserve concurrent changes.
- Concurrent work appeared during planning: root `CHANGELOG.md`, default subagent launch/visible code and launch-prompt tests, `scripts/pi-subagent-host.mjs`, and untracked default `extensions/bedrock/provider.ts`. These are not this task's changes. Task-owned changes at handoff are this spec, the AIF-030/APR-021 log entries, the analytics skill/reference fallback clarification and its distinct changelog entry; preserve all other edits.
- Read: `pi/README.md` log-analytics section; `pi/profiles/default/skills/pi-log-analytics/{SKILL.md,reference.md}`; `lib/log-analytics/{profiles,sessions,registry,api,store,render}.ts` under the default profile; `extensions/log-analytics-tool.ts`; existing `tests/log-analytics-*.test.ts`, `tests/helpers/analytics-fixture.ts`, and `scripts/log-analytics-{smoke,perf}.mjs` there.
- Before implementation, read the installed Pi docs for extensions, session format, skills and TUI rendering, with relevant linked examples. Resolve them under the installed package documented in the environment, not repository-relative `docs/`. Pi package work and checks use pnpm only.
- Relevant feedback: AIF-030 and APR-021 in default `skills/agent-process/references/`; earlier AIF-013 documents an independently sampled investigation also narrowed after OOM. AIF-003/AIF-004 and APR-002 constrain scope and verification churn. These records do not authorize unrelated workflow changes.

### Verified starting behavior

- `sessions` is already paginated and metadata-only, but `discoverSessions` traverses and rereads headers before each page or exact-reference query. Results include canonical `SessionRef` objects and file sizes. Creation/mtime are not event-time bounds.
- `registry.ts` already exposes `message_role`, `entry_type`, `tool_name`, `tool_call_id`, `is_error`, provenance and the full JSON `record`. Adding role filtering is not a missing-column project.
- `store.ts` materializes every selected source into `_prepared_*` tables before caller SQL. Even a role/date filter or `LIMIT 1` cannot avoid that setup. Each call creates another in-memory DuckDB instance with no spill.
- Defaults: 5-second deadline, 512 MiB selected input, two DuckDB threads, 1 GB DuckDB memory, at most 1,000 rows and 256 KiB encoded rows. DuckDB's memory setting is not a process-RSS guarantee. Abort and external-SQL isolation already exist and must remain.
- The previous port's recorded synthetic broad queries failed on approximately 50/100 MiB inputs under the 1 GB ceiling. This is historical evidence, not a new measurement. Its exact-session and metadata paths passed. See `.specs/archive/default-log-analytics-port/plan.md`.
- The old legacy architecture and the current default architecture are not the same comparison: persistent projections/caching were removed before the default port. Do not restore the old system wholesale or claim all earlier legacy workloads succeeded.
- Session JSONL contains all branches and copied fork history. Stored user-role messages can also be injected or quote other content. Role filtering reduces noise; it does not prove operator authorship or intent.

## Decisions and implementation contract

### One tool, different amounts of work

Keep `catalog`, `sessions`, and read-only SQL `query` compatible. Add one **`search` operation** for streaming session-record search and traversal, rather than requiring SQL for every lookup. Reuse canonical source discovery, profile authority and native-record field interpretation.

Search inputs support registered profiles, exact session references or project cwd, an explicit event-time interval, entry/message role, tool name, error flag, optional literal text matching, bounded result size, and continuation. Names and nested schema layout may follow local conventions. Do not add a competing SQL grammar, regex language, or a natural-language router inside the tool.

- Time is based on the actual record timestamp using the existing outer/native-nested normalization, not filename/header creation or mtime. Use a fixed `[since, until)` interval for a multi-call investigation. Null/invalid timestamps remain observable gaps in event-time coverage.
- Text search normally inspects message text content (string content and text blocks), not serialized entire records, image data, quoted tool arguments or arbitrary nested JSON. Keep SQL available for deliberate full-record JSON searches. A user-role filter searches stored user messages, not proof of human authorship.
- Return useful bounded snippets, existing profile/session/record identity, and occurrence coordinates sufficient for exact follow-up. Repeated ID-less records must remain distinct. Support bounded follow-up around a returned occurrence within the selected session without staging its entire file into DuckDB. Reuse the same reader; a small exact-record selector is preferable to another indexing subsystem.
- Read incrementally with bounded buffers and record size, including within a file larger than the per-call byte budget. Stop on result/byte/time budgets and return continuation rather than discard progress or require smaller files. Do not silently lose an oversized result between pages. Report skipped malformed/oversized input records with counts and bounded diagnostics.
- Search must not load DuckDB. Metadata discovery must remain transcript-free. Do not read extra transcript content merely to populate a cache.
- Cheap searches may prioritize likely/recent files as a heuristic, with that ordering described honestly. They do not promise globally newest matches without complete traversal or verified ordering. Unknown or stale metadata cannot exclude a file from an exhaustive scan.

### Continuation and coverage

Record traversal, output truncation, and semantic review are different things.

- Search returns bounded per-call and cumulative coverage: selected files/bytes, examined records/bytes, safely pruned files, remaining work, exclusions, stop reason, and `nextCursor` when continuation is possible. A caller can determine when its selected input has been exhausted without guessing from an empty page.
- Bind continuation to scope/filters and a stable selected-file inventory plus observed byte horizons. Continue at record boundaries without rereading earlier batches or duplicating occurrences in an unchanged corpus. A single large file must make progress across calls.
- Scope membership/horizons describe observations, not a transactional filesystem snapshot. Handle appends, replacement and truncation explicitly: no silently invalid offsets or "complete" claims over changed data. New records beyond captured horizons belong to a fresh scan; report that boundary. Cursors may be process-local and expire on reload/exit; report expiration and recovery clearly. Durable job execution/restart recovery is not required.
- Close handles between pages. Bound retained cursor metadata and release it when complete, expired or shut down; no held DuckDB instance, timer-driven scans, or waiting worker between pages. Preserve existing profile containment and revalidate resolved source identity on follow-up.
- Completion means the selected readable input was traversed, with exclusions disclosed. A sampled/early-stopped search is not exhaustive, and an exhaustive keyword scan is not a semantic review of every session. The skill must teach this distinction explicitly.

### Small cache, only on demand

Use one disposable metadata cache under the default runtime's gitignored analytics state directory, not inside legacy. It may contain file identity/change markers, session header metadata, observed event-time min/max, and completeness through observed byte horizons. No transcripts, snippets, arguments, outputs or permanent SQL projection.

First measure repeated header discovery in T1. Implement the small cache if it eliminates repeated work, as expected from the inspected call path; otherwise record why it is unnecessary and leave it out. This conditional optimization is user-approved, not a new acceptance gate.

- Populate headers during discovery and event ranges only during already-requested record reads. Never scan all content to warm the cache before a cheap query.
- Reuse only validated entries. Invalidate stale ranges on change; unknown/partially scanned ranges cannot prove exclusion. Prefer simple whole-file invalidation over an incremental-content-refresh subsystem.
- File identity/change markers must account for replacement/truncation as supported by the host filesystem. Document limits honestly; do not hash all transcripts on every query merely to validate the cache.
- A missing, corrupt or unavailable cache falls back to authoritative files with correct coverage. Use small atomic writes and a bounded cache; concurrent instances must not turn stale cache state into false exclusions. Cache data is disposable and never grants filesystem authority.

### SQL when SQL is needed

Preserve arbitrary native single-SELECT support (CTEs, JSON, joins, parameters) against registered views. Do not split arbitrary SQL across files and concatenate results: grouping, distinct, order, windows and joins require global semantics.

Add an explicit model-callable large-query execution option. Standard calls retain their lightweight resource contract; large calls may use more elapsed time/input and invocation-owned temporary storage without a new operator approval prompt. Keep memory/thread ceilings rather than treating a big question as permission for unbounded RAM or parallelism.

- In large mode, stage selected data in bounded chunks into invocation-local disk-backed DuckDB and allow bounded temporary spill. Avoid a multi-file JSON reader allocation that scales with the entire file set. The streaming reader can feed batches when native single-file ingestion still exceeds memory; T1 verifies the smallest workable mechanism before implementation expands.
- Retain complete registered records and typed-column semantics. Do not drop content from the SQL view or narrow caller SQL implicitly to make it pass.
- Report execution mode, actual phase/input costs, resource limits and failures. Use a documented longer large-mode deadline and disk budget chosen from T1's measurements. Existing environment overrides remain explicit and documented; do not silently raise configured ceilings after failures. Ordinary search handles small questions instead of auto-retrying expensive SQL.
- Temporary DB/spill paths are runtime-owned, never tool arguments. Only prepared registered data is accessible after setup. Preserve native SELECT validation, external-access disablement, and no extension auto-install/load. Verify spill still works with caller external access disabled.
- Clean invocation-owned temporary content on success, error and cancellation after closing native handles. If cleanup fails, report the exact owned remnant; never delete unrelated directories. Crash-left remnants may be cleaned on a subsequent analytics invocation when ownership is established, not through background maintenance. No secure-erasure claim.
- SQL output remains bounded and reports truncation. Do not invent resumable arbitrary SQL or claim a partial aggregate is a complete answer after timeout/OOM.

### Instructions and acceptance meaning

The tool description and owning analytics skill must give executable recipes, not only "keep requests bounded":

1. **Targeted lookup/examples:** narrow by known profile/project/session, use text/role search, stop when enough examples answer the request, and label unexamined scope. Exact follow-up retrieves context only where needed.
2. **Last-week tool-call failures:** freeze the seven-day interval, search stored `toolResult` records with `is_error = true`, page through the required scope, retain tool/call/session coordinates, then inspect relevant call/result context. Name these recorded failures, not automatically product defects. Expected nonzero outcomes, approvals/cancellations and confirmed defects require context. The error flag is not proof that all textual or domain-level failures were captured. Content searches can supplement it with separately labeled evidence; no speculative failure-classification engine.
3. **Complete three-month workflow review:** enumerate/traverse both selected profiles over the fixed window, inspect direct-message evidence and necessary adjacent activity, include analogous cases without profanity, and track what was screened versus actually reviewed. Continue available pages without scheduling ordinary work or asking permission at every budget boundary. Disclose exclusions and unresolved sessions; never substitute a keyword sample for the requested review.
4. **Global analytics:** use SQL when joins/aggregates are needed; select large execution for a large scope. Supply the practical next action on resource failure rather than claim no findings or silently reduce coverage.
5. **Read-only fallback (operator-approved follow-up):** prefer `log_analytics`, but permit existing `find`, `rg`, `jq`, `awk`, and `sort` through available shell tools when analytics is unavailable, resource-limited, excludes relevant input or cannot find the requested evidence. Keep the same authorized history scope, parse JSON for role/time/error semantics, stream/filter early, retain source coordinates, and report parse/pipeline failures and incomplete coverage. No extra approval merely to change read-only methods, no silent source mutation or wider scan, and no mandatory duplicate verification after a successful query. Temporary sorting space is allowed; clean up task-owned content artifacts. This is use of existing tools, not a new analytics CLI. The active `pi-log-analytics` skill and reference already contain this clarification; preserve it while adding the new operations. Fallback does not replace the tool-owned acceptance checks in T5.

Do not alter global `AGENTS.md`, planning rules, `/do-it`, or legacy skills to compensate for this tool-owned problem.

## Execution guidance

Create or resume the recorded worktree and record actual branch/path/target before editing. Carry task-owned plan and feedback changes without discarding their originating copies or unrelated work. Follow task dependencies, using bounded assignments when delegating. Adapt technical mechanisms within the settled decisions; ask only before changing scope, privacy/storage decisions or acceptance. Continue independent work around concrete blockers.

Keep checkbox evidence current. Do not turn benchmark failures into acceptable characterization when they violate the acceptance cases. Fix demonstrated task-relevant problems and stop when the finite checks below pass. No additional audit or mandatory reviewer pipeline.

## Tasks

- [x] **T1: Verify the ingestion mechanism and bounded workload contract**
  - Depends on: none.
  - Inputs: current store, sessions, fixture helper and perf script; installed DuckDB API. Proposed evidence file: this spec's `implementation-evidence.md` (synthetic metadata only).
  - Change: run the smallest synthetic experiment comparing repeated header discovery and one-file/chunked SQL staging with private temporary DB/spill at the existing 1 GB ceiling. Include full-record payloads rather than metadata-only rows. Confirm a grouped query and cross-file join after external access is disabled. Use existing infrastructure, not an engine-comparison framework. Record the selected ingestion mechanism, search page budgets/record bound, large-query deadline/disk budget, cache decision and expected metadata/continuation shapes for dependent tasks.
  - Verify: finite isolated Node/DuckDB probe, with known independent expected results, actual bytes, elapsed/CPU/peak-memory measurements and temporary cleanup. Run no private transcript benchmark during planning/execution acceptance.
  - Done when: the bounded path is demonstrated and subsequent tasks can implement it without guessing interfaces. Failure requires adapting ingestion within approved temporary-storage intent, not raising memory until it passes or abandoning large-query support.
  - Evidence: complete 2026-09-10. `node scripts/log-analytics-ingestion-probe.mjs` passed against 35,225,960 bytes of generated full-record JSONL plus 240 synthetic session headers. Both sequential one-file native ingestion and bounded reader/appender disk staging produced independently expected grouped and cross-file join results after external access was disabled, under the 1 GB ceiling, and cleaned all owned temporary content. Repeated discovery reread all 240 headers, so the approved metadata cache is selected. Measurements, selected budgets, and T2/T3 request/result interfaces are recorded in `implementation-evidence.md`.

- [x] **T2: Implement streaming search, continuation and exact follow-up**
  - Depends on: T1.
  - Files: proposed `pi/profiles/default/lib/log-analytics/search.ts` (split reader module only if useful); existing `profiles.ts`, `sessions.ts`, `registry.ts`, `api.ts`; proposed `tests/log-analytics-search.test.ts` and existing fixture helper.
  - Change: implement the search/coverage contract without DuckDB, share native field normalization, add bounded within-file continuation and occurrence follow-up. Integrate the conditional small metadata cache at discovery/scan boundaries; proposed `metadata-cache.ts` if used. No background work.
  - Verify: `pnpm test log-analytics-search.test.ts log-analytics-sessions.test.ts` from `pi/profiles/default/`. Use real temp JSONL files: nested/outer timestamps, old sessions resumed recently, repeated ID-less records, matches without profanity, user versus tool-output text, a file larger than a page budget, zero-match pages, malformed/oversized lines, cancellation and append/replacement/truncation at continuation. Assert exact stable-corpus occurrences across all pages and no repeated earlier record reads. If cached, verify warm metadata reads and changed/unknown-range inclusion, fallback on corrupt cache, and that persistent files contain no message content.
  - Done when: early search stops reading content once enough results are found, complete traversal finishes beyond a page budget, follow-up reaches the exact occurrence, and coverage cannot mistake partial work for exhausted input.
  - Evidence: complete 2026-09-10. Added DuckDB-free bounded JSONL search, process-local cursor continuation, exact occurrence follow-up, shared native record normalization, and the disposable default-profile metadata cache. `pnpm test log-analytics-search.test.ts log-analytics-sessions.test.ts` passed (13 tests), `pnpm exec tsc --noEmit` passed, and `git diff --check` passed. The search matrix uses temporary JSONL fixtures covering nested/outer timestamps, old resumed sessions, repeated ID-less records, role/error/text filtering, paging beyond the record and byte budgets, malformed/oversized records, cancellation, cache corruption/content exclusion, append boundaries, and replacement/truncation continuation boundaries.

- [x] **T3: Support large SQL without full-corpus RAM staging**
  - Depends on: T1; reuse T2 reader if selected by the probe.
  - Files: default `lib/log-analytics/{store,api}.ts`, proposed temporary-storage helper only if needed, existing store/boundary tests, default `.gitignore` for runtime-owned artifacts/cache.
  - Change: implement the measured bounded ingestion and temporary DB/spill path plus explicit large-execution resource configuration. Keep normal SQL compatibility and cleanup/cancellation. Update tests asserting the obsolete blanket no-disk rule to distinguish standard/large execution and permanent content storage.
  - Verify: `pnpm test log-analytics-store.test.ts log-analytics-boundary.test.ts`. Real DuckDB: full JSON parity, cross-file join/global aggregate correctness, result truncation, external SQL denial after staging, active cancellation, low-memory forced spill, disk/resource-limit failure and cleanup after success/error/cancel. Reuse existing boundary coverage, not a new exhaustive SQL-security audit.
  - Done when: large selected input exceeding the old aggregate input bound can execute globally correct supported queries without raising the 1 GB memory ceiling; standard small queries still work and temporary content has an owned cleanup lifecycle.
  - Evidence: complete 2026-09-10. Added explicit `standard`/`large` SQL execution, with large mode using a 64 KiB bounded JSONL reader and 8 MiB/1,000-record DuckDB appender flushes into an invocation-owned disk database and spill directory. Large mode retains two threads and the 1 GB default memory ceiling, has a 120-second deadline and 4 GiB owned-disk budget, reports phase/input/staging/disk/resource costs, denies external access before caller SQL, and removes only its owned invocation path after success, failure, or cancellation. Focused real-DuckDB tests cover full-record parity, global cross-profile join/aggregate semantics, explicit bypass of the standard aggregate-input bound, output truncation, external-read denial, active cancellation, low-memory spill, disk-budget failure, and cleanup. `pnpm test log-analytics-store.test.ts log-analytics-boundary.test.ts` passed (17 tests), `pnpm exec tsc --noEmit` passed, and `git diff --check` passed.

- [x] **T4: Expose usable operations, coverage and recipes**
  - Depends on: T2 and T3.
  - Files: default `extensions/log-analytics-tool.ts`, `lib/log-analytics/render.ts`, existing tool/render tests, `skills/pi-log-analytics/{SKILL.md,reference.md}`, `pi/README.md` analytics section, root `CHANGELOG.md`.
  - Change: wire search/follow-up/large execution into the existing deferred tool with validated operation-specific parameters. Keep catalog and listing cheap. Show compact matches, continuation/completion, exclusions and meaningful progress; expansion reveals bounded details, not another fetch. Update instructions with the four recipes and accurate costs, cache/disk ownership, cursor lifetime, and failure recovery. Remove superseded no-cache/no-spill statements from owning current docs, not historical archives.
  - Verify: `pnpm test log-analytics-tool.test.ts log-analytics-render.test.ts tool-search.test.ts tool-visibility.test.ts`. Exercise requests through registered execute with real temp records; keep mocks only for Pi host/render boundaries. Run the documented last-week recipe against known fixtures. Review prose once for scope/completeness contradictions.
  - Done when: a caller can select cheap search versus large SQL, follow returned continuation, inspect exact context and report accurate coverage using the tool/skill alone. No slash-command or repeated approval gate is introduced.
  - Evidence: complete 2026-09-10. The registered real-boundary tool test runs the documented frozen `[2026-09-01T00:00:00Z,2026-09-08T00:00:00Z)` last-week recipe across default and legacy fixtures, pages with `maxResults:1`, confirms only `toolResult`/`isError:true` records (including a successful textual false positive and user text exclusion), follows an exact occurrence, and executes explicit `large` SQL. Operation-specific TypeBox unions reject cross-operation fields. Renderer tests cover compact matches/progress and continuation, expanded occurrence coordinates/bounded context, standard/large cost labels, truncation and exclusions; expansion performs no fetch. The skill, reference and Pi README contain targeted, last-week, complete three-month, and global SQL recipes plus event-time, coverage, cursor, cache, temporary-disk and recovery semantics; fallback guidance remains intact. Checks passed:
    ```text
    cd pi/profiles/default
    pnpm test log-analytics-tool.test.ts log-analytics-render.test.ts tool-search.test.ts tool-visibility.test.ts
    # 4 files, 17 tests passed
    node scripts/log-analytics-smoke.mjs
    # real Pi loader catalog, metadata discovery and combined query passed offline
    pnpm exec tsc --noEmit
    # passed
    cd ../../..
    git diff --check
    # passed
    ```

- [x] **T5: Prove the contrasting workloads end to end**
  - Depends on: T4.
  - Files: default `scripts/log-analytics-perf.mjs`, `scripts/log-analytics-smoke.mjs`, fixture support where needed; implementation evidence in this spec.
  - Change: replace the old failing characterization matrix with a finite acceptance run using generated native records across both profiles. Use approximately 10 MiB and at least 600 MiB corpora, with one file larger than the search page budget and realistic padded tool outputs. Expected IDs/counts come from the fixture generator, not the implementation under test.
  - Verify: `node scripts/log-analytics-smoke.mjs`, `node scripts/log-analytics-perf.mjs`, `pnpm test log-analytics-`, and `pnpm run typecheck` from default; `git diff --check` from repository root. Run one cold and one warm sample for each workload, not an open-ended tuning campaign:
    - Header discovery/exact targeted search: no DuckDB; no unrelated transcript scan. Known early matches return before full corpus reads, with partial coverage when appropriate.
    - Last-week failures: known results across both profiles and resumed old sessions, valid call/result follow-up, no successful tool-output keyword false positives in the error-flag recipe. Page through to completion when full coverage is intended.
    - Three-month traversal: continue to exhaust the fixture with exact expected occurrences, including non-profanity feedback and explicit gaps, using bounded memory and no persistent transcript copies. This proves retrieval coverage, not semantic review quality.
    - Large SQL: global counts and a cross-file join agree with the generator over input larger than 512 MiB; exercise temporary storage while retaining the 1 GB DuckDB ceiling.
  - Report actual files/bytes read versus selected, cache hits/pruning, records/pages, end-to-end time, CPU, process peak memory, temp-disk high-water and cleanup. Do not equate the DuckDB ceiling with RSS. Structural read/coverage assertions are acceptance; timings characterize the host rather than invent an unapproved universal latency target. Required outcomes must succeed, not merely emit an explicit OOM.
  - Done when: all named checks pass and finite workload evidence demonstrates cheap early answers and complete large scans/SQL. No private-history export, live model calls or operator testing gate.
  - Evidence: complete 2026-09-10. `node scripts/log-analytics-smoke.mjs` and `node scripts/log-analytics-perf.mjs` passed from `pi/profiles/default`; the exact finite matrix ran one cold and one warm sample for each of the four workloads at both generated sizes (16 correct samples, no failures). The generator independently expected 9,616 records in the 11,337,048-byte corpus and 6,416 records in the 636,428,208-byte corpus, with both profiles, 16 recorded failures, 16 non-profanity feedback occurrences, 16 timestamp gaps, and cross-profile join expectations of 2,889,608 and 1,286,408 rows. The large corpus has a 39.8 MiB file, exceeds the 8 MiB search page, and exceeds the 512 MiB standard SQL bound.

    Targeted search returned after 4 records from 1 of 16 files (7,145 physical bytes in the small case and 106,744 in the large case), with no DuckDB and incomplete coverage. Failure search found all 16 error-flagged tool results across both profiles and valid adjacent follow-up; it completed in 2 pages at small size and 76 pages at large size. Three-month traversal found all 16 generated feedback markers, reported all 16 timestamp gaps, and exhausted 9,600/6,400 records with 11,335,176/636,426,336 physical bytes read. Large SQL returned generator-matching global counts and cross-profile joins while staging 9,616/6,416 records; it retained the 1 GB/two-thread ceiling and observed 14,055,296 bytes small and 851,535,500 bytes large temporary high-water.

    Worker measurements reported end-to-end time, CPU and peak RSS for every sample: large cold/warm were targeted 56/39 ms and 16/48 ms CPU with 82.6/82.1 MiB RSS; failures 5,051/4,682 ms and 5,203/4,438 ms CPU with 143.4/116.7 MiB RSS; traversal 5,347/4,676 ms and 5,970/4,890 ms CPU with 149.3/141.7 MiB RSS; and SQL 18,040/15,653 ms and 16,344/15,937 ms CPU with 314.7/326.9 MiB RSS. Cold cache hits were 0 and warm cache hits were 16 for every sample; safely-pruned files were 0. Every invocation-owned SQL path was absent after close/cleanup, and the scratch fixture tree was removed. During the large SQL run, bounded staging was adjusted to retain the raw disk table and lazily project typed fields, avoiding a demonstrated 1 GB transient full-copy OOM while preserving the registered JSON view and temporary-disk ownership.

- [ ] **T6: Archive, commit and integrate**
  - Depends on: T5.
  - Follow the closeout contract below. Mark this task complete only after integration and cleanup succeed.
  - Evidence: implementation and agreed checks passed; archival and task-branch commit are in progress, with integration and cleanup still pending.

## Agreed validation and current handoff

- Status: ready for execution authorization; implementation not started.
- Completed planning work: current source/docs/test inspection, user decisions captured, one fresh-executor review of dependencies and finish conditions. Operator-approved read-only fallback guidance added to the existing analytics skill/reference rather than creating a duplicate skill, with matching plan/feedback/changelog updates. No runtime prototype or performance checks run.
- Next: after authorization, create/resume the task worktree and start T1.
- Blockers/open user decisions: none. Numeric budgets and native ingestion details are bounded implementation choices to verify in T1, not another approval stage.
- Verification limits: no private corpus census, no new runtime acceptance, and no proof of future model adherence. Operator testing after reload is non-blocking.

## Closeout

After implementation and agreed checks pass, record integration pending. Confirm `.specs/archive/query-driven-log-analytics/` is unused, then move this entire spec there in the task worktree and repair affected links. Commit implementation, task-owned feedback updates and archived spec on the task branch. Do not archive unfinished implementation.

Merge into the recorded originating `main` checkout without stashing, discarding or committing unrelated target changes. Resolve ordinary conflicts within settled intent. If genuinely blocked, retain the committed worktree and report the blocker, next action and owner; passing tests/archival alone are not completion. An explicit later `--no-merge` is the intentional exception.

After merging, verify the target contains the implementation and archive with no active plan copy. Set archived frontmatter to `status: completed` and the actual completion date, record merge evidence, and commit that metadata on the target. Rerun affected checks only if conflict resolution changed checked content. Remove only the task-owned worktree/branch after it contains no uncommitted or unmerged work. Verify cleanup before marking T6 done; commit any final evidence update as needed. Push and deployment require separate authorization.

Final execution response starts with a symbol and explicit outcome: 🟢 **COMPLETED**, 🔴 **NOT COMPLETE: MERGE BLOCKED**, 🔴 **NOT COMPLETE: USER INPUT REQUIRED**, 🔵 **IMPLEMENTED: MERGE SKIPPED AS REQUESTED**, or 🟡 **CLEANUP PENDING**. For blocked/cleanup results, lead with **Reason** and **Action needed**, including who owns the next action. Then give concise checks, archive path, commits/merge result, and retained worktree or cleanup remnants. Do not hide unfinished delivery behind successful tests.
