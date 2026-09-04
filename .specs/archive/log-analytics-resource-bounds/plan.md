---
created: 2026-08-10
status: complete
completed: 2026-09-04
---

# Bound log_analytics DuckDB staging by time, memory, threads, input, and concurrency

## Objective

A `log_analytics` query fails explicitly instead of materializing an unbounded corpus, is interrupted when its wall-clock budget elapses, runs DuckDB with configured memory and thread ceilings, never stages sources concurrently with another session in the same process, reports what it scanned and how long each phase took, and remains available to read subagents.

## Completion Evidence

- Evidence: `cd pi && pnpm test log-analytics-store.test.ts` passes with cases proving (a) the DuckDB instance reports the configured `threads` and `memory_limit`, (b) `interrupt()` rejects both an in-flight staging `run` and an in-flight `stream`, (c) staging rejects a selected file set whose summed bytes exceed `maxInputBytes` before any DuckDB statement runs, (d) an elapsed deadline rejects the session and `withAnalyticsSession` still completes cleanup, (e) two concurrent `withAnalyticsSession` calls stage strictly one after the other and a failed first staging still releases the second, and (f) `AnalyticsQueryResult.cost` reports `filesScanned`, `bytesScanned`, `stagingMs`, `queryMs`; the tool result `details` carries `cost`; the skill, skill reference, README, and observability contract state the enforced bounds. `cd pi && pnpm test subagent-t1.test.ts` proves the closed read-subagent authority includes `log_analytics` while retaining non-mutating authority.
- Fails when: any listed case is absent or failing; a session over the input bound still creates staging tables; a session past its deadline runs to completion; `details.cost` is missing from the tool result; documentation still claims a five-second limit without enforcing code; or a read subagent cannot call `log_analytics`.

## Boundaries

- In scope: `pi/lib/log-analytics/store.ts`, `pi/lib/log-analytics/api.ts`, `pi/extensions/log-analytics-tool.ts`, `pi/tests/log-analytics-store.test.ts`, `pi/skills/pi-log-analytics/SKILL.md` (line 20 claims an unenforced 5-second limit), `pi/skills/pi-log-analytics/reference.md`, `pi/README.md` (the `log_analytics` paragraph), `pi/skills/pi-extension/references/contracts/observability.md` (Analytics authority bullet), root `CHANGELOG.md`, plus `pi/extensions/subagent/contracts.ts`, `pi/tests/subagent-t1.test.ts`, and `pi/skills/pi-extension/references/contracts/subagents-and-tasks.md` for read-subagent authority.
- Out of scope: typed report readers (`session-analytics.ts`, `orchestration-analytics.ts`, `readers.ts`, `/skill-stats`, `/extension-stats`, `/orchestration-stats`) keep their current unbounded-input behavior; ripgrep `search` or streaming `recent` operations; SQLite, FTS, vector, or Postgres projections; retention or purge; changes to `registry.ts` source definitions.
- Preserve: JSONL remains the only authority; DuckDB stays invocation-local in-memory with no persistent projection; the `query` SQL contract, `catalog` output, `_source_file`/`_record_key`/`_timestamp`/`record` columns, row and byte output bounds, `AbortSignal` cancellation, and `enable_external_access = false` after staging; existing callers of `withAnalyticsSession` compile and pass unchanged (`cost` is additive on the returned object; no repository caller constructs an `AnalyticsQueryResult` literal).
- Assumptions: `DuckDBInstance.create(path, options: Record<string, string>)` accepts DuckDB configuration options (installed schema `pi/node_modules/@duckdb/node-api/lib/DuckDBInstance.d.ts:6`; installed `README.md:78-81` demonstrates `threads: '4'` and links the DuckDB configuration reference, which documents `memory_limit` and `threads`). `DuckDBConnection.interrupt()` exists (`DuckDBConnection.d.ts:25`) but its effect on in-flight `run` and `stream` is not documented in the installed package; T1 proves it before T2 relies on it. Unrelated dirty files in `pi/extensions/*` and untracked `pi/lib/extension-diagnostics.ts` are not part of this plan and must remain untouched by `/do-it`.

## Tasks

- [x] **T1: Probe the three DuckDB contracts T2 depends on**
  - Files: `pi/tests/log-analytics-store.test.ts`
  - Change: Add a `describe("duckdb contracts")` block with three independent `it` cases: (1) `DuckDBInstance.create(":memory:", { threads: "2", memory_limit: "1GB" })` then `SELECT current_setting('threads'), current_setting('memory_limit')` returns `2` and a value whose parsed byte magnitude is 1 GiB (DuckDB may render `1.0 GiB`); (2) `connection.run` of `SELECT count(*) FROM range(1e8) a CROSS JOIN range(1e3) b` with `interrupt()` called from `setTimeout(…, 50)` rejects, then the connection closes; (3) the same with `connection.stream` plus one `yieldRowObjectJson()` pull. No store code changes.
  - Done when: All three cases pass independently. If (2) or (3) does not reject within the Vitest default timeout, the task ends `blocked` with the observed behavior recorded in `## Execution Status`; T2 must then use `closeSync()` on the active connection as the cancellation mechanism instead of `interrupt()`.
  - Verify: deterministic `cd pi && pnpm test log-analytics-store.test.ts`

- [x] **T2: Enforce input, deadline, resource, and staging-concurrency bounds in the store**
  - Files: `pi/lib/log-analytics/store.ts`, `pi/tests/log-analytics-store.test.ts`
  - Change: Four subclaims, each with its own test. (i) Input: `AnalyticsSessionOptions.maxInputBytes?: number`; after discovery and `selectedFiles` filtering, `stat` only the final deduplicated file list, sum sizes, and throw `analytics input <n> bytes exceeds bound <m>` before `DuckDBInstance.create`; undefined means unbounded. (ii) Resources and deadline: options `timeoutMs`, `threads`, `memoryLimit` resolved from `PI_ANALYTICS_TIMEOUT_MS` (default `5000`), `PI_ANALYTICS_THREADS` (default `2`), `PI_ANALYTICS_MEMORY_LIMIT` (default `1GB`), invalid values throw; pass `threads`/`memory_limit` to `DuckDBInstance.create`; one deadline timer started in `openSession` cancels the active connection via the T1-proven mechanism and sets an expired flag so later `query` calls reject with `analytics session exceeded <timeoutMs> ms`; cleared in `withAnalyticsSession`'s `finally`. (iii) Concurrency: a module-level rejection-safe FIFO promise chain wraps only the `createView` loop (not discovery or stat); released in `finally`. A single module-private test seam `setStagingObserver(fn | undefined)` is exported for tests to await inside the locked region. (iv) Cost: `AnalyticsQueryResult.cost = { filesScanned, bytesScanned, stagingMs, queryMs }` from the staged file list and phase timers.
  - Done when: Tests prove (i) a `maxInputBytes` smaller than the fixture rejects with the bound message; (ii) `timeoutMs: 200` against the T1 long statement rejects with the deadline message and `withAnalyticsSession` resolves its `finally` (in-process timing test; acceptable as deterministic because the statement is orders of magnitude longer than the budget); (iii) with the observer holding the first session's staging open, the second session's observer fires only after the first releases, and a first staging that throws still lets the second complete; (iv) `cost.filesScanned === 1` and `bytesScanned` equals the fixture file size. Existing store tests still pass.
  - Verify: deterministic `cd pi && pnpm test log-analytics-store.test.ts`
  - Depends on: T1

- [x] **T3: Surface the tool input bound and cost, and correct owning documentation**
  - Files: `pi/lib/log-analytics/api.ts`, `pi/extensions/log-analytics-tool.ts`, `pi/skills/pi-log-analytics/SKILL.md`, `pi/skills/pi-log-analytics/reference.md`, `pi/README.md`, `pi/skills/pi-extension/references/contracts/observability.md`, `CHANGELOG.md`
  - Change: Two subclaims. (i) Wiring: `queryAnalytics` passes `maxInputBytes` resolved once in `api.ts` from `PI_ANALYTICS_MAX_INPUT_BYTES` with default 512 MiB (the store does not read this variable); the tool's existing `details: result` therefore exposes `cost` with no additional formatting. (ii) Documentation: in the four docs replace the "5 seconds per operation" claim with the enforced session deadline, and add the input-byte bound, thread/memory ceilings, environment overrides, the `exceeds bound` failure, and the `cost` shape; keep the statement that DuckDB is invocation-local with no persistent projection. One CHANGELOG entry records the bounds, defaults, overrides, and that typed reports remain unbounded.
  - Done when: `pnpm run typecheck` passes with the changed `AnalyticsQueryResult`; `rg -n "5 seconds" pi/skills/pi-log-analytics pi/README.md pi/skills/pi-extension/references/contracts/observability.md` returns no lines.
  - Verify: deterministic `cd pi && pnpm run typecheck && ! rg -q "5 seconds" pi/skills/pi-log-analytics pi/README.md pi/skills/pi-extension/references/contracts/observability.md`
  - Depends on: T2

- [x] **T4: Admit log_analytics to read-subagent authority**
  - Files: `pi/extensions/subagent/contracts.ts`, `pi/tests/subagent-t1.test.ts`, `pi/skills/pi-extension/references/contracts/subagents-and-tasks.md`, `CHANGELOG.md`
  - Change: Add `log_analytics` to the single closed `READ_TOOL_ALLOWLIST`, assert the read execution policy returns it while remaining non-mutating, document that read subagents may use the bounded generic analytics tool without gaining raw shell, mutation, delegation, or workflow authority, and record that availability in the existing changelog entry.
  - Done when: The focused authority test proves `log_analytics` is present and `canDirectlyMutate` remains false; existing closed-positive-list behavior is unchanged for unrecognized tools.
  - Verify: deterministic `cd pi && pnpm test subagent-t1.test.ts`
  - Depends on: T3

## Execution Strategy

T1 is a contract probe and must finish before T2; if it blocks, T2's cancellation mechanism changes and the plan is re-read before continuing. T2 changes the shared `AnalyticsQueryResult` type and is root-owned. T3 is thin wiring plus documentation and may run as one bounded leaf after T2.

## Validation

- [x] `cd pi && pnpm test log-analytics-store.test.ts` passes including the three contract probes and the four T2 cases.
- [x] `cd pi && pnpm test log-analytics-boundary.test.ts && pnpm test log-analytics-parity.test.ts` pass unchanged once at the end, proving typed report readers still work without an input bound.
- [x] `cd pi && pnpm run typecheck` passes.
- [x] `cd pi && pnpm test subagent-t1.test.ts && pnpm run typecheck` passes with read-subagent analytics authority.

## Retention

Keep incomplete work at `.specs/log-analytics-resource-bounds/plan.md`. After completion, `/do-it` archives this directory to `.specs/archive/log-analytics-resource-bounds/`.

## Execution Status

- State: complete
- Blocker: Primary worktree must be clean before merge closeout.
- Result: T1 through T4 and all validation passed. Read-subagent authority now includes `log_analytics` while remaining non-mutating and excluding unrecognized tools.
- Next: Archive, commit, and merge with `plan_archive` after the primary worktree is clean.
- Resume: `/do-it .specs/log-analytics-resource-bounds/plan.md`
