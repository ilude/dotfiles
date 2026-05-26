# User Effort Override Policy

## Decision

Explicit user effort selection should win over router reassignment.

If the user raises or lowers thinking effort, the final applied effort should
respect that choice unless a hard runtime or safety cap prevents it.

## Why this matters

Effort selection is user intent. If the user asks for more thinking, the system
should not downgrade the prompt. If the user asks for lower effort, the system
should focus on execution and avoid unnecessary escalation.

The router may still recommend a route, but explicit user control should be
logged as authoritative runtime intent.

## Policy shape

1. Router predicts route as usual.
2. Runtime detects user-selected effort.
3. If no user override exists, router policy applies normally.
4. If user override exists, preserve selected effort.
5. Apply only hard caps, such as unsupported effort levels.
6. Log router recommendation and final applied route separately.

## Telemetry fields

```json
{
  "router_recommended_route": {
    "model_tier": "core",
    "effort": "low"
  },
  "user_selected_route": {
    "model_tier": "core",
    "effort": "high"
  },
  "final_applied_route": {
    "model_tier": "core",
    "effort": "high"
  },
  "override_type": "user_effort_up",
  "user_override_authoritative": true
}
```

## Training implications

User overrides are high-value signals, but they are not automatically cheapest
acceptable route labels. They should feed an adjudication queue where reviewed
rows can produce `accepted_route`.

## Open implementation work

- Locate the runtime surface where user effort selection is represented.
- Add override precedence tests.
- Log recommended, selected, and applied route separately.
- Build an adjudication queue from override disagreements.
