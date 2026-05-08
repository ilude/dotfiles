# UX Researcher Review: Router Operator/Status Usability

## Finding 1

- **Severity:** High
- **Evidence:** The next validation gate records `prompt hash`, `requested
  classifier mode`, `raw route`, `applied route`,
  `provider/model/thinking passed to generation dispatch`,
  `dispatch order/timestamp`, and `observer source`, but it does not require a
  single human-readable success signal that says the route was applied before
  generation.
- **Required fix:** Define an operator-facing proof field such as
  `same_turn_applied: true`, backed by the dispatch observer, plus a concise
  status sentence: `Routed before generation: <provider>/<model>, thinking
  <level>`. Status/explain/log should all derive this from the same decision
  object.

## Finding 2

- **Severity:** High
- **Evidence:** The plan says to emit evidence from the same decision object
  used by dispatch, but it does not specify correlation between status, explain,
  logs, and the generation dispatch event. Users who distrust routing cannot
  verify that the displayed explanation corresponds to the exact turn they just
  ran.
- **Required fix:** Require a non-secret `route_decision_id` or equivalent turn
  correlation ID in status, explain, logs, and dispatch harness output. Document
  that this ID must not contain raw prompt text and must be stable only for the
  route decision/turn.

## Finding 3

- **Severity:** Medium
- **Evidence:** The validation gate allows `prompt hash for a synthetic prompt
  only`, but the plan does not define what users see for real prompts when raw
  prompt/excerpt logging is disabled. Without a safe identifier, operators may
  enable unsafe logging to prove routing behavior.
- **Required fix:** Specify privacy-preserving prompt proof for normal use:
  display only synthetic prompt hashes in tests, and for real prompts show a
  redacted input marker, route decision ID, timestamp, classifier mode, and
  route fields. Explicitly state that raw prompt/excerpt logging remains off by
  default.

## Finding 4

- **Severity:** Medium
- **Evidence:** The proposed architecture distinguishes `raw route` and
  `applied route`, but the plan does not require explaining why they differ.
  If an override, canonicalization, or deny-by-default policy changes the route,
  users may conclude the router is broken or may misuse overrides.
- **Required fix:** Add an explain/status field such as
  `route_resolution_reason` with controlled values, for example `matched`,
  `canonicalized`, `override_applied`, `denied_by_policy`, or `fallback_used`.
  Include the source of any override without exposing prompt content.

## Finding 5

- **Severity:** Medium
- **Evidence:** The manual smoke pass condition is technically precise, but it
  is not written as an operator-observable checklist. It requires knowing how to
  compare dispatch observer output against applied route fields and timestamps.
- **Required fix:** Add a manual smoke checklist with expected visible output:
  run synthetic prompt, inspect status, inspect explain/log, confirm same
  `route_decision_id`, confirm `same_turn_applied: true`, and confirm the
  provider/model/thinking shown in status exactly matches dispatch observer
  fields before generation.
