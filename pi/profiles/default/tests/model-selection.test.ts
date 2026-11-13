import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { resolveLatestCodexModelFromRegistry, resolveLatestCodexModelFromRuntime, resolveLatestShortcutModel, resolvePreferredModel } from "../lib/model-selection.ts";
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
		const pinned = modelFixture("openai", "gpt-6.1-sol");
		const registry = registryFixture([modelFixture("openai", `gpt-6-${family}`), latest, pinned], ["openai"]);
		// This real method was missing from the original mock, hiding the crash.
		expect(Array.isArray(registry.getAvailable())).toBe(true);
		expect(resolveLatestCodexModelFromRegistry(family, registry)).toBe(family === "sol" ? pinned : latest);
		expect(resolvePreferredModel(family, registry)).toBe(family === "sol" ? pinned : latest);
	});

	it("does not substitute Sol 5.6 or Sol 6 when pinned Sol 6.1 is unavailable", async () => {
		const older = [modelFixture("openai", "gpt-5.6-sol"), modelFixture("openai", "gpt-6-sol")];
		const registry = registryFixture(older, ["openai"]);
		const runtime = { getAvailable: vi.fn<ModelRuntime["getAvailable"]>().mockResolvedValue(older) };
		expect(() => resolvePreferredModel("sol", registry)).toThrow(/No authenticated openai sol model/);
		await expect(resolveLatestCodexModelFromRuntime("sol", runtime)).rejects.toThrow(/No authenticated openai sol model/);
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
