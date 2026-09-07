import { expect, it } from "vitest";
import { compatWithoutReasoningEffortMap, getThinkingLevelMap, toModelDefinition } from "../lib/models/compat.ts";
import { buildProviderModelDefinitions } from "../lib/models/reconcile.ts";

const model = {
	provider: "test", id: "test", name: "Test", api: "openai-completions", baseUrl: "https://example.test",
	reasoning: true, input: ["text" as const], cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 },
	contextWindow: 1000, maxTokens: 100, headers: { test: "header" },
	compat: { reasoningEffortMap: { low: "minimal" }, supportsStore: false },
};

it("normalizes legacy maps without discarding other compatibility or model fields", () => {
	expect(getThinkingLevelMap(model)).toEqual({ low: "minimal" });
	expect(compatWithoutReasoningEffortMap(model.compat)).toEqual({ supportsStore: false });
	expect(compatWithoutReasoningEffortMap(undefined)).toBeUndefined();
	expect(compatWithoutReasoningEffortMap({ reasoningEffortMap: {} })).toBeUndefined();
	const { provider: _provider, baseUrl: _baseUrl, ...fields } = model;
	expect(toModelDefinition(model)).toEqual({ ...fields, compat: { supportsStore: false }, thinkingLevelMap: undefined });
});

it("preserves remote > existing > legacy map precedence during refresh", () => {
	const existing = { ...model, thinkingLevelMap: { low: "low" } };
	expect(buildProviderModelDefinitions("test", [existing], [{ id: "test", thinkingLevelMap: { low: null } }])[0]?.thinkingLevelMap).toEqual({ low: null });
	expect(buildProviderModelDefinitions("test", [existing], [{ id: "test" }])[0]?.thinkingLevelMap).toEqual({ low: "low" });
	expect(buildProviderModelDefinitions("test", [model], [{ id: "test" }])[0]?.thinkingLevelMap).toEqual({ low: "minimal" });
});
