# Product/Simplicity Review: Provider-Architecture Spike

## Finding 1 — High — Proposed architecture is too broad for the proven blocker

**Evidence:** The blocker only proves the current `input` hook returns before `classifyAndRoute(...)` completes. The repo already has a closer provider seam: `pi/extensions/direct-personality.ts` registers `pi.on("before_provider_request", ...)` and mutates provider payload immediately before request dispatch. The spike jumps from “input hook is wrong” to a new “provider/model resolution layer” without proving the existing provider-request hook cannot carry the same-turn route.

**Required fix:** Reframe the spike as a minimal seam comparison: first validate whether `before_provider_request` can synchronously/awaitedly classify and mutate model/thinking/provider for the current dispatch. Only propose a new resolution layer if that existing seam cannot satisfy the observer test.

## Finding 2 — High — The spike assumes same-turn classification must be online, but does not bound latency or failure UX

**Evidence:** The current fire-and-forget design likely exists to keep input responsive. The proposed architecture requires awaiting classifier/policy resolution before generation dispatch, but the plan has no timeout, fallback, or user-visible latency budget. A same-turn guarantee that hangs or noticeably delays every prompt is not product-ready.

**Required fix:** Add acceptance criteria for max classification wait, timeout behavior, and fallback route. Example: classify may block dispatch for at most N ms; on timeout/error, dispatch uses the current/default route and records `rule_fired=classifier-timeout`.

## Finding 3 — Medium — “Single route profile resolver” risks premature consolidation

**Evidence:** The spike asks for canonical route -> provider/model/thinking through a single resolver before proving provider-level dispatch works. Existing router code already contains tier/effort mappings, provider skip logic, policy state, and model-registry resolution. Consolidating this during a feasibility spike expands blast radius and can mix refactor risk with seam validation.

**Required fix:** Split feasibility from cleanup. The spike should reuse the existing mapping/policy functions as-is for the first harness. Make resolver consolidation a later refactor only after same-turn dispatch is proven.

## Finding 4 — Medium — Scope boundary omits provider switching semantics

**Evidence:** The pass condition says generation dispatch observer sees “same provider/model/thinking,” but the current extension APIs visible in router usage are `setModel` and `setThinkingLevel`; provider selection may be implicit in model registry/current model hints. The spike does not define whether V1 requires changing provider, model within current provider, or only thinking level.

**Required fix:** Define the minimum V1 routing surface explicitly: thinking-only, model-within-current-provider, or cross-provider. If cross-provider is required, add evidence that Pi exposes a same-turn-safe provider switch API; otherwise exclude cross-provider routing from V1.

## Finding 5 — Low — Logging requirements are larger than needed for the first validation gate

**Evidence:** The proposed harness records prompt hash, classifier mode, raw route, applied route, provider/model/thinking, timestamps, and observer source. For the core blocker, the decisive evidence is ordering plus applied dispatch tuple. Extra fields add implementation/test churn and privacy review surface.

**Required fix:** Minimize the first gate to: synthetic prompt id/hash, decision tuple, dispatch tuple, and ordered event list. Add raw/applied route detail only after the seam is proven and needed for debugging.
