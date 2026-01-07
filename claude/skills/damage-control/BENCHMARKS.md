# Damage Control Benchmark History

Track pattern matching performance over time. Run `uv run benchmark.py` to add entries.

| Date | Bash Patterns | Path Patterns | Iterations | Avg (ms) | P50 (ms) | P95 (ms) | P99 (ms) | Notes |
|------|---------------|---------------|------------|----------|----------|----------|----------|-------|
| 2026-01-07 14:55 | 162 | 109 | 218 | 40.9994 | 55.0167 | 71.5792 | 98.8989 | Baseline before exfil protection patterns |
| 2026-01-07 15:05 | 162 | 163 | 218 | 58.2236 | 59.6982 | 132.2526 | 212.4065 | After exfil protection patterns |
| 2026-01-07 15:41 | 162 | 163 | 218 | 37.1633 | 45.6479 | 112.4468 | 146.7319 | After Phase 1 optimizations (pre-compiled patterns) |
