# Prompt Router Analytics

Use DuckDB through this uv project for prompt-router analytics. Do not require a
system DuckDB install.

## Logs

- `logs/routing_log.jsonl`: classifier-side log. Future entries use
  `prompt_hash` + `prompt_excerpt` by default, not full prompt text. Set
  `LOG_ROUTING_PROMPT=1` only for explicit debugging/audit sessions that need
  self-contained prompts.
- `~/.pi/agent/traces/*.jsonl`: Pi transcript logs. `routing_decision` events
  contain runtime routing fields such as `selected_model_size`, `actual_model`,
  and `model_switch_applied`.

Join the two with `prompt_hash`.

## Query

```bash
uv run --project pi/prompt-routing python pi/prompt-routing/router_analytics.py
uv run --project pi/prompt-routing python pi/prompt-routing/router_analytics.py --limit 100 --csv
```

The script creates a DuckDB `router_session_view` with classifier output,
runtime/applied route, actual model identity, and prompt excerpt.
