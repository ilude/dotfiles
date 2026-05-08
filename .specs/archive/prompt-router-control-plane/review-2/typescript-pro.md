# Independent Review: TypeScript provider seam

## Finding 1

**severity:** high

**evidence:** The plan says to use a “synchronous/awaited pre-generation seam” and later a “provider-level or generation-dispatch harness,” but it does not name the Pi extension event/API that owns model selection. In the current extension surface, `prompt-router.ts` routes from `pi.on("input")`, while `direct-personality.ts` uses `pi.on("before_provider_request")` only to mutate request payload. Without a concrete typed seam that can return provider/model/thinking into dispatch, implementers can satisfy the prose by moving the existing side effects to another hook without proving the generation dispatcher consumes them.

**required_fix:** Specify the exact seam contract to implement/use, including event name, event ordering relative to generation dispatch, return type, and how returned provider/model/thinking are consumed by dispatch. If the seam does not exist, make creating that typed API part of the plan before router changes.

## Finding 2

**severity:** high

**evidence:** The current blocker is an async ordering failure: `classifyAndRoute(...)` is fire-and-forget and observed order is `classifier-start -> hook-returned-continue -> classifier-finish -> setModel -> setThinkingLevel`. The proposed validation only says the dispatch observer sees the applied route before the synthetic prompt is generated. That can still pass if a patch delays generation indirectly or relies on global `setModel` state, without proving the classifier/policy promise is awaited on the dispatch path.

**required_fix:** Add an ordering assertion that records `classification-start`, `classification-finish`, `route-resolved`, and `generation-dispatch-start`, and require `classification-finish`/`route-resolved` to occur before dispatch starts. Also assert no router path calls fire-and-forget `classifyAndRoute` for normal user prompts.

## Finding 3

**severity:** medium

**evidence:** The plan requires passing provider/model/thinking “atomically,” but the existing implementation applies them through separate mutable operations: `await pi.setModel(model)` followed by non-awaited `(pi as any).setThinkingLevel(effort)`. The spike does not require replacing this with a typed decision object consumed by dispatch, so model and thinking can still be observed from different turns or different state snapshots.

**required_fix:** Define a `RouteDecision`/`ResolvedRouteProfile` type and require dispatch to accept one immutable object containing raw route, applied route, provider, model, and thinking. Remove `(pi as any)` from the routing path by adding/using a typed thinking field or typed API.

## Finding 4

**severity:** medium

**evidence:** The plan calls for a “single route profile resolver,” but does not specify module ownership. Today model selection helpers live in `pi/lib/model-routing.ts`, while router policy/state and effort mapping remain embedded in `pi/extensions/prompt-router.ts`. If the harness re-implements expected resolution instead of importing the production resolver, tests can pass while dispatch uses different logic.

**required_fix:** Require a pure exported resolver module under `pi/lib/` or another shared path, with explicit TypeScript types, used by both `prompt-router.ts` and the provider/generation harness. Tests must assert against the production resolver output, not duplicated fixtures.

## Finding 5

**severity:** medium

**evidence:** The evidence file lists only `cd pi/extensions && pnpm install --frozen-lockfile`, then `cd ../tests && pnpm install --frozen-lockfile`, then `pnpm run test -- prompt-router.test.ts`. Repo policy requires Pi TypeScript validation to run `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck` plus `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test`. The plan’s “typecheck/test commands” focus is not satisfied without the extension typecheck.

**required_fix:** Add `cd pi/extensions && pnpm run typecheck` as a required gate, and keep tests under `pi/tests` with `pnpm run test -- prompt-router.test.ts` or the repo-approved equivalent. Do not use Bun for these Pi TypeScript checks.
