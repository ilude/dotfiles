# T0 Existing Pi Timing Sources

Metadata-only inspection only. Do not copy prompt bodies, tool outputs, file contents, raw session IDs, API keys, or secret-like values into artifacts.

## Sources inspected

- `.pi/` repo-local runtime directory: ignored by `.gitignore`; may contain local agent/session state.
- `pi/lib/metrics.ts`: existing structured JSONL metrics writer.
- `pi/extensions/subagent/index.ts`: subagent task lifecycle and spawned-process boundaries.
- `pi/extensions/workflow-commands.ts`: slash-command dispatch for `/review-it` and `/do-it`.

## Recoverable event shapes

- Existing `metrics.jsonl` / `metrics-YYYY-MM-DD.jsonl` records include `schemaVersion`, `id`, `ts`, `event`, optional `session`, and metadata-only `data`.
- Existing `task_status_change` records capture subagent task state transitions, agent name, retry count, error reason, and token usage, but not reliable monotonic durations.
- Existing wall-clock `ts` values can correlate events, but cannot alone prove nested span durations or recovery/panel timing.

## Gaps requiring instrumentation

- Monotonic duration fields for command, subagent, reviewer, panel, recovery, synthesis, and tool spans.
- Parent/child span IDs and bounded timing summaries.
- Explicit redaction/allow-listing for timing metadata.
