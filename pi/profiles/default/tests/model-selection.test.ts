import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { resolveLatestCodexModelFromRegistry, resolveLatestCodexModelFromRuntime, resolvePreferredModel } from "../lib/model-selection.ts";
import { modelFixture, registryFixture } from "./helpers/model-selection.ts";

const models = [
	modelFixture("openai-codex", "gpt-5.6-luna"),
	modelFixture("openai-codex", "gpt-6-luna"),
	modelFixture("bedrock-mantle", "openai.gpt-7-luna"),
	modelFixture("openai-codex", "gpt-7-sol"),
];

describe("latest authenticated Codex family resolution", () => {
	it("keeps registry and runtime contracts separate at compile time", () => {
		expectTypeOf<ModelRegistry>().not.toExtend<Parameters<typeof resolveLatestCodexModelFromRuntime>[1]>();
		expectTypeOf<ModelRuntime>().not.toExtend<Parameters<typeof resolveLatestCodexModelFromRegistry>[1]>();
		expectTypeOf<ReturnType<typeof resolveLatestCodexModelFromRegistry>>().toEqualTypeOf<Model<Api>>();
		expectTypeOf<ReturnType<typeof resolveLatestCodexModelFromRuntime>>().toEqualTypeOf<Promise<Model<Api>>>();
	});

	it("uses the same Codex-only family/version selection for registry and runtime", async () => {
		const registry = registryFixture(models, ["openai-codex", "bedrock-mantle"]);
		const runtime = { getAvailable: vi.fn<ModelRuntime["getAvailable"]>().mockResolvedValue(models) } satisfies Pick<ModelRuntime, "getAvailable">;
		const signal = new AbortController().signal;

		expect(resolveLatestCodexModelFromRegistry("luna", registry).id).toBe("gpt-6-luna");
		await expect(resolveLatestCodexModelFromRuntime("luna", runtime, signal)).resolves.toMatchObject({ provider: "openai-codex", id: "gpt-6-luna" });
		expect(runtime.getAvailable).toHaveBeenCalledWith("openai-codex", { signal });
	});

	it.each(["astra", "sol", "terra", "luna"] as const)("resolves %s synchronously with Pi's actual registry API", family => {
		const latest = modelFixture("openai-codex", `gpt-7-${family}`);
		const pinned = modelFixture("openai-codex", "gpt-5.6-sol");
		const registry = registryFixture([modelFixture("openai-codex", `gpt-6-${family}`), latest, pinned], ["openai-codex"]);
		// This real method was missing from the original mock, hiding the crash.
		expect(Array.isArray(registry.getAvailable())).toBe(true);
		expect(resolveLatestCodexModelFromRegistry(family, registry)).toBe(family === "sol" ? pinned : latest);
		expect(resolvePreferredModel(family, registry)).toBe(family === "sol" ? pinned : latest);
	});

	it("rejects missing families and never falls back to another provider", async () => {
		const onlyBedrock = [models[2]];
		const registry = registryFixture(onlyBedrock, ["bedrock-mantle"]);
		const runtime = { getAvailable: vi.fn<ModelRuntime["getAvailable"]>().mockResolvedValue(onlyBedrock) };
		expect(() => resolveLatestCodexModelFromRegistry("luna", registry)).toThrow(/No authenticated openai-codex luna model/);
		await expect(resolveLatestCodexModelFromRuntime("luna", runtime)).rejects.toThrow(/No authenticated openai-codex luna model/);
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
		expect(runtime.getAvailable).toHaveBeenCalledWith("openai-codex", { signal: controller.signal });
		runtime.getAvailable.mockClear();
		await expect(resolveLatestCodexModelFromRuntime("luna", runtime, controller.signal)).rejects.toThrow();
		expect(runtime.getAvailable).not.toHaveBeenCalled();
	});
});
