# Pi Log Analytics Reference

## Helper contract

Run from the dotfiles repository root:

```bash
uv sync --project pi/analytics --locked
uv run --project pi/analytics python pi/analytics/pi_log_query.py catalog
uv run --project pi/analytics python pi/analytics/pi_log_query.py views
uv run --project pi/analytics python pi/analytics/pi_log_query.py query "SELECT ..." --limit 50
```

The helper opens an in-memory DuckDB connection, registers explicit JSONL schemas, and runs exactly one read-only `SELECT`. Results default to 50 rows and cannot exceed 1,000 rows. Table cells are truncated for terminal safety; use `--format csv` or `--format jsonl` only when full selected values are required.

Malformed JSONL fails by default. Diagnose a source without printing record content:

```bash
uv run --project pi/analytics python pi/analytics/pi_log_query.py validate routing_classifier_events
```

If an incomplete exploratory result is acceptable, place the explicit opt-in before the subcommand:

```bash
uv run --project pi/analytics python pi/analytics/pi_log_query.py \
  --ignore-malformed \
  query "SELECT count(*) FROM routing_decisions_joined"
```

`validate` reports the total malformed count and prints at most 100 issue locations. Report the total; never present an opt-in result as complete.

Path overrides must precede the subcommand:

```bash
uv run --project pi/analytics python pi/analytics/pi_log_query.py \
  --agent-dir /path/to/agent \
  --metrics-dir /path/to/metrics \
  --trace-dir /path/to/traces \
  --workflow-telemetry-dir /path/to/workflow-telemetry \
  catalog
```

Recognized environment overrides are `PI_AGENT_DIR`, `PI_METRICS_DIR`, `PI_WORKFLOW_TELEMETRY_DIR`, `PI_WORKFLOW_FRICTION_DIR`, `PI_OPERATOR_DIR`, and `PI_COMS_LAN_DIR`. The default trace root follows `transcript.path` in the agent `settings.json`; `--trace-dir` overrides it explicitly.

## Source views

| View | Source | Content risk | Notes |
| --- | --- | --- | --- |
| `session_entries` | `~/.pi/agent/sessions/**/*.jsonl*` | High | Canonical session corpus |
| `history_entries` | `~/.pi/agent/history/**/*.jsonl*` | High | Archived copies; can overlap sessions |
| `metric_events` | `PI_METRICS_DIR/metrics*.jsonl` or the agent log root | Medium | `data` is explicit JSON |
| `trace_events` | configured transcript path or `~/.pi/agent/traces/**/*.jsonl*` | High | `payload` is explicit JSON; no auto inference |
| `usage_events` | `~/.pi/agent/logs/usage.jsonl` | Medium | Usage extension operations |
| `classifier_failures` | `pi/prompt-routing/logs/classifier_failures.jsonl` | Medium | No prompt text or output previews in the registered schema |
| `workflow_episodes` | `~/.pi/workflow-telemetry/episodes.jsonl` | Medium | Workflow dispatch envelopes |
| `workflow_events` | `~/.pi/workflow-telemetry/*/events.jsonl` | Medium | Phase and runtime events |
| `friction_interactions` | `~/.pi/agent/workflow-friction/interactions.jsonl` | Medium | Interaction measurements |
| `friction_reviews` | `~/.pi/agent/workflow-friction/reviews.jsonl` | Medium | Review outcomes |
| `friction_experiments` | `~/.pi/agent/workflow-friction/experiments.jsonl` | Medium | Experiment definitions |
| `friction_learning_decisions` | `~/.pi/agent/workflow-friction/learning-decisions.jsonl` | High | Approved text and target paths |
| `routing_classifier_events` | `pi/prompt-routing/logs/routing_log.jsonl` | Medium | Prompt and excerpt fields are intentionally omitted |
| `damage_control_judgments` | `~/.pi/agent/operator/damage-control/judge.jsonl` | Medium | Shadow-judge decisions |
| `coms_audit_events` | `~/.pi/coms-lan/**/audit.jsonl*` | Medium | Redacted LAN audit records |

Missing sources still produce empty views with stable schemas. Malformed rows fail the query unless the caller explicitly uses `--ignore-malformed` after validation.

## Derived views

| View | Purpose |
| --- | --- |
| `session_inventory` | One metadata row per canonical session file |
| `history_inventory` | One metadata row per archived history file |
| `metric_event_summary` | Counts and time range by metric event |
| `trace_event_summary` | Counts, sessions, and time range by trace event |
| `trace_routing_decisions` | Routing fields extracted from trace JSON payloads |
| `routing_decisions_joined` | Classifier-to-trace correlation by unique ID with legacy occurrence fallback |
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

### Routing correlation

```sql
SELECT
  classifier_model_size,
  selected_model_size,
  count(*) AS decisions,
  avg(elapsed_us) AS mean_classifier_us
FROM routing_decisions_joined
WHERE classifier_timestamp >= strftime(current_timestamp - INTERVAL '14 days', '%Y-%m-%d')
GROUP BY classifier_model_size, selected_model_size
ORDER BY decisions DESC
```

A null `session_id` means no trace-side match was found. Current records join on unique `route_decision_id`; legacy records with absent or deterministic hash-derived IDs pair by prompt-hash occurrence order.

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

Put any explicit export under the ignored scratch root:

```text
.tmp/pi-log-analytics/
```

JSONL remains authoritative. Delete and rebuild DuckDB or Parquet artifacts when schemas or source selection changes. Do not use generated analytics files as inputs to live Pi readers or writers.
