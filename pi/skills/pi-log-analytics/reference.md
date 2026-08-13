# Pi Log Analytics Reference

## Helper contract

Run from the dotfiles repository root:

```bash
uv sync --project pi/analytics --locked
uv run --no-sync --project pi/analytics python pi/analytics/pi_log_query.py catalog
uv run --no-sync --project pi/analytics python pi/analytics/pi_log_query.py views
uv run --no-sync --project pi/analytics python pi/analytics/pi_log_query.py query "SELECT ..." --limit 50
```

Run `uv sync --project pi/analytics --locked` when dependencies need installation or updating. Routine analytics commands use `uv run --no-sync` to avoid repeated environment resolution.

The live-query default opens an in-memory DuckDB connection, registers explicit JSONL schemas, and runs exactly one read-only `SELECT`. Results default to 50 rows and cannot exceed 1,000 rows. Table cells are truncated for terminal safety; use `--format csv` or `--format jsonl` only when full selected values are required. DuckDB uses at most four threads by default; place `--threads N` before the subcommand to change the cap.

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

Recognized environment overrides are `PI_AGENT_DIR`, `PI_METRICS_DIR`, `PI_WORKFLOW_TELEMETRY_DIR`, `PI_WORKFLOW_FRICTION_DIR`, `PI_OPERATOR_DIR`, and `PI_COMS_LAN_DIR`. The default trace root follows `transcript.path` in the agent `settings.json`; `--trace-dir` overrides it explicitly.

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
| `damage_control_judgments` | `~/.pi/agent/operator/damage-control/judge.jsonl` | Medium | Shadow-judge decisions |
| `coms_audit_events` | `~/.pi/coms-lan/**/audit.jsonl*` | Medium | Redacted LAN audit records |

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
