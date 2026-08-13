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
uv run --no-sync --project pi/analytics python pi/analytics/pi_log_query.py catalog
```

3. Select only the sources needed. For repeated or parallel analysis, snapshot each selected source once in the parent workflow:

```bash
uv run --no-sync --project pi/analytics python pi/analytics/pi_log_query.py \
  --source session_entries snapshot
```

If snapshot creation reports malformed JSONL, validate that source once to locate the malformed rows. Do not run a separate full validation before a successful snapshot.

4. Reuse the snapshot for every query. Snapshot readers do not discover or parse the JSONL corpus:

```bash
uv run --no-sync --project pi/analytics python pi/analytics/pi_log_query.py \
  --snapshot-db .tmp/pi-log-analytics/pi-logs.duckdb \
  --source session_entries \
  query "SELECT count(*) AS sessions FROM session_inventory" --limit 50
```

5. Put related `SELECT` statements in one SQL file and use `batch` so they share one connection. For parallel screening, compute the partition column once, export a bounded manifest, and give workers either the shared read-only snapshot or only their assigned files. Workers must not independently validate, snapshot, or rescan the complete corpus.
6. If a live query or snapshot reports malformed JSONL, validate that source without printing records. Validation caches unchanged-file results under `.tmp/pi-log-analytics/` by default.
7. Use `--ignore-malformed` only after validation when an incomplete exploratory result is acceptable. Report the omitted row count.
8. Read [reference.md](reference.md) when source fields, snapshot operations, manifests, correlation rules, or query recipes are needed.
9. Report the source views, time window, filters, row counts, and any missing or malformed source that limits the conclusion.

## Safety

- Treat `session_entries.message`, `session_entries.content`, and `trace_events.payload` as potentially sensitive. Do not select or print raw content unless the task requires it.
- Use `session_entries` as the canonical corpus. `history_entries` can overlap it; never union both without explicit session-level deduplication.
- Keep exports and caches under `.tmp/pi-log-analytics/`. Never commit DuckDB, Parquet, JSONL, or copied runtime data.
- Build snapshots before dispatching parallel readers. Never let workers refresh the same snapshot or independently scan the complete source corpus.
- Use `--source` and `--files-from` to restrict discovery before reading rows. SQL partition predicates alone do not prevent JSONL scans.
- Use explicit schemas. Never use `read_ndjson_auto()` for heterogeneous trace payloads.
- Malformed JSONL fails by default. Never use `--ignore-malformed` without first validating and reporting the omitted records.

## Anti-Patterns

- Scanning raw prompt or tool output when event metadata answers the question.
- Treating prompt hashes as unique invocation IDs.
- Joining sessions and history by filename alone.
- Replacing live bounded readers or JSONL writers with DuckDB.
- Treating the disposable snapshot as authoritative state.
- Running one helper process per query or one full-corpus validation per worker.
