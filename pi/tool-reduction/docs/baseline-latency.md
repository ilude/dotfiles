# reduce.py baseline latency

## After lazy-load index (current)

| Field | Value |
|---|---|
| OS | Windows 11 |
| Python | 3.14.4 |
| Reducer version (commit) | 1dc785a28b81aeb226050c308db3e70495f1b9f1 |
| Iterations | 10 |
| p50 | 524.3 ms |
| p95 | 621.3 ms |
| p99 | 621.3 ms |

Measured by `pi/tool-reduction/tests/bench_reduce.py` against the
`git-status-sample.txt` fixture.

With argv0-indexed lazy loading, each call opens 11 git rule files instead of
107, cutting Windows Defender inspection overhead from ~8-10 s/call to ~0.5 s/call.

## Before lazy-load index

| Field | Value |
|---|---|
| OS | Windows 11 |
| Python | 3.14.4 |
| Reducer version (commit) | 1dc785a28b81aeb226050c308db3e70495f1b9f1 |
| Iterations | 10 |
| p50 | 8892.1 ms |
| p95 | 14908.1 ms |
| p99 | 14908.1 ms |

Full scan of 107 rule files per call; each file open intercepted by Windows Defender.
