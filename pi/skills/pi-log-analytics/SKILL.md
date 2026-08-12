---
name: pi-log-analytics
description: "Pi session, trace, metrics, workflow-friction, workflow-telemetry, usage, or local JSONL analysis with DuckDB. Use for aggregating or correlating Pi runtime logs. Not for adding telemetry, generic SQL/database design, or non-Pi logs."
---

# Pi Log Analytics

## Boundary

Use this skill to investigate existing Pi runtime data with the deterministic helper in `pi/analytics/`. Use `logging-observability` to design or add telemetry, `analysis-workflow` for debugging without telemetry, and `database` for generic database work.

## Governing Principle

JSONL is the append-only source of truth. DuckDB views and any DuckDB or Parquet files are disposable local analysis artifacts.

## Workflow

1. Run from the dotfiles repository root.
2. Inventory sources without scanning rows:

```bash
uv run --project pi/analytics python pi/analytics/pi_log_query.py catalog
```

3. List stable source and derived views:

```bash
uv run --project pi/analytics python pi/analytics/pi_log_query.py views
```

4. Start with metadata, a bounded time window, and aggregate counts. Run one read-only `SELECT` with a result cap:

```bash
uv run --project pi/analytics python pi/analytics/pi_log_query.py query \
  "SELECT event, count(*) AS n FROM metric_events GROUP BY event ORDER BY n DESC" \
  --limit 50
```

5. If a query reports malformed JSONL, validate that source without printing records:

```bash
uv run --project pi/analytics python pi/analytics/pi_log_query.py validate metric_events
```

6. Use `--ignore-malformed` only after validation when an incomplete exploratory result is acceptable. Report the omitted row count.
7. Read [reference.md](reference.md) when source fields, correlation rules, or query recipes are needed.
8. Report the source views, time window, filters, row counts, and any missing or malformed source that limits the conclusion.

## Safety

- Treat `session_entries.message`, `session_entries.content`, and `trace_events.payload` as potentially sensitive. Do not select or print raw content unless the task requires it.
- Use `session_entries` as the canonical corpus. `history_entries` can overlap it; never union both without explicit session-level deduplication.
- Keep exports and caches under `.tmp/pi-log-analytics/`. Never commit DuckDB, Parquet, JSONL, or copied runtime data.
- Use explicit schemas. Never use `read_ndjson_auto()` for heterogeneous trace payloads.
- Malformed JSONL fails by default. Never use `--ignore-malformed` without first validating and reporting the omitted records.

## Anti-Patterns

- Scanning raw prompt or tool output when event metadata answers the question.
- Treating prompt hashes as unique invocation IDs.
- Joining sessions and history by filename alone.
- Replacing live bounded readers or JSONL writers with DuckDB.
- Persisting an analytics database as authoritative state.
