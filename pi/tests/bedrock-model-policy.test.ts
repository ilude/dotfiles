import { describe, expect, it } from "vitest";
import {
	selectLatestClaudeModelIds,
	selectLatestGptModelIds,
} from "../lib/bedrock-model-policy.js";

describe("Bedrock model policy", () => {
	it("advances Claude families across major releases", () => {
		expect(
			selectLatestClaudeModelIds(
				[
					"us.anthropic.claude-opus-4-8",
					"us.anthropic.claude-opus-5",
					"us.anthropic.claude-opus-6",
					"us.anthropic.claude-opus-6-20270101",
					"us.anthropic.claude-fable-5",
					"us.anthropic.claude-sonnet-5",
					"us.anthropic.claude-haiku-4-5-20251001-v1:0",
				],
				"us.anthropic",
			),
		).toEqual([
			"us.anthropic.claude-fable-5",
			"us.anthropic.claude-opus-6",
			"us.anthropic.claude-sonnet-5",
			"us.anthropic.claude-haiku-4-5-20251001-v1:0",
		]);
	});

	it("keeps every approved tier of only the newest GPT release", () => {
		expect(
			selectLatestGptModelIds([
				"openai.gpt-5.6-luna",
				"openai.gpt-5.6-terra",
				"openai.gpt-5.6-sol",
				"openai.gpt-5.7-luna",
				"openai.gpt-5.7-terra",
				"openai.gpt-5.7-sol",
				"openai.gpt-5.7-20270101",
			]),
		).toEqual([
			"openai.gpt-5.7-sol",
			"openai.gpt-5.7-terra",
			"openai.gpt-5.7-luna",
		]);
	});
});
