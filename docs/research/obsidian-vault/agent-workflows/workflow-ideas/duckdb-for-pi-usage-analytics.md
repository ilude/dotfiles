---
status: research-note
source: local Pi usage-extension discussion
---

# DuckDB for Pi Usage Analytics

## Why this matters

Pi and Codex session logs are JSONL today. The current `/usage` extension parses them directly in TypeScript, which is simple and good enough for fixed reports, but DuckDB may become useful if usage analysis turns into richer local analytics.

## Useful signals

- DuckDB could normalize Pi/Codex usage events into queryable local tables.
- Useful tables might include `usage_events`, `pricing_snapshots`, `model_aliases`, and `report_runs`.
- This would make trend reports, ad hoc SQL, model/provider joins, and historical pricing comparisons easier.
- TypeScript integration options include DuckDB CLI via `pi.exec`, native `duckdb`, or `@duckdb/node-api`.
- CLI-first is likely the least risky if DuckDB is already installed for prompt routing.

## Possible Pi fit

- Keep the TypeScript parser as the default `/usage` path.
- Add an optional DuckDB backend only if we repeatedly need richer queries than 1/7/30/90-day summaries.
- Could share a local analytics store with prompt-routing experiments if that work proves stable.

## Risks / reasons not to build yet

- Native DuckDB Node bindings may add cross-platform install friction.
- A database adds state, migrations, cache invalidation, and debugging overhead.
- Current `/usage` needs are met by a deterministic TypeScript parser.
- Prematurely centralizing logs into DuckDB could make simple reports harder to trust.

## KISS recommendation

Do not build this yet. If usage analysis outgrows fixed reports, first prototype a DuckDB CLI-backed importer/report script against copied JSONL fixtures, then decide whether it belongs in the Pi extension.

## Related notes

- [pipelines-and-policies](pipelines-and-policies.md)
- [pi-observability-timing](../patterns/pi-observability-timing.md)
