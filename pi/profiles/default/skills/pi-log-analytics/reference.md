# Default log analytics reference

## Operations

`log_analytics` is registered by the default profile and activated through `tool_search`. Choose `catalog` for schemas, `sessions` for metadata-only listing, `search` for bounded DuckDB-free native record lookup, `follow_up` for exact bounded context, and `query` for one native SELECT. `catalog` needs no profile filesystem access or DuckDB initialization:

```json
{"operation":"catalog"}
```

Metadata-only discovery:

```json
{"operation":"sessions","profiles":["default","legacy"],"maxRows":50}
```

Optional discovery fields: `cwd` (exact stored header string), `sessionIds` (native IDs), `maxRows` (1-1000, default 100), and `cursor` (the preceding `nextCursor`, with identical filters). Results contain `profiles`, `sessions`, `truncated`, `nextCursor`, and coverage notes. Each session has `ref: { profile, sessionId, fileKey }`, nullable `cwd` and `created`, file `modified` time, and `bytes`. Modified time is filesystem metadata, not the last event timestamp. Listing is best-effort under concurrent changes, not a snapshot.

Discovery validates the first physical JSONL line as a native session header. Each header read is limited to 64 KiB, with at most 511 bytes of read-ahead. Non-session, empty, malformed, or oversized headers are excluded. Listing and session-query results include `coverage.discovery`: `excludedFiles`, up to 20 `diagnostics` (profile, profile-relative file label capped at 512 characters, opaque fileKey, and reason), and `diagnosticsTruncated`. Counts cover the selected profiles before listing filters or exact session selection, not just the returned page. Explicit references to excluded sessions still fail as unresolved. Discovery never falls back to a transcript scan or native session loading that may repair files. Directory listing and header reads still cover the selected profile's session tree before pagination. Empty supported session trees are valid; missing profile roots and unreadable inputs are errors.

Exact session SQL follow-up:

```json
{
  "operation":"query",
  "profiles":["legacy"],
  "sources":["session_entries"],
  "sessionRefs":[{"profile":"legacy","sessionId":"<native-id>","fileKey":"<file-key>"}],
  "sql":"SELECT _profile, session_id, _record_key, tool_name, is_error FROM session_entries WHERE message_role = 'toolResult' AND is_error LIMIT 20",
  "maxRows":20
}
```

Use the complete returned `ref`, including `fileKey`, when available. An ID that matches multiple files fails as ambiguous unless its discriminator is supplied. Unknown references and references outside selected profiles fail. `sessionRefs` narrows only `session_entries` and requires that source.

Streaming search and exact context:

```json
{"operation":"search","profiles":["default","legacy"],"interval":{"since":"2026-09-01T00:00:00Z","until":"2026-09-08T00:00:00Z"},"filters":{"messageRoles":["toolResult"],"isError":true},"maxResults":100}
```

Continue with the same filters and returned `nextCursor` until `complete:true`. For a returned match, pass its complete `occurrence` to:

```json
{"operation":"follow_up","occurrence":{"profile":"default","session":{"profile":"default","sessionId":"<native-id>","fileKey":"<file-key>"},"fileKey":"<file-key>","byteOffset":123,"byteLength":456,"recordOrdinal":7,"recordKey":"<id-or-null>"},"before":2,"after":2}
```

Search interval is fixed `[since,until)`, based on normalized outer/native-nested record timestamps. Search text is literal and examines message strings/text blocks only. `follow_up` revalidates the file and identity, streams to the exact occurrence without DuckDB or whole-file staging, and returns only bounded adjacent context; expansion does not fetch again.

Both-profile recent-event query:

```json
{
  "operation":"query",
  "profiles":["default","legacy"],
  "sources":["session_entries"],
  "sql":"SELECT _profile, session_id, count(*) AS errors FROM session_entries WHERE message_role = 'toolResult' AND is_error AND _timestamp >= $since::TIMESTAMPTZ GROUP BY _profile, session_id ORDER BY errors DESC LIMIT 20",
  "parameters":{"since":"2026-09-01T00:00:00Z"},
  "maxRows":20
}
```

Bounded content lookup within explicitly selected sessions:

```sql
SELECT _profile, session_id, _source_file, _record_key, _timestamp
FROM session_entries
WHERE contains(CAST(record AS VARCHAR), $needle)
ORDER BY _timestamp
LIMIT 20
```

Named parameters accept strings, numbers, booleans, and null. One native DuckDB SELECT statement is accepted, including CTEs and JSON expressions. SQL syntax is handled by DuckDB, not a separate Pi grammar. Non-query statements, multiple statements, and EXPLAIN are rejected. External access and automatic extension installation/loading are disabled before caller SQL. Parameter limits do not authorize filesystem SQL or arbitrary profile paths.

## Sources and identity

| Source | Profiles | Owned files and meaning |
| --- | --- | --- |
| `session_entries` | default, legacy | `sessions/**/*.jsonl`, including full native headers, entries, branch history, and custom entries |
| `bedrock_usage` | default | `bedrock-usage.jsonl`, existing request usage/pricing observations |
| `codex_cache_observations` | default | `codex-cache.jsonl`, existing model/input/cacheRead observations |

A selected profile/source combination that is unsupported fails, rather than silently dropping that profile. Missing ledger files for supported combinations produce typed empty views. Source discovery does not scan generic root JSONL, credentials, metrics, or unrelated logs. Profile roots derive from the repository-owned extension layout and native active agent directory; canonical aliases are deduplicated and link escapes rejected. The legacy `PI_ANALYTICS_SOURCE_ROOT` override is not supported by default analytics and fails explicitly; no model-supplied root override replaces it.

Every view exposes `_profile`, `_source_file`, `_record_key`, `_timestamp`, `session_id`, and complete original `record` JSON. `_timestamp` is nullable TIMESTAMPTZ, normalized from ISO outer timestamps or native epoch-millisecond timestamps. Setup and query connections use UTC, including date-only SQL casts. Session identity comes from the file header, not a message entry ID. Convenience fields map native nested `message.provider`, `message.model`, `message.usage`, tool-result IDs/names, and error status; the catalog lists exact columns.

`_record_key` uses a stored ID or raw-JSON hash. Use profile/file provenance with it. Identical ID-less observations share a hash and remain separate rows; hashes are not exact occurrence coordinates. Stored records are counted, not deduplicated events. Forks can contain shared history, and a single session file can contain multiple tree branches. Analytics does not restrict reads to the active branch or current compacted model context.

### `/plans` action history

Default-profile `/plans` events are native `custom` entries with `customType = 'plan-action-event'`. The payload is under `record.data` and includes a schema version, event ID, invocation and attempt IDs, action, phase, outcome, timestamp, profile/session/cwd, selected plan coordinates, exact Herdr identities when available, elapsed time for completed attempts, and bounded error details. They are display-only and excluded from model context. Use the existing source, with no additional analytics registration.

Outcome counts across selected persisted sessions:

```sql
WITH plan_events AS (
  SELECT json_extract_string(record, '$.data.action') AS plan_action,
         json_extract_string(record, '$.data.outcome') AS plan_outcome
  FROM session_entries
  WHERE entry_type = 'custom'
    AND json_extract_string(record, '$.customType') = 'plan-action-event'
    AND json_extract_string(record, '$.data.phase') = 'outcome'
)
SELECT plan_action, plan_outcome, count(*) AS records
FROM plan_events
GROUP BY plan_action, plan_outcome
ORDER BY plan_action, plan_outcome;
```

Chronological invocation trace for a session selected through `sessions` discovery and passed as `sessionRefs`:

```sql
SELECT _timestamp,
       json_extract_string(record, '$.data.invocationId') AS invocation_id,
       json_extract_string(record, '$.data.action') AS action_name,
       json_extract_string(record, '$.data.phase') AS phase,
       json_extract_string(record, '$.data.outcome') AS outcome_name,
       json_extract_string(record, '$.data.plan.stub') AS stub
FROM session_entries
WHERE entry_type = 'custom'
  AND json_extract_string(record, '$.customType') = 'plan-action-event'
ORDER BY _timestamp
LIMIT 200;
```

Only persisted native session files are searchable. Pi may keep a fresh picker-only session ephemeral until an assistant message is saved, so analytics cannot recover events from a session file that was never created.

Codex records have no timestamp or session association; those columns stay null for the existing records. No metadata is invented or added to the writer. Bedrock pricing is the existing local estimate, not authoritative cloud billing. Ledger and session usage can overlap; do not sum them as independent spending.

## Bounds, coverage, and performance

- Header discovery has a 64 KiB first-line bound and never reads transcript bodies. Search reads 64 KiB buffers, examines at most 8 MiB or 10,000 records per page, returns at most 100 matches per page, and treats 16 MiB as the maximum physical record. An oversized or malformed line is counted and disclosed while valid surrounding records remain searchable.
- Search and metadata discovery do not initialize DuckDB. Ordinary search has a 5,000 ms deadline. Search coverage reports selected files/bytes, examined files/records/bytes, safely pruned files, remaining files, malformed/oversized records, timestamp gaps, exclusions, captured byte horizons, and inventory changes. `complete:true` means selected readable input was traversed with exclusions disclosed, not that results are a semantic review.
- Search cursors are process-local, bounded and expiring. They bind normalized scope/filters, selected-file identity markers and captured byte horizons. They are released when complete and may expire on reload/exit. Appends beyond a captured horizon belong to a fresh scan; replacement/truncation stops continuation with an inventory-change result. Do not treat an empty early page as exhaustive.
- Standard SQL retains the 5,000 ms deadline, 512 MiB selected-input bound, two threads, `1GB` DuckDB memory ceiling, serialized staging and invocation-local in-memory database with no spill. Overrides are `PI_ANALYTICS_TIMEOUT_MS`, `PI_ANALYTICS_MAX_INPUT_BYTES`, `PI_ANALYTICS_THREADS`, and `PI_ANALYTICS_MEMORY_LIMIT`; invalid values fail and are never raised automatically.
- Explicit large SQL uses a bounded 64 KiB reader and 1,000-record/8 MiB appender batches, an invocation-owned disk database plus spill directory, a 120,000 ms deadline and 4 GiB owned-disk budget. It retains two threads and the `1GB` DuckDB memory ceiling. Overrides are `PI_ANALYTICS_LARGE_TIMEOUT_MS` and `PI_ANALYTICS_LARGE_DISK_BUDGET_BYTES`, in addition to shared thread/memory settings. Runtime-owned paths are removed after success, error or cancellation; cleanup failures name the exact owned remnant.
- Returned SQL rows remain at most 1,000 and 256 KiB for the encoded rows array. `truncated` means output hit those bounds, not that input was silently omitted. Large resource failure is explicit; it is not a partial aggregate or permission to retry standard SQL as large.

Query results return `columns`, `rows`, `truncated`, `cost`, `profiles`, `sources`, and coverage notes. DuckDB serializes BIGINT values as decimal strings and JSON values as JSON text. `cost` reports `filesScanned`, `bytesScanned`, `discoveryMs`, `stagingMs`, `queryMs`, execution/resource limits, and, for large mode, records staged, malformed records, disk high-water and disk budget. Staging includes queue wait, instance setup and materialization; end-to-end latency also includes lazy loading and cleanup.

SQL predicates run after staging and do not prune files. Session creation dates and filename timestamps must not exclude resumed sessions with recent events. Exact session selection reduces staged files, but still performs metadata discovery. Repeated queries rebuild DuckDB and do not imply an index. File sizes are measured before ingestion; live files are not a transactional snapshot. Header exclusions are separate from malformed/oversized records and are reported in coverage.

The disposable metadata cache is `.analytics-state/metadata.json` beneath the default runtime root. It stores only file markers, validated session header metadata and event ranges learned during requested reads. It contains no transcript content or permanent SQL projection. Missing, corrupt, stale or unwritable cache state falls back to authoritative discovery and cannot exclude a file.

## When the tool cannot answer

The [skill's read-only fallback](SKILL.md#read-only-fallback) permits `find`, `rg`, `jq`, `awk`, and `sort` against the same authorized local history when `log_analytics` is unavailable, over budget, excludes relevant input, or cannot retrieve the needed evidence. Its no-filesystem-SQL boundary is not a prohibition on direct read-only shell inspection. Use parsed JSON for roles, timestamps and error flags; plain-text matches only identify candidates. Preserve source coordinates and disclose partial scans and parse/pipeline failures. The tool's SQL staging policy does not prohibit temporary sorting space for these commands.

## Installation and checks

The default profile owns `@duckdb/node-api@1.5.5-r.4` through pnpm. From the repository root, follow the normal default setup: frozen pnpm install in `pi/profiles/default`, then `bash scripts/pi-deps-link-setup --profile default`. Use `/reload` or a fresh `pp` session to activate installed code. No live reload is performed by validation.

From `pi/profiles/default/`:

```sh
pnpm test log-analytics-sessions.test.ts log-analytics-store.test.ts log-analytics-boundary.test.ts log-analytics-tool.test.ts tool-search.test.ts tool-visibility.test.ts
node scripts/log-analytics-smoke.mjs
node scripts/log-analytics-perf.mjs
pnpm run typecheck
```

The smoke uses the installed Pi loader offline with injected temporary default/legacy roots. The finite performance script generates approximately 10 and 100 MiB synthetic corpora, validates independent expected results, reports cold-process and three repeated-runtime samples, and deletes only its temporary fixtures. It resets analytics resource overrides for reproducible defaults. It does not read private sessions, benchmark SQLite, or create an index.
