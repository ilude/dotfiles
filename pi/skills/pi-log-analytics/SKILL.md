---
name: pi-log-analytics
description: "Pi session, trace, metrics, workflow-friction, workflow-telemetry, usage, or local JSONL analysis with DuckDB. Use the registered catalog and bounded SQL query interface for Pi runtime logs. Not for adding telemetry, generic SQL/database design, or non-Pi logs."
---

# Pi Log Analytics

## Boundary

Use the registered in-process `log_analytics` tool to inspect existing Pi runtime data. Use the typed Pi command surfaces for reports such as `/find-fails`, `/usage`, `/extension-stats`, `/skill-stats`, `/orchestration-stats`, and workflow-friction diagnostics. Use `logging-observability` to design or add telemetry, `analysis-workflow` for debugging without telemetry, and `database` for generic database work.

## Governing principle

JSONL is the append-only source of truth. The local DuckDB store and its projections are disposable read-model state. No analytics operation rewrites authoritative JSONL or starts a helper process.

## Workflow

1. Ask `log_analytics` for `{"operation":"catalog"}` before selecting an unfamiliar source.
2. Submit `{"operation":"query","sources":["<source-id>"],"sql":"<DuckDB query>","parameters":{...},"maxRows":...}`. SQL may use CTEs, date predicates, JSON functions, and scalar parameters, but only registered same-named views are available as filesystem boundaries. The catalog lists each view and its typed convenience columns.
3. Keep requests bounded. The tool refreshes registered sources internally and enforces limits of at most 1,000 rows, 256 KiB of encoded output, and 5 seconds per operation. Cancellation and unknown source IDs fail explicitly; results report truncation.
4. Each selected view includes the complete original JSON record in `record`, plus `_source_file`, `_record_key`, `_timestamp`, and optional typed convenience columns. Treat `record` as potentially sensitive transcript or operational content: request it only for an explicitly authorized bounded investigation. Prefer identifiers, timestamps, event and status labels, names, token and duration counts, costs, and byte counts when content is not needed.
5. For recurring tool failures, run `/find-fails`. It starts one ordinary active-session analysis turn over the preceding seven days with the normal `log_analytics`, repository inspection, focused read-only command, current-test, and Git-history capabilities. Group failure families and distinct-session/day evidence before choosing representative exact call/result pairs. Separate expected outcomes from defects, investigate current implementation and onset evidence, report prioritized remedies and not-candidates, and stop without code changes or decision writes.
6. When screening settled sessions for overengineering or churn, read [Overengineering and churn screens](overengineering-churn.md) and follow its RG-1 through RG-4 method and bounded query rules.
7. Use `/usage`, `/extension-stats`, `/skill-stats`, `/orchestration-stats`, and workflow-friction commands for their characterized reports rather than reconstructing those reports through ad hoc reads. These commands use typed in-process readers and preserve their documented windows, ordering, and limits.
8. Report the source IDs, time window, filters, row counts, and any missing or malformed source that limits the conclusion. Treat correlation provenance as evidence metadata, not as permission to decide.

## Safety

- Treat session and trace sources as potentially sensitive because the generic query can return complete original records.
- Do not combine overlapping session and history sources without explicit session-level deduplication.
- Keep bounded analysis local and disposable. Never commit DuckDB, copied runtime data, or exports.
- The generic query model includes complete original records and is therefore content-bearing. Treat session and trace records as potentially sensitive; bounded domain readers may provide narrower separately authorized evidence retrieval.
- Exact and deterministic correlations take precedence. Unique inferred correlations are opt-in, provenance-marked, and never decision authority.
- Append or refresh failures are observational gaps and must not break the primary Pi operation.

## Anti-patterns

- Running an external interpreter, package environment, replacement command, or subprocess for Pi JSONL analytics.
- Supplying SQL, expressions, paths, pragmas, table functions, extension commands, or filesystem functions to `log_analytics`.
- Scanning raw prompt, transcript, tool argument, tool output, workflow evidence, or terminal content when structural metadata answers the question.
- Treating the disposable DuckDB store as authoritative state.
- Treating timestamp proximity alone as a correlation or allowing inferred correlation to authorize a decision.
