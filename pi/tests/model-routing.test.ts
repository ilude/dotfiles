import { describe, expect, it } from "vitest";
import {
	getCurrentModelHint,
	resolveCommitPlanningModel,
	resolveDynamicModel,
	resolveModelTierLabel,
} from "../lib/model-routing.ts";

describe("resolveCommitPlanningModel", () => {
	it("prefers the current same-family small model when available", () => {
		const models = [
			{ provider: "openai-codex", id: "gpt-5.4-mini" },
			{ provider: "openai-codex", id: "gpt-5.4-fast" },
			{ provider: "openai-codex", id: "gpt-5.4" },
		];
		expect(resolveCommitPlanningModel(models, { provider: "openai-codex", id: "gpt-5.4" })).toEqual(models[0]);
	});

	it("uses the anthropic small rung when the current model is anthropic", () => {
		const models = [
			{ provider: "anthropic", id: "claude-haiku-4-6" },
			{ provider: "anthropic", id: "claude-sonnet-4-6" },
			{ provider: "anthropic", id: "claude-opus-4-6" },
		];
		expect(resolveCommitPlanningModel(models, { provider: "anthropic", id: "claude-sonnet-4-6" })).toEqual(models[0]);
	});

	it("falls back to preferred OpenAI/GitHub mini models when no current model is provided", () => {
		const models = [
			{ provider: "github-copilot", id: "gpt-4.1-mini" },
			{ provider: "openai-codex", id: "gpt-5.4-mini" },
		];
		expect(resolveCommitPlanningModel(models)).toEqual(models[1]);
	});

	it("falls back to the best available small model when no mini-labeled model exists", () => {
		const models = [
			{ provider: "github-copilot", id: "gpt-4.1" },
			{ provider: "github-copilot", id: "gpt-4.1-fast" },
		];
		expect(resolveCommitPlanningModel(models, { provider: "github-copilot", id: "gpt-4.1" })).toEqual(models[1]);
	});
});

describe("resolveDynamicModel", () => {
	it("uses the active openai same-family ladder when available", () => {
		const models = [
			{ provider: "openai-codex", id: "gpt-5.4-mini" },
			{ provider: "openai-codex", id: "gpt-5.4-fast" },
			{ provider: "openai-codex", id: "gpt-5.4" },
			{ provider: "anthropic", id: "claude-sonnet-4-6" },
		];
		const current = { provider: "openai-codex", id: "gpt-5.4" };
		expect(resolveDynamicModel(models, current, "small", "same-family")).toEqual(models[0]);
		expect(resolveDynamicModel(models, current, "medium", "same-family")).toEqual(models[1]);
		expect(resolveDynamicModel(models, current, "large", "same-family")).toEqual(models[2]);
	});

	it("uses the anthropic ladder when current model is anthropic", () => {
		const models = [
			{ provider: "anthropic", id: "claude-haiku-4-6" },
			{ provider: "anthropic", id: "claude-sonnet-4-6" },
			{ provider: "anthropic", id: "claude-opus-4-6" },
			{ provider: "openai-codex", id: "gpt-5.4" },
		];
		const current = { provider: "anthropic", id: "claude-sonnet-4-6" };
		expect(resolveDynamicModel(models, current, "small", "same-family")).toEqual(models[0]);
		expect(resolveDynamicModel(models, current, "medium", "same-family")).toEqual(models[1]);
		expect(resolveDynamicModel(models, current, "large", "same-family")).toEqual(models[2]);
	});

	it("prefers same-provider fallbacks when exact family variants are missing", () => {
		const models = [
			{ provider: "github-copilot", id: "gpt-4.1-mini" },
			{ provider: "github-copilot", id: "gpt-4.1" },
			{ provider: "github-copilot", id: "o3" },
			{ provider: "openai-codex", id: "gpt-5.4-mini" },
		];
		const current = { provider: "github-copilot", id: "gpt-4.1" };
		expect(resolveDynamicModel(models, current, "small", "same-provider")).toEqual(models[0]);
		expect(resolveDynamicModel(models, current, "medium", "same-provider")).toEqual(models[1]);
		expect(resolveDynamicModel(models, current, "large", "same-provider")).toEqual(models[2]);
	});
});

describe("getCurrentModelHint", () => {
	it("prefers direct ctx.model objects", () => {
		const ctx = { model: { provider: "openai-codex", id: "gpt-5.4" } };
		expect(getCurrentModelHint(ctx, [])).toEqual(ctx.model);
	});

	it("parses provider/model strings when present", () => {
		const ctx = { currentModel: "anthropic/claude-sonnet-4-6" };
		expect(getCurrentModelHint(ctx, [])).toEqual({ provider: "anthropic", id: "claude-sonnet-4-6" });
	});
});

describe("resolveModelTierLabel", () => {
	it("uses the model name or id when available", () => {
		expect(resolveModelTierLabel({ provider: "openai-codex", id: "gpt-5.4-fast" }, "medium")).toBe("gpt-5.4-fast");
	});

	it("falls back to a generic size label", () => {
		expect(resolveModelTierLabel(undefined, "large")).toBe("Large model");
	});
});
