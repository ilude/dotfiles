# QA Review: Provider-Architecture Spike

## Finding 1

- **severity:** high
- **evidence:** The proposed pass condition only says the generation dispatch observer sees matching provider/model/thinking before the synthetic prompt is generated. It does not require proving that the observed values came from the newly resolved route object rather than pre-existing/global state already set by the old input-hook side effect. Existing tests heavily mock `setModel`/`setThinkingLevel` and T0 proves those can still fire after `continue`, so a harness could pass by observing stale or asynchronously mutated global state while real generation still uses the old route.
- **required_fix:** Make the acceptance gate inject a deliberately conflicting pre-existing route, classifier route, and default dispatch route, then assert dispatch receives a per-turn immutable decision object/id from the awaited resolver. The observer must fail if dispatch reads ambient current model/thinking state or any post-`continue` mutation.

## Finding 2

- **severity:** high
- **evidence:** The plan records `dispatch order/timestamp`, but not a hard happens-before assertion linking `classifier-finish`/route resolution to generation dispatch. Timestamp-only evidence can be false-positive under event-loop scheduling, clock resolution, or mocked observers; T0's useful evidence is an ordered event trace (`classifier-start`, `hook-returned-continue`, etc.), not wall-clock timing.
- **required_fix:** Require a deterministic order trace with await barriers: `pre-generation-start -> classifier-start -> classifier-finish -> route-resolved -> dispatch-called -> first-token/generated`. The test must hold the classifier promise open and assert dispatch is not called until it is released and the route is resolved.

## Finding 3

- **severity:** medium
- **evidence:** The validation gate covers a happy-path synthetic prompt, but does not specify negative tests for classifier failure, invalid route, denied provider, timeout, or resolver mismatch. Those are the cases most likely to fall back to legacy behavior or leak an old route while still allowing the happy-path proof to pass.
- **required_fix:** Add negative harness cases that assert dispatch uses the documented safe fallback decision object, not the previous turn's route or input-hook side effects, for invalid JSON/schema, classifier timeout, unknown route, denied provider, and resolver/provider mismatch.

## Finding 4

- **severity:** medium
- **evidence:** The observer fields include `prompt hash for a synthetic prompt only`, but the pass condition does not require correlating the hash/decision/dispatch to the same turn. In a multi-turn or concurrent test, route A could be resolved for prompt A while dispatch B observes the same provider/model/thinking and falsely passes.
- **required_fix:** Add a per-turn correlation id/decision id propagated from prompt capture through classifier result, route resolver, dispatch arguments, and evidence logs. Include a two-prompt interleaving test where classifiers complete out of order and assert each dispatch uses its own decision.

## Finding 5

- **severity:** medium
- **evidence:** The plan says status/explain/log evidence comes from the same decision object used by dispatch, but the validation gate only checks provider/model/thinking at dispatch. It can pass even if status/explain/logs are produced from a separate object, masking regressions in future acceptance criteria and auditability.
- **required_fix:** Extend the harness to assert status/explain/log records carry the exact dispatch decision id and raw/applied route used by generation, and fail when telemetry is built from recomputed or stale state.
