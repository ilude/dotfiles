---
reviewer: typescript-pro
status: complete-inline-recovery
---

# Findings

- severity: high
  evidence: T4 says the hold is “bounded to one turn unless explicitly documented,” but its acceptance criteria only test one held continuation and one unrelated downgrade. They do not require proof that the same prior effective route is consumed/expired after the continuation hold.
  required_fix: Add an acceptance criterion/test that a `context-continuation-hold` does not persist indefinitely, e.g. previous `large` + `do option 2` holds once, then a following lower-route prompt without continuation dependency can apply the lower route unless pin/safety policy applies.

- severity: high
  evidence: T5 requires “explicit model selection > route pin,” but the plan does not define the TypeScript contract for detecting explicit model selection in `before_provider_request` payload/context, nor does it name the field(s) the hook must preserve. Without that, `applyRouteDecisionToProviderPayload` can still overwrite a user-selected model while tests only cover route pins/overrides.
  required_fix: Define the explicit-model-selection contract in T5, including payload/context fields, expected decision trace metadata, and a same-turn provider payload test proving explicit model is preserved and reported.

- severity: medium
  evidence: T3 route-state acceptance requires `available`, `fallback`, `policy-only`, or `disabled`, but current plan language also says “route state contract” without requiring a strict exported union/type. Existing `RouteDecisionTrace.routeState` is just `string`, allowing unsupported values such as `applied` to typecheck.
  required_fix: Require a `RouteState` union type exported from the route-profile/decision contract and tests/type assertions covering only `available | fallback | policy-only | disabled`.

- severity: medium
  evidence: T6 telemetry acceptance targets default privacy and schema fields, but the same-turn `before_provider_request` event path is separate from `emitRoutingDecision`; the plan does not explicitly require both event emitters to share the same schema/version/privacy contract.
  required_fix: Add an acceptance criterion/test that same-turn routing telemetry includes the PRD schema fields and excludes raw prompt/excerpt by default.

- severity: medium
  evidence: The constraints warn that top-level `pi/extensions/*.ts` files are auto-discovered, but T3/T4/T6 allow “optional” helpers without a verification step proving no new top-level helper extension was added.
  required_fix: Add a validation check such as `git ls-files 'pi/extensions/*.ts'` before/after or a grep/status assertion requiring helper modules to live under `pi/lib/` or non-auto-discovered subdirectories only.
