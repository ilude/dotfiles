---
name: pi-log-analytics
description: Search existing Pi sessions and usage records across default, legacy, or both profiles with bounded read-only DuckDB SQL. Use for session discovery, tool failures, content lookup, and local usage analysis, not new telemetry or generic databases.
---

# Pi log analytics

1. Activate `log_analytics` through `tool_search` with `session analytics` or `usage logs` keywords. It is deferred at session start and stays active until the next session.
2. Use `{"operation":"catalog"}` for source names and columns. `session_entries` supports default and legacy; `bedrock_usage` and `codex_cache_observations` support default only.
3. Omitted `profiles` selects the active registered profile, normally default. Use `["legacy"]` or `["default","legacy"]` explicitly. Never assume a default-only result searched legacy too.
4. Start targeted investigations with `{"operation":"sessions","profiles":["default","legacy"],"cwd":"/exact/project/path","maxRows":50}`. Cwd is an exact header string, not a path to read. Discovery reads bounded header metadata, not transcripts. Follow `nextCursor` with the same filters to finish the listing.
5. Copy returned `ref` objects into `sessionRefs` to query exact sessions. This reduces DuckDB staging; directory/header discovery still occurs. References contain profile, native session ID, and an opaque file discriminator. Do not invent file keys or supply filesystem roots.
6. Submit one read-only SELECT query, including CTEs, native JSON functions, and named scalar parameters. Use SQL timestamp predicates for event time. An old session may contain recent events, so session creation dates and file modification times are not event-time filters.
7. Prefer profile/session/record coordinates, error labels, names, counts, and usage fields. Request bounded transcript content only when needed for the user's investigation. Session records and returned tool results can contain sensitive content; do not export or commit them.
8. Report selected profiles/sources, filters, scan costs, and limitations. Over-limit or unavailable input fails explicitly; a successful bounded output does not mean every row was returned. Do not broaden scope or increase resource limits silently.

See [reference.md](reference.md) for the API, SQL examples, limits, and performance semantics.

## Preserved boundaries

- Existing JSONL remains authoritative. No writes, history migration, persistent DuckDB index, disk spill, copied transcript corpus, or new logging producer.
- No legacy orchestration, workflow-friction, permissions, or Damage Control telemetry. Default Damage Control keeps its existing in-memory evidence only.
- No arbitrary roots, filesystem SQL functions, extension installation/loading, mutations, multiple statements, or EXPLAIN. EXPLAIN ANALYZE can execute writes, so only native SELECT statements are admitted.
- Count stored records by default. Forks and branches may duplicate history; no automatic semantic deduplication. ID-less record hashes are not unique occurrence IDs.
- Codex observations have no timestamps or session IDs. Never infer those fields from file mtime or observation order. Repeated identical observations count separately.
- `/usage` remains the owned user-facing usage report. This port does not add legacy report commands.
