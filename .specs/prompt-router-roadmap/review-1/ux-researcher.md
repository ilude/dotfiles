---
reviewer: ux-researcher
persona: Operator trust and workflow UX reviewer
focus: terminology, operator control, explainability, overrides, route naming
status: ready
---

# PRD Readiness Review: UX / Operator Trust

## Finding 1

severity: high

evidence: The PRD introduces `nano → mini → core → large → max`, but FR2 says `mini/core-low`, `core-coding`, `core-general`, `large`, and `max`; acceptance criteria require `mini/core/large/max` but omit `nano`. Users will not know whether `core-low` is a route, profile, effort, or model alias.

required_fix: Define one user-facing naming model: route size, domain, effort, profile, and model. Add a glossary and require `/router-status` and `/router-explain` to render these as separate labeled fields, not combined names.

## Finding 2

severity: high

evidence: FR7 says explicit model/route pins override automatic routing until cleared, but Open Questions asks whether route pins are separate from Pi `/model` manual selection. This leaves the core manual override mental model unresolved.

required_fix: Decide the override hierarchy in the PRD: explicit model selection, route pin, temporary per-turn override, automatic policy, fallback. Specify scope, lifetime, clear command, and how status/explain indicates an active override.

## Finding 3

severity: medium

evidence: `/router-explain` must show raw route, applied route, confidence, top candidates, policy rule, context flags, and resolved provider/model/thinking. There is no required plain-language explanation or operator-oriented summary. Ambiguous output can still be technically complete but distrusted.

required_fix: Add an explain output contract with a one-line decision summary, “why this route,” “what changed from classifier,” and “how to override/clear.” Include example output for normal route, continuation hold, unavailable fallback, and manual pin.

## Finding 4

severity: medium

evidence: FR6 allows holding the previous route on continuation unless the user asks for cheap/fast/brief behavior, but the PRD does not define recognized downgrade intent terms or how the router reports ignored/accepted downgrade requests.

required_fix: Define explicit downgrade intent vocabulary and precedence. Require explain/status/log fields showing whether cheap/fast/brief intent was detected and whether it overrode `context-continuation-hold`.

## Finding 5

severity: medium

evidence: FR2 says unavailable routes and fallback mappings must be explicit, while `nano` is unavailable/future and `max` is policy-only in v1. The acceptance criteria do not verify that unavailable/policy-only routes are understandable or non-selectable.

required_fix: Add acceptance criteria for unavailable and policy-only routes. `/router-status` should show route state (`available`, `fallback`, `policy-only`, `disabled`) and the operator-facing consequence for selecting each route.
