---
name: logging-observability
description: "Observability design and debugging. Use for logging, structured logs, metrics, tracing, monitoring, alerting, SLOs, correlation IDs, trace IDs, and log aggregation. Not for general debugging without telemetry."
---

# Logging and Observability

**Auto-activate when:** working with logs, metrics, traces, monitoring, alerting, SLOs, correlation IDs, trace IDs, or telemetry-driven debugging.

## Boundary

Use this skill only when telemetry is central to the task. Use `analysis-workflow` for general investigation and `code-review` for diff review.

## Core Principle

Observability lets operators infer internal state from external signals. Instrument the questions people must answer during incidents.

## Practical Steps

1. Identify the operational question: latency, errors, saturation, causality, or audit trail.
2. Pick the right signal: logs for events, metrics for trends, traces for request flow.
3. Add correlation IDs across boundaries.
4. Keep fields structured and stable.
5. Alert on user impact or error-budget burn, not noisy internals.
6. Validate that telemetry appears where operators will query it.

## Signal Guide

| Signal | Best for | Avoid |
| --- | --- | --- |
| Logs | discrete events, audits, failures | high-cardinality metrics replacement |
| Metrics | rates, latency, saturation | per-request debugging |
| Traces | cross-service flow and bottlenecks | business reporting |

## Structured Log Fields

Prefer stable names: timestamp, level, message, service, environment, request_id/trace_id, user/account identifier when safe, operation, outcome, duration_ms, error type. Do not add redundant derived fields when consumers can derive them reliably from existing structured fields.

## Anti-Patterns

- Logging secrets or raw PII.
- Alerting on every exception instead of user impact.
- Free-text logs where structured fields are needed.
- Redundant derived fields that duplicate existing structured data without a clear query need.
- Adding telemetry without a query/use case.

## Quick Reference

Instrument to answer: what happened, who/what was affected, where did it fail, and how bad is it?
