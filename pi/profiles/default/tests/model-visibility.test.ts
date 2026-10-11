// @ts-nocheck
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";

import modelVisibility, {
	applyProviderFilter,
	getConfiguredBedrockModelIds,
	shouldHideModel,
} from "../extensions/model-visibility";
import { createMockCtx, createMockPi } from "./helpers/mock-pi";

describe("applyProviderFilter", () => {
	it("preserves native descriptors and OAuth filtering without resolving an API key", async () => {
		const registerProvider = vi.fn();
		const model = {
			type: "chat",
			provider: "openai",
			name: "GPT-5.5",
			api: "openai-responses",
			baseUrl: "https://chatgpt.com/backend-api/codex",
			reasoning: true,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 200000,
			maxTokens: 128000,
		};
		const models = [{ ...model, id: "gpt-5.5", inputLimits: { images: { maxPerMessage: 10 } } },
			{ ...model, id: "codex-auto-review", name: "Codex Auto Review" }];
		const classifier = { ...model, type: "classifier", id: "gpt-6-luna" };
		const native = { id: "openai", api: { id: "openai-responses" }, auth: { oauth: {} },
			classifiers: { "openai-decisions": {} },
			getModels: () => models, getAllModels: () => [...models, classifier],
			filterAllModels: (all, credential) => credential?.type === "oauth"
				? all.filter((entry) => entry.type !== "classifier") : all };
		const getApiKeyForProvider = vi.fn(async () => undefined);
		const ctx = { modelRegistry: { getAll: () => models,
			getProvider: () => native, getApiKeyForProvider, registerProvider } };
		await expect(applyProviderFilter(ctx, "openai")).resolves.toEqual({ before: 2, after: 1 });
		expect(getApiKeyForProvider).not.toHaveBeenCalled();
		const wrapped = registerProvider.mock.calls[0][0];
		expect(wrapped.api).toBe(native.api);
		expect(wrapped.auth).toBe(native.auth);
		expect(wrapped.classifiers).toBe(native.classifiers);
		expect(wrapped.getModels()).toEqual([models[0]]);
		expect(wrapped.getModels()[0]).toBe(models[0]);
		expect(wrapped.getAllModels()).toEqual([models[0], classifier]);
		expect(wrapped.filterAllModels([...models, classifier], { type: "oauth" })).toEqual([models[0]]);
		expect(wrapped.filterAllModels([...models, classifier], { type: "api_key" })).toEqual([models[0], classifier]);
	});

});

describe("model visibility startup", () => {
	it("reads models once, resolves credentials concurrently, and registers in target order", async () => {
		const registerProvider = vi.fn();
		const models = [
			{
				provider: "openai",
				id: "codex-auto-review",
				name: "Codex Auto Review",
				api: "responses",
				baseUrl: "https://codex.example",
				reasoning: true,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 1,
				maxTokens: 1,
			},
			{
				provider: "openai",
				id: "gpt-5.5",
				name: "GPT-5.5",
				api: "responses",
				baseUrl: "https://codex.example",
				reasoning: true,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 1,
				maxTokens: 1,
			},
		];
		let pendingCredentials = 0;
		const ctx = {
			...createMockCtx(),
			sessionManager: { getSessionId: () => "test-session" },
			modelRegistry: {
				getAll: vi.fn(() => models),
				getProvider: () => ({ id: "openai", getModels: () => models }),
				getApiKeyForProvider: vi.fn(async () => {
					pendingCredentials += 1;
					return "token";
				}),
				registerProvider,
			},
		};
		const pi = createMockPi();
		modelVisibility(pi as Parameters<typeof modelVisibility>[0]);
		await pi._getHook("session_start")[0].handler({ reason: "startup" }, ctx);

		expect(ctx.modelRegistry.getAll).toHaveBeenCalledOnce();
		expect(pendingCredentials).toBe(0);
		expect(registerProvider.mock.calls.map(([provider]) => provider.id)).toEqual([
			"openai",
		]);
	});
});

describe("shouldHideModel", () => {
	it("hides date/version suffix and preview snapshots", () => {
		expect(
			shouldHideModel("openrouter", {
				id: "gemini-3-flash-preview",
				name: "Gemini 3 Flash",
			}),
		).toBe(true);
	});

	it("hides explicit blocklist entries", () => {
		expect(
			shouldHideModel("openai", {
				id: "codex-auto-review",
				name: "Codex Auto Review",
			}),
		).toBe(true);
		expect(
			shouldHideModel("openai", {
				id: "gpt-6-sol",
				name: "GPT-6 Sol",
			}),
		).toBe(true);
		expect(
			shouldHideModel("opencode", {
				id: "claude-opus-4-1",
				name: "Claude Opus 4.1",
			}),
		).toBe(true);
		expect(
			shouldHideModel("openrouter", { id: "openai/gpt-4o", name: "GPT-4o" }),
		).toBe(true);
		expect(
			shouldHideModel("openrouter", {
				id: "openai/gpt-audio",
				name: "GPT Audio",
			}),
		).toBe(true);
		expect(
			shouldHideModel("openrouter", {
				id: "arcee-ai/trinity-mini",
				name: "Trinity Mini",
			}),
		).toBe(true);
		expect(
			shouldHideModel("openrouter", {
				id: "nex-agi/deepseek-v3.1-nex-n1",
				name: "DeepSeek",
			}),
		).toBe(true);
		expect(
			shouldHideModel("openrouter", {
				id: "nvidia/llama-3.1-nemotron-70b-instruct",
				name: "Nemotron",
			}),
		).toBe(true);
		expect(
			shouldHideModel("openrouter", {
				id: "meta-llama/llama-3.1-70b",
				name: "Llama",
			}),
		).toBe(true);
	});

	it("keeps non-blocked modern models", () => {
		expect(
			shouldHideModel("openai", { id: "gpt-5.5", name: "GPT-5.5" }),
		).toBe(false);
		expect(
			shouldHideModel("openai", { id: "gpt-5.6-sol", name: "GPT-5.6 Sol" }),
		).toBe(false);
		expect(
			shouldHideModel("openai", { id: "gpt-6.1-sol", name: "GPT-6.1 Sol" }),
		).toBe(false);
		expect(
			shouldHideModel("opencode", {
				id: "claude-sonnet-4.6",
				name: "Claude Sonnet 4.6",
			}),
		).toBe(false);
		expect(
			shouldHideModel("openrouter", {
				id: "google/gemini-3-pro",
				name: "Gemini 3 Pro",
			}),
		).toBe(false);
	});

	it("only keeps selected Amazon Bedrock Anthropic models", () => {
		expect(
			shouldHideModel("amazon-bedrock", {
				id: "global.anthropic.claude-sonnet-4-6",
				name: "Claude Sonnet 4.6",
			}),
		).toBe(true);
		expect(
			shouldHideModel("amazon-bedrock", {
				id: "anthropic.claude-sonnet-4-5",
				name: "Claude Sonnet 4.5",
			}),
		).toBe(true);
		expect(
			shouldHideModel("amazon-bedrock", {
				id: "us.anthropic.claude-sonnet-4-6",
				name: "Claude Sonnet 4.6",
			}),
		).toBe(true);
		expect(
			shouldHideModel("amazon-bedrock", {
				id: "us.anthropic.claude-opus-5",
				name: "Claude Opus 5",
			}),
		).toBe(false);
		expect(
			shouldHideModel("amazon-bedrock", {
				id: "us.anthropic.claude-sonnet-5",
				name: "Claude Sonnet 5",
			}),
		).toBe(false);
		expect(
			shouldHideModel("amazon-bedrock", {
				id: "us.anthropic.claude-fable-5",
				name: "Claude Fable 5",
			}),
		).toBe(true);
		expect(
			shouldHideModel("amazon-bedrock", {
				id: "us.anthropic.claude-fable-5-1",
				name: "Claude Fable 5.1",
			}),
		).toBe(false);
		expect(
			shouldHideModel("amazon-bedrock", {
				id: "global.amazon.nova-pro-v1",
				name: "Amazon Nova Pro",
			}),
		).toBe(true);
	});


	it("loads refreshed Bedrock visibility IDs from settings", () => {
		const agentDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "pi-model-visibility-"),
		);
		try {
			fs.writeFileSync(
				path.join(agentDir, "settings.json"),
				JSON.stringify({
					bedrockRefresh: {
						models: ["us.anthropic.claude-fable-5-1"],
					},
				}),
			);
			vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
			expect(getConfiguredBedrockModelIds()).toEqual(
				new Set(["us.anthropic.claude-fable-5-1"]),
			);
		} finally {
			vi.unstubAllEnvs();
			fs.rmSync(agentDir, { recursive: true, force: true });
		}
	});

	it("hides non-US Amazon Bedrock regional models", () => {
		expect(
			shouldHideModel("amazon-bedrock", {
				id: "au.anthropic.claude-sonnet-5",
				name: "Claude Sonnet 5",
			}),
		).toBe(true);
		expect(
			shouldHideModel("amazon-bedrock", {
				id: "eu.anthropic.claude-sonnet-5",
				name: "Claude Sonnet 5",
			}),
		).toBe(true);
		expect(
			shouldHideModel("amazon-bedrock", {
				id: "us.anthropic.claude-sonnet-5",
				name: "Claude Sonnet 5",
			}),
		).toBe(false);
		expect(
			shouldHideModel("amazon-bedrock", {
				id: "eu.amazon.nova-pro-v1:0",
				name: "Amazon Nova Pro",
			}),
		).toBe(true);
	});
});
