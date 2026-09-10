# Query-driven log analytics implementation evidence

## T1 ingestion and bounded-workload probe

Date: 2026-09-10

Execution identity:

- Worktree: `C:/Users/mglenn/.dotfiles-worktrees/query-driven-log-analytics`
- Branch: `feat/query-driven-log-analytics`
- Integration target: originating `C:/Users/mglenn/.dotfiles`, branch `main`
- Starting task HEAD: `406b1ba8`
- Runtime: Node v25.9.0, `@duckdb/node-api` 1.5.5-r.4, Windows x64
- Input: generated JSONL only. No private transcripts were read.

Command:

```sh
cd pi/profiles/default
node scripts/log-analytics-ingestion-probe.mjs
```

The probe generated 240 header-only sessions plus two 17.6 MiB JSONL files. The data files held 8,192 complete native-shaped message records, each with a 4,096-byte text payload, for 35,225,960 input bytes. Expected counts came from the generator: 8,192 records, 586 errors among the `read` groups, and 4,096 cross-profile join rows.

### Measurements

Header discovery still opened and parsed every header on every call:

| pass | files | bounded header bytes (upper bound) | elapsed | CPU |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 240 | 122,880 | 475.97 ms | 250 ms |
| 2 | 240 | 122,880 | 307.35 ms | 204 ms |
| 3 | 240 | 122,880 | 291.68 ms | 187 ms |

Disk-backed staging used two threads and the existing 1 GB DuckDB memory ceiling:

| mechanism | elapsed | CPU | observed RSS delta | owned disk high-water |
| --- | ---: | ---: | ---: | ---: |
| sequential native one-file JSON ingestion | 691.56 ms | 594 ms | 17,584,128 B | 71,577,600 B |
| bounded line reader plus DuckDB appender | 659.72 ms | 625 ms | 43,114,496 B | 36,188,160 B |

Overall probe elapsed time was 2,740.61 ms, CPU was 2,249 ms, and sampled process peak RSS was 469,069,824 bytes. RSS is a process measurement, not DuckDB's configured ceiling. Both mechanisms preserved full JSON records, produced the independent grouped counts and cross-file join count, and denied a new `read_json_objects` call after `enable_external_access` was disabled. Each invocation-owned database and spill directory was removed after native handles closed; the entire probe scratch directory was then removed and its absence asserted.

### Decisions for T2

Repeated discovery is material even with warm filesystem cache and repeats the same 240 opens/reads. Implement the approved disposable metadata cache. Cache only validated file identity/change markers, native header metadata, and event-time range completeness learned while requested records are read. It must contain no transcript text. Whole-file invalidation is sufficient for replacement, truncation, or marker change. Cache failure must fall back to authoritative discovery.

Use these initial search bounds, exposed as coverage rather than hidden behavior:

- 8 MiB examined bytes per page (soft boundary at a record boundary).
- 10,000 examined records per page.
- 100 returned matches per page and the existing 256 KiB encoded-result ceiling.
- 16 MiB maximum physical record, matching the currently documented DuckDB object bound. A single record may cross the 8 MiB page budget so it can be returned or explicitly counted as oversized rather than causing a no-progress cursor.
- 5-second ordinary search deadline. Stop at the first reached result, byte, record, or time bound.
- Read in 64 KiB stream buffers and close the file between pages. These are implementation constants, not caller-supplied filesystem controls.

Expected T2 request interface:

```ts
type SearchRequest = {
  operation: "search";
  profiles?: ProfileId[];
  sessionRefs?: SessionRef[];
  cwd?: string;
  interval?: { since: string; until: string }; // fixed [since, until)
  filters?: {
    entryTypes?: string[];
    messageRoles?: string[];
    toolNames?: string[];
    isError?: boolean;
    text?: string; // literal message text/string and text blocks only
  };
  maxResults?: number; // <= 100
  cursor?: string;
};

type FollowUpRequest = {
  operation: "follow_up";
  occurrence: OccurrenceRef;
  before?: number;
  after?: number;
};

type OccurrenceRef = {
  profile: ProfileId;
  session: SessionRef;
  fileKey: string;
  byteOffset: number;
  byteLength: number;
  recordOrdinal: number;
  recordKey: string | null;
};
```

Expected response has `matches` with bounded snippets and `OccurrenceRef`, `nextCursor`, `complete`, `stopReason`, and coverage split into per-page and cumulative values. Coverage fields are `selectedFiles`, `selectedBytes`, `examinedFiles`, `examinedRecords`, `examinedBytes`, `safelyPrunedFiles`, `remainingFiles`, captured byte horizons, malformed/oversized counts with bounded diagnostics, exclusions, and inventory-change observations. The cursor binds normalized scope/filters, stable selected-file inventory, identity markers, byte horizons, current file index, next record-boundary offset, and cumulative coverage. It is process-local, bounded, expiring, and released on completion. Append beyond a captured horizon is outside that scan; replacement/truncation invalidates continuation explicitly.

### Decisions for T3

Select the bounded reader plus DuckDB appender as the robust large-query ingestion mechanism. It was slightly faster in this finite sample, used about half the owned disk, avoids asking DuckDB's JSON reader to own a whole multi-file input set, and can share T2's record-boundary reader. The one-file native path remains evidence that sequential native ingestion works, but it transiently stores both raw and prepared copies and had the larger disk high-water.

Large mode interface:

```ts
type AnalyticsExecution = "standard" | "large";
// Add `execution?: AnalyticsExecution` to query requests; omitted means standard.

type LargeQueryCost = AnalyticsQueryCost & {
  execution: "large";
  recordsStaged: number;
  malformedRecords: number;
  peakOwnedDiskBytes: number;
  memoryLimit: string;
  threads: number;
  deadlineMs: number;
  diskBudgetBytes: number;
};
```

Large-mode defaults selected for implementation and fixture acceptance:

- 120-second end-to-end deadline.
- 4 GiB invocation-owned database plus spill budget. The 35.2 MiB probe used 36.2 MiB after raw staging was dropped; 4 GiB leaves bounded working room for the required 600+ MiB fixture, indexes/operators, and spill without claiming a universal expansion ratio.
- Existing 1 GB DuckDB memory ceiling and two threads.
- 8 MiB or 1,000-record appender flush batches, whichever occurs first; no batch may retain more than one allowed 16 MiB record plus fixed bookkeeping.
- Runtime-owned temporary paths only. Create one disk-backed database and a sibling spill directory, disable external access after staging, retain global SQL semantics, then close handles and remove only the owned invocation directory on success, failure, or cancellation.
- Standard mode retains its current 5-second, 512 MiB selected-input, in-memory/no-spill contract. Large mode is explicit and does not silently retry or raise configured limits.

T3 must report phase costs and exact cleanup remnants on cleanup failure. Disk budget exhaustion is an explicit resource failure, never a partial aggregate. The successful grouped query and cross-file join in this probe establish that caller SQL can execute globally after staged input access is disabled.

## T2 streaming search, continuation and follow-up

Date: 2026-09-10

Implementation and focused verification:

- `pi/profiles/default/lib/log-analytics/search.ts` reads native session JSONL incrementally with a 64 KiB buffer, 8 MiB/10,000-record page bounds, 100-result bound, 16 MiB record bound, and a fixed captured byte horizon.
- Cursors retain only bounded process-local inventory and record-boundary state. They expire, are released on completion, and report append, replacement, and truncation observations without claiming coverage beyond a captured horizon.
- Occurrences retain profile/session/file identity, byte offset and length, ordinal, and nullable native ID. Follow-up revalidates the selected profile file and retrieves bounded adjacent context without DuckDB.
- `normalizeRecord` in `sessions.ts` is shared by search and exposes outer/native-nested timestamps, role, tool, error, literal message text blocks, and nullable record IDs. Text search does not inspect serialized arguments or image blocks.
- `metadata-cache.ts` stores only validated file markers, native session header metadata, and observed event ranges in one atomic disposable cache under the default profile's `.analytics-state/`; cache corruption or write failure falls back to authoritative files. No transcript text is written.

Focused tests:

```text
cd pi/profiles/default
pnpm test log-analytics-search.test.ts log-analytics-sessions.test.ts
# 2 files, 13 tests passed
pnpm exec tsc --noEmit
# passed
git diff --check
# passed
```

The temporary fixture matrix covered nested and outer timestamps, old sessions resumed recently, repeated ID-less records, user/tool-output text distinctions, error filtering, matches without profanity, zero-match paging beyond the page budget, exact follow-up, malformed and oversized lines, cancellation, corrupt metadata fallback, append horizons, and replacement/truncation continuation. No private transcript data was used.

## T3 bounded large SQL execution

Date: 2026-09-10

Large SQL is now an explicit execution mode. Standard mode remains the in-memory, no-spill path with its 5-second deadline and 512 MiB selected-input bound. Large mode reads JSONL with a 64 KiB bounded reader, rejects/discloses malformed or over-16-MiB records, and flushes a DuckDB appender every 1,000 records or 8 MiB. It stages complete JSON plus source/session metadata into an invocation-owned disk database, exposes the same registered typed views as a lazy projection over that raw disk table, checkpoints, and disables external access before caller SQL. T5 demonstrated that materializing a second full JSON table could exceed the 1 GB ceiling on a 600+ MiB generated corpus; retaining the raw disk table avoids that transient full-copy allocation while preserving complete `record` JSON and typed columns.

Large defaults match the T1 decision: 120-second end-to-end deadline, 4 GiB combined owned database/spill budget, two threads, and the existing 1 GB DuckDB memory limit. Costs report execution mode, selected files/bytes, records staged, malformed records, phase times, configured limits, and observed owned-disk high-water. Disk monitoring covers staging and caller SQL; native memory/temp-space failures are labeled resource-limit failures. Every path closes appenders, connections, and the instance before removing exactly its generated invocation directory. A cleanup failure names that exact owned remnant.

Focused verification used generated temporary records and real DuckDB:

```text
cd pi/profiles/default
pnpm test log-analytics-store.test.ts log-analytics-boundary.test.ts
# 2 files, 17 tests passed
pnpm exec tsc --noEmit
# passed
cd ../../..
git diff --check
# passed
```

The matrix covers full JSON parity, malformed-record accounting, a cross-profile global join with an aggregate window, large execution despite a deliberately lower standard input bound, incremental result truncation, external read denial after staging, standard and large cancellation, low-memory forced spill with observed disk high-water growth, explicit owned-disk exhaustion, invalid resource environment configuration, and owned-path absence after success, error, and cancellation. No private transcript data was used.

## T5 finite generated-native acceptance

Date: 2026-09-10

Commands:

```text
cd pi/profiles/default
node scripts/log-analytics-smoke.mjs
# passed: generated native-record catalog/search/follow-up/large SQL through Pi 0.85.0 loader; 11,337,048 bytes across both profiles
node scripts/log-analytics-perf.mjs
# passed: 16/16 correct samples, 8 workloads x cold/warm, no failures
pnpm test log-analytics-
# 6 files, 41 tests passed
pnpm run typecheck
# passed
git diff --check
# passed
```

The fixture generator wrote both registered profiles and computed expected values independently of analytics: a small 11,337,048-byte corpus with 9,616 records and a large 636,428,208-byte corpus with 6,416 records. Each has 16 failure-flagged tool results, 16 non-profanity feedback markers, 16 missing-timestamp gaps, and cross-profile join expectations of 2,889,608 and 1,286,408 rows. The large corpus has files larger than the 8 MiB search page and is above the 512 MiB standard SQL input bound. No private history, model calls, or persistent transcript copy was used.

Each size ran exactly one cold and one warm sample of targeted search, last-week failures, three-month traversal, and large SQL across both profiles. Targeted search stopped after four records in one selected file (7,145 physical bytes small; 106,744 large), returned incomplete coverage, and used no DuckDB. Failure search returned all 16 error-flagged `toolResult` records, rejected successful false positives by assertion, followed an exact occurrence with adjacent context, and completed in 2 pages small/76 pages large. Three-month traversal returned all 16 expected markers, reported 16 gaps, and exhausted 9,600/6,400 records with 11,335,176/636,426,336 physical bytes read. Large SQL matched all generator counts and joins, staged 9,616/6,416 records, and retained the 1 GB/two-thread ceiling.

Reported per-sample metrics included end-to-end time, CPU, process peak RSS, selected/read files and bytes, records/pages, metadata-cache hits, safe pruning, and cleanup. Large cold/warm samples measured: targeted 56/39 ms and 16/48 ms CPU with 82.6/82.1 MiB RSS; failures 5,051/4,682 ms and 5,203/4,438 ms CPU with 143.4/116.7 MiB RSS; traversal 5,347/4,676 ms and 5,970/4,890 ms CPU with 149.3/141.7 MiB RSS; SQL 18,040/15,653 ms and 16,344/15,937 ms CPU with 314.7/326.9 MiB RSS. SQL temporary-disk high-water was 14,055,296 bytes small and 851,535,500 bytes large; search used no temporary SQL path. Cold metadata-cache hits were 0 and warm hits 16 for every workload; safely-pruned files were 0. All invocation-owned SQL paths and the fixture scratch tree were absent after cleanup.
