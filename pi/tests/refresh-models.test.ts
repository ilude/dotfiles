import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockPi } from "./helpers/mock-pi";

vi.mock("@mariozechner/pi-ai/oauth", () => ({
	getOAuthProvider: vi.fn((provider: string) => ({
		id: provider,
		name: provider,
		login: vi.fn(),
		refreshToken: vi.fn(),
		getApiKey: vi.fn(),
	})),
}));

vi.mock("@mariozechner/pi-ai", () => ({
	getModels: vi.fn((provider: string) => {
		if (provider !== "github-copilot") return [];
		return [
			{
				id: "gpt-4.1",
				headers: {
					"User-Agent": "GitHubCopilotChat/0.35.0",
					"Editor-Version": "vscode/1.107.0",
					"Editor-Plugin-Version": "copilot-chat/0.35.0",
					"Copilot-Integration-Id": "vscode-chat",
				},
			},
		];
	}),
}));

import registerRefreshModelsCommand, {
	getCurrentSubscriptionProviders,
	parseRefreshModelsArgs,
} from "../extensions/refresh-models";

function makeCodexJwt(accountId = "acct_test") {
	const payload = Buffer.from(
		JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: accountId } }),
	).toString("base64url");
	return `header.${payload}.sig`;
}

function mockJsonResponse(payload: unknown, status = 200) {
	return {
		ok: status >= 200 && status < 300,
		status,
		text: async () => JSON.stringify(payload),
	} as any;
}

describe("parseRefreshModelsArgs", () => {
	it("returns empty scope when no provider is supplied", () => {
		expect(parseRefreshModelsArgs("")).toEqual({});
		expect(parseRefreshModelsArgs("   ")).toEqual({});
	});

	it("parses a single provider", () => {
		expect(parseRefreshModelsArgs("openai-codex")).toEqual({ provider: "openai-codex" });
	});

	it("rejects multiple arguments", () => {
		expect(() => parseRefreshModelsArgs("openai-codex github-copilot")).toThrow(
			"Usage: /refresh-models [provider]",
		);
	});
});

describe("getCurrentSubscriptionProviders", () => {
	it("returns only providers with oauth credentials", () => {
		const modelRegistry = {
			authStorage: {
				list: () => ["openai-codex", "openrouter", "github-copilot"],
				get: (provider: string) => {
					if (provider === "openrouter") return { type: "api_key", key: "x" };
					return { type: "oauth", access: "x", refresh: "y", expires: Date.now() + 1000 };
				},
			},
		};
		expect(getCurrentSubscriptionProviders(modelRegistry)).toEqual(["openai-codex", "github-copilot"]);
	});
});

describe("/refresh-models command", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("registers the slash command", () => {
		const pi = createMockPi();
		registerRefreshModelsCommand(pi as any);
		expect(pi.registerCommand).toHaveBeenCalledWith(
			"refresh-models",
			expect.objectContaining({ description: expect.any(String), handler: expect.any(Function) }),
		);
	});

	it("refreshes all active subscriptions when no provider is supplied", async () => {
		const pi = createMockPi();
		registerRefreshModelsCommand(pi as any);
		const cmd = pi._commands.find((c) => c.name === "refresh-models");
		if (!cmd) throw new Error("command not registered");

		const fetchMock = vi.fn(async (url: string) => {
			if (url.includes("chatgpt.com") && url.includes("/codex/models?client_version=")) {
				return mockJsonResponse({
					models: [
						{
							slug: "gpt-5.4",
							display_name: "GPT-5.4",
							input_modalities: ["text", "image"],
							supported_reasoning_levels: ["low", "high"],
							context_window: 272000,
						},
						{
							slug: "gpt-5.5",
							display_name: "GPT-5.5",
							input_modalities: ["text", "image"],
							supported_reasoning_levels: ["low", "high"],
							context_window: 272000,
						},
						{
							slug: "codex-auto-review",
							display_name: "Codex Auto Review",
							visibility: "hide",
							input_modalities: ["text", "image"],
							supported_reasoning_levels: ["low", "high"],
							context_window: 272000,
						},
					],
				});
			}
			if (url.includes("githubcopilot.com") && url.endsWith("/models")) {
				return mockJsonResponse({
					data: [
						{
							id: "gpt-4.1",
							name: "GPT-4.1",
							model_picker_enabled: true,
							supported_endpoints: ["/chat/completions"],
							capabilities: {
								supports: { vision: true, reasoning_effort: ["low"] },
								limits: { max_context_window_tokens: 128000, max_output_tokens: 16000 },
							},
						},
						{
							id: "claude-opus-4.7",
							name: "Claude Opus 4.7",
							model_picker_enabled: true,
							supported_endpoints: ["/v1/messages"],
							capabilities: {
								supports: { vision: true, adaptive_thinking: true },
								limits: { max_context_window_tokens: 200000, max_output_tokens: 64000 },
							},
							policy: { state: "enabled" },
						},
						{
							id: "text-embedding-3-small",
							name: "Embedding V3",
							model_picker_enabled: false,
							supported_endpoints: ["/chat/completions"],
						},
						{
							id: "oswe-vscode-secondary",
							name: "Raptor mini",
							model_picker_enabled: false,
							supported_endpoints: ["/responses"],
						},
						{
							id: "accounts/msft/routers/f185i3v4",
							name: "Search Agent A",
							model_picker_enabled: false,
							supported_endpoints: ["/chat/completions"],
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
					list: () => ["openai-codex", "github-copilot"],
					get: () => ({ type: "oauth", access: "x", refresh: "y", expires: Date.now() + 1000 }),
				},
				getApiKeyForProvider: vi.fn(async (provider: string) =>
					provider === "openai-codex" ? makeCodexJwt("acct_test") : "copilot-token",
				),
				getAll: () => [
					{
						provider: "openai-codex",
						id: "gpt-5.4",
						name: "GPT-5.4",
						api: "openai-codex-responses",
						baseUrl: "https://chatgpt.com/backend-api",
						reasoning: true,
						input: ["text", "image"],
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
						contextWindow: 272000,
						maxTokens: 128000,
					},
					{
						provider: "github-copilot",
						id: "gpt-4.1",
						name: "GPT-4.1",
						api: "openai-completions",
						baseUrl: "https://api.individual.githubcopilot.com",
						reasoning: false,
						input: ["text", "image"],
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
						contextWindow: 128000,
						maxTokens: 16384,
					},
					{
						provider: "github-copilot",
						id: "text-embedding-3-small",
						name: "Embedding V3",
						api: "openai-completions",
						baseUrl: "https://api.individual.githubcopilot.com",
						reasoning: false,
						input: ["text"],
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
						contextWindow: 8192,
						maxTokens: 1024,
					},
					{
						provider: "github-copilot",
						id: "oswe-vscode-secondary",
						name: "Raptor mini",
						api: "openai-responses",
						baseUrl: "https://api.individual.githubcopilot.com",
						reasoning: true,
						input: ["text"],
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
						contextWindow: 128000,
						maxTokens: 16000,
					},
				],
				registerProvider,
			},
		};

		await cmd.handler("", ctx as any);

		expect(registerProvider).toHaveBeenCalledTimes(2);
		expect(registerProvider).toHaveBeenCalledWith(
			"openai-codex",
			expect.objectContaining({
				models: expect.arrayContaining([
					expect.objectContaining({ id: "gpt-5.4", api: "openai-codex-responses" }),
					expect.objectContaining({ id: "gpt-5.5", api: "openai-codex-responses" }),
				]),
			}),
		);
		const codexProviderCall = registerProvider.mock.calls.find(([provider]: [string]) => provider === "openai-codex");
		if (!codexProviderCall) throw new Error("missing openai-codex registerProvider call");
		const codexModels = (codexProviderCall[1] as { models: Array<{ id: string }> }).models;
		expect(codexModels.some((model) => model.id === "codex-auto-review")).toBe(false);
		expect(registerProvider).toHaveBeenCalledWith(
			"github-copilot",
			expect.objectContaining({
				models: expect.arrayContaining([
					expect.objectContaining({ id: "gpt-4.1" }),
					expect.objectContaining({ id: "claude-opus-4.7", api: "anthropic-messages" }),
				]),
			}),
		);

		const copilotProviderCall = registerProvider.mock.calls.find(
			([provider]: [string]) => provider === "github-copilot",
		);
		if (!copilotProviderCall) throw new Error("missing github-copilot registerProvider call");
		const copilotModels = (copilotProviderCall[1] as { models: Array<{ id: string }> }).models;
		expect(copilotModels.some((model) => model.id.startsWith("accounts/"))).toBe(false);
		expect(copilotModels.some((model) => model.id === "text-embedding-3-small")).toBe(false);
		expect(copilotModels.some((model) => model.id === "oswe-vscode-secondary")).toBe(false);

		const codexCall = fetchMock.mock.calls.find(([url]: [string]) =>
			url.includes("/codex/models?client_version="),
		);
		expect(codexCall).toBeDefined();
		expect(codexCall?.[1]?.headers?.["chatgpt-account-id"]).toBe("acct_test");

		const copilotCall = fetchMock.mock.calls.find(([url]: [string]) =>
			url.includes("githubcopilot.com") && url.endsWith("/models"),
		);
		expect(copilotCall).toBeDefined();
		expect(copilotCall?.[1]?.headers?.["Editor-Version"]).toBe("vscode/1.107.0");

		expect(notify).toHaveBeenCalledWith(expect.stringContaining("openai-codex added: gpt-5.5"), "info");
		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("github-copilot added: claude-opus-4.7"),
			"info",
		);
		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("github-copilot removed: oswe-vscode-secondary, text-embedding-3-small"),
			"info",
		);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("Done. Refreshed 2"), "info");
	});

	it("refreshes anthropic using /v1/models with x-api-key auth", async () => {
		const pi = createMockPi();
		registerRefreshModelsCommand(pi as any);
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
					get: () => ({ type: "oauth", access: "x", refresh: "y", expires: Date.now() + 1000 }),
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

		await cmd.handler("anthropic", ctx as any);

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
		expect(anthropicCall?.[1]?.headers?.["anthropic-version"]).toBe("2023-06-01");
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("anthropic added: claude-opus-4-7"), "info");
		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("anthropic removed: claude-sonnet-4-5"),
			"info",
		);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("Done. Refreshed 1"), "info");
	});

	it("fails when an explicit provider is not an active subscription", async () => {
		const pi = createMockPi();
		registerRefreshModelsCommand(pi as any);
		const cmd = pi._commands.find((c) => c.name === "refresh-models");
		if (!cmd) throw new Error("command not registered");

		const notify = vi.fn();
		const ctx = {
			ui: { notify },
			modelRegistry: {
				authStorage: {
					list: () => ["openai-codex"],
					get: () => ({ type: "oauth", access: "x", refresh: "y", expires: Date.now() + 1000 }),
				},
			},
		};

		await cmd.handler("github-copilot", ctx as any);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("not an active subscription"), "error");
	});
});
