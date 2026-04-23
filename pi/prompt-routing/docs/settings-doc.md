# Router Settings Reference

Location: `pi/settings.json` under the `router.*` key. JSON does not allow
comments, so this doc is the canonical reference for what each knob does.

## Ship configuration (current)

```json
"router": {
  "policy": {
    "N_HOLD": 0,
    "DOWNGRADE_THRESHOLD": 0.85,
    "K_CONSEC": 1,
    "COOLDOWN_TURNS": 2,
    "UNCERTAIN_THRESHOLD": 0.55,
    "UNCERTAIN_FALLBACK_ENABLED": false
  },
  "effort": {
    "maxLevel": "high"
  }
}
```

## Per-key reference

### `router.policy.N_HOLD` (int, default 0)

Number of turns a just-upgraded tier is held before a downgrade is eligible.
Ship value: `0` (hysteresis hold disabled). Shadow-eval on `eval_v3` showed
that any `N_HOLD >= 1` carried Opus/Sonnet over additional turns, which cost
more than it saved. Keeping the hold at zero lets the classifier drive every
turn.

### `router.policy.K_CONSEC` (int, default 1)

Consecutive turns where the classifier recommends a strictly lower tier before
a single downgrade step fires. Tightly coupled to `N_HOLD`; with `N_HOLD=0`
there is no reason to require more than one consecutive signal.

### `router.policy.COOLDOWN_TURNS` (int, default 2)

Runtime escalation cooldown. When `_escalateFor(n)` is invoked (e.g. after a
tool-call failure), the router holds the escalated tier for exactly `n` turns
and then decays back to classifier recommendation. Not session-sticky.

### `router.policy.UNCERTAIN_THRESHOLD` (float, default 0.55)

Dormant under ship config because `UNCERTAIN_FALLBACK_ENABLED=false`. Retained
for future use if a calibrated classifier is introduced. Below this confidence
value, the uncertainty fallback path (when enabled) applies
`max(classifier_primary, current_applied)`.

### `router.policy.UNCERTAIN_FALLBACK_ENABLED` (bool, default false)

Hard-disabled. Shadow-eval showed the fallback blocked legitimate downgrades
because T2 softmax probabilities are low-entropy across 12 joint classes.
Leaving it off lets the classifier recommendation drive routing.

### `router.policy.DOWNGRADE_THRESHOLD` (float, default 0.85)

Retained for hysteresis-based downgrade gating. Dormant when `N_HOLD=0` because
the hysteresis machine always allows downgrades immediately. Kept in settings
so that raising `N_HOLD` at a later date re-activates the threshold without a
schema change.

### `router.effort.maxLevel` (string, default `"high"`)

Hard cap on the applied thinking level regardless of classifier output. Allowed
values: `off | minimal | low | medium | high`. Ship value `high` blocks `xhigh`.
When the classifier recommendation exceeds the cap, the router clamps and
reports `effort-cap` as the rule fired in `/router-explain`.

## Runtime operations

- `/router-status` -- show current tier, effort, and policy snapshot.
- `/router-explain` -- decision trail for the last turn.
- `/router-reset` -- clear session state.
- `/router-off` / `/router-on` -- disable / enable routing entirely.

Audit log (when classifier logging is enabled): `pi/prompt-routing/logs/routing_log.jsonl`.
