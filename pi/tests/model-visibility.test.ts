import { describe, expect, it, vi } from "vitest";

vi.mock("@earendil-works/pi-ai/oauth", () => ({
	getOAuthProvider: vi.fn(),
}));

import { shouldHideModel } from "../extensions/model-visibility";

describe("shouldHideModel", () => {
	it("hides date/version suffix and preview snapshots", () => {
		expect(
			shouldHideModel("github-copilot", {
				id: "gpt-4.1-2025-04-14",
				name: "GPT-4.1",
			}),
		).toBe(true);
		expect(
			shouldHideModel("github-copilot", { id: "gpt-4-0613", name: "GPT-4" }),
		).toBe(true);
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

	it("only keeps US Amazon Bedrock Anthropic models", () => {
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
		).toBe(false);
		expect(
			shouldHideModel("amazon-bedrock", {
				id: "global.amazon.nova-pro-v1",
				name: "Amazon Nova Pro",
			}),
		).toBe(false);
	});

	it("hides selected OpenCode model families and ids", () => {
		const hiddenIds = [
			"claude-haiku-4-5",
			"claude-opus-4-5",
			"claude-opus-4-6",
			"claude-opus-4-7",
			"claude-sonnet-4-5",
			"claude-sonnet-4-6",
			"gpt-5.1",
			"qwen3.5-plus",
		];

		for (const id of hiddenIds) {
			expect(shouldHideModel("opencode", { id, name: id }), id).toBe(true);
		}
	});

	it("hides selected OpenRouter model families and ids", () => {
		const hiddenIds = [
			"anthropic/claude-sonnet-4.6",
			"deepseek/deepseek-v3.2",
			"deepseek/deepseek-v3.2-exp",
			"google/gemma-3-12b-it",
			"google/gemma-3-27b-it",
			"ibm-granite/granite-4.1-8b",
			"inclusionai/ling-2.6-1t",
			"inclusionai/ling-2.6-flash",
			"inclusionai/ring-2.6-1t",
			"minimax/minimax-m2.5",
			"nvidia/nemotron-3-nano-30b-a3b",
			"openai/gpt-5.1",
			"openrouter/owl-alpha",
			"poolside/laguna-m.1:free",
			"poolside/laguna-xs.2:free",
			"qwen/qwen3.5-122b-a10b",
			"qwen/qwen3.5-27b",
			"qwen/qwen3.5-35b-a3b",
			"qwen/qwen3.5-397b-a17b",
			"qwen/qwen3.5-9b",
			"qwen/qwen3.5-flash-02-23",
			"qwen/qwen3.5-plus-02-15",
			"z-ai/glm-5",
			"z-ai/glm-5-turbo",
			"z-ai/glm-5.1",
			"z-ai/glm-5v-turbo",
			"~anthropic/claude-haiku-latest",
			"~anthropic/claude-opus-latest",
			"~anthropic/claude-sonnet-latest",
			"~google/gemini-flash-latest",
			"~google/gemini-pro-latest",
			"~moonshotai/kimi-latest",
			"~openai/gpt-latest",
			"~openai/gpt-mini-latest",
		];

		for (const id of hiddenIds) {
			expect(shouldHideModel("openrouter", { id, name: id }), id).toBe(true);
		}
	});

	it("hides selected Amazon Bedrock model families and ids", () => {
		const hiddenIds = [
			"meta.llama3-70b-instruct-v1:0",
			"minimax.minimax-m2",
			"minimax.minimax-m2.1",
			"deepseek.r1-v1:0",
			"deepseek.v3-v1:0",
			"mistral.mistral-large-2407-v1:0",
			"moonshot.kimi-k2-thinking",
			"nvidia.nemotron-3-nano-30b-a3b-v1:0",
			"us.anthropic.claude-opus-4-1-20250805-v1:0",
			"us.anthropic.claude-sonnet-4-5-20250929-v1:0",
			"us.deepseek.r1-v1:0",
			"us.meta.llama4-maverick-17b-instruct-v1:0",
			"us.meta.llama4-scout-17b-instruct-v1:0",
			"writer.palmyra-x4-v1:0",
			"writer.palmyra-x5-v1:0",
			"zai.glm-4.7",
			"zai.glm-4.7-flash",
		];

		for (const id of hiddenIds) {
			expect(shouldHideModel("amazon-bedrock", { id, name: id }), id).toBe(
				true,
			);
		}
	});

	it("hides non-US Amazon Bedrock regional models", () => {
		expect(
			shouldHideModel("amazon-bedrock", {
				id: "au.anthropic.claude-sonnet-4-6",
				name: "Claude Sonnet 4.6",
			}),
		).toBe(true);
		expect(
			shouldHideModel("amazon-bedrock", {
				id: "eu.anthropic.claude-sonnet-4-6",
				name: "Claude Sonnet 4.6",
			}),
		).toBe(true);
		expect(
			shouldHideModel("amazon-bedrock", {
				id: "us.anthropic.claude-sonnet-4-6",
				name: "Claude Sonnet 4.6",
			}),
		).toBe(false);
	});
});
