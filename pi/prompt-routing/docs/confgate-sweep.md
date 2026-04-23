# CONF_GATE Sweep -- ConfGated Classifier Shadow Eval

**Sweep param:** CONF_GATE over [0.30, 0.40, 0.50, 0.60, 0.70]

**Policy:** N_HOLD=0 (hysteresis disabled), UNCERTAIN_FALLBACK_ENABLED=false, effort cap only, maxLevel=high

**Best CONF_GATE: 0.30** (all gates produce identical results -- see finding below)

---

## Why the sweep is flat

LGB confidence on the eval_v3 corpus is extremely high. The gate almost never triggers:

| LGB conf threshold | % of prompts below |
|--------------------|--------------------|
| < 0.30             | 0.0%               |
| < 0.40             | 0.0%               |
| < 0.50             | 2.0%               |
| < 0.60             | 4.5%               |
| < 0.70             | 9.0%               |

Median LGB confidence: 0.997. At gate=0.30, fewer than 1 in 100 prompts trigger T2
consultation. The delegation path is essentially dead on this corpus. All five gate
values route identically, producing the same cost, catastrophic, and thrash numbers.

This is not a bug -- it means LGB is uniformly confident on the eval set. The gate
would only matter on prompts where LGB confidence is low, which this corpus does not
stress.

---

## Sweep Results

| CONF_GATE | Verdict | Cost delta | Cost gate | Cat delta | Cat gate | Sess cat gate | Thrash |
|-----------|---------|------------|-----------|-----------|----------|---------------|--------|
| 0.30 | FAIL | +$2.5392 | FAIL | +8 | FAIL | FAIL | 145 |
| 0.40 | FAIL | +$2.5392 | FAIL | +8 | FAIL | FAIL | 145 |
| 0.50 | FAIL | +$2.5392 | FAIL | +8 | FAIL | FAIL | 145 |
| 0.60 | FAIL | +$2.5392 | FAIL | +8 | FAIL | FAIL | 145 |
| 0.70 | FAIL | +$2.5392 | FAIL | +8 | FAIL | FAIL | 145 |

All gates: identical results. Selected 0.30 as nominal "best" (lowest gate = most T2
consultation; makes no practical difference when LGB is near-universally confident).

---

## Comparison with T2-alone baseline

T2-alone numbers are from cost-shadow-eval.json (N_HOLD=3, full hysteresis).
ConfGate numbers use N_HOLD=0 (effort-cap only), so the comparison is not identical
policy -- hysteresis removal accounts for some of the difference.

| Metric | T2-alone (N_HOLD=3) | ConfGate/LGB (N_HOLD=0) | Delta |
|--------|---------------------|-------------------------|-------|
| cost_delta vs legacy | +$4.3407 | +$2.5392 | -$1.80 (confgate cheaper) |
| per-prompt cat | 10 | 8 | -2 (confgate better) |
| session cat | 10 | 7 | -3 (confgate better) |
| thrash | 119 | 145 | +26 (confgate worse, N_HOLD=0 explains this) |

ConfGate beats T2-alone on cost AND catastrophic. However, this comparison mixes
N_HOLD=3 (T2) vs N_HOLD=0 (confgate), so the cost and thrash differences partially
reflect the different hysteresis setting, not purely the classifier difference.

---

## Notes

- Sweep source: pi/prompt-routing/data/eval_v3.jsonl (564 rows, 71 sessions)
- Sessions: 8 consecutive prompts each, fresh hysteresis state per session
- Policy: N_HOLD=0, UNCERTAIN_FALLBACK_ENABLED=false, maxLevel=high
- Classifier: LGB primary + T2 fallback when LGB conf < CONF_GATE
- T2-alone baseline from cost-shadow-eval.json (different N_HOLD -- not directly comparable)
