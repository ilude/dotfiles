# Manual Validation Template

Use only these synthetic prompts. Record sanitized route fields only: decision_id, route, applied_route, classifier_mode, provider_family, model_alias, same_turn_applied, fallback_reason, override_scope, context_flags. Do not record raw prompts or excerpts.

## Normal
Prompt: "Summarize this synthetic three-item task list in one sentence."
Expected: automatic route, same_turn_applied true, no prompt excerpt.

## Continuation
Prompt 1: "Analyze this synthetic architecture tradeoff and recommend a path."
Prompt 2: "Now implement option 2."
Expected: continuation hold prevents unsafe downgrade for Prompt 2.

## Cheap/brief override
Prompt: "Briefly answer this synthetic question using the cheapest suitable route."
Expected: downgrade intent may bypass continuation hold; sanitized override_scope visible.

## Route/model pin
Prompt: "Use the pinned synthetic route/model setting for this toy request."
Expected: explicit selection takes precedence and appears in status/explain.

## Unavailable/policy-only
Prompt: "Try a policy-only unavailable synthetic route."
Expected: fail-closed fallback reason; no stale route state.
