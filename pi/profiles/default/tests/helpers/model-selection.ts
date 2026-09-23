import { InMemoryCredentialStore, type Api, type Model } from "@earendil-works/pi-ai";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { vi } from "vitest";

// No profile files, credentials, catalog refresh, or provider requests.
const runtime = await ModelRuntime.create({
	credentials: new InMemoryCredentialStore(),
	modelsPath: null,
	refreshOnCreate: false,
	allowModelNetwork: false,
});

export function modelFixture(provider: string, id: string): Model<Api> {
	return {
		provider, id, name: id, api: "openai-codex-responses",
		baseUrl: "https://unused.invalid", reasoning: true, input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1000, maxTokens: 1000,
	};
}

// Use Pi's actual class, including its synchronous getAvailable method.
// Only catalog contents and configured-auth answers are controlled by tests.
export function registryFixture(models: Model<Api>[], authenticated: string[]): ModelRegistry {
	const registry = new ModelRegistry(runtime);
	vi.spyOn(registry, "getAll").mockReturnValue(models);
	vi.spyOn(registry, "hasConfiguredAuth").mockImplementation(model => authenticated.includes(model.provider));
	return registry;
}
