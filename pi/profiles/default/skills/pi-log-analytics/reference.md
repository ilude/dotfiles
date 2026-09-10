# Default log analytics reference

## Operations

`log_analytics` is registered by the default profile and activated through `tool_search`. `catalog` needs no profile filesystem access or DuckDB initialization:

```json
{"operation":"catalog"}
```

Metadata-only discovery:

```json
{"operation":"sessions","profiles":["default","legacy"],"maxRows":50}
```

Optional discovery fields: `cwd` (exact stored header string), `sessionIds` (native IDs), `maxRows` (1-1000, default 100), and `cursor` (the preceding `nextCursor`, with identical filters). Results contain `profiles`, `sessions`, `truncated`, `nextCursor`, and coverage notes. Each session has `ref: { profile, sessionId, fileKey }`, nullable `cwd` and `created`, file `modified` time, and `bytes`. Modified time is filesystem metadata, not the last event timestamp. Listing is best-effort under concurrent changes, not a snapshot.

Discovery validates the first physical JSONL line as a native session header. Each header read is limited to 64 KiB, with at most 511 bytes of read-ahead. Non-session, empty, malformed, or oversized headers are excluded. Listing and session-query results include `coverage.discovery`: `excludedFiles`, up to 20 `diagnostics` (profile, profile-relative file label capped at 512 characters, opaque fileKey, and reason), and `diagnosticsTruncated`. Counts cover the selected profiles before listing filters or exact session selection, not just the returned page. Explicit references to excluded sessions still fail as unresolved. Discovery never falls back to a transcript scan or native session loading that may repair files. Directory listing and header reads still cover the selected profile's session tree before pagination. Empty supported session trees are valid; missing profile roots and unreadable inputs are errors.

Exact session follow-up:

```json
{
  "operation":"query",
  "profiles":["legacy"],
  "sources":["session_entries"],
  "sessionRefs":[{"profile":"legacy","sessionId":"<native-id>"}],
  "sql":"SELECT _profile, session_id, _record_key, tool_name, is_error FROM session_entries WHERE message_role = 'toolResult' AND is_error LIMIT 20",
  "maxRows":20
}
```

Use the complete returned `ref`, including `fileKey`, when available. An ID that matches multiple files fails as ambiguous unless its discriminator is supplied. Unknown references and references outside selected profiles fail. `sessionRefs` narrows only `session_entries` and requires that source.

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

- Default query session deadline: 5,000 ms from core discovery through staging/query; native module loading and profile-root resolution precede this timer. Metadata discovery has its own 5,000 ms default deadline.
- Selected input: 512 MiB, checked before instance creation and staging.
- DuckDB: 2 threads, `1GB` memory, invocation-local in-memory database, serialized staging across calls in the process, no disk spill or persistent projection.
- Resource overrides: `PI_ANALYTICS_TIMEOUT_MS`, `PI_ANALYTICS_MAX_INPUT_BYTES`, `PI_ANALYTICS_THREADS`, `PI_ANALYTICS_MEMORY_LIMIT`. Invalid values fail. Do not increase these automatically after a failed search.
- Returned rows: at most 1,000 and 256 KiB for the encoded rows array. This is not a bound on the whole result envelope. Rows stream incrementally and stop at the limit; no full result collection followed by truncation.
- Native JSON ingestion retains its default per-object size limit (16 MiB in this DuckDB version). Larger objects fail explicitly rather than being silently clipped. Malformed JSON lines are excluded while valid surrounding records remain readable; excluded-line counts are not available.

Query results return `columns`, `rows`, `truncated`, `cost`, `profiles`, `sources`, and coverage notes. DuckDB serializes BIGINT values as decimal strings and JSON values as JSON text. `cost` contains `filesScanned`, `bytesScanned`, `discoveryMs`, `stagingMs`, and `queryMs`. Staging time includes queue wait, instance setup and materialization. Discovery time covers file selection and size checks. End-to-end latency also includes lazy module loading and cleanup.

`truncated` means returned rows hit their row/byte bound, not that some input files were silently omitted. Complete file selection is distinct from malformed-record exclusion and live-file consistency. Header exclusions are reported separately in `coverage.discovery`; `files: "all selected files staged"` refers only to valid, selected session files. Unreadable, missing-during-query, over-limit (other than excluded oversized headers), or cancelled inputs fail instead of producing a claimed partial success. File sizes are measured before ingestion; concurrently appended/replaced files are not a transactional snapshot. Narrow the profile/session set after an input-limit failure.

The Windows synthetic check on 2026-09-07 passed all approximately 10 MiB workloads. In the approximately 100 MiB corpus, metadata and one-session queries passed, but broad queries over approximately 50 MiB (default only) or 100 MiB (both) reached the 1 GB memory ceiling. The input-byte cap is not a promise that every smaller corpus fits in memory. Exact session selection remains the supported way to narrow these searches; limits were not raised and no index was added.

SQL event-time or content predicates run after staging and do not prune files. Session creation dates and filename timestamps must not exclude resumed sessions with recent events. Exact session selection reduces staged files, but still performs metadata discovery. Repeated queries rebuild DuckDB and do not imply an index or cache. Synthetic performance results are not latency guarantees for private all-history searches.

## When the tool cannot answer

The [skill's read-only fallback](SKILL.md#read-only-fallback) permits `find`, `rg`, `jq`, `awk`, and `sort` against the same authorized local history when `log_analytics` is unavailable, over budget, excludes relevant input, or cannot retrieve the needed evidence. Its no-filesystem-SQL boundary is not a prohibition on direct read-only shell inspection. Use parsed JSON for roles, timestamps and error flags; plain-text matches only identify candidates. Preserve source coordinates and disclose partial scans and parse/pipeline failures. The tool's current no-spill implementation does not prohibit temporary sorting space for these commands.

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
