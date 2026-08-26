# Overengineering Churn Detection Screens

## Typed analytics boundary

Use the in-process `log_analytics` tool from the `pi-log-analytics` skill. Begin with catalog discovery, then issue typed `select` or `aggregate` requests over registered structural source and column IDs. Do not run an external command, SQL statement, or filesystem query.

Use the canonical `session_events` source for recent session screens and restrict the request to structural identifiers, timestamps, event labels, tool names, status, and counts. Use `metric_events`, workflow, orchestration, or friction sources only when the screen requires their structural lifecycle records. The tool refreshes sources internally and bounds each operation to 1,000 rows, 256 KiB, and 5 seconds.

Example typed screen request:

```json
{
  "operation": "aggregate",
  "source": "session_events",
  "groupBy": ["session_id", "tool_name", "status"],
  "measures": [{"kind":"count","as":"events"}],
  "filters": [{"column":"timestamp","op":"gte","value":"2026-08-11T00:00:00Z"}],
  "limit": 100
}
```

The generic tool exposes no prompt, transcript, tool-result, argument, evidence, reason, path, filename, or terminal-output fields. A separately authorized domain reader is required for bounded evidence review.

| Rule | Requirement |
| --- | --- |
| Source | Prefer canonical `session_events`; do not combine overlapping history records without deduplication. |
| Window | Screens use the most recent 14 days unless the command contract states another window. |
| Output | Emit structural identifiers, labels, hashes, and counts only. Never retrieve raw content. |
| Interpretation | Every hit requires bounded manual review; a hit is not a prevalence or causality claim. |
| Correlation | Exact and deterministic edges are authoritative. Unique inferred edges are opt-in, provenance-marked, and never decision authority. |
| Failure | Report malformed, changing, or unavailable sources as bounded gaps; do not widen scope or use a fallback process. |

## Screen guidance

- For identical-edit retry candidates, aggregate by the registered tool and status identifiers, then use the owning bounded domain reader for any authorized coordinate review. Equal structural results do not establish equivalent arguments, targets, or relevant state.
- For cross-client writes, filter structural tool and session metadata and use the owning domain boundary for any separately authorized path check. Authorized cross-client work is not an incident.
- For duplicate verification, aggregate successful structural tool events and manually determine whether repeated results were verification or whether inputs, state, or failure signatures differed. Mandatory, user-requested, safety, and held-out checks are not incidents merely because output matches.
- For metadata outliers, aggregate session event counts and duration fields. Treat thresholds as triage thresholds, not causal cutoffs.
- For manual review, use workflow outcome reports and bounded domain feedback records. Retain only sanitized report-style citations and metadata; do not copy raw feedback or workflow payloads into tracked files.
