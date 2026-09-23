import { describe, expect, it, vi } from "vitest";
import type { Api, Model } from "@earendil-works/pi-ai";
import { resolveLatestAuthenticatedCodexModel } from "../lib/model-selection.ts";

const models = [
	{ provider: "openai-codex", id: "gpt-5.6-luna" },
	{ provider: "openai-codex", id: "gpt-6-luna" },
	{ provider: "bedrock-mantle", id: "openai.gpt-7-luna" },
	{ provider: "openai-codex", id: "gpt-7-sol" },
] as Model<Api>[];

describe("latest authenticated Codex family resolution", () => {
	it("uses the same Codex-only family/version selection for ModelRegistry and ModelRuntime", async () => {
		const registry = { getAll: vi.fn(() => models), hasConfiguredAuth: vi.fn(() => true) };
		const runtime = { getAvailable: vi.fn(async () => models.filter(model => model.provider === "openai-codex")) };

		expect(resolveLatestAuthenticatedCodexModel("luna", registry).id).toBe("gpt-6-luna");
		await expect(resolveLatestAuthenticatedCodexModel("luna", runtime)).resolves.toMatchObject({ provider: "openai-codex", id: "gpt-6-luna" });
		expect(runtime.getAvailable).toHaveBeenCalledWith("openai-codex");
	});

	it("rejects a runtime result without the requested Codex family", async () => {
		const runtime = { getAvailable: vi.fn(async () => [models[2]]) };
		await expect(resolveLatestAuthenticatedCodexModel("luna", runtime)).rejects.toThrow(/No authenticated openai-codex luna model/);
	});

	it("ignores unauthenticated registry entries", () => {
		const registry = { getAll: vi.fn(() => models), hasConfiguredAuth: vi.fn((model: Model<Api>) => model.id !== "gpt-6-luna") };
		expect(resolveLatestAuthenticatedCodexModel("luna", registry).id).toBe("gpt-5.6-luna");
	});
});
