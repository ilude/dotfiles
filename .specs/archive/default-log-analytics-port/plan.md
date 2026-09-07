---
created: 2026-09-07
status: completed
completed: 2026-09-07
---

# Port bounded log analytics with explicit default and legacy session selection

## Goal and scope

- User requirements: plan the legacy `log_analytics` port into default, consider existing telemetry and recent performance work, and support efficient searches within default sessions, legacy sessions, or both.
- Implemented scope: the generic DuckDB tool, metadata-only session discovery, explicit profile/session selection, source adapters for existing records, focused tests, performance characterization, and owning documentation.
- No new logging producers. Session JSONL and existing default Bedrock/Codex ledgers remain authoritative and unchanged.
- Non-goals: persistent indexes or caches, SQLite migration, legacy metrics/orchestration/workflow-friction/permission telemetry, persistent Damage Control telemetry, typed legacy report readers, `/find-fails`, churn-review workflows, automatic legacy-history import, arbitrary named-profile discovery, live runtime reload, deployment, commits, or pushes.
- Authorization: the user subsequently requested execution to completion without expanding scope. Implement the listed baseline with recommended deferred activation. No commits, pushes, deployment, live reload, or persistent indexing are authorized.

## Context for a fresh session

All code paths below are relative to the dotfiles repository root unless explicitly identified as installed Pi documentation. Read current applicable `AGENTS.md` files before acting.

- Owner: dotfiles, primarily `pi/profiles/default/`. Legacy runtime and submodules remain unchanged.
- Required reading: root `AGENTS.md`, `pi/profiles/default/AGENTS.md`, `pi/README.md`, this plan, and task-local files below. Before implementation, read installed Pi `docs/extensions.md` completely and follow relevant linked documentation/examples, particularly session format, custom tools, and dynamic tool loading. Resolve these under the installed package specified by the active harness, not this checkout. Follow the testing skill when authoring tests.
- Existing generic implementation: `pi/profiles/legacy/extensions/log-analytics-tool.ts`; `pi/profiles/legacy/lib/log-analytics/{api,store,registry}.ts`; `pi/profiles/legacy/tests/log-analytics-{tool,store,boundary}.test.ts`.
- Existing default writers: `pi/profiles/default/lib/bedrock/ledger.ts`, `pi/profiles/default/lib/codex-usage.ts`; native Pi writes sessions. Default Damage Control deliberately has no persistent telemetry ledger, per `pi/profiles/default/docs/damage-control-setup.md`.
- Existing discovery integration: `pi/profiles/default/extensions/{tool-search,tool-visibility}.ts`, `pi/profiles/default/lib/tool-activation.ts`.
- Existing performance context: `.specs/archive/source-selective-log-analytics/plan.md` and `.specs/archive/log-analytics-resource-bounds/plan.md`. Their old `pi/lib`, `pi/extensions`, and `pi/tests` paths now live under `pi/profiles/legacy/`. These are historical evidence, not current workflow instructions.
- Separate experiment: `.specs/duckdb-sqlite-log-analytics-benchmark/plan.md` is unimplemented according to its current checklist. Do not execute, merge, or inherit its benchmark matrix, worktree rules, retry rules, or database-replacement scope.
- Existing work to preserve at planning time: changes to `CHANGELOG.md`, `pi/README.md`, `pi/profiles/default/docs/commands.md`, `pi/profiles/default/extensions/model-shortcuts.ts`, and `pi/profiles/default/tests/model-shortcuts.test.ts`. Recheck Git status before editing; documentation changes may overlap.

### Verified findings and limits

- Current generic queries stage selected sources into invocation-local in-memory DuckDB, then disable external access and stream bounded output. There is no persistent analytics index.
- The August source-selective work deliberately removed persistent projections, fingerprints, offsets, and shared stores. The September resource-bound work added input/deadline/thread/memory/concurrency limits and cost reporting. Plans record completed checks, but this planning session has not rerun them.
- `api.ts` supplies the default 512 MiB input limit. The earlier discussion's suspicion that it was missing was resolved by inspection.
- `store.ts` supports internal `selectedFiles` and `sourceRoots`; the agent-facing tool currently exposes neither profile selection nor session discovery.
- Generic SQL predicates run after source staging. A small result or recent-event WHERE clause does not imply a small scan.
- Session filenames encode creation time, not the time of every event. Old sessions can resume today. Never prune recent-event searches by session filename creation time.
- Current default Codex cache records contain only model/input/cacheRead, without timestamps, session IDs, or unique observation IDs. Repeated identical records are distinct observations, not duplicates to remove.
- Source registry broad patterns such as root `*.jsonl` must not be copied into default.

### Pi profiles

- Planning profile: verified `default`, `PI_CODING_AGENT_DIR=C:\Users\mglenn\.dotfiles\pi\profiles\default`.
- Launcher mapping verified in `scripts/pp` and `scripts/pp.ps1`: bare `pp` selects repository-owned default; `pp -p legacy` selects repository-owned legacy.
- Intended implementation/validation profile: `pi/profiles/default/`, pnpm only.
- Legacy is an explicitly selectable read-only session corpus, not a runtime to modify or activate. `~/.pi/agent` is a compatibility alias, not an additional corpus.

| Date | Actual profile/path | Work or check | Result |
| --- | --- | --- | --- |
| 2026-09-07 | default / pi/profiles/default | Source inspection and plan creation | Planning only at that point |
| 2026-09-07 | default / pi/profiles/default | Implementation, focused tests, typecheck, real-loader smoke, finite performance matrix, full tests | Windows x64, Node v25.9.0, installed Pi 0.85.0; results below. No live runtime reload or history reads |

## Decisions and contracts

| Decision | Source/status | Choice or question | Tasks |
| --- | --- | --- | --- |
| Cross-profile sessions | User requirement | Select default, legacy, or both explicitly through one session schema | T1-T4 |
| Default scope | Execution baseline | Omitted `profiles` means active supported profile; in normal default launches this is default. Both requires `["default", "legacy"]`. No implicit scan of arbitrary profiles | T2-T4 |
| Engine | Preserved baseline | Keep invocation-local DuckDB and direct documented SQL; no persistent index in this port | T3, T6 |
| Existing source catalog | Implemented baseline | `session_entries` for both profiles; `bedrock_usage` and `codex_cache_observations` for default only. Unsupported profile/source pairs fail explicitly; absent files for supported pairs produce empty views | T3-T4 |
| Session discovery | Implemented supporting behavior | Add bounded metadata-only `sessions` operation; discover exact session references by profile, cwd, or native session ID without scanning transcript bodies | T2, T4 |
| Tool visibility | Execution baseline | Deferred via `tool_search`, matching the recommendation in the authorized plan; announced at execution start | T4 |
| Complete-search semantics | Implemented correctness contract | No newest-N file clipping. Exceeding corpus bounds fails; result truncation is separate from corpus coverage | T2-T4 |
| Time semantics | Verified correctness constraint | SQL event timestamp filters do not exclude old resumed sessions. No `since`/`until` filename pruning | T2-T3 |
| Performance commitment | Measured with limits | 28 correct samples, 12 explicit memory-limit outcomes in the finite matrix below. No latency guarantee, higher limits, or index was added | T6 |

### Implemented tool interface

Keep one tool named `log_analytics` with operation-specific fields validated at execution:

```ts
type ProfileId = "default" | "legacy";
type SourceId = "session_entries" | "bedrock_usage" | "codex_cache_observations";
type SessionRef = { profile: ProfileId; sessionId: string; fileKey?: string }; // returned discovery refs include fileKey

// Discovery only. No DuckDB startup or transcript-body scan.
{ operation: "catalog" }
{ operation: "sessions", profiles?: ProfileId[], cwd?: string,
  sessionIds?: string[], maxRows?: number, cursor?: string }

// Explicit corpus selection. sessionRefs narrows only session_entries.
{ operation: "query", profiles?: ProfileId[], sources: SourceId[],
  sessionRefs?: SessionRef[], sql: string,
  parameters?: Record<string, string | number | boolean | null>, maxRows?: number }
```

- `catalog` reports supported profile/source combinations, schemas, bounds, and limitations. It need not enumerate session files or load DuckDB.
- `sessions` reads only bounded header metadata plus directory/stat information. Return profile, native session ID, cwd, creation timestamp, file modification time (not claimed as event time), size, and an exact selectable reference. No prompt previews or session-body-derived titles. Paginate with a bounded opaque cursor and deterministic ordering; describe concurrent changes as a best-effort listing, not a snapshot.
- T1 verifies native session-header and duplicate-ID behavior before freezing `SessionRef`. If a profile contains multiple distinct files with the same native ID, do not silently choose or merge them. Use a validated opaque file discriminator if needed, never caller-supplied filesystem paths.
- Query selectors resolve to a closed canonical file set before DuckDB staging. Unknown or unresolved explicit session references fail. `sessionRefs` outside selected profiles or without `session_entries` fail.
- Default bounds preserve legacy: 5,000 ms session deadline, 512 MiB selected input, 2 threads, `1GB` DuckDB memory, at most 1,000 returned rows, and 256 KiB encoded rows. Preserve documented environment overrides for resources. Do not claim the byte bound covers the whole response envelope unless implemented and tested.
- `query` retains `{ columns, rows, truncated, cost }`, with explicit selected profiles/sources and coverage information added. Cost retains `filesScanned`, `bytesScanned`, `stagingMs`, `queryMs`; record discovery and end-to-end timings in the performance check rather than hiding them inside query time.
- `_profile`, `_source_file`, `_record_key`, `_timestamp`, and `record` remain available. Session rows additionally carry native session identity from their file header and useful typed native message fields. `_record_key` alone is not globally unique; use profile/file provenance with it. If exact identification of repeated ID-less records is needed, retain a stable ordinal rather than deduplicating equal JSON hashes.
- Forks can duplicate historical entries. Count stored records by default, document overlap, and do not silently deduplicate semantic events across sessions.
- Normalize supported timestamp forms accurately; absent/invalid values remain unknown. Missing Codex timestamps must not be fabricated.
- Result `truncated` means the row/byte output bound stopped iteration, not that some source files were skipped. Preserve valid records around malformed lines, but document malformed-record exclusion and report unavailable/unreadable inputs rather than equating them with complete empty history. Avoid a second full parse solely to count malformed lines.
- Keep full original records available, with content sensitivity documented. No extra transcript export, copied runtime corpus, or telemetry stream.

### Profile and filesystem ownership

Use the current native/default profile helper and a small default-owned profile resolver. Resolve repository-owned default/legacy paths from the verified loader/layout, not the session cwd or hardcoded workstation paths. Inspect launcher and native path behavior in T1 before choosing the helper implementation.

Canonicalize roots and selected files, check containment after realpath, reject link escapes, and deduplicate aliases by canonical file identity. Source layouts are exact owned ledger paths and `sessions/**/*.jsonl`, not generic root JSONL patterns. Model arguments cannot supply roots. Tests inject a closed temporary profile registry instead of relying on ambient legacy metrics/operator environment variables. Document whether the legacy single-root `PI_ANALYTICS_SOURCE_ROOT` override is replaced; do not silently reinterpret it for multiple profiles.

## Execution guidance

**Before expanding work:** Which existing requirement needs this addition, and what evidence justifies it? Do not turn optional improvements into tasks or completion criteria.

**At scope checkpoints:** Check whether recent work advances the agreed requirements or has drifted into repeated verification, speculative cases, or unnecessary complexity. Continue required work without starting another audit.

**Recovery when drift is found:** Stop the detour and remove unnecessary code, tests, and plan items introduced during execution without disturbing pre-existing or concurrent work. Note anything that cannot safely be removed. Restore the agreed completion criteria and resume the next required step.

## Tasks

- [x] **T1 — Recover performance provenance and freeze source/selection contracts**
  - Depends on: implementation authorization; clarify the visibility choice before T4.
  - Inputs/files: historical plans above; legacy generic core/tests; `scripts/pp`, `scripts/pp.ps1`; native installed session format and header/listing implementation; default `lib/profile.ts` and existing ledgers.
  - Do: trace relevant changes through pre-migration `pi/lib/log-analytics/` and `pi/extensions/log-analytics-tool.ts` paths, not only new profile paths. Record the few commits explaining direct staging, selected-file behavior, resource limits, and serialized staging. Check for any additional relevant completed performance changes; stop once the mechanism and evidence are clear. Verify header metadata/ID semantics and profile-root resolution, finalize the session reference and bounded listing contract, and confirm supported source/profile combinations. Record decisions in this file, not a second plan.
  - Verify: source/history comparison plus installed API documentation. Small synthetic contract probes only where behavior cannot be established from source.
  - Done when: implementation can start without guessing roots, identity, timestamp semantics, or which performance behaviors must be preserved. Historical benchmark plans are not presented as measured results.
  - Evidence: `3ab8b4eb` removed persistent projections and established direct invocation-local ingestion; `2d94583c` added native nested tool paths and timestamp fallback; `fedeb3c4` added resource limits, serialized staging, and costs. Native Pi 0.85.0 listing scans transcript bodies and is not reused. Header IDs can be reused through native `newSession` options/copies, so returned refs carry a SHA-256 canonical-file discriminator and ambiguous ID-only refs fail. Closed roots derive from the loader module's repository layout plus native `getAgentDir`, never cwd. First physical headers have a 64 KiB bound. Runtime source-root overrides fail explicitly. Native SELECT statement classification replaces the legacy unsafe prefix check; EXPLAIN is excluded because ANALYZE may execute writes. UTC is set on both setup and query connections.

- [x] **T2 — Implement profile resolution and metadata-only session selection**
  - Depends on: T1.
  - Inputs/files: native session header facilities; existing default path helpers. Proposed new `pi/profiles/default/lib/log-analytics/profiles.ts`, `sessions.ts`, and `pi/profiles/default/tests/log-analytics-sessions.test.ts`.
  - Do: implement closed profile mapping, canonical containment/alias handling, bounded header reads, profile/cwd/native-ID discovery, pagination, and exact-session resolution before staging. Reuse native facilities only if they do not scan full transcript bodies for listing. Keep missing roots, unsupported pairs, unreadable headers, and unknown references distinguishable. Do not filter event searches using filename or file mtime.
  - Verify: `pnpm test log-analytics-sessions.test.ts` from default. Temporary fixtures cover both profiles, cwd selection, pagination, unknown IDs, duplicated aliases, link escape, malformed headers, and an old session with a recent event. Demonstrate that metadata listing does not read transcript bodies.
  - Done when: a caller can select either profile or both and then a bounded exact session set without arbitrary paths or silent omissions.
  - Evidence: default-profile `log-analytics-sessions.test.ts` passed all 5 cases on Windows. Profile/cwd/ID selection, cursor scope, malformed/oversized headers, duplicate-ID disambiguation, canonical directory aliases, escape rejection, absent roots, and cancellation are covered.

- [x] **T3 — Port bounded DuckDB core and precise existing-data adapters**
  - Depends on: T1-T2.
  - Inputs/files: legacy `lib/log-analytics/{api,registry,store}.ts` and core tests; default Bedrock/Codex ledger types. Proposed new default `lib/log-analytics/{api,registry,store}.ts`, `tests/log-analytics-{store,boundary}.test.ts`; default `package.json` and `pnpm-lock.yaml`.
  - Do: add pnpm-managed `@duckdb/node-api` using the verified legacy version as baseline; port only necessary core code. Stage the resolved selected file set without rediscovering unrelated profiles. Union selected session roots into one schema with profile/header provenance; map nested native usage/tool fields accurately; add precise default ledger adapters. Preserve serialized staging, pre-staging aggregate-byte checks, deadline/resource limits, streaming row/byte limits, and cleanup. Hook abort into active setup and query work, including queued staging cancellation, without weakening isolation. Enforce one read-only SQL query through tested DuckDB facilities; do not invent a competing SQL grammar or rely solely on a prefix regex. Disable external access before caller SQL runs.
  - Verify: `pnpm test log-analytics-store.test.ts log-analytics-boundary.test.ts`. Use real DuckDB with temporary records. Cover selected-file scan counts, native nested fields, profile provenance, old resumed sessions, missing supported ledgers, large records, malformed lines, row/byte/input limits, timeout/abort, concurrent staging and failure release, SQL CTE/JSON/parameter support, multi-statement rejection, filesystem/extension/ATTACH/COPY denial, alias containment, and clean instance closure without persistent analytics artifacts.
  - Done when: the selected corpus is accurately queryable within the preserved boundary and unsupported or over-limit scopes fail explicitly rather than returning a misleading subset.
  - Evidence: default store/boundary tests pass (8 + 3 cases), using real DuckDB 1.5.5-r.4 and temporary files. Native SELECT classification, multi-statement/external-access rejection, empty views, nested fields, explicit selection costs, large/malformed/repeated records, resource/output limits, active-query interruption, and serialized staging/failure release pass. No disk spill or persistent database. Added discoveryMs without replacing legacy cost fields. An initial oversized parser buffer caused OOM; removed it and retained native 16 MiB object limit rather than increasing memory.

**Scope checkpoint:** This is still a read-only analytics port. Do not add telemetry, indexes, a shared database lifecycle, a custom SQL language, or legacy report infrastructure.

- [x] **T4 — Wire the agent tool and discovery integration**
  - Depends on: T2-T3 and resolved visibility choice.
  - Inputs/files: legacy tool; default tool-search/visibility/activation modules. Proposed new default `extensions/log-analytics-tool.ts`, `tests/log-analytics-tool.test.ts`.
  - Do: register catalog/sessions/query with operation-specific validation and clear descriptions; propagate abort and return bounded results with scope/cost information. Keep catalog and metadata-only sessions independent of DuckDB initialization, using lazy engine loading if needed. If deferred is chosen, add `log_analytics` to the existing deferred list and use normal tool-search activation, not a separate visibility system. Do not change unrelated tools.
  - Verify: `pnpm test log-analytics-tool.test.ts` plus the existing discovery/visibility test filter identified from actual imports. Verify default-only, legacy-only, combined, exact-session, unsupported-source/profile, catalog, pagination, invalid parameter, and chosen visibility behavior through the registered tool.
  - Done when: the model can discover and use the full contract through one tool and all errors retain explicit scope/coverage meaning.
  - Evidence: 3 registered-tool cases plus existing search/visibility checks pass. Deferred activation uses the existing shared list. Catalog avoids filesystem resolution, metadata listing avoids DuckDB, and runtime validation rejects wrong-operation fields and mutated invalid arguments.

- [x] **T5 — Write profile-owned guidance and an offline loader smoke check**
  - Depends on: T4.
  - Inputs/files: legacy `skills/pi-log-analytics/{SKILL.md,reference.md}`; default smoke-script conventions. Proposed new default `skills/pi-log-analytics/{SKILL.md,reference.md}` and `scripts/log-analytics-smoke.mjs`; existing `pi/README.md` and root `CHANGELOG.md`.
  - Do: rewrite skill guidance for actual sources, profile selection, metadata discovery, exact-session follow-up, SQL time/content filters, limits, sensitivity, fork overlap, Codex missing timestamps/identity, and complete-search versus output truncation. Remove absent legacy commands/workflows and the contradictory instruction forbidding SQL itself. Document dependency and visibility choices, no new telemetry, no persistence, no history migration, and explicit reload activation. Add a real installed-Pi-loader smoke check with temporary profile roots and synthetic JSONL only.
  - Verify: `node scripts/log-analytics-smoke.mjs` from default; confirm catalog, session discovery, and a cross-profile fixture query work without network, live history reads, or persistent analytics state. Review docs against implemented schema and preserve concurrent changelog/README edits.
  - Done when: fresh operators and agents can follow accurate examples and the installed loader accepts the extension offline.
  - Evidence: `node scripts/log-analytics-smoke.mjs` passed through installed Pi 0.85.0 on win32/x64. It exposed a real timezone difference hidden by Vitest's UTC environment; setting UTC on both setup and per-query connections fixes date-only event filters. Skill/reference, pi/README.md, and root CHANGELOG.md describe actual contracts and preserved producers. No live reload.

- [x] **T6 — Characterize search costs without introducing a benchmark project**
  - Depends on: T4; correctness checks passed.
  - Inputs/files: completed core and selection tests. Proposed new `pi/profiles/default/scripts/log-analytics-perf.mjs`; evidence recorded in this plan.
  - Do: use deterministic synthetic session trees split between default/legacy, near 10 MiB and 100 MiB combined, including old resumed sessions. Measure metadata listing, one-session query, default-only query, combined query, and recent-event query across both. Run each once in a fresh process and three times in one process with fresh DuckDB instances; report cold and repeated samples separately. Include a grouped-error query and bounded nested-content search with known expected results, actual files/bytes, discovery/staging/query/end-to-end timings, runtime/dependency/OS versions, and terminal failures. Keep temporary corpus/output untracked and clean up only task-owned fixtures. Do not read private history or execute the separate SQLite benchmark plan.
  - Verify: `node scripts/log-analytics-perf.mjs` from default. Assert result correctness and that exact-session selection stages only that session. Time-window-only searches must still find the recent event in the old session. Record timeouts as outcomes, not omitted samples or invitations to increase limits silently.
  - Done when: finite measurements establish the actual cost of selection versus full scans and identify whether all-history latency remains a limitation. No absolute latency pass threshold is assumed. If requirements demand faster behavior than observed, report that decision instead of implementing an index automatically.
  - Evidence: `node scripts/log-analytics-perf.mjs` ran the finite 40-sample matrix on Windows. All 20 approximately 10 MiB samples and 8 approximately 100 MiB metadata/one-session samples were correct. All 12 approximately 100 MiB broad-query samples returned explicit DuckDB OOM errors at the unchanged 1GB ceiling, not incomplete results. The command therefore exited 1 and those outcomes remain recorded below. This meets the plan's characterization criterion, not a claim that all corpora under 512 MiB fit. No index, higher bound, or disk spill was introduced.

- [x] **T7 — Final integration validation and closeout**
  - Depends on: T1-T6.
  - Inputs/files: task diff and evidence; default package scripts.
  - Do: inspect only this feature's diff for unintended writers, broad paths, legacy mutations, generated corpus/state, and unrelated edits. Record actual host/profile checks and unresolved limitations. Run the finite final validation below, fixing demonstrated port regressions only.
  - Verify: from default, `pnpm run typecheck` and `pnpm test`; from repository root, `git diff --check`. Do not repeat passing smoke/performance checks without changed relevant inputs. Run the same offline smoke on an available supported Unix/WSL host if accessible; otherwise record Unix native-binding validation as unverified, not a fabricated pass or authorization to provision a host.
  - Done when: contracts and evidence are reconciled, chosen visibility is documented, checks pass or unrelated blockers are explicitly separated, legacy producers/history are unchanged, and completion reflects actual platform coverage.
  - Evidence: default `pnpm run typecheck` passes. Full `pnpm test`: 40 files passed, 1 skipped, 1 failed; 252 tests passed, 6 skipped, 1 timed out in the existing `web-tools-curl.test.ts` extractor subprocess case. That untouched file then passed all 3 tests in isolation (2.76 seconds); no web code or timeout was changed and a clean full-suite pass is not claimed. All analytics and visibility tests passed in the full run. Final installed-Pi offline smoke passed after the lazy-import change. Git diff check passes; no changes under legacy/modules, no runtime writers or generated corpus in the feature. WSL reported only the running docker-desktop distribution, not an available Unix Pi development runtime, so Unix native-loader validation remains unverified. No host was provisioned.

## Agreed validation and finish

- The user authorized execution of this validation set. Task-local checks, one real-loader smoke, the finite synthetic measurement set, and final default typecheck/tests/diff check form the complete scope.
- Use real pure functions, temporary files, and real DuckDB for storage/boundary checks. Mock only host/runtime boundaries that would touch live profiles or network. No real session exports, model calls, or telemetry additions.
- Rerun checks only for relevant changes or stale evidence. Do not create a broad security audit, benchmark framework, or persistent index as a completion condition.
- Loading native bindings on Windows is not evidence of Linux compatibility. Synthetic performance is not a guarantee about current private all-history searches; report dataset sizes and limits.
- Runtime activation requires the operator to reload or launch a fresh default session after installation. Offline checks do not activate this feature.

## Performance evidence

Host: Windows 10.0.26200 x64, Intel Core i7-1355U, about 34.0 GB RAM with 5.4 GB free at measurement start; Node v25.9.0, @duckdb/node-api 1.5.5-r.4. Source base at closeout: `e84cadc7` plus this task's uncommitted changes. Twenty synthetic files per corpus, ten per profile, 4 KiB padded native tool-result payloads. Errors occur modulo 7, content matches modulo 97, and each old session contains one recent event. Expected counts/content IDs are generated independently of SQL. Native file caches were not flushed; cold means a fresh worker process, not cold disk caches. Every query rebuilds DuckDB.

The 10 MiB target contained 10,335,590 bytes and 120 messages/file. The 100 MiB target contained 103,815,200 bytes and 1,205 messages/file. Header discovery always covered twenty files and staged none. Exact-session requests staged one file (516,840 / 5,191,363 bytes); default-only requests selected ten files (5,168,400 / 51,913,630 bytes); combined and recent requests selected all twenty. Both-profile recent-event results included all twenty resumed sessions when the query could stage within the memory bound.

Milliseconds, rounded. Repeated columns retain all three samples, including first-use lazy imports. Cold end-to-end includes API/native imports inside the worker; cold process wall time additionally includes process startup/exit.

| Target | Workload | Cold end-to-end / process wall | Repeated end-to-end samples | Outcome |
| --- | --- | --- | --- | --- |
| 10 MiB | Metadata | 283 / 413 | 112, 38, 32 | All correct |
| 10 MiB | One-session content | 567 / 692 | 221, 83, 85 | All correct |
| 10 MiB | Default errors | 598 / 746 | 122, 116, 115 | All correct |
| 10 MiB | Combined errors | 497 / 639 | 176, 188, 210 | All correct |
| 10 MiB | Recent events | 421 / 554 | 191, 175, 190 | All correct |
| 100 MiB | Metadata | 111 / 232 | 119, 32, 36 | All correct |
| 100 MiB | One-session content | 448 / 570 | 377, 245, 250 | All correct |
| 100 MiB | Default errors | 422 / 537 | 191, 201, 201 | All four OOM at 1GB |
| 100 MiB | Combined errors | 434 / 553 | 222, 202, 213 | All four OOM at 1GB |
| 100 MiB | Recent events | 439 / 563 | 191, 220, 238 | All four OOM at 1GB |

Phase ranges from successful repeated samples:

| Target/workload | Discovery ms | Staging ms | Query ms |
| --- | --- | --- | --- |
| 10 MiB metadata | 31.4-49.5 | No staging | No SQL |
| 10 MiB one-session | 32.9-39.3 | 33.4-39.7 | 5.5-7.8 |
| 10 MiB default errors | 15.1-22.1 | 83.7-87.8 | 2.2-2.6 |
| 10 MiB combined errors | 39.4-55.8 | 121.8-138.7 | 2.7-3.4 |
| 10 MiB recent events | 36.8-45.2 | 122.4-133.1 | 2.9-3.7 |
| 100 MiB metadata | 31.4-50.5 | No staging | No SQL |
| 100 MiB one-session | 33.2-34.0 | 155.5-160.8 | 41.6-45.9 |

Broad-query OOM cases have no successful cost result; their elapsed times are failures, not fast-query measurements. The 512 MiB input limit is not a guarantee of fitting in 1GB memory. The documented supported response is to narrow exact sessions/profiles, not silently trim coverage. Private all-history speed remains unverified; no persistent-index decision was made.

Earlier failed measurement attempt: standalone Jiti eagerly traversed the optional `pi-server` export, so all 40 cases failed before analytics. A lazy native-profile import removed that dependency from injected-root analytics; a small metadata/query probe passed before the recorded rerun. Those earlier failures are retained here as harness errors and excluded from latency conclusions. Temporary corpora were removed in both runs.

## Current handoff

- Status: completed within the authorized port scope, with explicit validation limitations above.
- Completed work: T1-T7, including tests, native-loader verification, docs, finite measurements, and closeout.
- Next: operator may reload or start a fresh default Pi session; activate through `tool_search`. No live activation, commit, or push was performed.
- Open decisions: none required for this port. No absolute latency target, higher resource limit, or persistent index was approved.
- Verification limits: broad approximately 100 MiB synthetic queries hit the unchanged memory ceiling; Unix native bindings are unverified; the full suite had one existing curl-test timeout that passed in isolation. No private history was read or exported.

## Completion and archive

When implementation and the agreed checks finish, set `status: completed` and the actual `completed: YYYY-MM-DD`, summarize evidence and actual profile/platform runs, and move the whole directory to `.specs/archive/default-log-analytics-port/`. Confirm the archive destination is absent, repair inbound links, and leave no active duplicate. Leave incomplete work active. Archiving does not authorize commits, pushes, deployment, or deleting unrelated work.
