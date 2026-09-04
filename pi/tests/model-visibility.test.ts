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
	it("re-registers built-in OAuth providers without legacy OAuth helpers", async () => {
		const registerProvider = vi.fn();
		const model = {
			provider: "openai-codex",
			name: "GPT-5.5",
			api: "openai-codex-responses",
			baseUrl: "https://chatgpt.com/backend-api/codex",
			reasoning: true,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 200000,
			maxTokens: 128000,
		};
		const ctx = {
			modelRegistry: {
				getAll: () => [
					{ ...model, id: "gpt-5.5" },
					{ ...model, id: "codex-auto-review", name: "Codex Auto Review" },
				],
				getApiKeyForProvider: async () => "oauth-token",
				registerProvider,
			},
		};

		await expect(applyProviderFilter(ctx, "openai-codex")).resolves.toEqual({
			before: 2,
			after: 1,
		});
		expect(registerProvider).toHaveBeenCalledWith(
			"openai-codex",
			expect.objectContaining({
				baseUrl: model.baseUrl,
				models: [expect.objectContaining({ id: "gpt-5.5" })],
			}),
		);
		expect(registerProvider.mock.calls[0]?.[1]).not.toHaveProperty("oauth");
	});

});

describe("model visibility startup", () => {
	it("reads models once, resolves credentials concurrently, and registers in target order", async () => {
		const registerProvider = vi.fn();
		const models = [
			{
				provider: "openai-codex",
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
				provider: "openai-codex",
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
		expect(pendingCredentials).toBe(1);
		expect(registerProvider.mock.calls.map(([provider]) => provider)).toEqual([
			"openai-codex",
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
			shouldHideModel("openai-codex", {
				id: "codex-auto-review",
				name: "Codex Auto Review",
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
			shouldHideModel("openai-codex", { id: "gpt-5.5", name: "GPT-5.5" }),
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
