# User Effort Override Policy

## Decision

User-selected effort should be authoritative.

If the user explicitly raises or lowers thinking effort, the router should not
silently reassign effort up or down. The router may still record its predicted
route, but the final applied effort should respect the user's selected effort
unless a hard runtime or safety limit prevents it.

## Rationale

Effort selection is user intent, not just a routing preference.

Examples:

- If the user raises effort, they are asking for deeper reasoning.
- If the user lowers effort, they are asking for faster execution or less
  deliberation.
- If the router overrides this, the system violates a direct instruction and
  creates misleading training data.

The router should recommend defaults. It should not fight explicit controls.

## Runtime Policy

1. Classify the prompt as usual.
2. Detect whether the user explicitly selected effort.
3. If no user effort override exists, apply router policy normally.
4. If a user effort override exists, preserve that effort in the final route.
5. Apply only hard safety/runtime caps, such as max supported effort.
6. Log both values:
    - router recommended route
    - final applied route

## Training and Telemetry Policy

User effort overrides should be logged as high-value training signals.

Recommended fields:

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

These records should feed an adjudication queue, not become labels without
review. A user override says what the user wanted for that task; review still
needs to decide the cheapest acceptable route.

## Evaluation Implications

Future router evaluations should include override-specific checks:

- User effort up is preserved.
- User effort down is preserved.
- Router recommendation is still logged.
- Override events can be queried for review.
- The router does not use confidence or safety floor logic to erase explicit
  effort choice except for hard caps.

## Open Implementation Work

- Identify where Pi stores or applies user-selected effort.
- Add a runtime policy test for effort override precedence.
- Add telemetry fields for recommended route, selected route, and applied route.
- Add adjudication queue logic for router/user effort disagreement.
