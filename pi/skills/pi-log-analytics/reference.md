# Pi Log Analytics Reference

## In-process tool contract

Pi JSONL analytics is served by the registered `log_analytics` tool. It is an in-process TypeScript boundary over a disposable local DuckDB read model. Refresh is internal to each operation; callers do not open databases, scan files, or run commands.

Start with catalog discovery:

```json
{"operation":"catalog"}
```

The catalog returns registered source IDs and their typed structural columns. Use those IDs in a typed `select` request:

```json
{
  "operation": "select",
  "source": "metric_events",
  "columns": ["event", "model", "timestamp"],
  "filters": [{"column":"event","op":"eq","value":"tool_use"}],
  "orderBy": [{"column":"timestamp","direction":"desc"}],
  "limit": 50
}
```

Use `aggregate` for bounded counts and numeric sums:

```json
{
  "operation": "aggregate",
  "source": "metric_events",
  "groupBy": ["model"],
  "measures": [
    {"kind":"count","as":"events"},
    {"kind":"sum","column":"input_tokens","as":"input_tokens"}
  ],
  "limit": 50
}
```

Filters support only `eq`, `neq`, `lt`, `lte`, `gt`, and `gte`. Ordering, grouping, measures, and limits accept registered typed column IDs only. The boundary accepts no SQL, expressions, paths, pragmas, table functions, extension commands, or filesystem functions.

Each operation is bounded to at most 1,000 rows, 256 KiB of encoded output, and 5 seconds. Cancellation, unknown source or column IDs, invalid requests, and budget violations are typed failures. External access and extension loading are disabled. Do not retry a failing operation by widening its scope.

## Structural privacy

The generic catalog and read model expose only structural fields: compact IDs, timestamps, event and status labels, names, provider and model labels, token and duration counts, costs, and byte counts. They do not expose messages, transcript payloads, arbitrary `data`, arguments, evidence, reasons, paths, filenames, or terminal output. Bounded domain readers own any separately authorized evidence retrieval.

JSONL remains the append-only source of truth. DuckDB is disposable local state. Refresh is incremental and transactional; malformed, unstable, truncated, replaced, deleted, or over-limit inputs remain observable gaps or fail without rewriting authoritative records or corrupting the prior valid store.

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
