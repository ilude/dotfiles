# Spike foundation

- Timestamp: 2026-05-08T04:02:00Z
- CWD: WORKTREE_ROOT
- Spike archive exists exit: 0
- Grep exit: 0

```text
pi/extensions/direct-personality.ts:74:	pi.on("before_provider_request", (event, ctx) => {
pi/extensions/prompt-router.ts:88:export interface RouteDecision {
pi/extensions/prompt-router.ts:99:  same_turn_applied: boolean;
pi/extensions/prompt-router.ts:133:function makeRouteDecisionId(promptHash: string): string {
pi/extensions/prompt-router.ts:137:function fallbackRouteDecision(text: string, reason: RouteResolutionReason, fallbackReason: string, ctx: any): RouteDecision {
pi/extensions/prompt-router.ts:141:    route_decision_id: makeRouteDecisionId(`${promptHash}-${reason}`),
pi/extensions/prompt-router.ts:151:    same_turn_applied: false,
pi/extensions/prompt-router.ts:155:export async function resolveProviderRouteDecision(
pi/extensions/prompt-router.ts:160:): Promise<RouteDecision> {
pi/extensions/prompt-router.ts:163:  if (classified === "timeout") return fallbackRouteDecision(text, "classifier_timeout", "classifier timed out", ctx);
pi/extensions/prompt-router.ts:164:  if (!classified) return fallbackRouteDecision(text, "classifier_failure", "classifier returned no usable route", ctx);
pi/extensions/prompt-router.ts:169:  if (!model) return fallbackRouteDecision(text, "fallback_used", `no ${rawSize} model available`, ctx);
pi/extensions/prompt-router.ts:173:    return fallbackRouteDecision(text, "denied_by_policy", "cross-provider fallback denied", ctx);
pi/extensions/prompt-router.ts:178:    route_decision_id: makeRouteDecisionId(promptHash),
pi/extensions/prompt-router.ts:187:    same_turn_applied: false,
pi/extensions/prompt-router.ts:191:export function applyRouteDecisionToProviderPayload(payload: unknown, decision: RouteDecision): unknown {
pi/extensions/prompt-router.ts:199:    same_turn_applied: true,
pi/extensions/prompt-router.ts:726:  pi.on("before_provider_request", async (event, ctx) => {
pi/extensions/prompt-router.ts:730:    const decision = await resolveProviderRouteDecision(pi, text, ctx);
pi/extensions/prompt-router.ts:734:    const payload = applyRouteDecisionToProviderPayload(event.payload, { ...decision, same_turn_applied: true });
pi/extensions/prompt-router.ts:737:      `same_turn_applied: true route_decision_id=${decision.route_decision_id} route=${decision.applied_route}`,
pi/extensions/prompt-router.ts:741:      same_turn_applied: true,
pi/extensions/transcript-provider.ts:6: *   - before_provider_request -> emit `llm_request` (cloned + redacted payload)
pi/extensions/transcript-provider.ts:123:	// before_provider_request: clone + redact the request payload, emit llm_request.
pi/extensions/transcript-provider.ts:127:	pi.on("before_provider_request", async (event) => {
pi/tests/direct-personality.test.ts:63:		expect(pi._getHook("before_provider_request")).toHaveLength(1);
pi/tests/direct-personality.test.ts:79:		const hook = pi._getHook("before_provider_request")[0].handler;
pi/tests/direct-personality.test.ts:88:		const hook = pi._getHook("before_provider_request")[0].handler;
pi/tests/prompt-router.test.ts:10:  applyRouteDecisionToProviderPayload,
pi/tests/prompt-router.test.ts:11:  resolveProviderRouteDecision,
pi/tests/prompt-router.test.ts:1272:    const decisionPromise = resolveProviderRouteDecision(pi as any, "synthetic same turn prompt", routeCtx());
pi/tests/prompt-router.test.ts:1278:    const payload = applyRouteDecisionToProviderPayload({ model: "ambient-default", prompt: "synthetic same turn prompt" }, { ...decision, same_turn_applied: true }) as Record<string, unknown>;
pi/tests/prompt-router.test.ts:1293:    expect(payload.same_turn_applied).toBe(true);
pi/tests/prompt-router.test.ts:1300:    const decision = await resolveProviderRouteDecision(pi as any, "synthetic timeout prompt", routeCtx(), 1);
pi/tests/prompt-router.test.ts:1303:    expect(decision.same_turn_applied).toBe(false);
pi/tests/prompt-router.test.ts:1310:    const decision = await resolveProviderRouteDecision(pi as any, "synthetic provider boundary", ctx);
pi/tests/prompt-router.test.ts:1327:    const first = resolveProviderRouteDecision(pi as any, "synthetic prompt one", routeCtx({ provider: "openai-codex", id: "gpt-5.4" }));
pi/tests/prompt-router.test.ts:1328:    const second = resolveProviderRouteDecision(pi as any, "synthetic prompt two", routeCtx());
pi/tests/transcript-integration.test.ts:155:			"before_provider_request",
pi/tests/transcript-integration.test.ts:157:				type: "before_provider_request",
pi/tests/transcript-integration.test.ts:343:			"before_provider_request",
pi/tests/transcript-integration.test.ts:344:			{ type: "before_provider_request", payload: { messages: [], turn: 1 } },
pi/tests/transcript-integration.test.ts:350:			"before_provider_request",
pi/tests/transcript-integration.test.ts:351:			{ type: "before_provider_request", payload: { messages: [], turn: 2 } },
pi/tests/transcript-integration.test.ts:633:			"before_provider_request",
pi/tests/transcript-integration.test.ts:635:				type: "before_provider_request",
```
