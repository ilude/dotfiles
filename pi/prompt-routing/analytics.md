# Prompt Router Analytics

Use DuckDB through this uv project for prompt-router analytics. Do not require a
system DuckDB install.

## Logs

- `logs/routing_log.jsonl`: classifier-side log. New entries include a
  per-invocation `route_decision_id` and use `prompt_hash` + redacted
  `prompt_excerpt` by default, not full prompt text.
  Set `LOG_ROUTING_PROMPT=1` only for explicit debugging/audit sessions that
  need self-contained prompts.
- `~/.pi/agent/traces/*.jsonl`: Pi transcript logs. `routing_decision` events
  use payload `schema_version: router-log-v1`, include `prompt_hash`,
  classifier mode, raw/applied canonical routes, candidate margin/candidates,
  previous route, rule fired, context capsule, provider/model/profile, latency,
  fallback reason, selected model size, and model-switch metadata. Default
  transcript telemetry stores no raw prompt and no unredacted excerpt; the
  optional `PI_ROUTER_EXCERPTS_OPT_IN=1` path records only character-redacted
  excerpts for local debugging.

Join the two by `route_decision_id`. Existing records without IDs remain
compatible through a deterministic per-prompt-hash occurrence fallback.

## Privacy, purge, and rotation

Router telemetry inherits local Pi transcript retention/rotation for
`~/.pi/agent/traces/*.jsonl`; classifier logs remain local under
`pi/prompt-routing/logs/`. To purge router telemetry, remove the relevant local
trace JSONL files and `pi/prompt-routing/logs/routing_log.jsonl` after stopping
Pi. Do not copy logs into evidence unless a secret/sentinel scan passes.

## Query

```bash
uv run --project pi/prompt-routing python pi/prompt-routing/router_analytics.py
uv run --project pi/prompt-routing python pi/prompt-routing/router_analytics.py --limit 100 --csv
```

The script creates a DuckDB `router_session_view` with classifier output,
runtime/applied route, actual model identity, and prompt excerpt. It projects a
fixed column schema and keeps heterogeneous trace payload fields bounded instead
of using `read_ndjson_auto` over the trace glob. Other DuckDB readers should do
the same: declare the trace envelope columns explicitly and load `payload` as
`JSON` before creating event-specific views.
