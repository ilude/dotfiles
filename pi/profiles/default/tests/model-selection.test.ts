import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { resolveAvailablePreferredModel, resolveLatestCodexModelFromRegistry, resolveLatestCodexModelFromRuntime, resolveLatestShortcutModel, resolvePreferredModel } from "../lib/model-selection.ts";
import { modelFixture, registryFixture } from "./helpers/model-selection.ts";

const models = [
	modelFixture("openai", "gpt-5.6-luna"),
	modelFixture("openai", "gpt-6-luna"),
	modelFixture("bedrock-mantle", "openai.gpt-7-luna"),
	modelFixture("openai", "gpt-7-sol"),
];

describe("Opus AWS routing", () => {
	const mantle = modelFixture("bedrock-mantle", "anthropic.claude-opus-5-5");
	const native = modelFixture("amazon-bedrock", "global.anthropic.claude-opus-5-5");
	const direct = modelFixture("anthropic", "claude-opus-5-5");

	it("selects the newest Mantle Opus, not an older cheaper model or direct Anthropic", () => {
		const old = modelFixture("bedrock-mantle", "anthropic.claude-opus-5");
		const latest = { ...mantle, cost: { input: 10, output: 20, cacheRead: 1, cacheWrite: 12 } };
		const registry = registryFixture([old, latest, native, direct], ["bedrock-mantle", "amazon-bedrock", "anthropic"]);
		expect(resolvePreferredModel("opus", registry)).toBe(latest);
		expect(resolvePreferredModel("claude-opus-5-5", registry)).toBe(latest);
		expect(resolveLatestShortcutModel("opus", registry)).toBe(latest);
	});

	it("uses native Bedrock only when Mantle is not configured", () => {
		const registry = registryFixture([mantle, native, direct], ["amazon-bedrock", "anthropic"]);
		expect(resolvePreferredModel("opus", registry)).toBe(native);
	});

	it("does not substitute another provider when AWS has no configured Opus", () => {
		const registry = registryFixture([direct, modelFixture("openai", "claude-opus-5-5")], ["anthropic", "openai"]);
		expect(() => resolvePreferredModel("opus", registry)).toThrow(/No configured AWS Bedrock model/);
		expect(() => resolvePreferredModel("claude-opus-5-5", registry)).toThrow(/No configured AWS Bedrock model/);
	});
});

describe("Grok AWS routing", () => {
	it("resolves the council's bare Grok selection to the newest authenticated native US model", () => {
		const grok = modelFixture("amazon-bedrock", "us.xai.grok-4.7");
		const others = [
			modelFixture("amazon-bedrock", "us.xai.grok-4.6"),
			modelFixture("amazon-bedrock", "global.xai.grok-4.7"),
			modelFixture("bedrock-mantle", "xai.grok-4.7"),
			modelFixture("xai", "grok-4.7"),
		];
		const providers = ["amazon-bedrock", "bedrock-mantle", "xai"];
		expect(resolvePreferredModel("grok", registryFixture([...others, grok], providers))).toBe(grok);
		expect(() => resolvePreferredModel("grok", registryFixture(others.slice(2), providers))).toThrow(/No configured native AWS Bedrock/);
		expect(() => resolvePreferredModel("grok", registryFixture([grok], []))).toThrow(/No configured native AWS Bedrock/);
	});
});

describe("fresh subscription-first delegation resolution", () => {
	it("uses working OpenAI availability even when the cached auth snapshot is false", async () => {
		const sol = modelFixture("openai", "gpt-6.1-sol");
		const registry = registryFixture([sol, modelFixture("openai-codex", sol.id)], ["openai", "openai-codex"]);
		vi.mocked(registry.hasConfiguredAuth).mockReturnValue(false);
		await expect(resolveAvailablePreferredModel("sol", registry)).resolves.toBe(sol);
		expect(registry.hasConfiguredAuth).not.toHaveBeenCalled();
		expect(registry.getAvailableOfType).toHaveBeenCalledExactlyOnceWith("chat", "openai", { signal: undefined });
		expect(registry.getApiKeyForProvider).toHaveBeenCalledExactlyOnceWith("openai");
	});

	it("identifies the rejected route without exposing credentials when no authorized fallback is available", async () => {
		const registry = registryFixture([modelFixture("openai-codex", "gpt-6.2-astra")], ["openai-codex"]);
		vi.mocked(registry.getApiKeyForProvider).mockResolvedValue(undefined);
		await expect(resolveAvailablePreferredModel("astra", registry)).rejects.toThrow(/Request authentication unavailable for openai-codex/);
	});

	it.each(["empty", "failed"])("uses Mantle when OpenAI availability is %s", async state => {
		const sol = modelFixture("bedrock-mantle", "openai.gpt-6.1-sol");
		const registry = registryFixture([sol], ["bedrock-mantle"]);
		if (state === "failed") vi.mocked(registry.getAvailableOfType).mockImplementation(async (_type, provider) => {
			if (provider === "openai") throw new Error("provider unavailable");
			return provider === "bedrock-mantle" ? [sol] : [];
		});
		await expect(resolveAvailablePreferredModel("sol", registry)).resolves.toBe(sol);
		expect(resolvePreferredModel("sol", registry)).toBe(sol);
	});

	it("recognizes the native AWS namespace without changing a requested Sol version", async () => {
		const sol = modelFixture("amazon-bedrock", "us.openai.gpt-6.1-sol");
		const registry = registryFixture([modelFixture("openai", "gpt-6-sol"), sol], ["openai", "amazon-bedrock"]);
		await expect(resolveAvailablePreferredModel("gpt-6.1-sol", registry)).resolves.toBe(sol);
		expect(resolvePreferredModel("gpt-6.1-sol", registry)).toBe(sol);
	});

	it("keeps the requested family and reports checked routes rather than claiming a missing login", async () => {
		const registry = registryFixture([modelFixture("openai", "gpt-6.1-terra")], ["openai"]);
		await expect(resolveAvailablePreferredModel("sol", registry)).rejects.toThrow(/No available.*sol.*openai, openai-codex, bedrock-mantle, amazon-bedrock/);
	});

	it("keeps Opus and Grok on their allowed AWS routes", async () => {
		const opus = modelFixture("bedrock-mantle", "anthropic.claude-opus-5-5");
		const grok = modelFixture("amazon-bedrock", "us.xai.grok-4.7");
		const registry = registryFixture([opus, grok], ["bedrock-mantle", "amazon-bedrock"]);
		await expect(resolveAvailablePreferredModel("opus", registry)).resolves.toBe(opus);
		await expect(resolveAvailablePreferredModel("grok", registry)).resolves.toBe(grok);
		expect(registry.getAvailableOfType).not.toHaveBeenCalledWith("chat", "openai", expect.anything());
	});

	it("propagates cancellation rather than falling back to a paid route", async () => {
		const controller = new AbortController();
		const registry = registryFixture([], []);
		vi.mocked(registry.getAvailableOfType).mockImplementation(async () => {
			controller.abort();
			throw controller.signal.reason;
		});
		await expect(resolveAvailablePreferredModel("sol", registry, controller.signal)).rejects.toThrow();
		expect(registry.getAvailableOfType).toHaveBeenCalledTimes(1);
	});
});

describe("latest authenticated OpenAI family resolution", () => {
	it("keeps registry and runtime contracts separate at compile time", () => {
		expectTypeOf<ModelRegistry>().not.toExtend<Parameters<typeof resolveLatestCodexModelFromRuntime>[1]>();
		expectTypeOf<ModelRuntime>().not.toExtend<Parameters<typeof resolveLatestCodexModelFromRegistry>[1]>();
		expectTypeOf<ReturnType<typeof resolveLatestCodexModelFromRegistry>>().toEqualTypeOf<Model<Api>>();
		expectTypeOf<ReturnType<typeof resolveLatestCodexModelFromRuntime>>().toEqualTypeOf<Promise<Model<Api>>>();
	});

	it("uses the same OpenAI-only family/version selection for registry and runtime", async () => {
		const registry = registryFixture(models, ["openai", "bedrock-mantle"]);
		const runtime = { getAvailable: vi.fn<ModelRuntime["getAvailable"]>().mockResolvedValue(models) } satisfies Pick<ModelRuntime, "getAvailable">;
		const signal = new AbortController().signal;

		expect(resolveLatestCodexModelFromRegistry("luna", registry).id).toBe("gpt-6-luna");
		await expect(resolveLatestCodexModelFromRuntime("luna", runtime, signal)).resolves.toMatchObject({ provider: "openai", id: "gpt-6-luna" });
		expect(runtime.getAvailable).toHaveBeenCalledWith("openai", { signal });
	});

	it.each(["astra", "sol", "terra", "luna"] as const)("resolves %s synchronously with Pi's actual registry API", family => {
		const latest = modelFixture("openai", `gpt-7-${family}`);
		const registry = registryFixture([modelFixture("openai", `gpt-6-${family}`), latest], ["openai"]);
		// This real method was missing from the original mock, hiding the crash.
		expect(Array.isArray(registry.getAvailable())).toBe(true);
		expect(resolveLatestCodexModelFromRegistry(family, registry)).toBe(latest);
		expect(resolvePreferredModel(family, registry)).toBe(latest);
	});

	it("never substitutes another version, dated variant, or display name for an exact GPT ID", async () => {
		const registry = registryFixture([
			modelFixture("openai", "gpt-6.1-sol"),
			modelFixture("openai-codex", "gpt-6.2-sol-preview"),
			{ ...modelFixture("openai", "gpt-7-sol"), name: "gpt-6.2-sol" },
			modelFixture("bedrock-mantle", "openai.gpt-6.3-sol"),
		], ["openai", "openai-codex", "bedrock-mantle"]);
		expect(() => resolvePreferredModel("gpt-6.2-sol", registry)).toThrow(/No configured subscription or AWS model/);
		await expect(resolveAvailablePreferredModel("gpt-6.2-sol", registry)).rejects.toThrow(/No available subscription or AWS chat model/);
	});

	it("rejects missing families and never falls back to another provider", async () => {
		const onlyBedrock = [models[2]];
		const registry = registryFixture(onlyBedrock, ["bedrock-mantle"]);
		const runtime = { getAvailable: vi.fn<ModelRuntime["getAvailable"]>().mockResolvedValue(onlyBedrock) };
		expect(() => resolveLatestCodexModelFromRegistry("luna", registry)).toThrow(/No authenticated openai luna model/);
		await expect(resolveLatestCodexModelFromRuntime("luna", runtime)).rejects.toThrow(/No authenticated openai luna model/);
	});

	it("ignores unauthenticated registry entries", () => {
		const registry = registryFixture(models, []);
		expect(() => resolveLatestCodexModelFromRegistry("luna", registry)).toThrow(/No authenticated/);
		vi.mocked(registry.hasConfiguredAuth).mockImplementation(model => model.id !== "gpt-6-luna");
		expect(resolveLatestCodexModelFromRegistry("luna", registry).id).toBe("gpt-5.6-luna");
	});

	it("propagates runtime availability errors without fallback", async () => {
		const failure = new Error("availability failed");
		const runtime = { getAvailable: vi.fn<ModelRuntime["getAvailable"]>().mockRejectedValue(failure) };
		await expect(resolveLatestCodexModelFromRuntime("luna", runtime)).rejects.toBe(failure);
	});

	it("honors cancellation before and during availability lookup", async () => {
		const controller = new AbortController();
		const runtime = {
			getAvailable: vi.fn<ModelRuntime["getAvailable"]>().mockImplementation(async () => {
				controller.abort();
				return models;
			}),
		};
		await expect(resolveLatestCodexModelFromRuntime("luna", runtime, controller.signal)).rejects.toThrow();
		expect(runtime.getAvailable).toHaveBeenCalledWith("openai", { signal: controller.signal });
		runtime.getAvailable.mockClear();
		await expect(resolveLatestCodexModelFromRuntime("luna", runtime, controller.signal)).rejects.toThrow();
		expect(runtime.getAvailable).not.toHaveBeenCalled();
	});
});
