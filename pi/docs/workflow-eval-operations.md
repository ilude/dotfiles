# Workflow Dispatch Telemetry Operations

This document covers the mechanically recorded dispatch data described in `pi/docs/workflow-eval-telemetry.md`.

## Current scope

`pi/lib/workflow-telemetry.ts` appends one episode and one dispatch event when `/plan-it`, `/prd-it`, `/review-it`, or `/do-it` runs. It does not infer whether implementation, validation, review, manual gates, or archiving later completed.

Plans and workflow prompts record ordinary bounded evidence in their checklist and Execution Status. They do not emit telemetry-shaped prose.

## Storage

Runtime JSONL lives under `~/.pi/workflow-telemetry/`:

```text
episodes.jsonl
{episode_id}/events.jsonl
```

This directory is local runtime state. Do not commit it. DuckDB files are optional rebuildable query caches and are also uncommitted.

## Query

Run the repository reader:

```bash
python pi/scripts/workflow-eval-query.py
```

Use a separate root when validating fixtures:

```bash
python pi/scripts/workflow-eval-query.py \
  --telemetry-dir .tmp/workflow-telemetry \
  --no-duckdb
```

The summary reports episode counts by command and event counts by type. An absent directory is reported as empty local state rather than a workflow failure.

DuckDB can query the same JSONL directly:

```sql
SELECT command, count(*) AS dispatches
FROM read_ndjson_auto(
  '~/.pi/workflow-telemetry/episodes.jsonl',
  union_by_name = true
)
GROUP BY command
ORDER BY command;
```

## Privacy and retention

Dispatch records contain command arguments but no command output. Keep secrets out of workflow command arguments. The runtime currently has no automatic retention job; purge only the exact local telemetry directory after stopping writers and confirming its path.

## Validation

```bash
cd pi && pnpm test workflow-telemetry.test.ts workflow-dispatch.test.ts
cd pi && pnpm run typecheck
python pi/scripts/workflow-eval-query.py --telemetry-dir .tmp/workflow-telemetry --no-duckdb
```
