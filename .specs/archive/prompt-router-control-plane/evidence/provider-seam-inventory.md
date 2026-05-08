# Provider Seam Inventory

- timestamp: 2026-05-07T00:00:00Z
- command: grep before_provider_request/provider_request/setModel/setThinkingLevel/classifyAndRoute
- exit_code: 0

pi/extensions/direct-personality.ts:74:	pi.on("before_provider_request", (event, ctx) => {
pi/extensions/persistent-defaults.ts:60:	const originalSetModel = pi.setModel.bind(pi);
pi/extensions/persistent-defaults.ts:61:	pi.setModel = async (model) => {
pi/extensions/persistent-defaults.ts:67:	const originalSetThinkingLevel = pi.setThinkingLevel.bind(pi);
pi/extensions/persistent-defaults.ts:68:	pi.setThinkingLevel = (level) => {
pi/extensions/prompt-router.ts:159:// if the user manually sets xhigh, classifyAndRoute preserves it.
pi/extensions/prompt-router.ts:451:async function classifyAndRoute(
pi/extensions/prompt-router.ts:528:      await pi.setModel(model);
pi/extensions/prompt-router.ts:531:      (pi as any).setThinkingLevel(effort);
pi/extensions/prompt-router.ts:534:      ctx.ui.notify(`router: setThinkingLevel failed (non-fatal): ${msg}`, "warning");
pi/extensions/prompt-router.ts:596:    if (shouldForceLowThinkingOnSessionStart(ctx) && typeof (pi as any).setThinkingLevel === "function") {
pi/extensions/prompt-router.ts:597:      (pi as any).setThinkingLevel("low");
pi/extensions/prompt-router.ts:618:    classifyAndRoute(pi, text, state, policy, ctx).catch((err: unknown) => {
pi/extensions/session-hooks.ts:46:						await pi.setModel(model);
pi/extensions/transcript-provider.ts:6: *   - before_provider_request -> emit `llm_request` (cloned + redacted payload)
pi/extensions/transcript-provider.ts:123:	// before_provider_request: clone + redact the request payload, emit llm_request.
pi/extensions/transcript-provider.ts:127:	pi.on("before_provider_request", async (event) => {

## Candidate seams
- `before_provider_request`: existing awaited provider hook used by direct-personality and transcript-provider; can return mutated provider payload before request dispatch.
- `input`: current prompt-router hook is not sufficient because it returns continue before route application.

## Selection
Use existing `before_provider_request` as the minimal awaited seam for spike proof. It can return a provider payload derived from an immutable route decision object before provider invocation.
