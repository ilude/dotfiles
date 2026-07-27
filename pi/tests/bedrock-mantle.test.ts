import {
	type Api,
	type AssistantMessage,
	createAssistantMessageEventStream,
	type Model,
} from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import registerBedrockMantleProvider, {
	BEDROCK_MANTLE_MODELS,
	createBedrockMantleStream,
	createBedrockMantleTokenProvider,
	resolveBedrockMantleTarget,
} from "../extensions/bedrock-mantle.js";

function model(id = "openai.gpt-5.6-luna"): Model<Api> {
	const definition = BEDROCK_MANTLE_MODELS.find((candidate) => candidate.id === id);
	if (!definition) throw new Error(`Missing model fixture: ${id}`);
	return {
		...definition,
		api: "openai-responses",
		provider: "bedrock-mantle",
		baseUrl: "https://placeholder.invalid/openai/v1",
	};
}

function assistantMessage(selected: Model<Api>): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text: "ok" }],
		api: selected.api,
		provider: selected.provider,
		model: selected.id,
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
	};
}

describe("Bedrock Mantle target resolution", () => {
	it("prefers extension-specific profile and region settings", () => {
		expect(
			resolveBedrockMantleTarget({
				BEDROCK_MANTLE_AWS_PROFILE: " mantle-profile ",
				BEDROCK_MANTLE_REGION: " us-west-2 ",
				AWS_PROFILE: "default",
				AWS_REGION: "us-east-1",
			}),
		).toEqual({
			profile: "mantle-profile",
			region: "us-west-2",
			baseUrl: "https://bedrock-mantle.us-west-2.api.aws/openai/v1",
		});
	});

	it("uses the standard AWS environment and us-east-2 fallback", () => {
		expect(
			resolveBedrockMantleTarget({
				AWS_PROFILE: "default",
				AWS_REGION: "us-east-2",
			}),
		).toMatchObject({ profile: "default", region: "us-east-2" });
		expect(resolveBedrockMantleTarget({})).toEqual({
			profile: undefined,
			region: "us-east-2",
			baseUrl: "https://bedrock-mantle.us-east-2.api.aws/openai/v1",
		});
	});
});

describe("Bedrock Mantle token resolution", () => {
	it("uses an explicit Bedrock bearer token without calling the factory", async () => {
		const factory = vi.fn();
		const provideToken = createBedrockMantleTokenProvider(
			{ AWS_BEARER_TOKEN_BEDROCK: " token-value " },
			factory,
		);
		await expect(provideToken()).resolves.toBe("token-value");
		expect(factory).not.toHaveBeenCalled();
	});

	it("creates one-hour short-term tokens from the selected AWS profile", async () => {
		const generated = vi.fn(async () => "generated-token");
		const factory = vi.fn(() => generated);
		const provideToken = createBedrockMantleTokenProvider(
			{ AWS_PROFILE: "teams", AWS_REGION: "us-east-2" },
			factory,
		);
		await expect(provideToken()).resolves.toBe("generated-token");
		expect(factory).toHaveBeenCalledWith({
			profile: "teams",
			region: "us-east-2",
			expiresInSeconds: 3600,
		});
	});
});

describe("Bedrock Mantle streaming", () => {
	it("delegates to Pi's OpenAI Responses stream with a generated token", async () => {
		const selected = model();
		const completed = assistantMessage(selected);
		const inner = createAssistantMessageEventStream();
		const streamOpenAI = vi.fn(() => inner);
		const stream = createBedrockMantleStream(
			async () => "generated-token",
			streamOpenAI,
		)(selected, { messages: [] }, { reasoning: "low" });

		queueMicrotask(() => {
			inner.push({ type: "start", partial: completed });
			inner.push({ type: "done", reason: "stop", message: completed });
			inner.end();
		});

		const events = [];
		for await (const event of stream) events.push(event);

		expect(events.map((event) => event.type)).toEqual(["start", "done"]);
		expect(streamOpenAI).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "openai.gpt-5.6-luna",
				api: "openai-responses",
				baseUrl: "https://bedrock-mantle.us-east-2.api.aws/openai/v1",
			}),
			{ messages: [] },
			expect.objectContaining({ apiKey: "generated-token", reasoning: "low" }),
		);
	});

	it("returns an error event when token generation fails", async () => {
		const selected = model();
		const streamOpenAI = vi.fn();
		const stream = createBedrockMantleStream(
			async () => {
				throw new Error("credential chain unavailable");
			},
			streamOpenAI,
		)(selected, { messages: [] });

		const events = [];
		for await (const event of stream) events.push(event);

		expect(events).toHaveLength(1);
		expect(events[0]?.type).toBe("error");
		if (events[0]?.type === "error")
			expect(events[0].error.errorMessage).toBe("credential chain unavailable");
		expect(streamOpenAI).not.toHaveBeenCalled();
	});
});

describe("Bedrock Mantle provider registration", () => {
	it("registers only the GPT-5.6 Luna, Terra, and Sol models", () => {
		const registerProvider = vi.fn();
		registerBedrockMantleProvider({ registerProvider } as unknown as ExtensionAPI);
		expect(registerProvider).toHaveBeenCalledOnce();
		expect(registerProvider).toHaveBeenCalledWith(
			"bedrock-mantle",
			expect.objectContaining({
				api: "openai-responses",
				models: expect.arrayContaining([
					expect.objectContaining({ id: "openai.gpt-5.6-luna" }),
					expect.objectContaining({ id: "openai.gpt-5.6-terra" }),
					expect.objectContaining({ id: "openai.gpt-5.6-sol" }),
				]),
			}),
		);
		const config = registerProvider.mock.calls[0]?.[1];
		expect(config.models).toHaveLength(3);
	});
});
