# Effort-Routing Plan Close-Out

**Status:** shipped
**Completed:** 2026-04-23

---

## What Went Live

### T0 through T4 -- previously landed
All upstream waves completed as documented in the plan. See the plan at
`.specs/pi-router-effort-routing/plan.md` for per-task acceptance evidence.

### P0 bridge -- retained as fallback
The P0 hysteresis + static tier->effort mapping is retained in the code path
and exercised whenever the v3 classifier fails to return a schema-valid JSON
object. The TS-side null-fallback in `prompt-router.ts` holds the previous
applied route and logs a warning; routing never crashes.

### v3 ConfGate classifier -- live default
`classify.py` now defaults to `--classifier confgate`. ConfGate
(`classifier_confgate.py`) runs LightGBM as the primary route predictor and
consults T2 (LinearSVC) only when LGB confidence falls below
`CONF_GATE = 0.50`. Wire output includes an optional `ensemble_rule` field
(`lgb-confident` | `agree` | `t2-overrides` | `lgb-fallback`) for
observability. Both backing artifacts are SHA256-verified at load:
`models/router_v3.joblib` and `models/router_v3_lgbm.joblib`.

### Simplified runtime policy
Ship config (see `docs/settings-doc.md` for the full reference):

- `router.effort.maxLevel = "high"` -- blocks `xhigh`
- `router.policy.N_HOLD = 0` -- hysteresis hold disabled
- `router.policy.K_CONSEC = 1` -- tied to `N_HOLD`
- `router.policy.COOLDOWN_TURNS = 2` -- runtime escalation cooldown, useful
  for failure-signal escalation (`_escalateFor(n)`)
- `router.policy.UNCERTAIN_THRESHOLD = 0.55` -- dormant
- `router.policy.UNCERTAIN_FALLBACK_ENABLED = false` -- disabled after
  shadow-eval showed it blocked legitimate downgrades
- `router.policy.DOWNGRADE_THRESHOLD = 0.85` -- dormant at N_HOLD=0

Effective behavior: classifier recommendation drives routing every turn,
subject only to the effort cap and any active temporary escalation cooldown.

---

## Measured Performance

Source: shadow-eval on `data/eval_v3.jsonl` (564 prompts, 71 pseudo-sessions
of 8). Full detail in `docs/cost-shadow-eval-confgate.md`.

### ConfGate vs T2-alone (apples to apples, same policy)

| Metric | T2-alone (N_HOLD=0) | ConfGate (N_HOLD=0) | Delta |
|--------|---------------------|---------------------|-------|
| Total cost | $11.9040 | $11.2461 | -$0.658 (-20.6% on the over-legacy portion) |
| Per-prompt catastrophic | 10 | 8 | -2 |
| Session catastrophic | 10/71 | 7/71 | -3 |
| Thrash | 155 | 145 | -10 |

**ConfGate beats T2-alone on both cost and catastrophic under identical
policy.** This is the apples-to-apples comparison that justifies the default
swap.

### vs Legacy (absolute)

Both classifiers project more expensive than the legacy oracle router on this
synthetic benchmark. Legacy uses flat tier mapping with no effort control;
the corpus derives prompts from `complexity_tier`, which is itself the oracle
the legacy router uses, so the benchmark is structurally biased toward it.
Real-traffic cost is expected to be lower because legacy routes `mid` ->
Sonnet uniformly with no effort control, while ConfGate's joint
`(tier, effort)` predictions capture easy Haiku-tier and low-effort slices
that legacy flattens.

---

## Rejected Alternatives

- **Veto ensemble** (`classifier_ensemble.py`, retained as artifact): reduced
  catastrophic to 5 but inflated cost by +44.5% vs legacy. Veto always
  escalates on disagreement, which over-routes to Opus on prompts legacy
  correctly mapped to Sonnet. Not calibrated.
- **Uncertainty fallback** (`UNCERTAIN_FALLBACK_ENABLED`): blocked downgrades
  because T2 softmax probabilities are low-entropy across 12 joint classes,
  so the fallback fired constantly. Disabled in settings.
- **Hysteresis hold** (`N_HOLD >= 1`): carried Opus/Sonnet over additional
  turns beyond what the classifier recommended, inflating cost. Set to zero
  in settings.

---

## Operator Notes

### Settings knobs (live)
`pi/settings.json` under `router.policy.*` and `router.effort.*`. Full
per-key reference: `pi/prompt-routing/docs/settings-doc.md`.

### Commands
- `/router-status` -- current tier, effort, policy snapshot, model ladder
- `/router-explain` -- full decision trail for the last turn (classifier
  raw, applied route, rule fired, current model+effort+cap)
- `/router-reset` -- clear session state
- `/router-off` / `/router-on` -- disable / enable routing entirely

### Logs
- Classifier audit log (Python side, when enabled):
  `pi/prompt-routing/logs/routing_log.jsonl`
- Turn-by-turn router decisions are surfaced via `/router-explain`; no
  dedicated TS-side log file ships yet. Instrumenting that is the primary
  follow-up.

### Debugging flow
If `/router-explain` shows `Rule fired: null-fallback`, the classifier
failed. Reproduce outside the agent with
`python pi/prompt-routing/classify.py "your prompt"`. Schema violations are
caught at the TS boundary in `safeParseClassifierOutput` and the router
keeps the previous applied route.

---

## Follow-Up Plan Scope

1. **Instrument real `routing_log.jsonl`** on the TS side so every turn's
   decision (prompt hash, classifier JSON, applied route, rule fired,
   cost-relevant fields) is persisted. Today only the Python classifier
   writes its own audit log.
2. **Re-run shadow-eval on 30 days of real traffic** once that log
   accumulates. The expectation is that real-world cost will look
   materially better than on `eval_v3` because the eval corpus is biased
   toward legacy-oracle.
3. **Iterate** if real-traffic cost is not in line with expectation:
   revisit CONF_GATE threshold, consider re-enabling a calibrated
   uncertainty path, or retrain ConfGate on a corpus that includes real
   traffic labels.
