import {
	type Api,
	type AssistantMessage,
	createAssistantMessageEventStream,
	type Model,
} from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import registerBedrockMantleProvider, {
	buildBedrockModelRoutes,
	createBedrockMantleTokenProvider,
	createBedrockModelProvider,
	createBedrockRequestTokenProvider,
	createBedrockRoutingStream,
	discoverBedrockMantleModelIds,
	resolveBedrockMantleTarget,
	type BedrockModelRoute,
} from "../extensions/bedrock-mantle.js";

const mantleModelIds = [
	"anthropic.claude-opus-4-8",
	"anthropic.claude-opus-5",
	"anthropic.claude-sonnet-5",
	"anthropic.claude-fable-5",
	"openai.gpt-5.5",
	"openai.gpt-5.6-luna",
	"openai.gpt-5.6-terra",
	"openai.gpt-5.6-sol",
];

function route(
	modelId: string,
	modelIds: readonly string[] = mantleModelIds,
): BedrockModelRoute {
	const selected = buildBedrockModelRoutes(modelIds).find(
		(candidate) => candidate.model.id === modelId,
	);
	if (!selected) throw new Error(`Missing route fixture: ${modelId}`);
	return selected;
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

function completedStream(selected: Model<Api>) {
	const completed = assistantMessage(selected);
	const stream = createAssistantMessageEventStream();
	queueMicrotask(() => {
		stream.push({ type: "start", partial: completed });
		stream.push({ type: "done", reason: "stop", message: completed });
		stream.end();
	});
	return stream;
}

async function collect(stream: ReturnType<typeof createAssistantMessageEventStream>) {
	const events = [];
	for await (const event of stream) events.push(event);
	return events;
}

describe("Bedrock Mantle target resolution", () => {
	it("prefers extension-specific profile and region settings", () => {
		expect(
			resolveBedrockMantleTarget({
				BEDROCK_MANTLE_AWS_PROFILE: " mantle-profile ",
				BEDROCK_MANTLE_REGION: " us-west-2 ",
				AWS_PROFILE: "default",
				AWS_REGION: "us-east-2",
			}),
		).toEqual({
			profile: "mantle-profile",
			region: "us-west-2",
			baseUrl: "https://bedrock-mantle.us-west-2.api.aws/openai/v1",
		});
	});

	it("keeps Mantle in us-east-1 independently from the Runtime region", () => {
		expect(
			resolveBedrockMantleTarget({
				AWS_PROFILE: "default",
				AWS_REGION: "us-east-2",
			}),
		).toEqual({
			profile: "default",
			region: "us-east-1",
			baseUrl: "https://bedrock-mantle.us-east-1.api.aws/openai/v1",
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

	it("creates one-hour short-term tokens for the Mantle region", async () => {
		const generated = vi.fn(async () => "generated-token");
		const factory = vi.fn(() => generated);
		const provideToken = createBedrockMantleTokenProvider(
			{
				AWS_PROFILE: "teams",
				AWS_REGION: "us-east-2",
				BEDROCK_MANTLE_REGION: "us-east-1",
			},
			factory,
		);
		await expect(provideToken()).resolves.toBe("generated-token");
		expect(factory).toHaveBeenCalledWith({
			profile: "teams",
			region: "us-east-1",
			expiresInSeconds: 3600,
		});
	});

	it("prefers an explicit profile over ambient access keys", async () => {
		const generated = vi.fn(async () => "generated-token");
		const factory = vi.fn(() => generated);
		const provideToken = createBedrockMantleTokenProvider(
			{
				AWS_PROFILE: "teams",
				AWS_ACCESS_KEY_ID: "ambient-access-key",
				AWS_SECRET_ACCESS_KEY: "ambient-secret-key",
				BEDROCK_MANTLE_REGION: "us-east-1",
			},
			factory,
		);

		await expect(provideToken()).resolves.toBe("generated-token");
		expect(factory).toHaveBeenCalledWith({
			profile: "teams",
			region: "us-east-1",
			expiresInSeconds: 3600,
		});
	});

	it("passes scoped access keys to token generation", async () => {
		const generated = vi.fn(async () => "generated-token");
		const factory = vi.fn(() => generated);
		const provideToken = createBedrockMantleTokenProvider(
			{
				AWS_ACCESS_KEY_ID: "access-key",
				AWS_SECRET_ACCESS_KEY: "secret-key",
				AWS_SESSION_TOKEN: "session-token",
				BEDROCK_MANTLE_REGION: "us-east-1",
			},
			factory,
		);

		await expect(provideToken()).resolves.toBe("generated-token");
		expect(factory).toHaveBeenCalledWith({
			credentials: {
				accessKeyId: "access-key",
				secretAccessKey: "secret-key",
				sessionToken: "session-token",
			},
			region: "us-east-1",
			expiresInSeconds: 3600,
		});
	});

	it("uses request credentials before ambient Mantle credentials", async () => {
		const factory = vi.fn();
		const target = resolveBedrockMantleTarget({
			BEDROCK_MANTLE_REGION: "us-east-1",
		});
		const provideToken = createBedrockRequestTokenProvider(
			target,
			{ AWS_BEARER_TOKEN_BEDROCK: "ambient-token" },
			factory,
		);

		await expect(provideToken({ apiKey: "request-token" })).resolves.toBe(
			"request-token",
		);
		expect(factory).not.toHaveBeenCalled();
	});

	it("uses request profile settings before ambient credentials", async () => {
		const generated = vi.fn(async () => "generated-token");
		const factory = vi.fn(() => generated);
		const target = resolveBedrockMantleTarget({
			BEDROCK_MANTLE_REGION: "us-east-1",
		});
		const provideToken = createBedrockRequestTokenProvider(
			target,
			{
				AWS_BEARER_TOKEN_BEDROCK: "ambient-token",
				AWS_ACCESS_KEY_ID: "ambient-access-key",
				AWS_SECRET_ACCESS_KEY: "ambient-secret-key",
				BEDROCK_MANTLE_AWS_PROFILE: "ambient-profile",
			},
			factory,
		);

		await provideToken({ env: { AWS_PROFILE: "request" } });
		expect(factory).toHaveBeenCalledWith({
			profile: "request",
			region: "us-east-1",
			expiresInSeconds: 3600,
		});
	});

	it("uses request access keys before ambient bearer and session tokens", async () => {
		const generated = vi.fn(async () => "generated-token");
		const factory = vi.fn(() => generated);
		const target = resolveBedrockMantleTarget({
			BEDROCK_MANTLE_REGION: "us-east-1",
		});
		const provideToken = createBedrockRequestTokenProvider(
			target,
			{
				AWS_BEARER_TOKEN_BEDROCK: "ambient-token",
				AWS_SESSION_TOKEN: "ambient-session-token",
			},
			factory,
		);

		await provideToken({
			env: {
				AWS_ACCESS_KEY_ID: "request-access-key",
				AWS_SECRET_ACCESS_KEY: "request-secret-key",
			},
		});
		expect(factory).toHaveBeenCalledWith({
			credentials: {
				accessKeyId: "request-access-key",
				secretAccessKey: "request-secret-key",
			},
			region: "us-east-1",
			expiresInSeconds: 3600,
		});
	});
});

describe("Bedrock model routing policy", () => {
	it("selects the newest Claude families and GPT version from Mantle", () => {
		const routes = buildBedrockModelRoutes(mantleModelIds);
		expect(routes.map((candidate) => candidate.model.id)).toEqual([
			"anthropic.claude-fable-5",
			"anthropic.claude-opus-5",
			"anthropic.claude-sonnet-5",
			"anthropic.claude-haiku-4-5",
			"openai.gpt-5.6-sol",
			"openai.gpt-5.6-terra",
			"openai.gpt-5.6-luna",
		]);
		expect(
			routes
				.filter((candidate) => candidate.model.id !== "anthropic.claude-haiku-4-5")
				.every((candidate) => candidate.transport !== "runtime"),
		).toBe(true);
	});

	it("retains the newest catalog-known model when discovery is newer", () => {
		const routes = buildBedrockModelRoutes([
			...mantleModelIds,
			"anthropic.claude-opus-6",
			"openai.gpt-5.7-luna",
		]);
		expect(routes.map((candidate) => candidate.model.id)).toContain(
			"anthropic.claude-opus-5",
		);
		expect(routes.map((candidate) => candidate.model.id)).toContain(
			"openai.gpt-5.6-luna",
		);
	});

	it("uses Runtime only for Claude families absent from Mantle", () => {
		const routes = buildBedrockModelRoutes([
			"openai.gpt-5.6-luna",
			"openai.gpt-5.6-terra",
			"openai.gpt-5.6-sol",
		]);
		const claude = routes.filter((candidate) =>
			candidate.model.id.startsWith("anthropic.claude-"),
		);
		expect(claude.map((candidate) => candidate.model.id)).toEqual([
			"anthropic.claude-fable-5",
			"anthropic.claude-opus-5",
			"anthropic.claude-sonnet-5",
			"anthropic.claude-haiku-4-5",
		]);
		expect(claude.every((candidate) => candidate.transport === "runtime")).toBe(
			true,
		);
		expect(claude[0]?.target.id).toBe("us.anthropic.claude-fable-5");
	});
});

describe("Bedrock Mantle discovery", () => {
	it("uses the regional /v1/models endpoint and keeps available models", async () => {
		const fetchMock = vi.fn(async () =>
			new Response(
				JSON.stringify({
					data: [
						{ id: "anthropic.claude-opus-5", status: "available" },
						{ id: "openai.gpt-5.6-sol", status: "disabled" },
					],
				}),
				{ status: 200 },
			),
		);
		vi.stubGlobal("fetch", fetchMock);
		const target = resolveBedrockMantleTarget({
			BEDROCK_MANTLE_REGION: "us-east-1",
		});
		await expect(
			discoverBedrockMantleModelIds(
				target,
				async () => "token",
				new AbortController().signal,
			),
		).resolves.toEqual(["anthropic.claude-opus-5"]);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://bedrock-mantle.us-east-1.api.aws/v1/models",
			expect.objectContaining({
				headers: { authorization: "Bearer token" },
			}),
		);
		vi.unstubAllGlobals();
	});
});

describe("Bedrock routed streaming", () => {
	it("routes GPT through OpenAI Responses with a generated token", async () => {
		const selectedRoute = route("openai.gpt-5.6-luna");
		const openAI = vi.fn((selected: Model<Api>) => completedStream(selected));
		const stream = createBedrockRoutingStream(
			async () => "generated-token",
			() => selectedRoute,
			{ openAI },
		)(selectedRoute.model, { messages: [] }, { reasoning: "low" });
		const events = await collect(stream);

		expect(events.map((event) => event.type)).toEqual(["start", "done"]);
		expect(openAI).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "openai.gpt-5.6-luna",
				api: "openai-responses",
				baseUrl: "https://bedrock-mantle.us-east-1.api.aws/openai/v1",
			}),
			{ messages: [] },
			expect.objectContaining({ apiKey: "generated-token", reasoning: "low" }),
		);
	});

	it("forwards full provider stream options", async () => {
		const selectedRoute = route("openai.gpt-5.6-luna");
		const openAI = vi.fn((selected: Model<Api>) => completedStream(selected));
		const stream = createBedrockRoutingStream(
			async () => "generated-token",
			() => selectedRoute,
			{ openAI },
			"full",
		)(
			selectedRoute.model,
			{ messages: [] },
			{ reasoningEffort: "xhigh" } as Parameters<
				ReturnType<typeof createBedrockRoutingStream>
			>[2],
		);
		await collect(stream);

		expect(openAI).toHaveBeenCalledWith(
			selectedRoute.target,
			{ messages: [] },
			expect.objectContaining({
				apiKey: "generated-token",
				reasoningEffort: "xhigh",
			}),
		);
	});

	it("routes Claude through Messages with bearer authorization", async () => {
		const selectedRoute = route("anthropic.claude-opus-5");
		const anthropic = vi.fn((selected: Model<Api>) => completedStream(selected));
		const stream = createBedrockRoutingStream(
			async () => "generated-token",
			() => selectedRoute,
			{ anthropic },
		)(selectedRoute.model, { messages: [] });
		await collect(stream);

		expect(anthropic).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "anthropic.claude-opus-5",
				api: "anthropic-messages",
				baseUrl: "https://bedrock-mantle.us-east-1.api.aws/anthropic",
			}),
			{ messages: [] },
			expect.objectContaining({
				apiKey: undefined,
				headers: { authorization: "Bearer generated-token" },
			}),
		);
	});

	it("routes unavailable Mantle Claude through Runtime without a token", async () => {
		const selectedRoute = route("anthropic.claude-opus-5", [
			"openai.gpt-5.6-luna",
		]);
		const provideToken = vi.fn(async () => "unused");
		const runtime = vi.fn((selected: Model<Api>) => completedStream(selected));
		const stream = createBedrockRoutingStream(
			provideToken,
			() => selectedRoute,
			{ runtime },
		)(
			selectedRoute.model,
			{ messages: [] },
			{ env: { BEDROCK_MANTLE_AWS_PROFILE: "mantle-only" } },
		);
		const events = await collect(stream);

		expect(provideToken).not.toHaveBeenCalled();
		expect(runtime).toHaveBeenCalledWith(
			expect.objectContaining({ id: "us.anthropic.claude-opus-5" }),
			{ messages: [] },
			{ env: { BEDROCK_MANTLE_AWS_PROFILE: "mantle-only" } },
		);
		const done = events.find((event) => event.type === "done");
		expect(done?.type === "done" ? done.message : undefined).toMatchObject({
			model: "anthropic.claude-opus-5",
			responseModel: "us.anthropic.claude-opus-5",
		});
	});

	it("restores Runtime identity only for responses from the same route", async () => {
		const selectedRoute = route("anthropic.claude-opus-5", [
			"openai.gpt-5.6-luna",
		]);
		const sameRouteMessage = {
			...assistantMessage(selectedRoute.model),
			responseModel: selectedRoute.target.id,
		};
		const previousMantleMessage = {
			...assistantMessage(selectedRoute.model),
			responseModel: selectedRoute.model.id,
		};
		const runtime = vi.fn((selected: Model<Api>) => completedStream(selected));
		const stream = createBedrockRoutingStream(
			async () => "unused",
			() => selectedRoute,
			{ runtime },
		)(selectedRoute.model, {
			messages: [sameRouteMessage, previousMantleMessage],
		});
		await collect(stream);

		const routedContext = runtime.mock.calls[0]?.[1];
		expect(routedContext?.messages[0]).toMatchObject({
			api: selectedRoute.target.api,
			provider: selectedRoute.target.provider,
			model: selectedRoute.target.id,
		});
		expect(routedContext?.messages[1]).toMatchObject({
			api: selectedRoute.model.api,
			provider: selectedRoute.model.provider,
			model: selectedRoute.model.id,
		});
	});

	it("returns an error event when token generation fails", async () => {
		const selectedRoute = route("openai.gpt-5.6-luna");
		const stream = createBedrockRoutingStream(
			async () => {
				throw new Error("credential chain unavailable");
			},
			() => selectedRoute,
		)(selectedRoute.model, { messages: [] });
		const events = await collect(stream);

		expect(events).toHaveLength(1);
		expect(events[0]?.type).toBe("error");
		if (events[0]?.type === "error")
			expect(events[0].error.errorMessage).toBe(
				"credential chain unavailable",
			);
	});
});

describe("Bedrock provider registration", () => {
	it("recognizes default-chain config without explicit environment credentials", async () => {
		const provider = createBedrockModelProvider({});
		const resolve = provider.auth.apiKey?.resolve;
		if (!resolve) throw new Error("Missing Bedrock auth resolver");
		const auth = await resolve({
			ctx: {
				env: async () => undefined,
				fileExists: async () => false,
			},
			signal: new AbortController().signal,
		});

		expect(auth).toEqual({ auth: {}, source: "AWS credential chain" });
	});

	it("keeps a Mantle-only profile separate from Runtime AWS_PROFILE", async () => {
		const provider = createBedrockModelProvider({});
		const resolve = provider.auth.apiKey?.resolve;
		if (!resolve) throw new Error("Missing Bedrock auth resolver");
		const auth = await resolve({
			ctx: {
				env: async (name) =>
					name === "BEDROCK_MANTLE_AWS_PROFILE"
						? "mantle-profile"
						: name === "AWS_PROFILE"
							? "runtime-profile"
							: undefined,
				fileExists: async () => false,
			},
			signal: new AbortController().signal,
		});

		expect(auth).toEqual({
			auth: {},
			env: {
				BEDROCK_MANTLE_AWS_PROFILE: "mantle-profile",
				AWS_PROFILE: "runtime-profile",
			},
			source: "BEDROCK_MANTLE_AWS_PROFILE",
		});
	});

	it("normalizes a stored default profile for Runtime fallback", async () => {
		const provider = createBedrockModelProvider({});
		const resolve = provider.auth.apiKey?.resolve;
		if (!resolve) throw new Error("Missing Bedrock auth resolver");
		const auth = await resolve({
			ctx: {
				env: async () => undefined,
				fileExists: async () => false,
			},
			credential: {
				type: "api_key",
				env: {
					AWS_DEFAULT_PROFILE: "runtime-profile",
					BEDROCK_MANTLE_AWS_PROFILE: "mantle-profile",
				},
			},
			signal: new AbortController().signal,
		});

		expect(auth).toEqual({
			auth: {},
			env: {
				AWS_DEFAULT_PROFILE: "runtime-profile",
				AWS_PROFILE: "runtime-profile",
				BEDROCK_MANTLE_AWS_PROFILE: "mantle-profile",
			},
			source: "stored AWS credential chain",
		});
	});

	it("registers a native provider before model scope is resolved", () => {
		const registerProvider = vi.fn();
		registerBedrockMantleProvider({
			registerProvider,
		} as unknown as ExtensionAPI);
		expect(registerProvider).toHaveBeenCalledOnce();
		const provider = registerProvider.mock.calls[0]?.[0];
		expect(provider).toMatchObject({
			id: "bedrock-mantle",
			name: "Amazon Bedrock (Auto)",
		});
		expect(provider.getModels().map((model: Model<Api>) => model.id)).toEqual(
			expect.arrayContaining([
				"anthropic.claude-opus-5",
				"openai.gpt-5.6-luna",
			]),
		);
	});

	it("publishes a refreshed provider-scoped regional model route set", async () => {
		const discoverModels = vi.fn(async (target, provideToken) => {
			expect(target.region).toBe("us-west-2");
			expect(target.baseUrl).toContain("bedrock-mantle.us-west-2.api.aws");
			expect(await provideToken()).toBe("stored-token");
			return mantleModelIds;
		});
		const provider = createBedrockModelProvider(
			{ AWS_PROFILE: "teams" },
			{ discoverModels },
		);
		const publish = vi.fn(async (publication) => {
			publication.update?.();
			return true;
		});
		await provider.refreshModels?.({
			allowNetwork: true,
			credential: {
				type: "api_key",
				key: "stored-token",
				env: { BEDROCK_MANTLE_REGION: "us-west-2" },
			},
			publish,
			signal: new AbortController().signal,
		} as Parameters<NonNullable<typeof provider.refreshModels>>[0]);

		expect(publish).toHaveBeenCalledOnce();
		expect(publish.mock.calls[0]?.[0].persist).toMatchObject({
			models: expect.arrayContaining([
				expect.objectContaining({ id: "anthropic.claude-opus-5" }),
				expect.objectContaining({ id: "openai.gpt-5.6-luna" }),
			]),
		});
		const opus = provider
			.getModels()
			.find((model) => model.id === "anthropic.claude-opus-5");
		expect(opus?.name).toContain("Mantle");
		expect(opus?.baseUrl).toContain("bedrock-mantle.us-west-2.api.aws");
	});

	it("restores discovered model IDs from the persisted catalog", async () => {
		const provider = createBedrockModelProvider({});
		const storedModels = buildBedrockModelRoutes(mantleModelIds).map(
			(route) => route.model,
		);
		const publish = vi.fn(async (publication) => {
			publication.update?.();
			return true;
		});

		await provider.refreshModels?.({
			allowNetwork: false,
			stored: { models: storedModels, checkedAt: Date.now() },
			publish,
			signal: new AbortController().signal,
		} as Parameters<NonNullable<typeof provider.refreshModels>>[0]);

		expect(publish).toHaveBeenCalledOnce();
		expect(provider.getModels().map((model) => model.id)).toEqual(
			expect.arrayContaining([
				"anthropic.claude-opus-5",
				"anthropic.claude-fable-5",
				"anthropic.claude-sonnet-5",
				"openai.gpt-5.6-luna",
			]),
		);
	});
});
