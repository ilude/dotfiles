# Pi Observability Timing

Pi timing instrumentation writes metadata-only span events through the existing metrics stream at `~/.pi/agent/logs/metrics-YYYY-MM-DD.jsonl` (or `PI_METRICS_DIR` in tests). This path is local generated state and must not be committed.

## Event policy

Timing events use `event: "timing_span"` with `category`, `name`, `startWallTime`, `endWallTime`, monotonic `durationMs`, `status`, `spanId`, optional `parentId`, and allow-listed metadata. Prompt bodies, tool/command output bodies, file contents, API keys, raw session IDs, and secret-like values are excluded.

## Clock contract

Durations use a monotonic clock (`performance.now()` in Node) and milliseconds. Wall-clock timestamps are included only for correlation. Tests can inject a fake clock for deterministic duration assertions.

## Persistence and retention

Metrics persistence is best-effort: failures return `null` and must not change workflow behavior. Metrics supports daily filenames and a soft `maxFileBytes` marker (`metrics_rotation_needed`) for retention/rotation handling.

## Runtime/source boundary

Before adding a new timing output path, verify it is ignored/untracked, for example:

```bash
git check-ignore -v .pi/
```

Generated observability files, session JSONL, traces, caches, and local logs remain runtime state. Track only source code, tests, docs, and intentional config.
