# Pi Observability Timing

## Purpose

Document Pi timing instrumentation as an agent-workflow support pattern: collect useful metadata about agent/tool spans without committing runtime logs or exposing sensitive content.

## Metrics stream

Pi timing instrumentation writes metadata-only span events through the existing metrics stream:

```text
~/.pi/agent/logs/metrics-YYYY-MM-DD.jsonl
```

Tests can override this with `PI_METRICS_DIR`. Metrics paths are local generated state and must not be committed.

## Event policy

Timing events use:

```text
event: "timing_span"
```

Allowed fields include `category`, `name`, `startWallTime`, `endWallTime`, monotonic `durationMs`, `status`, `spanId`, optional `parentId`, and allow-listed metadata.

Excluded from timing events:

- prompt bodies
- tool or command output bodies
- file contents
- API keys
- raw session IDs
- secret-like values

## Clock contract

Durations use a monotonic clock, such as `performance.now()` in Node, and milliseconds. Wall-clock timestamps are included only for correlation. Tests can inject a fake clock for deterministic duration assertions.

## Persistence and retention

Metrics persistence is best-effort. Persistence failures return `null` and must not change workflow behavior.

Metrics supports daily filenames and a soft `maxFileBytes` marker, `metrics_rotation_needed`, for retention/rotation handling.

## Runtime/source boundary

Before adding a new timing output path, verify it is ignored or untracked, for example:

```bash
git check-ignore -v .pi/
```

Generated observability files, session JSONL, traces, caches, and local logs remain runtime state. Track only source code, tests, docs, and intentional config.

## Workflow relevance

This pattern complements [[../workflow-ideas/pipelines-and-policies]]: run ledgers and policy gates need enough observability to debug workflow cost and failures, but should preserve Pi's source-vs-runtime boundary and avoid content capture.
