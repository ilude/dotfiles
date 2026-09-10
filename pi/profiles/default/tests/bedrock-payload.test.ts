import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import type { AnthropicMessagesCompat, SimpleStreamOptions } from "@earendil-works/pi-ai";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/compat";
import { getBuiltinModels } from "@earendil-works/pi-ai/providers/all";
import { buildBedrockModelRoutes, createBedrockRoutingStream } from "../lib/bedrock/provider.ts";
import { codexHistory, discoveredClaudeIds } from "./fixtures/bedrock-cross-provider.ts";

const routes = buildBedrockModelRoutes(discoveredClaudeIds);
const mantleRoutes = routes.filter(route => route.transport === "mantle-anthropic");
const rejection = () => new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "intercepted serialized request" } }), { status: 400, headers: { "content-type": "application/json" } });

function captureFetch() {
	const requests: { url: string; headers: Headers; payload: any }[] = [];
	const fetch: typeof globalThis.fetch = async (input, init) => {
		const request = new Request(input, init);
		requests.push({ url: request.url, headers: request.headers, payload: await request.json() });
		return rejection();
	};
	return { fetch: vi.fn(fetch), requests };
}

function expectCompatibleMessages(payload: any) {
	expect(payload.messages.length).toBeGreaterThanOrEqual(3);
	for (const message of payload.messages) {
		expect(["user", "assistant"]).toContain(message.role);
		expect(message).not.toHaveProperty("output_config");
		expect(message.content.length).toBeGreaterThan(0);
	}
	expect(JSON.stringify(payload)).not.toContain("opaque-codex-signature");
}

describe("Bedrock real adapter serialization", () => {
	it("uses the four latest discovered model routes", () => {
		expect(routes.map(route => [route.model.id, route.target.id, route.transport])).toEqual([
			["anthropic.claude-fable-5-1", "us.anthropic.claude-fable-5-1", "runtime"],
			["anthropic.claude-opus-5", "anthropic.claude-opus-5", "mantle-anthropic"],
			["anthropic.claude-sonnet-5", "anthropic.claude-sonnet-5", "mantle-anthropic"],
			["anthropic.claude-haiku-4-5", "anthropic.claude-haiku-4-5", "mantle-anthropic"],
		]);
	});

	for (const route of mantleRoutes) {
		for (const mode of ["simple", "full"] as const) {
			const levels = route.model.thinkingLevelMap?.off === null ? ["low"] as const : ["off", "low"] as const;
			for (const level of levels) {
				it(`${route.model.id} ${mode} ${level}: serializes Codex history without mid-conversation controls`, async () => {
					const captured = captureFetch();
					const onPayload = vi.fn(async (payload: any) => ({ ...payload, metadata: { user_id: "custom-payload" } }));
					const simpleOptions: SimpleStreamOptions = { reasoning: level === "off" ? undefined : level, maxTokens: 2048, thinkingBudgets: { low: 1024 } };
					const options = mode === "simple" ? simpleOptions : { thinkingEnabled: level !== "off", effort: "low", thinkingBudgetTokens: 1024, maxTokens: 2048 };
					const stream = createBedrockRoutingStream(async () => "test-token", () => route, {}, mode);
					const result = await stream(route.model, structuredClone(codexHistory), { ...options, fetch: captured.fetch, onPayload }).result();
					expect(result.errorMessage).toContain("intercepted serialized request");
					expect(captured.fetch).toHaveBeenCalledOnce();
					expect(onPayload).toHaveBeenCalledOnce();
					const { payload, headers, url } = captured.requests[0];
					expect(url).toContain("/anthropic/v1/messages");
					expect(headers.get("authorization")).toBe("Bearer test-token");
					expect(headers.get("anthropic-beta") ?? "").not.toMatch(/mid-conversation-output-config|thinking-binding-controls/);
					expectCompatibleMessages(payload);
					expect(payload.metadata).toEqual({ user_id: "custom-payload" });
					expect(payload.thinking).not.toHaveProperty("block_binding");
					if (level === "off") {
						expect(payload.thinking).toEqual({ type: "disabled" });
						expect(payload).not.toHaveProperty("output_config");
					} else if ((route.model.compat as AnthropicMessagesCompat).forceAdaptiveThinking) {
						expect(payload.thinking.type).toBe("adaptive");
						expect(payload.output_config).toEqual({ effort: "low" });
					} else {
						expect(payload.thinking).toMatchObject({ type: "enabled", budget_tokens: 1024 });
					}
				});
			}
		}
	}

	it("does not alter native Anthropic mid-conversation effort support", async () => {
		const native = getBuiltinModels("anthropic").find(model => model.id === "claude-opus-5")!;
		expect(native.compat?.supportsMidConvoEffort).toBe(true);
		const captured = captureFetch();
		await anthropicMessagesApi().streamSimple(native, structuredClone(codexHistory), { apiKey: "test-key", reasoning: "low", maxTokens: 128, fetch: captured.fetch }).result();
		expect(captured.requests[0].payload.messages.at(-1)).toEqual({ role: "system", content: [], output_config: { effort: "low" } });
	});

	it("serializes the real latest Fable Runtime route with request-level low effort", async () => {
		const route = routes.find(route => route.model.id === "anthropic.claude-fable-5-1")!;
		const requests: { url: string; payload: any }[] = [];
		// Runtime uses the AWS Node HTTP handler, not fetch. Capture its serialized
		// HTTP body at loopback rather than mocking the adapter or SDK command.
		const server = createServer(async (request, response) => {
			const chunks: Buffer[] = [];
			for await (const chunk of request) chunks.push(Buffer.from(chunk));
			requests.push({ url: request.url!, payload: JSON.parse(Buffer.concat(chunks).toString()) });
			response.writeHead(400, { "content-type": "application/json", "x-amzn-errortype": "ValidationException" });
			response.end(JSON.stringify({ message: "intercepted serialized request" }));
		});
		server.listen(0, "127.0.0.1");
		await once(server, "listening");
		try {
			const target = { ...route.target, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
			const stream = createBedrockRoutingStream(async () => { throw new Error("Runtime must not use Mantle auth"); }, () => ({ ...route, target }));
			const options: SimpleStreamOptions = { reasoning: "low", maxTokens: 128, signal: AbortSignal.timeout(5000), env: { AWS_BEDROCK_SKIP_AUTH: "1", AWS_BEDROCK_FORCE_HTTP1: "1", NO_PROXY: "127.0.0.1", AWS_REGION: "us-east-1" } };
			const result = await stream(route.model, structuredClone(codexHistory), options).result();
			expect(result.errorMessage).toContain("intercepted serialized request");
			expect(requests).toHaveLength(1);
			expect(decodeURIComponent(requests[0].url)).toContain(`/model/${route.target.id}/converse-stream`);
			const { payload } = requests[0];
			expectCompatibleMessages(payload);
			expect(payload.additionalModelRequestFields).toMatchObject({ thinking: { type: "adaptive" }, output_config: { effort: "low" } });
			expect(payload.inferenceConfig.maxTokens).toBe(128);
		} finally {
			server.closeAllConnections();
			await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
		}
	});
});
