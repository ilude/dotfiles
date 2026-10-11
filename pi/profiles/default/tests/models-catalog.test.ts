import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchProviderCatalog, parseRemoteModels } from "../lib/models/catalog.ts";

afterEach(() => vi.unstubAllGlobals());

describe("default provider catalog transport", () => {
	it.each(["openai", "openai-codex"])("does not send %s credentials to a catalog endpoint", async (provider) => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		await expect(fetchProviderCatalog({ provider, baseUrl: "https://api.openai.com/v1", apiKey: "native-credential" })).rejects.toThrow(
			provider === "openai" ? "native provider" : "historic openai-codex",
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("preserves unrelated catalog discovery", async () => {
		const fetchMock = vi.fn(async () => ({ ok: true, text: async () => JSON.stringify({ data: [{ id: "model" }] }) }));
		vi.stubGlobal("fetch", fetchMock);
		const payload = await fetchProviderCatalog({ provider: "openrouter", baseUrl: "https://openrouter.ai/api/v1", apiKey: "key" });
		expect(fetchMock).toHaveBeenCalledWith("https://openrouter.ai/api/v1/models", {
			method: "GET", headers: { Accept: "application/json", Authorization: "Bearer key" },
		});
		expect(parseRemoteModels("openrouter", payload)).toEqual([{ id: "model" }]);
	});
});
