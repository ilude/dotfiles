# Pi Log Analytics Reference

## In-process tool contract

Pi JSONL analytics is served by the registered `log_analytics` tool. It is an in-process TypeScript boundary over a disposable local DuckDB read model. Refresh is internal to each operation; callers do not open databases, scan files, or run commands.

Start with catalog discovery:

```json
{"operation":"catalog"}
```

The catalog returns registered source IDs, same-named DuckDB views, and typed convenience columns. Query a selected view with bounded DuckDB SQL:

```json
{
  "operation": "query",
  "sources": ["session_entries"],
  "sql": "SELECT _timestamp, event_type, tool_name FROM session_entries WHERE _timestamp >= $start ORDER BY _timestamp LIMIT 50",
  "parameters": {"start": "2026-08-01"},
  "maxRows": 50
}
```

The request accepts `sources`, `sql`, scalar `parameters`, and optional `maxRows`. SQL may use CTEs, date predicates, JSON functions, and ordinary DuckDB expressions. Prepared registered views are the only filesystem boundary; do not use filesystem functions, external table functions, pragmas, or extension commands.

Each query session has a 5,000 ms deadline, a 512 MiB input limit, 2 DuckDB threads, and a 1 GB DuckDB memory ceiling by default. `PI_ANALYTICS_TIMEOUT_MS`, `PI_ANALYTICS_MAX_INPUT_BYTES`, `PI_ANALYTICS_THREADS`, and `PI_ANALYTICS_MEMORY_LIMIT` override those defaults. Selected input over the byte limit fails with `exceeds bound` before DuckDB creates staging tables. Output remains bounded to at most 1,000 rows and 256 KiB of encoded data. Cancellation, unknown source IDs, invalid requests, and budget violations fail explicitly. Query results report truncation and `cost: { filesScanned, bytesScanned, stagingMs, queryMs }`. DuckDB is invocation-local in-memory state with no persistent analytics projection or shared connection cache. Typed report readers retain their existing unbounded-input behavior.

## Content and privacy boundary

Each registered view exposes structural convenience fields and the complete original JSON record in `record`, along with `_source_file`, `_record_key`, and `_timestamp`. The generic tool is therefore content-bearing: session and trace records may contain transcript payloads, messages, arguments, evidence, reasons, paths, filenames, or terminal output. Treat these records as potentially sensitive and request `record` only for an explicitly authorized, bounded investigation. Prefer structural fields when they answer the question. Bounded domain readers may provide narrower separately authorized evidence retrieval.

JSONL remains the append-only source of truth. DuckDB is invocation-local disposable state with no persistent analytics projection, refresh state, WAL, or shared connection cache. Malformed, unstable, truncated, replaced, deleted, or over-limit inputs remain observable gaps or fail without rewriting authoritative records.

## Correlation

Shared fields may include `runtime_instance_id`, `session_id`, `turn_id`, `trace_id`, `interaction_id`, `workflow_episode_id`, `orchestration_id`, `run_id`, `task_id`, `goal_id`, `tool_call_id`, and `operation_id`. Existing IDs remain opaque. Correlation precedence is:

1. `exact` - directly stored matching identifiers.
2. `deterministic` - a rule-defined join with required scope and direction.
3. `unique_inferred` - an opt-in unique legacy match with disclosed provenance.
4. `unmatched` - missing or ambiguous evidence.

Timestamp proximity alone is never sufficient. Inferred edges are excluded by default. `/find-fails` joins representative tool calls and results only through authoritative exact or deterministic identifiers.

Parallel and child scopes carry explicit immutable correlation envelopes. Settled scopes invalidate inherited context; detached work must receive an explicit child envelope or emit without inherited context. Append failures remain observational gaps and do not change the primary operation.

## Typed command surfaces

Use these active Pi surfaces for their owned reports instead of reconstructing them with custom queries:

- `/find-fails` - one ordinary active-session investigation of recurring tool-failure families from the preceding seven days.
- `/usage` and `/usage-stats` - usage and pricing reports.
- `/extension-stats` and `/skill-stats` - extension and skill activity reports.
- `/orchestration-stats` - bounded orchestration and workflow-friction report.
- Workflow-friction review commands - owned interaction and review diagnostics.

These readers use typed in-process APIs and preserve their documented windows, ordering, ties, and limits. `/find-fails` delegates its content-bearing investigation to the ordinary active turn and does not invoke an external process, replacement command, restricted diagnostic turn, or decision writer.

## Source selection guidance

Use catalog IDs to restrict a question to the smallest registered source set. Prefer metadata-only event, status, identifier, time, count, and duration fields. Use the canonical session source for session activity and do not combine overlapping history records without explicit session-level deduplication. Background-terminal analytics include lifecycle metadata only; terminal stdout and stderr are excluded.

For churn screens, issue typed structural requests over `session_events`, `metric_events`, and the relevant workflow or orchestration source. Emit only filenames or paths when a separately authorized domain report explicitly requires a source coordinate; never use the generic tool to retrieve content. Every hit requires bounded manual review and is not a prevalence or causality claim.

For malformed or changing sources, report the omission or gap and keep the conclusion bounded. Do not use a raw-content fallback.
