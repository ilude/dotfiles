# Manual/runtime and privacy validation

Date: 2026-05-11

Runtime evidence:
- `pi/prompt-routing/logs/routing_log.jsonl` contains current-session prompt router decisions for recent prompts, proving the merged router is active.
- `pi/prompt-routing/logs/transcript_debug.jsonl` contains `prompt_router_extension_loaded` and `emitRoutingDecision_called` events for current-session processes.

Privacy fix:
- `pi/prompt-routing/router.py` no longer writes `prompt_excerpt` by default.
- Prompt excerpts require `LOG_ROUTING_EXCERPT=1`; full prompts still require `LOG_ROUTING_PROMPT=1`.

Validation:
- `uv run --project pi/prompt-routing pytest pi/prompt-routing/tests/test_router_logging_privacy.py` passed.
- `cd pi/prompt-routing && uv run ruff check router.py tests/test_router_logging_privacy.py && uv run ruff format --check router.py tests/test_router_logging_privacy.py` passed.

Deployment validation:
- Not required; local dotfiles/Pi extension behavior only.
