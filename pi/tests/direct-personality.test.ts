import { describe, expect, it, vi } from "vitest";

import { readMergedSettings } from "../lib/settings-loader.js";
import directPersonality, {
	appendDirectPersonalityPrompt,
	applyDirectVerbosity,
	isDirectPersonalityEnabled,
	supportsOpenAiGpt5Verbosity,
} from "../extensions/direct-personality.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

vi.mock("../lib/settings-loader.js", () => ({
	readMergedSettings: vi.fn(() => ({})),
}));

describe("direct-personality helpers", () => {
	it("is per-user opt-in and defaults off", () => {
		expect(isDirectPersonalityEnabled({})).toBe(false);
		expect(isDirectPersonalityEnabled({ personality: "default" })).toBe(false);
		expect(isDirectPersonalityEnabled({ personality: "none" })).toBe(false);
		expect(isDirectPersonalityEnabled({ personality: "direct" })).toBe(true);
		expect(isDirectPersonalityEnabled({ pi: { personality: "direct" } })).toBe(true);
	});

	it("appends direct prompt only once when enabled", () => {
		const base = "base prompt";
		const once = appendDirectPersonalityPrompt(base, { personality: "direct" });
		expect(once).toContain("Communication style: direct");
		expect(appendDirectPersonalityPrompt(once, { personality: "direct" })).toBe(once);
		expect(appendDirectPersonalityPrompt(base, {})).toBe(base);
	});

	it("supports only OpenAI GPT-5 family verbosity", () => {
		expect(supportsOpenAiGpt5Verbosity({ provider: "openai-codex", id: "gpt-5.5" })).toBe(true);
		expect(supportsOpenAiGpt5Verbosity({ provider: "openai", id: "gpt-5-codex" })).toBe(true);
		expect(supportsOpenAiGpt5Verbosity({ provider: "openrouter", id: "openai/gpt-5.5" })).toBe(false);
		expect(supportsOpenAiGpt5Verbosity({ provider: "anthropic", id: "claude-sonnet-4-6" })).toBe(false);
		expect(supportsOpenAiGpt5Verbosity({ provider: "openai-codex", id: "gpt-4.1" })).toBe(false);
	});

	it("applies low verbosity without overwriting explicit verbosity", () => {
		expect(
			applyDirectVerbosity({ model: "gpt-5.5" }, { personality: "direct" }, { provider: "openai-codex", id: "gpt-5.5" }),
		).toEqual({ model: "gpt-5.5", text: { verbosity: "low" } });
		expect(
			applyDirectVerbosity(
				{ text: { verbosity: "medium" } },
				{ personality: "direct" },
				{ provider: "openai-codex", id: "gpt-5.5" },
			),
		).toEqual({ text: { verbosity: "medium" } });
		expect(
			applyDirectVerbosity({ model: "claude" }, { personality: "direct" }, { provider: "anthropic", id: "claude" }),
		).toEqual({ model: "claude" });
	});
});

describe("direct-personality extension", () => {
	it("registers prompt and provider hooks", () => {
		const pi = createMockPi();
		directPersonality(pi as any);
		expect(pi._getHook("before_agent_start")).toHaveLength(1);
		expect(pi._getHook("before_provider_request")).toHaveLength(1);
	});

	it("before_agent_start hook appends prompt when user setting enables direct mode", async () => {
		(readMergedSettings as any).mockReturnValueOnce({ personality: "direct" });
		const pi = createMockPi();
		directPersonality(pi as any);
		const hook = pi._getHook("before_agent_start")[0].handler;
		const result = await hook({ systemPrompt: "base" }, createMockCtx());
		expect(result.systemPrompt).toContain("Communication style: direct");
	});

	it("provider hook is no-op when settings are absent", async () => {
		(readMergedSettings as any).mockReturnValueOnce({});
		const pi = createMockPi();
		directPersonality(pi as any);
		const hook = pi._getHook("before_provider_request")[0].handler;
		const result = await hook({ payload: { model: "gpt-5.5" } }, createMockCtx({ model: { provider: "openai-codex", id: "gpt-5.5" } }));
		expect(result).toBeUndefined();
	});

	it("provider hook applies verbosity only when user setting enables direct mode", async () => {
		(readMergedSettings as any).mockReturnValueOnce({ personality: "direct" });
		const pi = createMockPi();
		directPersonality(pi as any);
		const hook = pi._getHook("before_provider_request")[0].handler;
		const result = await hook({ payload: { model: "gpt-5.5" } }, createMockCtx({ model: { provider: "openai-codex", id: "gpt-5.5" } }));
		expect(result).toEqual({ model: "gpt-5.5", text: { verbosity: "low" } });
	});
});
