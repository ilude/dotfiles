# Prompt Router V1 Operator Handoff

This page is the operator quick-reference for the Pi prompt router. It uses the
canonical route vocabulary `nano`, `mini`, `core`, `large`, and `max`.
Legacy classifier labels such as `Haiku`, `Sonnet`, and `Opus` are compatibility
inputs only, not primary operator vocabulary.

## Daily commands

```text
/router-status   # current route, classifier mode, overrides, route states
/router-explain  # last routing decision and why it changed or stayed put
/router-reset    # clear session router state, including pins/continuation state
/router-off      # disable auto-routing and keep current model
/router-on       # re-enable auto-routing
```

Check `router.classifier.mode` in `pi/settings.json` to see the configured
classifier. Supported modes are `t2`, `lgbm`, `ensemble`, and `confgate`.
Status, explain, runtime logs, and eval output should report the same mode.

## Route/profile states

The router classifies to a canonical route, then resolves that route through the
current provider profile. A resolved route reports:

- `available`: route maps directly to a provider/model.
- `fallback`: requested route is unavailable and stayed inside provider trust
  boundaries by falling back to the nearest configured route.
- `policy-only`: route is valid router vocabulary but only reachable through
  explicit policy or operator override in V1, such as `max`.
- `disabled`: route is configured off and must not be selected automatically.

Provider trust is explicit: the router must not silently move to a different
provider family. `/router-status` and `/router-explain` show fallback reason,
provider family, profile, resolved model, and effort when a fallback occurs.

## Required operator examples

### Normal classifier route

1. Send a normal synthetic prompt.
2. Run `/router-explain`.
3. Expected fields: actual `classifier mode`, canonical `raw route`, canonical
   `applied route`, confidence/candidates, rule `classifier`, provider/model,
   route state, and effort.

### Continuation hold

1. Send a complex synthetic planning or coding prompt expected to apply `large`.
2. Send a dependent follow-up such as `do option 2`.
3. Run `/router-explain`.
4. Expected: raw route may be lower, applied route remains at least the prior
   effective route, rule is `context-continuation-hold`, and the context capsule
   shows continuation/dependency flags. Explicit cheap/fast/brief downgrade
   intent should bypass the hold and be visible in the decision trace.

### Unavailable fallback

1. Inspect `/router-status` route states.
2. If `nano` or another route is unavailable, a request for it should resolve as
   `fallback` rather than silently crossing provider trust boundaries.
3. `/router-explain` should show `fallbackFrom`, fallback reason, provider,
   model, and route state.

### Policy-only max

`max` is canonical vocabulary but policy-only in V1. It should appear in route
state output as `policy-only` and should be selected only by explicit escalation
policy or operator override, not by normal classifier output.

### Manual pin / override

1. Pin or explicitly select a high route/model through the current Pi model or
   router UI.
2. Send a simple synthetic prompt such as `hi`.
3. Run `/router-status`.
4. Expected: status shows the active override scope/lifetime, provider trust
   state, and that auto-routing did not silently downgrade the explicit choice.
   Use `/router-reset` or the relevant model-selection clear flow to remove it.

## Telemetry privacy and purge

Runtime telemetry uses prompt hashes by default, not raw prompt text. Classifier
logs and transcript routing events can be joined by `prompt_hash`. Do not copy
logs into evidence or tickets unless a secret/sentinel scan passes.

For local purge, stop Pi and remove the relevant `~/.pi/agent/traces/*.jsonl`
files plus `pi/prompt-routing/logs/routing_log.jsonl`. See
`pi/prompt-routing/analytics.md` for analytics commands and the privacy/rotation
contract.

## Eval and validation commands

```bash
cd pi/tests && pnpm test prompt-router.test.ts
uv run --project pi/prompt-routing pytest pi/prompt-routing/tests
uv run --project pi/prompt-routing python pi/prompt-routing/evaluate.py \
  --config pi/settings.json \
  --sequences pi/prompt-routing/tests/fixtures/context_sequences_v1.jsonl \
  --json
```

The eval JSON should include classifier mode, runtime policy/profile settings,
catastrophic under-routing, over-routing, cost-weighted quality, thrash/policy
deltas, privacy summary, and context sequence results.
