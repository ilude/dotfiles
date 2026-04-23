# UNCERTAIN_THRESHOLD Sweep -- Ensemble Shadow Eval

**Selected threshold: 0.35**  (verdict: FAIL)

## Why this threshold was selected

No threshold in the sweep range passed both gates. The selected threshold (0.35) produced the best result: lowest catastrophic count and lowest cost delta among all FAIL configurations.

## Sweep Results

| Threshold | Verdict | Cost delta | Cost gate | Cat delta | Cat gate | Sess cat gate | Thrash |
|-----------|---------|------------|-----------|-----------|----------|---------------|--------|
| 0.25 | FAIL | +$3.8980 | FAIL | +5 | FAIL | FAIL | 127 |
| 0.3 | FAIL | +$3.8980 | FAIL | +5 | FAIL | FAIL | 127 |
| 0.35 | FAIL <-- selected | +$3.8678 | FAIL | +5 | FAIL | FAIL | 129 |
| 0.4 | FAIL | +$3.8678 | FAIL | +5 | FAIL | FAIL | 129 |
| 0.45 | FAIL | +$3.8678 | FAIL | +5 | FAIL | FAIL | 129 |
| 0.55 | FAIL | +$3.8678 | FAIL | +5 | FAIL | FAIL | 133 |

## Notes

- Cost gate: v3 projected cost <= legacy projected cost.
- Cat gate (per-prompt): v3 catastrophic_under_routing count - legacy count <= 0.
- Sess cat gate: session-level catastrophic delta <= 0.
- Thrash: consecutive model switches across replay sequence.
- Ensemble confidence formula: agree=max(t2,lgbm); veto=winning model's confidence.
- Sweep range: [0.25, 0.3, 0.35, 0.4, 0.45, 0.55]
- Source: data\eval_v3.jsonl
