import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import opus5Style, {
	appendOpus5Instruction,
	isOpus5Model,
	OPUS_5_INSTRUCTION,
} from "../extensions/opus-5-style.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

const OPUS_MODELS = [
	{ provider: "amazon-bedrock", id: "us.anthropic.claude-opus-5" },
	{ provider: "amazon-bedrock", id: "global.anthropic.claude-opus-5" },
	{ provider: "bedrock-mantle", id: "anthropic.claude-opus-5-v1:0" },
	{ provider: "anthropic", id: "claude-opus-5" },
	{ provider: "opencode", id: "claude-opus-5" },
	{ provider: "openrouter", id: "anthropic/claude-opus-5-fast" },
];

const OTHER_MODELS = [
	{ provider: "amazon-bedrock", id: "us.anthropic.claude-fable-5" },
	{ provider: "anthropic", id: "claude-sonnet-5" },
	{ provider: "anthropic", id: "claude-haiku-5" },
	{ provider: "anthropic", id: "claude-opus-4-6" },
	{ provider: "openai-codex", id: "gpt-5.6-sol" },
];

describe("Opus 5 style instruction", () => {
	it.each(OPUS_MODELS)("matches $provider/$id", (model) => {
		expect(isOpus5Model(model)).toBe(true);
	});

	it.each(OTHER_MODELS)("does not match $provider/$id", (model) => {
		expect(isOpus5Model(model)).toBe(false);
	});

	it("preserves the base prompt and appends the instruction once", () => {
		const first = appendOpus5Instruction("base prompt", OPUS_MODELS[0]);

		expect(first).toContain("base prompt");
		expect(appendOpus5Instruction(first ?? "", OPUS_MODELS[0])).toBeUndefined();
		expect(first?.split(OPUS_5_INSTRUCTION)).toHaveLength(2);
	});

	it("registers the instruction on before_agent_start", async () => {
		const pi = createMockPi();
		opus5Style(pi as unknown as ExtensionAPI);
		const hook = pi._getHook("before_agent_start")[0]?.handler;

		const result = await hook?.(
			{ type: "before_agent_start", systemPrompt: "base prompt" },
			createMockCtx({ model: OPUS_MODELS[0] }),
		);

		expect(result?.systemPrompt).toContain("For Opus 5");
	});
});
