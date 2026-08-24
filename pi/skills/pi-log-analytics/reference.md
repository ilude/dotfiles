# Pi Log Analytics Reference

## Helper contract

Run from the dotfiles repository root:

```bash
uv sync --project pi/analytics --locked
uv run --no-sync --project pi/analytics python pi/analytics/pi_log_query.py catalog
uv run --no-sync --project pi/analytics python pi/analytics/pi_log_query.py views
uv run --no-sync --project pi/analytics python pi/analytics/pi_log_query.py schema session_inventory
uv run --no-sync --project pi/analytics python pi/analytics/pi_log_query.py query "SELECT ..." --limit 50
```

Run `uv sync --project pi/analytics --locked` when dependencies need installation or updating. Routine analytics commands use `uv run --no-sync` to avoid repeated environment resolution.

The live-query default opens an in-memory DuckDB connection, registers explicit JSONL schemas, and runs exactly one read-only `SELECT`. Use `schema <view>` before querying an unfamiliar source or derived view. Results default to 50 rows and cannot exceed 1,000 rows. Table cells are truncated for terminal safety; use `--format csv` or `--format jsonl` only when full selected values are required. DuckDB uses at most four threads by default; place `--threads N` before the subcommand to change the cap.

Restrict discovery whenever the question needs only some sources. Repeat `--source` for multiple sources:

```bash
uv run --no-sync --project pi/analytics python pi/analytics/pi_log_query.py \
  --source session_entries \
  query "SELECT count(*) FROM session_inventory"
```

Unselected source views do not exist, so accidental references fail explicitly.

Malformed JSONL fails by default. Diagnose a source without printing record content:

```bash
uv run --no-sync --project pi/analytics python pi/analytics/pi_log_query.py validate metric_events
```

If an incomplete exploratory result is acceptable, place the explicit opt-in before the subcommand:

```bash
uv run --no-sync --project pi/analytics python pi/analytics/pi_log_query.py \
  --ignore-malformed \
  query "SELECT count(*) FROM metric_events"
```

`validate` reports the total malformed count and prints at most 100 issue locations. It caches results by resolved path, size, and modification time under `.tmp/pi-log-analytics/validation-cache.json`; unchanged files are not reparsed. Use `--no-validation-cache` for a forced validation or `--validation-cache PATH` for an alternate disposable cache. Report the total; never present an opt-in result as complete.

Path overrides must precede the subcommand:

```bash
uv run --no-sync --project pi/analytics python pi/analytics/pi_log_query.py \
  --agent-dir /path/to/agent \
  --metrics-dir /path/to/metrics \
  --trace-dir /path/to/traces \
  --workflow-telemetry-dir /path/to/workflow-telemetry \
  catalog
```

Recognized environment overrides are `PI_AGENT_DIR`, `PI_METRICS_DIR`, `PI_WORKFLOW_TELEMETRY_DIR`, `PI_WORKFLOW_FRICTION_DIR`, `PI_TOOL_FAILURE_DIR`, and `PI_OPERATOR_DIR`. The default trace root follows `transcript.path` in the agent `settings.json`; `--trace-dir` overrides it explicitly.

## Tool-failure triage

Run `/find-fails` in Pi for the normal operator workflow. It incrementally refreshes `.tmp/pi-log-analytics/tool-failures.duckdb`, writes the sanitized scan to `.tmp/pi-log-analytics/tool-failure-scan.json`, and displays at most 10 prioritized investigation cards. For a nonempty pool it discloses the provider boundary, sends only bounded structural card fields to the active model in an isolated tool-free session, validates a recommendation of 1-3 supplied IDs, and stops for operator acceptance or refinement. It does not load transcript evidence or make addressed or skipped decisions.

For direct analytics use, create or retain a frozen `session_entries` snapshot, then scan it without refreshing the source:

```bash
uv run --no-sync --project pi/analytics python pi/analytics/pi_log_query.py \
  --snapshot-db .tmp/pi-log-analytics/august.duckdb \
  --source session_entries tool-failure-scan \
  --output .tmp/pi-log-analytics/tool-failure-scan.json
```

The scan joins tool results to calls by source file and tool-call ID, but candidate IDs use only the fingerprint version, tool name, normalized error class, and approved structural contract. It captures one UTC `asOf` boundary and records occurrence and distinct-session counts for inclusive 7, 14, and 30-day windows. Missing, malformed, and future timestamps contribute only to lifetime totals and bounded diagnostics. Output contains safe aggregates, hashed coordinates, a path-free digest, source window, and join diagnostics. It does not contain prompts, arguments, tool output, source paths, or session filenames. An error-marked result is a screening input, not proof of a defect.

Append a human decision to the dedicated local-private ledger, which defaults to `~/.pi/agent/tool-failures/decisions.jsonl`:

```bash
uv run --no-sync --project pi/analytics python pi/analytics/pi_log_query.py \
  tool-failure-decide .tmp/pi-log-analytics/tool-failure-scan.json CANDIDATE_ID skipped \
  --reason "Expected safety rejection" --revisit-after 2026-09-30

uv run --no-sync --project pi/analytics python pi/analytics/pi_log_query.py \
  tool-failure-decide .tmp/pi-log-analytics/tool-failure-scan.json CANDIDATE_ID addressed \
  --reason "Validated corrected call contract" --evidence commit:REV \
  --effective-after 2026-08-24
```

Skipped decisions require a sanitized reason. Addressed decisions require typed evidence and an effective date. The writer rejects credentials, raw multiline content, and absolute home paths. Records are appended under an exclusive lock; latest state follows physical append order. This preserves best-effort history among cooperating writers, not tamper-proof audit integrity.

Render the deterministic investigation pool:

```bash
uv run --no-sync --project pi/analytics python pi/analytics/pi_log_query.py \
  tool-failure-report .tmp/pi-log-analytics/tool-failure-scan.json
```

Fingerprint changes, due revisits, and post-effective-date regressions qualify first. Otherwise, `internal-missing-method` requires one 14-day occurrence; `required-runtime-unavailable` requires two 14-day sessions; `external-service-failure` requires three 7-day sessions or ten 30-day sessions; other classified candidates require three 14-day occurrences across two sessions; and unclassified candidates require one 30-day observation. Zero 30-day observations are stale. Recurring model-contract and retry-ceremony classes require three 14-day occurrences across three sessions and may enter the pool while remaining counted as expected-suppressed evidence.

Cards use the closed reason set `ledger-changed`, `ledger-regression`, `ledger-revisit`, `internal-contract-defect`, `runtime-unavailable`, `model-contract-friction`, `retry-ceremony`, `external-failure`, `classified-recurrence`, and `unclassified-review`. The 10-card pool reserves three places for ledger attention, three for internal/runtime evidence, two for model-tool friction, and two for other recurrence, then backfills unused capacity in stable tier order. Within a tier, the gate-driving session count, occurrence count, and candidate ID determine order. Card explanations describe investigation opportunities, not proven severity, cause, or fixability.

Use independent diagnostic views when the bounded default omits needed metadata:

```bash
uv run --no-sync --project pi/analytics python pi/analytics/pi_log_query.py \
  tool-failure-report .tmp/pi-log-analytics/tool-failure-scan.json \
  --include-overflow
uv run --no-sync --project pi/analytics python pi/analytics/pi_log_query.py \
  tool-failure-report .tmp/pi-log-analytics/tool-failure-scan.json \
  --include-observed
uv run --no-sync --project pi/analytics python pi/analytics/pi_log_query.py \
  tool-failure-report .tmp/pi-log-analytics/tool-failure-scan.json \
  --include-expected
```

`--include-overflow` returns qualifying cards beyond the limit. `--include-observed` returns neutral stale, below-threshold, and nonqualifying expected observations. `--include-expected` preserves the earlier direct expected-candidate report behavior. The flags compose. The report separately counts expected-suppressed, stale, below-threshold, overflow, timestamp, join, unchanged-skipped, and resolved groups. Ledger overrides take precedence over expected classification and unchanged safety-block suppression.

## Snapshots and batches

For repeated queries or parallel analysis, materialize each needed source once. The default path is `.tmp/pi-log-analytics/pi-logs.duckdb`:

```bash
uv run --no-sync --project pi/analytics python pi/analytics/pi_log_query.py \
  --source session_entries snapshot
```

Later commands must name the snapshot explicitly. They use its metadata and tables without discovering or parsing live JSONL:

```bash
uv run --no-sync --project pi/analytics python pi/analytics/pi_log_query.py \
  --snapshot-db .tmp/pi-log-analytics/pi-logs.duckdb \
  --source session_entries catalog
uv run --no-sync --project pi/analytics python pi/analytics/pi_log_query.py \
  --snapshot-db .tmp/pi-log-analytics/pi-logs.duckdb \
  --source session_entries \
  query "SELECT count(*) FROM session_inventory"
```

Running `snapshot` again inserts new files, replaces changed files, and removes deleted files for the selected sources. If files change during a long initial load, the helper performs bounded incremental stabilization passes that reread only changed files. It rolls back if the source does not stabilize. Other materialized sources remain unchanged. JSONL remains authoritative; delete and rebuild a snapshot when source schemas change.

Put multiple read-only statements in a SQL file to avoid one process and connection per query:

```bash
uv run --no-sync --project pi/analytics python pi/analytics/pi_log_query.py \
  --snapshot-db .tmp/pi-log-analytics/pi-logs.duckdb \
  --source session_entries \
  batch .tmp/pi-log-analytics/screening.sql --format jsonl --limit 1000
```

Every batch statement must be a `SELECT`, and the row limit applies to each result. Before parallel screening, the parent prepares the snapshot and any partition manifest. Workers may read the shared snapshot concurrently, but they must not refresh it or revalidate the complete corpus.

For file-level sharding without a snapshot, pass one or more manifests before the subcommand:

```bash
uv run --no-sync --project pi/analytics python pi/analytics/pi_log_query.py \
  --source session_entries \
  --files-from session_entries=.tmp/pi-log-analytics/shard-1.jsonl \
  query "SELECT count(*) FROM session_entries"
```

A manifest contains one nonblank path per line or JSONL objects containing `source_file`, `filename`, or `path`. Relative paths resolve from the manifest directory. Duplicate paths are removed, and missing files fail explicitly. A SQL hash predicate alone partitions results after reading the source; a manifest restricts the files read.

## Source views

| View | Source | Content risk | Notes |
| --- | --- | --- | --- |
| `session_entries` | `~/.pi/agent/sessions/**/*.jsonl*` | High | Canonical session corpus |
| `history_entries` | `~/.pi/agent/history/**/*.jsonl*` | High | Archived copies; can overlap sessions |
| `metric_events` | `PI_METRICS_DIR/metrics*.jsonl` or the agent log root | Medium | `data` is explicit JSON |
| `trace_events` | configured transcript path or `~/.pi/agent/traces/**/*.jsonl*` | High | `payload` is explicit JSON; no auto inference |
| `usage_events` | `~/.pi/agent/logs/usage.jsonl` | Medium | Usage extension operations |
| `workflow_episodes` | `~/.pi/workflow-telemetry/episodes.jsonl` | Medium | Workflow dispatch envelopes |
| `workflow_events` | `~/.pi/workflow-telemetry/*/events.jsonl` | Medium | Phase and runtime events |
| `friction_interactions` | `~/.pi/agent/workflow-friction/interactions.jsonl` | Medium | Interaction measurements |
| `friction_reviews` | `~/.pi/agent/workflow-friction/reviews.jsonl` | Medium | Review outcomes |
| `friction_experiments` | `~/.pi/agent/workflow-friction/experiments.jsonl` | Medium | Experiment definitions |
| `friction_learning_decisions` | `~/.pi/agent/workflow-friction/learning-decisions.jsonl` | High | Approved text and target paths |
| `tool_failure_decisions` | `~/.pi/agent/tool-failures/decisions.jsonl` | Medium | Addressed or skipped tool-failure candidates; separate from workflow-friction decisions |
| `damage_control_judgments` | `~/.pi/agent/operator/damage-control/judge.jsonl` | Medium | Shadow-judge decisions |

A selected live source with no files still produces an empty view with a stable schema. Unselected source views do not exist. Malformed rows fail the query unless the caller explicitly uses `--ignore-malformed` after validation.

## Derived views

| View | Purpose |
| --- | --- |
| `session_inventory` | One metadata row per canonical session file |
| `history_inventory` | One metadata row per archived history file |
| `metric_event_summary` | Counts and time range by metric event |
| `tool_discovery_activity` | Metadata-only toolset exposure, hashed searches, activation results, and tool use |
| `trace_event_summary` | Counts, sessions, and time range by trace event |
| `workflow_episode_summary` | Workflow event and budget-trip counts per episode |

## Query recipes

### Source coverage

```sql
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'main'
ORDER BY table_name
```

Use `catalog` for file counts and byte sizes without scanning source rows.

### Session activity without content

```sql
SELECT
  date_trunc('day', started_at) AS day,
  count(*) AS sessions,
  sum(user_messages) AS user_messages,
  sum(tool_results) AS tool_results
FROM session_inventory
WHERE started_at >= current_timestamp - INTERVAL '14 days'
GROUP BY day
ORDER BY day DESC
```

Do not combine `session_inventory` with `history_inventory` unless the question explicitly requires archives and the join deduplicates on session ID.

### Metrics by event

```sql
SELECT event, event_count, first_seen, last_seen
FROM metric_event_summary
ORDER BY event_count DESC
```

For one payload field, extract only that field:

```sql
SELECT
  event,
  try_cast(json_extract_string(data, '$.durationMs') AS DOUBLE) AS duration_ms,
  try_cast(ts AS TIMESTAMPTZ) AS occurred_at
FROM metric_events
WHERE event = 'timing_span'
  AND try_cast(ts AS TIMESTAMPTZ) >= current_timestamp - INTERVAL '7 days'
ORDER BY occurred_at DESC
```

### Tool discovery

```sql
SELECT
  event,
  tool_name,
  query_hash,
  activated_tools,
  toolset_id,
  occurred_at
FROM tool_discovery_activity
WHERE occurred_at >= current_timestamp - INTERVAL '30 days'
ORDER BY occurred_at DESC
```

Join searches to later `tool_use` rows only within the same `session_id`. The view contains tool names and structural metadata, not raw search queries, arguments, descriptions, or output.

### Trace coverage

```sql
SELECT event_type, event_count, session_count, first_seen, last_seen
FROM trace_event_summary
ORDER BY event_count DESC
```

Inspect payload keys before values:

```sql
SELECT DISTINCT event_type, unnest(json_keys(payload)) AS payload_key
FROM trace_events
WHERE try_cast(timestamp AS TIMESTAMPTZ) >= current_timestamp - INTERVAL '1 day'
ORDER BY event_type, payload_key
```


### Workflow outcomes

```sql
SELECT command, count(*) AS episodes, sum(budget_trips) AS budget_trips
FROM workflow_episode_summary
WHERE started_at >= current_timestamp - INTERVAL '30 days'
GROUP BY command
ORDER BY episodes DESC
```

### Workflow-friction rates

```sql
SELECT
  mode,
  count(*) AS interactions,
  avg(durationMs) AS mean_duration_ms,
  sum(toolFailureCount) AS tool_failures,
  sum(failedSubagentCount) AS failed_subagents
FROM friction_interactions
WHERE try_cast(startedAt AS TIMESTAMPTZ) >= current_timestamp - INTERVAL '30 days'
GROUP BY mode
ORDER BY interactions DESC
```

## Exports and disposable caches

Put snapshots, validation caches, manifests, SQL batches, and explicit exports under the ignored scratch root:

```text
.tmp/pi-log-analytics/
```

JSONL remains authoritative. Delete and rebuild DuckDB or Parquet artifacts when schemas change. Incremental snapshot refresh handles source selection and file additions, changes, and removals. Do not use generated analytics files as inputs to live Pi readers or writers.
