---
name: logging-observability
description: "Structured logging, distributed tracing, and debugging patterns. Triggers: logging, observability, tracing, debugging, structured logging, log aggregation, performance metrics, monitoring, correlation ID, trace ID."
---

# Logging & Observability Skill

Compact index for logs, metrics, traces, debugging instrumentation, and alerting work.

## Auto-activate when

- Adding or reviewing logging, metrics, traces, spans, dashboards, alerts, SLOs, debug output, correlation IDs, or telemetry pipelines.
- User mentions logging, observability, tracing, monitoring, Prometheus, OpenTelemetry, structured logs, log aggregation, metrics, performance counters, trace ID, or correlation ID.
- Do not use for generic bug fixing unless instrumentation or diagnostic output is being changed.

## Project-specific rules

- Prefer deterministic code/tool output for status handling and debugging decisions.
- Match the local logging mechanism; do not introduce `print` in structured-logger code or vice versa.
- Do not log secrets, tokens, private paths, PII, credentials, or raw request/response bodies unless explicitly scrubbed.
- Fail explicitly for missing telemetry dependencies; do not silently disable observability in production paths unless the project already does so.

## Practical steps

1. Define the operational question the signal must answer.
2. Use structured fields for identifiers, status, duration, operation, and error class.
3. Keep cardinality bounded; avoid user input, paths, UUIDs, or stack traces as metric labels.
4. Validate by exercising the code path and checking emitted logs/metrics/traces when practical.

## Quick validation

| Purpose | Checks |
|---|---|
| Structured logs | Run focused path and inspect fields, levels, and redaction |
| Metrics | Confirm names, units, labels, and bounded cardinality |
| Traces | Confirm span boundaries, parent/child relation, status, and attributes |
| Alerts | Confirm alert maps to an SLO/user impact and has runbook context |

## Anti-patterns

- Logging everything at `info` or hiding useful failures at `debug`.
- High-cardinality metric labels from IDs, emails, URLs, paths, or exception messages.
- Adding telemetry without a stated debugging/operations question.
- Swallowing exceptions after logging them.

## Optional references

- [reference.md](reference.md) - detailed guidance, examples, sources, and language library notes.
