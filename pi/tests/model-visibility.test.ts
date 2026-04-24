import { describe, expect, it, vi } from "vitest";

vi.mock("@mariozechner/pi-ai/oauth", () => ({
	getOAuthProvider: vi.fn(),
}));

import { shouldHideModel } from "../extensions/model-visibility";

describe("shouldHideModel", () => {
	it("hides date/version suffix and preview snapshots", () => {
		expect(shouldHideModel("github-copilot", { id: "gpt-4.1-2025-04-14", name: "GPT-4.1" })).toBe(true);
		expect(shouldHideModel("github-copilot", { id: "gpt-4-0613", name: "GPT-4" })).toBe(true);
		expect(shouldHideModel("openrouter", { id: "gemini-3-flash-preview", name: "Gemini 3 Flash" })).toBe(true);
	});

	it("hides explicit blocklist entries", () => {
		expect(shouldHideModel("openai-codex", { id: "codex-auto-review", name: "Codex Auto Review" })).toBe(true);
		expect(shouldHideModel("opencode", { id: "claude-opus-4-1", name: "Claude Opus 4.1" })).toBe(true);
		expect(shouldHideModel("openrouter", { id: "openai/gpt-4o", name: "GPT-4o" })).toBe(true);
		expect(shouldHideModel("openrouter", { id: "openai/gpt-audio", name: "GPT Audio" })).toBe(true);
		expect(shouldHideModel("openrouter", { id: "arcee-ai/trinity-mini", name: "Trinity Mini" })).toBe(true);
		expect(shouldHideModel("openrouter", { id: "nex-agi/deepseek-v3.1-nex-n1", name: "DeepSeek" })).toBe(true);
		expect(shouldHideModel("openrouter", { id: "nvidia/llama-3.1-nemotron-70b-instruct", name: "Nemotron" })).toBe(true);
		expect(shouldHideModel("openrouter", { id: "meta-llama/llama-3.1-70b", name: "Llama" })).toBe(true);
	});

	it("keeps non-blocked modern models", () => {
		expect(shouldHideModel("openai-codex", { id: "gpt-5.5", name: "GPT-5.5" })).toBe(false);
		expect(shouldHideModel("opencode", { id: "claude-sonnet-4.6", name: "Claude Sonnet 4.6" })).toBe(false);
		expect(shouldHideModel("openrouter", { id: "openai/gpt-5", name: "GPT-5" })).toBe(false);
	});
});
