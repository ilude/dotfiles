# T6 Privacy-conscious telemetry

Status: implemented.

Commands and exit codes are recorded in the task response. Evidence notes:

- Runtime `routing_decision` payloads use `schema_version: router-log-v1`.
- Default payloads include `prompt_hash` and omit raw prompt text; `prompt_excerpt` is `null` unless the explicit local opt-in redacted excerpt path is enabled.
- Same-turn provider telemetry and background `emitRoutingDecision` share the same telemetry payload builder.
- Purge/rotation behavior is documented in `pi/prompt-routing/analytics.md`.
