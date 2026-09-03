# Overengineering and Churn Screens

## Boundary

Use this reference to screen settled Pi sessions for known overengineering and churn patterns. Use `analysis-workflow` for an active failure and this skill's general workflow for unrelated log analysis.

Historical evidence, decisions, baselines, and experiments live in [`pi/docs/pi-research-report.md`](../../docs/pi-research-report.md). This reference defines the screening method; it does not replace that historical record.

## Failure classes

| Class | Screen for | Required manual check |
| --- | --- | --- |
| RG-1 | Repeated failed edit-family calls | Arguments, target, relevant state, and result were materially equivalent |
| RG-2 | Repeated successful verification or review | Inputs, relevant state, and failure signature did not change |
| RG-3 | Writes to another client's owned paths | The active client did not own or authorize the write |
| RG-4 | Workflow ceremony rejected by the user | Direct feedback confirms rejection; volume alone is insufficient |

## Procedure

1. Run the relevant query below.
2. Treat matches as candidates, not confirmed incidents or prevalence estimates.
3. Inspect the cited session and apply the manual check for its failure class.
4. Report only confirmed cases with sanitized citations. Do not copy raw prompts, arguments, responses, or tool output into tracked files.
5. Update historical records only when the user requests research or experiment tracking.

## Interpretation

- Snapshot medians in the research report are unadjusted associations, not causes or treatment effects.
- Disposable `.tmp` research artifacts may no longer exist.
- Do not re-audit the settled corpus unless the user requests it.
- Do not count raw errors or repeated calls as churn without checking whether the target, inputs, state, and result were materially equivalent.

## Bounded analytics boundary

Use the in-process `log_analytics` tool. Start with catalog discovery, then issue bounded SQL queries against registered views. Do not run an external command or filesystem query.

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
  "sql": "SELECT sha256(_source_file) AS session_key, tool_name, tool_call_id, count(*) AS events, sum(CASE WHEN is_error THEN 1 ELSE 0 END) AS errors FROM session_entries WHERE _timestamp >= $start AND message_role = 'toolResult' GROUP BY sha256(_source_file), tool_name, tool_call_id ORDER BY events DESC LIMIT 100",
  "parameters": {"start": "2026-08-19T00:00:00Z"},
  "maxRows": 100
}
```

Each selected view also exposes the complete original JSON record in `record`, plus `_source_file`, `_record_key`, and `_timestamp`. Treat `record` as potentially sensitive; request it only for an explicitly authorized, bounded investigation. Prefer structural columns, and use a separately authorized domain reader for evidence review. The screen identifies a session only as `sha256(_source_file)` and selects structural fields and counts; arguments and results are reserved for separately authorized correlation by exact tool-call ID.

| Rule | Requirement |
| --- | --- |
| Source | Prefer canonical `session_entries`; do not combine overlapping history records without deduplication. |
| Window | Screens use the most recent 14 days unless the command contract states another window. |
| Output | Emit structural identifiers, labels, and counts only. Never retrieve raw content. |
| Interpretation | Every hit requires bounded manual review; a hit is not a prevalence or causality claim. |
| Correlation | Exact and deterministic edges are authoritative. Unique inferred edges are opt-in, provenance-marked, and never decision authority. |
| Failure | Report malformed, changing, or unavailable sources as bounded gaps; do not widen scope or use a fallback process. |

## Screen guidance

Use a bounded query with the smallest relevant source set for each screen:

- **Identical-edit retry candidates:** Group `session_entries` by `sha256(_source_file)`, `tool_name`, and `tool_call_id` for `message_role = 'toolResult'`; use the owning bounded domain reader for any authorized coordinate review. Equal structural results do not establish equivalent arguments, targets, or relevant state.
- **Cross-client writes:** Filter structural `tool_name`, `sha256(_source_file)`, and event metadata; use the owning domain boundary for any separately authorized path check. Authorized cross-client work is not an incident.
- **Duplicate verification:** Query successful structural tool events and manually determine whether repeats were verification or whether inputs, state, or failure signatures differed. Mandatory, user-requested, safety, and held-out checks are not incidents merely because output matches.
- **Metadata outliers:** Query per-session event counts and available timestamp or token-count fields. Treat thresholds as triage thresholds, not causal cutoffs.
- **Manual review:** Use workflow outcome reports and bounded domain feedback records. Retain only sanitized report-style citations and metadata; do not copy raw feedback or workflow payloads into tracked files.
