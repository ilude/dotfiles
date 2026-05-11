# T8 docs, examples, and operator handoff

Date: 2026-05-11

## Result

PASS. Added operator handoff documentation and refreshed the Pi README prompt-router summary to use canonical route vocabulary and link to the handoff.

## Files changed

- `pi/prompt-routing/docs/operator-handoff.md`
- `pi/README.md`
- `.specs/prompt-router-v1/evidence/T8-docs.md`

## Operator coverage

- `/router-status` and `/router-explain` commands are documented with canonical route output expectations.
- `router.classifier.mode` is documented with supported modes: `t2`, `lgbm`, `ensemble`, and `confgate`.
- Route/profile states are documented: `available`, `fallback`, `policy-only`, and `disabled`.
- Provider trust is documented as no silent provider-family crossing, with fallback reason/provider/model/profile visible in status/explain.
- Required scenarios are documented:
  - normal classifier route
  - `context-continuation-hold`
  - unavailable fallback
  - `policy-only` `max`
  - manual pin / override
- Telemetry privacy, router purge, and eval commands are documented.

## PRD acceptance mapping

| PRD AC | Status | Mapping |
|---|---|---|
| AC1 canonical status/explain vocabulary | Covered | `operator-handoff.md` documents `nano/mini/core/large/max`; focused tests assert canonical status/explain output. |
| AC2 settings-driven classifier mode | Covered | `operator-handoff.md` documents `router.classifier.mode`; tests/eval cover mode truthfulness. |
| AC3 context continuation anti-downgrade | Covered | `operator-handoff.md` documents `context-continuation-hold` example and cheap/fast/brief bypass; focused tests cover behavior. |
| AC4 explicit override respected | Covered | `operator-handoff.md` documents manual pin/override expected status; focused tests cover override hierarchy. |
| AC5 unified eval runtime metrics | Covered | `operator-handoff.md` documents eval command and required JSON content; V3 evidence contains canonical eval output. |
| AC6 same-turn generation route proven | Covered | Focused tests cover before-provider same-turn application and immutable route decision id; README states same generation turn. |
| AC7 override/provider trust explicit | Covered | `operator-handoff.md` documents provider trust, fallback state/reason, and override scope/lifetime. |
| AC8 telemetry privacy useful | Covered | `operator-handoff.md` and `analytics.md` document prompt-hash default, purge, and no raw prompt evidence rule; tests cover telemetry fields/privacy. |

## Verification notes

No raw prompts, credentials, tokens, private keys, or `.env` content were added. Example prompts are synthetic placeholders only.
