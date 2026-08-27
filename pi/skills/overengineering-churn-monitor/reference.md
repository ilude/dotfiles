# Overengineering Churn Detection Screens

## Bounded analytics boundary

Use the in-process `log_analytics` tool from the `pi-log-analytics` skill. Start with catalog discovery, then issue bounded SQL queries against registered views. Do not run an external command or filesystem query.

Use the canonical `session_entries` source for recent session screens and request only structural identifiers, timestamps, event labels, tool names, and counts. Use `metric_events`, workflow, orchestration, or friction sources only when the screen requires their structural lifecycle records. Each request is limited to 1,000 rows, 256 KiB of encoded output, and 5 seconds.

Discover sources:

```json
{"operation":"catalog"}
```

Example bounded screen request:

```json
{
  "operation": "query",
  "sources": ["session_entries"],
  "sql": "SELECT session_id, tool_name, event_type, count(*) AS events FROM session_entries WHERE timestamp >= $start GROUP BY session_id, tool_name, event_type ORDER BY events DESC LIMIT 100",
  "parameters": {"start": "2026-08-11T00:00:00Z"},
  "maxRows": 100
}
```

Each selected view also exposes the complete original JSON record in `record`, plus `_source_file`, `_record_key`, and `_timestamp`. Records may contain transcripts, messages, arguments, evidence, reasons, paths, filenames, or terminal output. Treat `record` as potentially sensitive; request it only for an explicitly authorized, bounded investigation. Prefer structural columns, and use a separately authorized domain reader for evidence review.

| Rule | Requirement |
| --- | --- |
| Source | Prefer canonical `session_entries`; do not combine overlapping history records without deduplication. |
| Window | Screens use the most recent 14 days unless the command contract states another window. |
| Output | Emit structural identifiers, labels, and counts only. Never retrieve raw content. |
| Interpretation | Every hit requires bounded manual review; a hit is not a prevalence or causality claim. |
| Correlation | Exact and deterministic edges are authoritative. Unique inferred edges are opt-in, provenance-marked, and never decision authority. |
| Failure | Report malformed, changing, or unavailable sources as bounded gaps; do not widen scope or use a fallback process. |

## Screen guidance

Use a bounded `query` request with the smallest relevant source set for each screen:

- **Identical-edit retry candidates:** group `session_entries` by `session_id`, `tool_name`, and `event_type`; use the owning bounded domain reader for any authorized coordinate review. Equal structural results do not establish equivalent arguments, targets, or relevant state.
- **Cross-client writes:** filter structural `tool_name`, `session_id`, and event metadata; use the owning domain boundary for any separately authorized path check. Authorized cross-client work is not an incident.
- **Duplicate verification:** query successful structural tool events and manually determine whether repeats were verification or whether inputs, state, or failure signatures differed. Mandatory, user-requested, safety, and held-out checks are not incidents merely because output matches.
- **Metadata outliers:** query per-session event counts and available timestamp or token-count fields. Treat thresholds as triage thresholds, not causal cutoffs.
- **Manual review:** use workflow outcome reports and bounded domain feedback records. Retain only sanitized report-style citations and metadata; do not copy raw feedback or workflow payloads into tracked files.
