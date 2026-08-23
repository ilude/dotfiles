import type { Context, Model } from "@earendil-works/pi-ai";
import { stream } from "../node_modules/@earendil-works/pi-ai/dist/api/openai-codex-responses.js";
import { describe, expect, it } from "vitest";

type CapturedPayload = {
	model: string;
	instructions: string;
	input: unknown[];
	tools: unknown[];
	reasoning: unknown;
};

type SyntheticUsage = {
	input_tokens: number;
	output_tokens: number;
	total_tokens: number;
	input_tokens_details: { cached_tokens: number; cache_write_tokens?: number };
};

const model: Model<"openai-codex-responses"> = {
	id: "gpt-5.5",
	name: "GPT-5.5",
	api: "openai-codex-responses",
	provider: "openai-codex",
	baseUrl: "https://example.test/backend-api",
	reasoning: true,
	input: ["text"],
	cost: { input: 1, output: 1, cacheRead: 1, cacheWrite: 1 },
	contextWindow: 100_000,
	maxTokens: 4_096,
	compat: { supportsStrictMode: true },
};

const tool = {
	name: "lookup",
	description: "Look up a fixed value.",
	parameters: {
		type: "object",
		properties: { key: { type: "string" } },
		required: ["key"],
		additionalProperties: false,
	},
};

function context(goalReminder: string): Context {
	return {
		systemPrompt: `Stable system instructions.\nGoal reminder: ${goalReminder}`,
		messages: [
			{ role: "user", content: "Use the fixed lookup input.", timestamp: 0 },
		],
		tools: [tool],
	};
}

function responseFor(usage: SyntheticUsage): Response {
	const body = [
		JSON.stringify({
			type: "response.output_item.added",
			output_index: 0,
			item: { type: "message", id: "message_1", role: "assistant", content: [] },
		}),
		JSON.stringify({
			type: "response.completed",
			response: {
				id: "response_1",
				status: "completed",
				output: [],
				usage,
			},
		}),
	]
		.map((event) => `data: ${event}\n\n`)
		.join("");
	return new Response(body, {
		status: 200,
		headers: { "content-type": "text/event-stream" },
	});
}

async function run(
	requestContext: Context,
	usage: SyntheticUsage,
	captures: CapturedPayload[],
	callOrder: string[],
) {
	const request = stream(model, requestContext, {
		apiKey: "header.eyJodHRwczovL2FwaS5vcGVuYWkuY29tL2F1dGgiOnsiY2hhdGdwdF9hY2NvdW50X2lkIjoiYWNjb3VudC0xIn19.signature",
		reasoningEffort: "medium",
		transport: "sse",
		onPayload(payload) {
			callOrder.push("onPayload");
			const body = payload as CapturedPayload;
			captures.push(structuredClone(body));
		},
		fetch: async () => {
			callOrder.push("fetch");
			return responseFor(usage);
		},
	});

	let finalUsage: unknown;
	for await (const event of request) {
		if (event.type === "done") finalUsage = event.message.usage;
	}
	return finalUsage;
}

describe("installed OpenAI Codex request adapter prompt-cache measurement", () => {
	it("captures the final payload and normalizes synthetic cache usage", async () => {
		const captures: CapturedPayload[] = [];
		const callOrder: string[] = [];
		const usageWithCacheWrite: SyntheticUsage = {
			input_tokens: 100,
			output_tokens: 11,
			total_tokens: 118,
			input_tokens_details: { cached_tokens: 60, cache_write_tokens: 7 },
		};
		const usageWithoutCacheWrite: SyntheticUsage = {
			input_tokens: 100,
			output_tokens: 11,
			total_tokens: 111,
			input_tokens_details: { cached_tokens: 60 },
		};

		const firstUsage = await run(
			context("Keep the primary goal visible."),
			usageWithCacheWrite,
			captures,
			callOrder,
		);
		const secondUsage = await run(
			context("Keep the primary goal visible."),
			usageWithCacheWrite,
			captures,
			callOrder,
		);
		const variantUsage = await run(
			context("Use the alternate reminder wording."),
			usageWithoutCacheWrite,
			captures,
			callOrder,
		);

		expect(callOrder).toEqual(["onPayload", "fetch", "onPayload", "fetch", "onPayload", "fetch"]);
		expect(JSON.stringify(captures[0])).toBe(JSON.stringify(captures[1]));
		expect(captures[0].model).toBe(captures[2].model);
		expect(captures[0].reasoning).toEqual(captures[2].reasoning);
		expect(captures[0].input).toEqual(captures[2].input);
		expect(captures[0].tools).toEqual(captures[2].tools);
		expect(captures[0].instructions).not.toBe(captures[2].instructions);
		expect(captures[0].instructions.replace("Keep the primary goal visible.", "<REMINDER>"))
			.toBe(captures[2].instructions.replace("Use the alternate reminder wording.", "<REMINDER>"));

		expect(firstUsage).toMatchObject({ input: 33, cacheRead: 60, cacheWrite: 7, output: 11 });
		expect(secondUsage).toMatchObject({ input: 33, cacheRead: 60, cacheWrite: 7, output: 11 });
		expect(variantUsage).toMatchObject({ input: 40, cacheRead: 60, cacheWrite: 0, output: 11 });
	});
});
