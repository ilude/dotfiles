# Route-Balanced Subset Results

## Summary

Three route-balanced routellm sandbox variants were evaluated from the passing
250-row routellm ablation.

Source:

```text
pi/prompt-routing/experiments/retraining/ablation-routellm-20260526175457-agentH/candidates.jsonl
```

All outputs were written under ignored experiment directories.

## Variants

| Variant | Rows | Gate result | Notes |
| --- | ---: | --- | --- |
| mini-heavy | 72 | failed | Extra catastrophic under-routing. |
| no-core-medium | 66 | passed | Removes dominant core-medium, but latency regressed. |
| confidence-conservative | 88 | passed | Safest variant from this batch. |

## Metrics

| Variant | Top-1 | Catastrophic | Over-routing | Mean latency |
| --- | --- | --- | --- | --- |
| mini-heavy | 0.5920 -> 0.5936 | 37 -> 38 | 0.2128 -> 0.2000 | 1207 us -> 960 us |
| no-core-medium | 0.5920 -> 0.5888 | 37 -> 37 | 0.2128 -> 0.2048 | 1008 us -> 1220 us |
| confidence-conservative | 0.5920 -> 0.5888 | 37 -> 37 | 0.2128 -> 0.2112 | 1107 us -> 980 us |

## Interpretation

The mini-heavy variant shows that over-weighting cheap routes can create safety
risk even when top-1 and over-routing look better.

The no-core-medium variant passes gates but has a latency regression in this run.
It may be useful as a stress test, not as the leading candidate.

The confidence-conservative variant is the safest of the three because it:

- passed all gates,
- preserved catastrophic under-routing count,
- avoided the mini-heavy safety regression,
- avoided hard exclusion of `core|medium`, and
- improved latency in this run.

## Relationship to the 60-row reviewed subset

The earlier 60-row reviewed subset still had the strongest sandbox metrics:

- catastrophic under-routing improved from 37 to 32,
- over-routing improved,
- all per-tier recall improved,
- latency improved.

However, these variants show that subset composition is fragile. Route balance
helps, but aggressive route shaping can introduce safety regressions.

## Recommendation

Do not promote any route-balanced subset directly yet.

Use the confidence-conservative and 60-row reviewed subset as references for the
next production-promotion dry run, but first add review-priority sidecars and
local workflow telemetry so the next subset is based on stronger signals.
