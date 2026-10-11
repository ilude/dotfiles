// @ts-nocheck
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockPi } from "./helpers/mock-pi";

vi.mock("@earendil-works/pi-ai/compat", () => ({
	getModels: vi.fn((provider: string) => {
		if (provider === "openai-codex") {
			return [
				{
					id: "gpt-5.6-luna",
					name: "GPT-5.6 Luna",
					provider,
					api: "openai-codex-responses",
					baseUrl: "https://chatgpt.com/backend-api",
					reasoning: true,
					thinkingLevelMap: {
						minimal: "low",
						xhigh: "xhigh",
						max: "max",
					},
					input: ["text", "image"],
					cost: { input: 1, output: 6, cacheRead: 0.1, cacheWrite: 1.25 },
					contextWindow: 272000,
					maxTokens: 128000,
				},
				{
					id: "gpt-5.6-sol",
					name: "GPT-5.6 Sol",
					provider,
					api: "openai-codex-responses",
					baseUrl: "https://chatgpt.com/backend-api",
					reasoning: true,
					thinkingLevelMap: {
						minimal: "low",
						xhigh: "xhigh",
						max: "max",
					},
					input: ["text", "image"],
					cost: { input: 5, output: 30, cacheRead: 0.5, cacheWrite: 6.25 },
					contextWindow: 272000,
					maxTokens: 128000,
				},
			];
		}
	}),
}));

import registerRefreshModelsCommand, {
	getCurrentSubscriptionProviders,
	orderProviderModels,
	parseRefreshModelsArgs,
	syncCuratedModelScope,
} from "../extensions/refresh-models";
import {
	getConfiguredBedrockModelIds,
	shouldHideModel,
} from "../extensions/model-visibility";

function mockJsonResponse(payload: unknown, status = 200) {
	return {
		ok: status >= 200 && status < 300,
		status,
		text: async () => JSON.stringify(payload),
	} as Response;
}

describe("parseRefreshModelsArgs", () => {
	it("returns empty scope when no provider is supplied", () => {
		expect(parseRefreshModelsArgs("")).toEqual({});
		expect(parseRefreshModelsArgs("   ")).toEqual({});
	});

	it("parses a single provider", () => {
		expect(parseRefreshModelsArgs("openai-codex")).toEqual({
			provider: "openai-codex",
		});
	});

	it("rejects multiple arguments", () => {
		expect(() => parseRefreshModelsArgs("openai-codex missing-provider")).toThrow(
			"Usage: /refresh-models [provider]",
		);
	});
});

describe("getCurrentSubscriptionProviders", () => {
	it("returns providers with oauth or api-key credentials", () => {
		const modelRegistry = {
			authStorage: {
				list: () => ["openai-codex", "openrouter", "missing"],
				get: (provider: string) => {
					if (provider === "openrouter") return { type: "api_key", key: "x" };
					if (provider === "missing") return undefined;
					return {
						type: "oauth",
						access: "x",
						refresh: "y",
						expires: Date.now() + 1000,
					};
				},
			},
		};
		expect(getCurrentSubscriptionProviders(modelRegistry)).toEqual([
			"openai-codex",
			"openrouter",
		]);
	});
});

describe("orderProviderModels", () => {
	it("orders latest size tiers before older generations without dropping models", () => {
		const models = [
			"gpt-5.5", "gpt-5.6-luna", "gpt-6-luna", "gpt-5.6-terra",
			"gpt-5.6-sol", "gpt-6-sol", "gpt-6-astra",
		].map((id) => ({ id }));
		expect(orderProviderModels(models).map(({ id }) => id)).toEqual([
			"gpt-6-astra", "gpt-6-sol", "gpt-5.6-terra", "gpt-6-luna",
			"gpt-5.6-sol", "gpt-5.6-luna", "gpt-5.5",
		]);
	});

	it("orders the latest Anthropic size tiers before older family versions", () => {
		const models = [
			"anthropic.claude-haiku-4-5", "anthropic.claude-opus-5",
			"anthropic.claude-sonnet-5", "anthropic.claude-fable-5-1",
			"anthropic.claude-opus-5-5",
		].map((id) => ({ id }));
		expect(orderProviderModels(models).map(({ id }) => id)).toEqual([
			"anthropic.claude-fable-5-1", "anthropic.claude-opus-5-5",
			"anthropic.claude-sonnet-5", "anthropic.claude-haiku-4-5",
			"anthropic.claude-opus-5",
		]);
	});
});

describe("/refresh-models command", () => {
	let tempHome: string;

	beforeEach(() => {
		vi.restoreAllMocks();
		tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-refresh-models-"));
		const agentDir = path.join(tempHome, ".pi", "agent");
		fs.mkdirSync(agentDir, { recursive: true });
		fs.writeFileSync(
			path.join(agentDir, "settings.json"),
			`${JSON.stringify(
				{
					enabledModels: ["openai/gpt-5.4"],
					unrelated: { preserved: true },
				},
				null,
				2,
			)}\n`,
			"utf-8",
		);
		vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
		fs.rmSync(tempHome, { recursive: true, force: true });
	});

	it("orders filtered provider models after Codex and Bedrock", async () => {
		const model = (provider: string, id: string, name = id) => ({
			provider,
			id,
			name,
			api: "openai-completions",
			baseUrl: "https://example.test",
			reasoning: false,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 128000,
			maxTokens: 16000,
		});
		const models = [
			model("openrouter", "google/gemini-3.1-pro", "Gemini 3.1 Pro"),
			model("openrouter", "openai/gpt-4o", "GPT-4o"),
			model("opencode", "zen"),
		];
		const ctx = {
			modelRegistry: {
				getAll: () => models,
				getProviderAuthStatus: (provider: string) => ({
					configured: provider === "openrouter" || provider === "opencode",
				}),
			},
		} as never;

		const result = await syncCuratedModelScope(ctx, [
			"us.anthropic.claude-fable-5-1",
		]);

		expect(result.scope).toEqual([
			"openai/gpt-5.4",
			"openrouter/google/gemini-3.1-pro",
			"opencode/zen",
		]);
		expect(result.scope).not.toContain("openrouter/openai/gpt-4o");
	});

	it("rebuilds configured Codex scope from refreshed available models", async () => {
		const model = (id: string) => ({
			provider: "openai",
			id,
			name: id,
			api: "openai-codex-responses",
			baseUrl: "https://chatgpt.com/backend-api",
			reasoning: true,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 256000,
			maxTokens: 128000,
		});
		const ctx = {
			modelRegistry: {
				getAll: () => [model("gpt-5.6-sol"), model("gpt-6-astra"), model("gpt-6-sol"), model("gpt-6.1-sol"), model("codex-auto-review")],
				getProviderAuthStatus: (provider: string) => ({
					configured: provider === "openai",
				}),
			},
		} as never;

		const result = await syncCuratedModelScope(ctx, []);

		expect(result.scope).toEqual([
			"openai/gpt-6-astra",
			"openai/gpt-6.1-sol",
			"openai/gpt-5.6-sol",
		]);
		expect(result.scope).not.toContain("openai/gpt-6-sol");
		expect(result.scope).not.toContain("openai/gpt-5.4");
		const settings = JSON.parse(fs.readFileSync(path.join(tempHome, ".pi", "agent", "settings.json"), "utf-8"));
		expect(settings).toMatchObject({ defaultProvider: "openai", defaultModel: "gpt-6.1-sol" });
	});

	it("ignores historic Codex cache when it has no new models", () => {
		const cacheDir = path.join(
			tempHome,
			".pi",
			"agent",
			"model-cache",
			"refresh-models",
		);
		fs.mkdirSync(cacheDir, { recursive: true });
		fs.writeFileSync(
			path.join(cacheDir, "openai-codex.json"),
			JSON.stringify({
				schemaVersion: 2,
				provider: "openai-codex",
				fetchedAt: "2026-07-09T00:00:00.000Z",
				models: [
					{
						id: "gpt-5.6-luna",
						thinkingLevelMap: { off: null, max: null },
					},
				],
			}),
			"utf-8",
		);

		const pi = createMockPi();
		const registerProvider = vi.fn();
		Object.assign(pi, { registerProvider });
		registerRefreshModelsCommand(
			pi as Parameters<typeof registerRefreshModelsCommand>[0],
		);
		const providerCall = registerProvider.mock.calls.find(
			([provider]: [string]) => provider === "openai-codex",
		);
		expect(providerCall).toBeUndefined();
		expect(registerProvider).not.toHaveBeenCalled();
	});

	it("ignores historic Codex versioned cache context windows", () => {
		const cacheDir = path.join(
			tempHome,
			".pi",
			"agent",
			"model-cache",
			"refresh-models",
		);
		fs.mkdirSync(cacheDir, { recursive: true });
		fs.writeFileSync(
			path.join(cacheDir, "openai-codex.json"),
			JSON.stringify({
				schemaVersion: 2,
				provider: "openai-codex",
				fetchedAt: "2026-07-09T00:00:00.000Z",
				models: [{ id: "gpt-5.6-sol", contextWindow: 372000 }],
			}),
			"utf-8",
		);

		const pi = createMockPi();
		const registerProvider = vi.fn();
		Object.assign(pi, { registerProvider });
		registerRefreshModelsCommand(
			pi as Parameters<typeof registerRefreshModelsCommand>[0],
		);
		const providerCall = registerProvider.mock.calls.find(
			([provider]: [string]) => provider === "openai-codex",
		);
		expect(providerCall).toBeUndefined();
		expect(registerProvider).not.toHaveBeenCalled();
	});

	it("ignores historic Codex cached discoveries", () => {
		const cacheDir = path.join(
			tempHome,
			".pi",
			"agent",
			"model-cache",
			"refresh-models",
		);
		fs.mkdirSync(cacheDir, { recursive: true });
		fs.writeFileSync(
			path.join(cacheDir, "openai-codex.json"),
			JSON.stringify({
				provider: "openai-codex",
				baseUrl: "https://stale.example.invalid",
				api: "openai-codex-responses",
				models: [
					{
						id: "gpt-5.6-luna",
						name: "Stale Luna",
						api: "openai-codex-responses",
						reasoning: true,
						thinkingLevelMap: {
							off: null,
							minimal: null,
							low: "low",
							medium: "medium",
							high: "high",
							xhigh: "xhigh",
						},
						input: ["text"],
						contextWindow: 128000,
						maxTokens: 16000,
					},
					{
						id: "gpt-5.7-preview",
						name: "GPT-5.7 Preview",
						api: "openai-codex-responses",
						reasoning: true,
						input: ["text"],
						contextWindow: 400000,
						maxTokens: 128000,
					},
				],
			}),
			"utf-8",
		);

		const pi = createMockPi();
		const registerProvider = vi.fn();
		Object.assign(pi, { registerProvider });
		registerRefreshModelsCommand(
			pi as Parameters<typeof registerRefreshModelsCommand>[0],
		);
		const providerCall = registerProvider.mock.calls.find(
			([provider]: [string]) => provider === "openai-codex",
		);
		expect(providerCall).toBeUndefined();
		expect(registerProvider).not.toHaveBeenCalled();
	});

	it("refreshes native OpenAI without token extraction, remote catalog or descriptor overlays", async () => {
		const pi = createMockPi();
		const startupRegister = vi.fn();
		Object.assign(pi, { registerProvider: startupRegister });
		registerRefreshModelsCommand(pi as never);
		const cmd = pi._commands.find((command) => command.name === "refresh-models");
		const models = ["gpt-6.1-sol", "gpt-6-luna", "gpt-6-sol"].map((id) => ({
			provider: "openai", type: "chat", id, name: id, api: "openai-responses",
			baseUrl: "https://api.openai.com/v1", inputLimits: { maxRequestBytes: 100 },
		}));
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const refresh = vi.fn(async () => ({ errors: new Map() }));
		const getApiKeyForProvider = vi.fn(async () => undefined);
		const registerProvider = vi.fn();
		const notify = vi.fn();
		const ctx = { ui: { notify }, modelRegistry: {
			getAll: () => [...models, { provider: "openai-codex", id: "historic" }],
			getProviderAuthStatus: (provider) => ({ configured: provider === "openai" }),
			refresh, getApiKeyForProvider, registerProvider,
		} };
		await cmd.handler("openai", ctx as never);
		expect(refresh).toHaveBeenCalledWith({ providers: ["openai"], allowNetwork: true, force: true });
		expect(getApiKeyForProvider).not.toHaveBeenCalled();
		expect(fetchMock).not.toHaveBeenCalled();
		expect(registerProvider).not.toHaveBeenCalled();
		expect(startupRegister).not.toHaveBeenCalled();
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("Done. Refreshed 1"), "info");
		const settings = JSON.parse(fs.readFileSync(path.join(tempHome, ".pi", "agent", "settings.json"), "utf-8"));
		expect(settings.enabledModels).toEqual(["openai/gpt-6.1-sol", "openai/gpt-6-luna"]);
	});

	it("refreshes anthropic using /v1/models with x-api-key auth", async () => {
		const pi = createMockPi();
		registerRefreshModelsCommand(
			pi as Parameters<typeof registerRefreshModelsCommand>[0],
		);
		const cmd = pi._commands.find((c) => c.name === "refresh-models");
		if (!cmd) throw new Error("command not registered");

		const fetchMock = vi.fn(async (url: string) => {
			if (url.includes("api.anthropic.com/v1/models")) {
				return mockJsonResponse({
					data: [
						{
							id: "claude-opus-4-7",
							display_name: "Claude Opus 4.7",
							max_input_tokens: 1000000,
							max_tokens: 128000,
							capabilities: { effort: { supported: true } },
						},
					],
				});
			}
			return mockJsonResponse({ error: "missing" }, 404);
		});
		vi.stubGlobal("fetch", fetchMock);

		const registerProvider = vi.fn();
		const notify = vi.fn();
		const ctx = {
			ui: { notify },
			modelRegistry: {
				authStorage: {
					list: () => ["anthropic"],
					get: () => ({
						type: "oauth",
						access: "x",
						refresh: "y",
						expires: Date.now() + 1000,
					}),
				},
				getApiKeyForProvider: vi.fn(async () => "sk-ant-oat-test"),
				getAll: () => [
					{
						provider: "anthropic",
						id: "claude-sonnet-4-5",
						name: "Claude Sonnet 4.5",
						api: "anthropic-messages",
						baseUrl: "https://api.anthropic.com",
						reasoning: true,
						input: ["text", "image"],
						cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
						contextWindow: 200000,
						maxTokens: 64000,
					},
				],
				registerProvider,
			},
		};

		await cmd.handler("anthropic", ctx as Parameters<typeof cmd.handler>[1]);

		expect(registerProvider).toHaveBeenCalledWith(
			"anthropic",
			expect.objectContaining({
				models: expect.arrayContaining([
					expect.objectContaining({
						id: "claude-opus-4-7",
						api: "anthropic-messages",
						contextWindow: 1000000,
						maxTokens: 128000,
					}),
				]),
			}),
		);

		const anthropicCall = fetchMock.mock.calls.find(([url]: [string]) =>
			url.includes("api.anthropic.com/v1/models"),
		);
		expect(anthropicCall).toBeDefined();
		expect(anthropicCall?.[1]?.headers?.["x-api-key"]).toBe("sk-ant-oat-test");
		expect(anthropicCall?.[1]?.headers?.["anthropic-version"]).toBe(
			"2023-06-01",
		);
		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("claude-opus-4-7"),
			"info",
		);
		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("claude-sonnet-4-5"),
			"info",
		);
		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("Done. Refreshed 1"),
			"info",
		);
	});

	it("refreshes API-key providers with generic /models catalogs", async () => {
		const pi = createMockPi();
		registerRefreshModelsCommand(
			pi as Parameters<typeof registerRefreshModelsCommand>[0],
		);
		const cmd = pi._commands.find((c) => c.name === "refresh-models");
		if (!cmd) throw new Error("command not registered");

		const fetchMock = vi.fn(async (url: string) => {
			if (url === "https://openrouter.ai/api/v1/models") {
				return mockJsonResponse({
					data: [{ id: "anthropic/claude-opus-4.7" }, { id: "openai/gpt-5.5" }],
				});
			}
			if (url === "https://opencode.ai/zen/v1/models") {
				return mockJsonResponse({ data: [{ id: "zen" }, { id: "sonnet" }] });
			}
			return mockJsonResponse({ error: "missing" }, 404);
		});
		vi.stubGlobal("fetch", fetchMock);

		const registerProvider = vi.fn();
		const notify = vi.fn();
		const ctx = {
			ui: { notify },
			modelRegistry: {
				authStorage: {
					list: () => ["openrouter", "opencode"],
					get: () => ({ type: "api_key", key: "x" }),
				},
				getApiKeyForProvider: vi.fn(async (provider: string) => provider + "-key"),
				getAll: () => [
					{
						provider: "openrouter",
						id: "anthropic/claude-opus-4.7",
						name: "Claude Opus 4.7",
						api: "openai-completions",
						baseUrl: "https://openrouter.ai/api/v1",
						reasoning: true,
						input: ["text"],
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
						contextWindow: 200000,
						maxTokens: 64000,
					},
					{
						provider: "opencode",
						id: "zen",
						name: "Zen",
						api: "openai-completions",
						baseUrl: "https://opencode.ai/zen",
						reasoning: false,
						input: ["text"],
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
						contextWindow: 128000,
						maxTokens: 16000,
					},
				],
				registerProvider,
			},
		};

		await cmd.handler("", ctx as Parameters<typeof cmd.handler>[1]);

		expect(registerProvider).toHaveBeenCalledTimes(2);
		expect(registerProvider).toHaveBeenCalledWith(
			"openrouter",
			expect.objectContaining({
				models: expect.arrayContaining([
					expect.objectContaining({ id: "openai/gpt-5.5" }),
				]),
			}),
		);
		expect(registerProvider).toHaveBeenCalledWith(
			"opencode",
			expect.objectContaining({
				models: expect.arrayContaining([
					expect.objectContaining({ id: "sonnet" }),
				]),
			}),
		);
		const openrouterDefinition = registerProvider.mock.calls.find(
			([provider]) => provider === "openrouter",
		)?.[1];
		expect(openrouterDefinition.oauth).toBeUndefined();
		expect(openrouterDefinition.apiKey).toBeUndefined();
		expect(openrouterDefinition.api).toBe("openai-completions");
		expect(
			openrouterDefinition.models.find(
				(model: { id: string }) => model.id === "openai/gpt-5.5",
			)?.contextWindow,
		).toBe(256000);
		const opencodeDefinition = registerProvider.mock.calls.find(
			([provider]) => provider === "opencode",
		)?.[1];
		expect(opencodeDefinition.apiKey).toBeUndefined();
		expect(opencodeDefinition.api).toBe("openai-completions");
		expect(
			opencodeDefinition.models.find(
				(model: { id: string }) => model.id === "sonnet",
			)?.contextWindow,
		).toBe(256000);
		expect(
			fetchMock.mock.calls.find(
				([url]) => url === "https://openrouter.ai/api/v1/models",
			)?.[1].headers.Authorization,
		).toBe("Bearer openrouter-key");
		expect(
			fetchMock.mock.calls.find(
				([url]) => url === "https://opencode.ai/zen/v1/models",
			)?.[1].headers.Authorization,
		).toBe("Bearer opencode-key");
		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("openai/gpt-5.5"),
			"info",
		);
		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("sonnet"),
			"info",
		);
		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("Done. Refreshed 2"),
			"info",
		);
		const settings = JSON.parse(
			fs.readFileSync(
				path.join(tempHome, ".pi", "agent", "settings.json"),
				"utf-8",
			),
		);
		expect(settings.enabledModels).toEqual([
			"openai/gpt-5.4",
			"opencode/zen",
		]);
		expect(settings.unrelated).toEqual({ preserved: true });
	});

	it("refreshes configured Bedrock models through the universal command", async () => {
		const pi = createMockPi();
		registerRefreshModelsCommand(pi as never);
		const cmd = pi._commands.find((command) => command.name === "refresh-models");
		if (!cmd) throw new Error("command not registered");

		const notify = vi.fn();
		const reload = vi.fn(async () => undefined);
		let models = [
			{ provider: "bedrock-mantle", id: "openai.gpt-5.6-luna" },
		];
		const refresh = vi.fn(async () => {
			models = [
				{ provider: "bedrock-mantle", id: "openai.gpt-5.6-luna" },
				{ provider: "bedrock-mantle", id: "anthropic.claude-opus-5" },
			];
			return { refreshed: new Set(["bedrock-mantle"]), errors: new Map() };
		});
		const ctx = {
			ui: { notify }, reload,
			modelRegistry: {
				getAll: () => models,
				getProviderAuthStatus: (provider: string) => ({ configured: provider === "bedrock-mantle" }),
				refresh,
			},
		};

		await cmd.handler("", ctx as never);

		expect(refresh).toHaveBeenCalledWith({ providers: ["bedrock-mantle"], allowNetwork: true, force: true });
		const settings = JSON.parse(fs.readFileSync(path.join(tempHome, ".pi", "agent", "settings.json"), "utf-8"));
		expect(settings.enabledModels).toEqual([
			"openai/gpt-5.4",
			"bedrock-mantle/anthropic.claude-opus-5",
			"bedrock-mantle/openai.gpt-5.6-luna",
		]);
		expect(reload).toHaveBeenCalledOnce();
	});

	it("fails when an explicit provider is not configured", async () => {
		const pi = createMockPi();
		registerRefreshModelsCommand(
			pi as Parameters<typeof registerRefreshModelsCommand>[0],
		);
		const cmd = pi._commands.find((c) => c.name === "refresh-models");
		if (!cmd) throw new Error("command not registered");

		const notify = vi.fn();
		const ctx = {
			ui: { notify },
			modelRegistry: {
				authStorage: {
					list: () => ["openai-codex"],
					get: () => ({
						type: "oauth",
						access: "x",
						refresh: "y",
						expires: Date.now() + 1000,
					}),
				},
			},
		};

		await cmd.handler(
			"missing-provider",
			ctx as Parameters<typeof cmd.handler>[1],
		);
		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("not configured"),
			"error",
		);
	});
});
