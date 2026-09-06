import { describe, expect, it } from "vitest";
import {
	ADVISORY_SUBAGENT_ROUTING_POLICY_VERSION,
	assignRoutingOutcomeExperiment,
	classifyAdvisorySubagentRoute,
	getCurrentModelHint,
	isConfiguredPremiumCodex,
	isPremiumCodexModel,
	MODEL_ROUTING_POLICY,
	preferredEffortForSize,
	resolveAdvisorySubagentRouting,
	resolveCommitPlanningModel,
	resolveDynamicModel,
	resolveExplicitModelPolicy,
	resolveModelTierLabel,
	resolveSampledDynamicModel,
	ROUTING_OUTCOME_ARMS,
	ROUTING_OUTCOME_EXPERIMENT_ID,
} from "../lib/model-routing.ts";

describe("advisory subagent routing policy", () => {
	it("exposes the versioned policy and task recommendations", () => {
		expect(ADVISORY_SUBAGENT_ROUTING_POLICY_VERSION).toBe(
			"subagent-routing-v1",
		);
		expect(resolveAdvisorySubagentRouting("tool")).toMatchObject({
			policyVersion: "subagent-routing-v1",
			preferred: {
				provider: "openai-codex",
				modelId: "gpt-5.6-luna",
				effort: "low",
			},
		});
		expect(resolveAdvisorySubagentRouting("review").preferred).toEqual({
			provider: "openai-codex",
			modelId: "gpt-5.6-sol",
			effort: "low",
		});
	});

	it("returns only accepted alternatives for bounded planning and implementation", () => {
		expect(resolveAdvisorySubagentRouting("planning").accepted).toEqual([
			{
				provider: "openai-codex",
				modelId: "gpt-5.6-sol",
				effort: "low",
			},
			{
				provider: "openai-codex",
				modelId: "gpt-5.6-luna",
				effort: "high",
			},
		]);
		expect(resolveAdvisorySubagentRouting("coordination").accepted).toEqual([
			{
				provider: "openai-codex",
				modelId: "gpt-5.6-sol",
				effort: "low",
			},
		]);
		expect(
			classifyAdvisorySubagentRoute("coordination", {
				provider: "openai-codex",
				modelId: "gpt-5.6-luna",
				effort: "high",
			}),
		).toBe("mismatch");
		expect(resolveAdvisorySubagentRouting("implementation").accepted).toEqual([
			{
				provider: "openai-codex",
				modelId: "gpt-5.6-luna",
				effort: "medium",
			},
			{
				provider: "openai-codex",
				modelId: "gpt-5.6-luna",
				effort: "high",
			},
		]);
	});

	it("classifies preferred, accepted, and mismatched routes", () => {
		const solLow = {
			provider: "openai-codex",
			modelId: "gpt-5.6-sol",
			effort: "low" as const,
		};
		const lunaHigh = {
			provider: "openai-codex",
			modelId: "gpt-5.6-luna",
			effort: "high" as const,
		};
		expect(classifyAdvisorySubagentRoute("planning", solLow)).toBe("preferred");
		expect(classifyAdvisorySubagentRoute("planning", lunaHigh)).toBe(
			"accepted-alternative",
		);
		expect(
			classifyAdvisorySubagentRoute("planning", {
				provider: "openai-codex",
				modelId: "gpt-5.6-terra",
				effort: "medium",
			}),
		).toBe("mismatch");
		expect(
			resolveAdvisorySubagentRouting("planning", lunaHigh).classification,
		).toBe("accepted-alternative");
	});

	it("does not change dynamic resolution", () => {
		const models = [
			{ provider: "openai-codex", id: "gpt-5.6-luna" },
			{ provider: "openai-codex", id: "gpt-5.6-sol" },
		];
		const before = resolveDynamicModel(models, models[1], "medium");
		resolveAdvisorySubagentRouting("implementation");
		expect(resolveDynamicModel(models, models[1], "medium")).toBe(before);
	});

	it("excludes Terra from automatic preferred IDs and experiment arms", () => {
		const preferredIds = Object.values(MODEL_ROUTING_POLICY.preferredCodexIds)
			.flat()
			.join(" ");
		expect(preferredIds).not.toContain("gpt-5.6-terra");
		expect(
			ROUTING_OUTCOME_ARMS.every((arm) => arm.modelId !== "gpt-5.6-terra"),
		).toBe(true);
	});
});

describe("routing outcome sampling", () => {
	const models = [
		{ provider: "openai-codex", id: "gpt-5.6-luna" },
		{ provider: "openai-codex", id: "gpt-5.6-sol" },
	];

	it("uses deterministic ten-percent assignment across configured arms", () => {
		const assignments = Array.from({ length: 10_000 }, (_, index) =>
			assignRoutingOutcomeExperiment(`run-${index}`, "subagent-single", 0.1),
		).filter((assignment) => assignment !== undefined);

		expect(assignments.length).toBeGreaterThan(900);
		expect(assignments.length).toBeLessThan(1_100);
		expect(new Set(assignments.map((assignment) => assignment.id))).toEqual(
			new Set(["luna-high", "sol-low"]),
		);
		expect(
			assignments.every(
				(assignment) =>
					assignment.experimentId === ROUTING_OUTCOME_EXPERIMENT_ID,
			),
		).toBe(true);
	});

	it("returns the byte-identical policy model with sampling disabled", () => {
		const expected = resolveDynamicModel(
			models,
			models[1],
			"medium",
			"same-provider",
		);
		const result = resolveSampledDynamicModel(
			models,
			models[1],
			"medium",
			"same-provider",
			"disabled-run",
			"subagent-single",
			0,
		);

		expect(result.model).toBe(expected);
		expect(result.experiment).toBeUndefined();
	});

	it("does not tag a sample when its configured model is unavailable", () => {
		const sampleKey = Array.from(
			{ length: 100 },
			(_, index) => `forced-${index}`,
		).find(
			(key) =>
				assignRoutingOutcomeExperiment(key, "subagent-single", 1)?.id !==
				"luna-high",
		);
		expect(sampleKey).toBeDefined();
		const result = resolveSampledDynamicModel(
			models.slice(0, 1),
			models[0],
			"small",
			"same-provider",
			sampleKey as string,
			"subagent-single",
			1,
		);

		expect(result.experiment).toBeUndefined();
		expect(result.model).toBe(models[0]);
	});
});

describe("resolveCommitPlanningModel", () => {
	it("prefers the current same-family small model when available", () => {
		const models = [
			{ provider: "openai-codex", id: "gpt-5.4-mini" },
			{ provider: "openai-codex", id: "gpt-5.4-fast" },
			{ provider: "openai-codex", id: "gpt-5.4" },
		];
		expect(
			resolveCommitPlanningModel(models, {
				provider: "openai-codex",
				id: "gpt-5.4",
			}),
		).toEqual(models[0]);
	});

	it("pins commit planning to Codex GPT-5.6 Luna", () => {
		const models = [
			{ provider: "openai-codex", id: "gpt-5.6-luna" },
			{ provider: "openai-codex", id: "gpt-5.6-sol" },
			{ provider: "openai-codex", id: "gpt-5.4-mini" },
		];
		expect(
			resolveCommitPlanningModel(models, {
				provider: "openai-codex",
				id: "gpt-5.6-sol",
			}),
		).toEqual(models[0]);
	});

	it("uses the anthropic small rung when the current model is anthropic", () => {
		const models = [
			{ provider: "anthropic", id: "claude-haiku-4-6" },
			{ provider: "anthropic", id: "claude-sonnet-4-6" },
			{ provider: "anthropic", id: "claude-opus-4-6" },
		];
		expect(
			resolveCommitPlanningModel(models, {
				provider: "anthropic",
				id: "claude-sonnet-4-6",
			}),
		).toEqual(models[0]);
	});

});

describe("resolveDynamicModel", () => {
	it("handles zero and one available model deterministically", () => {
		expect(resolveDynamicModel([], undefined, "small")).toBeUndefined();
		const only = { provider: "local", id: "only" };
		expect(resolveDynamicModel([only], undefined, "max")).toBe(only);
	});

	it("uses the active openai same-family ladder when available", () => {
		const models = [
			{ provider: "openai-codex", id: "gpt-5.4-mini" },
			{ provider: "openai-codex", id: "gpt-5.4-fast" },
			{ provider: "openai-codex", id: "gpt-5.4" },
			{ provider: "anthropic", id: "claude-sonnet-4-6" },
		];
		const current = { provider: "openai-codex", id: "gpt-5.4" };
		expect(
			resolveDynamicModel(models, current, "small", "same-family"),
		).toEqual(models[0]);
		expect(
			resolveDynamicModel(models, current, "medium", "same-family"),
		).toEqual(models[1]);
		expect(
			resolveDynamicModel(models, current, "large", "same-family"),
		).toEqual(models[2]);
	});

	it("maps the GPT-5.6 ladder to Luna and Sol without Terra", () => {
		const models = [
			{ provider: "openai-codex", id: "gpt-5.6-luna" },
			{ provider: "openai-codex", id: "gpt-5.6-terra" },
			{ provider: "openai-codex", id: "gpt-5.6-sol" },
		];
		const current = models[2];
		expect(
			resolveDynamicModel(models, current, "small", "same-family"),
		).toEqual(models[0]);
		expect(
			resolveDynamicModel(models, current, "medium", "same-family"),
		).toEqual(models[0]);
		expect(
			resolveDynamicModel(models, current, "large", "same-family"),
		).toEqual(models[2]);
		expect(preferredEffortForSize("small")).toBe("high");
		expect(preferredEffortForSize("medium")).toBe("medium");
		expect(preferredEffortForSize("large")).toBe("low");
	});

	it("uses the anthropic ladder when current model is anthropic", () => {
		const models = [
			{ provider: "anthropic", id: "claude-haiku-4-6" },
			{ provider: "anthropic", id: "claude-sonnet-4-6" },
			{ provider: "anthropic", id: "claude-opus-4-6" },
			{ provider: "openai-codex", id: "gpt-5.4" },
		];
		const current = { provider: "anthropic", id: "claude-sonnet-4-6" };
		expect(
			resolveDynamicModel(models, current, "small", "same-family"),
		).toEqual(models[0]);
		expect(
			resolveDynamicModel(models, current, "medium", "same-family"),
		).toEqual(models[1]);
		expect(
			resolveDynamicModel(models, current, "large", "same-family"),
		).toEqual(models[2]);
	});

	it("uses registry metadata and stable IDs for deterministic many-model selection", () => {
		const cheap = {
			provider: "local",
			id: "alpha",
			contextWindow: 128_000,
			cost: { input: 1, output: 1 },
		};
		const expensive = {
			provider: "local",
			id: "beta",
			contextWindow: 128_000,
			cost: { input: 20, output: 40 },
		};
		expect(resolveDynamicModel([expensive, cheap], undefined, "small")).toBe(
			cheap,
		);
		expect(resolveDynamicModel([cheap, expensive], undefined, "small")).toBe(
			cheap,
		);

		const reasoning = {
			provider: "local",
			id: "reasoning",
			reasoning: true,
			contextWindow: 256_000,
			maxTokens: 32_000,
			cost: { input: 10, output: 30 },
		};
		expect(resolveDynamicModel([cheap, reasoning], undefined, "large")).toBe(
			reasoning,
		);
	});

});

describe("shared named model policies", () => {
	it("resolves explicit command choices from the shared policy", () => {
		const fable = {
			provider: "amazon-bedrock",
			id: "us.anthropic.claude-fable-5",
		};
		expect(resolveExplicitModelPolicy([fable], "fable")).toEqual({
			model: fable,
			modelId: "amazon-bedrock/us.anthropic.claude-fable-5",
		});
	});

	it("returns a clear diagnostic when a policy capability is unavailable", () => {
		const resolution = resolveExplicitModelPolicy([], "foreman");
		expect(resolution.model).toBeUndefined();
		expect(resolution.diagnostic).toContain(
			"requires openai-codex/gpt-5.6-sol",
		);
		expect(resolution.diagnostic).toContain("not available");
	});

	it("owns premium Codex membership checks", () => {
		expect(
			isPremiumCodexModel({ provider: "openai-codex", id: "gpt-5.6-sol" }),
		).toBe(true);
		expect(isConfiguredPremiumCodex("openai-codex", "gpt-5.5")).toBe(true);
		expect(isConfiguredPremiumCodex("openai", "gpt-5.5")).toBe(false);
	});
});

describe("getCurrentModelHint", () => {
	it("prefers direct ctx.model objects", () => {
		const ctx = { model: { provider: "openai-codex", id: "gpt-5.4" } };
		expect(getCurrentModelHint(ctx, [])).toEqual(ctx.model);
	});

	it("parses provider/model strings when present", () => {
		const ctx = { currentModel: "anthropic/claude-sonnet-4-6" };
		expect(getCurrentModelHint(ctx, [])).toEqual({
			provider: "anthropic",
			id: "claude-sonnet-4-6",
		});
	});
});

describe("resolveModelTierLabel", () => {
	it("uses the model name or id when available", () => {
		expect(
			resolveModelTierLabel(
				{ provider: "openai-codex", id: "gpt-5.4-fast" },
				"medium",
			),
		).toBe("gpt-5.4-fast");
	});

	it("falls back to a generic size label", () => {
		expect(resolveModelTierLabel(undefined, "large")).toBe("Large model");
	});
});
