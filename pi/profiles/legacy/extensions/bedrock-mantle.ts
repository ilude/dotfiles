import * as fs from "node:fs";
import { getTokenProvider } from "@aws/bedrock-token-generator";
import {
	anthropicMessagesApi,
	bedrockConverseStreamApi,
	openAIResponsesApi,
} from "@earendil-works/pi-ai/compat";
import { getBuiltinModels } from "@earendil-works/pi-ai/providers/all";
import {
	type Api,
	type AssistantMessage,
	type AssistantMessageEvent,
	type AssistantMessageEventStream,
	type Context,
	createAssistantMessageEventStream,
	type Model,
	type Provider,
	type SimpleStreamOptions,
	type StreamOptions,
} from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	selectLatestClaudeModelIds,
	selectLatestGptModelIds,
} from "../lib/bedrock-model-policy.js";
import { bedrockModelCost } from "../lib/bedrock-pricing.js";
import { getSettingsPath } from "../lib/settings-file.ts";
import type { BedrockModelMetadata } from "../lib/bedrock-model-refresh.ts";

const PROVIDER_ID = "bedrock-mantle";
const DEFAULT_MANTLE_REGION = "us-east-1";
const TOKEN_EXPIRY_SECONDS = 60 * 60;
const INITIAL_MANTLE_MODEL_IDS = [
	"openai.gpt-5.6-luna",
	"openai.gpt-5.6-terra",
	"openai.gpt-5.6-sol",
] as const;

export interface BedrockMantleEnvironment {
	AWS_ACCESS_KEY_ID?: string;
	AWS_BEARER_TOKEN_BEDROCK?: string;
	AWS_DEFAULT_PROFILE?: string;
	AWS_DEFAULT_REGION?: string;
	AWS_PROFILE?: string;
	AWS_REGION?: string;
	AWS_SECRET_ACCESS_KEY?: string;
	AWS_SESSION_TOKEN?: string;
	BEDROCK_MANTLE_AWS_PROFILE?: string;
	BEDROCK_MANTLE_REGION?: string;
}

export interface BedrockMantleTarget {
	profile?: string;
	region: string;
	baseUrl: string;
}

type TokenProvider = () => Promise<string>;
type RequestTokenProvider = (options?: RoutingStreamOptions) => Promise<string>;
type TokenProviderFactoryConfig = Parameters<typeof getTokenProvider>[0] & {
	credentials?: {
		accessKeyId: string;
		secretAccessKey: string;
		sessionToken?: string;
	};
};
type TokenProviderFactory = (
	config?: TokenProviderFactoryConfig,
) => TokenProvider;
type RoutingStreamOptions = StreamOptions;
type StreamAdapter = (
	model: Model<Api>,
	context: Context,
	options?: RoutingStreamOptions,
) => AssistantMessageEventStream;
type BedrockTransport = "mantle-anthropic" | "mantle-openai" | "runtime";

export interface BedrockModelRoute {
	model: Model<Api>;
	target: Model<Api>;
	transport: BedrockTransport;
}

type MantleDiscovery = (
	target: BedrockMantleTarget,
	provideToken: TokenProvider,
	signal: AbortSignal,
) => Promise<string[]>;

function mantleOrigin(region: string): string {
	return `https://bedrock-mantle.${region}.api.aws`;
}

export function resolveBedrockMantleTarget(
	env: BedrockMantleEnvironment = process.env,
): BedrockMantleTarget {
	const region =
		env.BEDROCK_MANTLE_REGION?.trim() || DEFAULT_MANTLE_REGION;
	const profile =
		env.BEDROCK_MANTLE_AWS_PROFILE?.trim() ||
		env.AWS_PROFILE?.trim() ||
		env.AWS_DEFAULT_PROFILE?.trim() ||
		undefined;
	return {
		profile,
		region,
		baseUrl: `${mantleOrigin(region)}/openai/v1`,
	};
}

export function createBedrockMantleTokenProvider(
	env: BedrockMantleEnvironment = process.env,
	factory: TokenProviderFactory = getTokenProvider,
): TokenProvider {
	const bearerToken = env.AWS_BEARER_TOKEN_BEDROCK?.trim();
	if (bearerToken) return async () => bearerToken;

	const target = resolveBedrockMantleTarget(env);
	const accessKeyId = env.AWS_ACCESS_KEY_ID?.trim();
	const secretAccessKey = env.AWS_SECRET_ACCESS_KEY?.trim();
	const credentials =
		accessKeyId && secretAccessKey
			? {
					accessKeyId,
					secretAccessKey,
					...(env.AWS_SESSION_TOKEN?.trim()
						? { sessionToken: env.AWS_SESSION_TOKEN.trim() }
						: {}),
				}
			: undefined;
	return factory({
		...(target.profile
			? { profile: target.profile }
			: credentials
				? { credentials }
				: {}),
		region: target.region,
		expiresInSeconds: TOKEN_EXPIRY_SECONDS,
	});
}

export function createBedrockRequestTokenProvider(
	target: BedrockMantleTarget,
	baseEnv: BedrockMantleEnvironment = process.env,
	factory: TokenProviderFactory = getTokenProvider,
): RequestTokenProvider {
	return async (options) => {
		const requestToken = options?.apiKey?.trim();
		if (requestToken) return requestToken;
		const scopedEnv = options?.env;
		const tokenEnv = {
			...baseEnv,
			...scopedEnv,
			BEDROCK_MANTLE_REGION:
				scopedEnv?.BEDROCK_MANTLE_REGION?.trim() || target.region,
		};
		const scopedBearerToken = scopedEnv?.AWS_BEARER_TOKEN_BEDROCK?.trim();
		const scopedAccessKeyId = scopedEnv?.AWS_ACCESS_KEY_ID?.trim();
		const scopedSecretAccessKey = scopedEnv?.AWS_SECRET_ACCESS_KEY?.trim();
		const scopedSessionToken = scopedEnv?.AWS_SESSION_TOKEN?.trim();
		const hasScopedKeyField =
			scopedAccessKeyId !== undefined ||
			scopedSecretAccessKey !== undefined ||
			scopedSessionToken !== undefined;
		if (hasScopedKeyField && (!scopedAccessKeyId || !scopedSecretAccessKey))
			throw new Error(
				"Scoped AWS access-key authentication requires AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY",
			);
		const scopedAccessKeys = scopedAccessKeyId && scopedSecretAccessKey;
		const scopedProfile =
			scopedEnv?.BEDROCK_MANTLE_AWS_PROFILE?.trim() ||
			scopedEnv?.AWS_PROFILE?.trim() ||
			scopedEnv?.AWS_DEFAULT_PROFILE?.trim();
		if (scopedBearerToken) {
			delete tokenEnv.AWS_ACCESS_KEY_ID;
			delete tokenEnv.AWS_SECRET_ACCESS_KEY;
			delete tokenEnv.AWS_SESSION_TOKEN;
			delete tokenEnv.BEDROCK_MANTLE_AWS_PROFILE;
			delete tokenEnv.AWS_PROFILE;
			delete tokenEnv.AWS_DEFAULT_PROFILE;
		} else if (scopedAccessKeys) {
			delete tokenEnv.AWS_BEARER_TOKEN_BEDROCK;
			if (!scopedEnv?.AWS_SESSION_TOKEN) delete tokenEnv.AWS_SESSION_TOKEN;
			delete tokenEnv.BEDROCK_MANTLE_AWS_PROFILE;
			delete tokenEnv.AWS_PROFILE;
			delete tokenEnv.AWS_DEFAULT_PROFILE;
		} else if (scopedProfile) {
			delete tokenEnv.AWS_BEARER_TOKEN_BEDROCK;
			delete tokenEnv.AWS_ACCESS_KEY_ID;
			delete tokenEnv.AWS_SECRET_ACCESS_KEY;
			delete tokenEnv.AWS_SESSION_TOKEN;
			delete tokenEnv.BEDROCK_MANTLE_AWS_PROFILE;
			delete tokenEnv.AWS_PROFILE;
			delete tokenEnv.AWS_DEFAULT_PROFILE;
			tokenEnv.BEDROCK_MANTLE_AWS_PROFILE = scopedProfile;
		}
		return createBedrockMantleTokenProvider(tokenEnv, factory)();
	};
}

function withoutCompat(model: Model<Api>): Omit<Model<Api>, "compat"> {
	const { compat: _compat, ...definition } = model;
	return definition;
}

function mantleGptRoute(
	modelId: string,
	target: BedrockMantleTarget,
): BedrockModelRoute | undefined {
	const source = getBuiltinModels("amazon-bedrock").find(
		(model) => model.id === modelId,
	);
	if (!source) return undefined;
	const model: Model<Api> = {
		...withoutCompat(source),
		api: "openai-responses",
		provider: PROVIDER_ID,
		baseUrl: target.baseUrl,
		name: `${source.name} (Mantle)`,
	};
	return { model, target: model, transport: "mantle-openai" };
}

function mantleClaudeRoute(
	modelId: string,
	target: BedrockMantleTarget,
): BedrockModelRoute | undefined {
	const anthropicId = modelId.replace(/^anthropic[.]/, "");
	const source = getBuiltinModels("anthropic").find(
		(model) => model.id === anthropicId,
	);
	if (!source) return undefined;
	const model: Model<Api> = {
		...source,
		id: modelId,
		provider: PROVIDER_ID,
		baseUrl: `${mantleOrigin(target.region)}/anthropic`,
		name: `${source.name} (Mantle)`,
	};
	return { model, target: model, transport: "mantle-anthropic" };
}

function runtimeClaudeRoutes(
	metadata: readonly BedrockModelMetadata[] = [],
): BedrockModelRoute[] {
	const catalog = getBuiltinModels("amazon-bedrock");
	const runtimeIds = metadata
		.filter((entry) => entry.kind === "inference-profile")
		.map((entry) => entry.id);
	const candidateIds = [...new Set([...catalog.map((model) => model.id), ...runtimeIds])];
	return selectLatestClaudeModelIds(candidateIds, "us.anthropic").flatMap((runtimeId) => {
		const source = catalog.find((model) => model.id === runtimeId) ??
			catalog.find((model) => {
				const family = /claude-(fable|opus|sonnet|haiku)-/.exec(model.id)?.[1];
				return family !== undefined && runtimeId.includes(`claude-${family}-`);
			});
		if (!source) return [];
		const entry = metadata.find((candidate) => candidate.id === runtimeId);
		const displayName =
			typeof entry?.inferenceProfileName === "string"
				? entry.inferenceProfileName
				: typeof entry?.modelName === "string"
					? entry.modelName
					: source.name;
		const logicalId = runtimeId
			.replace(/^us[.]/, "")
			.replace(/-\d{8}-v\d+:\d+$/, "");
		const cost = bedrockModelCost(PROVIDER_ID, logicalId);
		const model: Model<Api> = {
			...source,
			id: logicalId,
			provider: PROVIDER_ID,
			name: `${displayName.replace(/ \(US\)$/, "")} (Bedrock Runtime)`,
			...(cost ? { cost } : {}),
		};
		const runtimeTarget = { ...source, id: runtimeId };
		return [{ model, target: runtimeTarget, transport: "runtime" as const }];
	});
}

export function buildBedrockModelRoutes(
	mantleModelIds: readonly string[],
	target: BedrockMantleTarget = resolveBedrockMantleTarget(),
	runtimeMetadata: readonly BedrockModelMetadata[] = [],
): BedrockModelRoute[] {
	const knownAnthropicIds = new Set(
		getBuiltinModels("anthropic").map((model) => `anthropic.${model.id}`),
	);
	const knownBedrockIds = new Set(
		getBuiltinModels("amazon-bedrock").map((model) => model.id),
	);
	const mantleClaudeIds = selectLatestClaudeModelIds(
		mantleModelIds.filter((modelId) => knownAnthropicIds.has(modelId)),
		"anthropic",
	);
	const mantleClaudeRoutes = mantleClaudeIds.flatMap((modelId) => {
		const route = mantleClaudeRoute(modelId, target);
		return route ? [route] : [];
	});
	const runtimeRoutes = runtimeClaudeRoutes(runtimeMetadata);
	const claudeCandidates = [...mantleClaudeRoutes, ...runtimeRoutes];
	const claudeRoutes = selectLatestClaudeModelIds(
		claudeCandidates.map((route) => route.model.id),
		"anthropic",
	).flatMap((modelId) => {
		const route = claudeCandidates.find(
			(candidate) => candidate.model.id === modelId,
		);
		return route ? [route] : [];
	});
	const gptRoutes = selectLatestGptModelIds(
		mantleModelIds.filter((modelId) => knownBedrockIds.has(modelId)),
	).flatMap((modelId) => {
		const route = mantleGptRoute(modelId, target);
		return route ? [route] : [];
	});
	return [...claudeRoutes, ...gptRoutes];
}

export const BEDROCK_MANTLE_MODELS = buildBedrockModelRoutes(
	INITIAL_MANTLE_MODEL_IDS,
).filter((route) => route.transport === "mantle-openai").map((route) => route.model);

export async function discoverBedrockMantleModelIds(
	target: BedrockMantleTarget,
	provideToken: TokenProvider,
	signal: AbortSignal,
): Promise<string[]> {
	const token = await provideToken();
	if (!token.trim())
		throw new Error("Bedrock Mantle token generation returned an empty token");
	const response = await fetch(`${mantleOrigin(target.region)}/v1/models`, {
		headers: { authorization: `Bearer ${token}` },
		signal,
	});
	if (!response.ok)
		throw new Error(
			`Bedrock Mantle model discovery failed (${response.status} ${response.statusText})`,
		);
	const payload = (await response.json()) as { data?: unknown };
	if (!Array.isArray(payload.data))
		throw new Error("Bedrock Mantle model discovery returned an invalid model list");
	return payload.data.flatMap((entry) => {
		if (entry === null || typeof entry !== "object") return [];
		const model = entry as { id?: unknown; status?: unknown };
		return typeof model.id === "string" && model.status === "available"
			? [model.id]
			: [];
	});
}

function normalizeMessage(
	message: AssistantMessage,
	route: BedrockModelRoute,
): AssistantMessage {
	return {
		...message,
		api: route.model.api,
		provider: route.model.provider,
		model: route.model.id,
		responseModel: route.target.id,
	};
}

function normalizeEvent(
	event: AssistantMessageEvent,
	route: BedrockModelRoute,
): AssistantMessageEvent {
	if (event.type === "done")
		return { ...event, message: normalizeMessage(event.message, route) };
	if (event.type === "error")
		return { ...event, error: normalizeMessage(event.error, route) };
	return { ...event, partial: normalizeMessage(event.partial, route) };
}

export function contextForBedrockRoute(
	context: Context,
	route: BedrockModelRoute,
): Context {
	return {
		...context,
		messages: context.messages.map((message) => {
			if (
				message.role !== "assistant" ||
				message.provider !== route.model.provider ||
				message.api !== route.model.api ||
				message.model !== route.model.id ||
				message.responseModel !== route.target.id
			)
				return message;
			return {
				...message,
				api: route.target.api,
				provider: route.target.provider,
				model: route.target.id,
			};
		}),
	};
}

function errorMessage(
	model: Model<Api>,
	error: unknown,
	options?: SimpleStreamOptions,
): AssistantMessage {
	return {
		role: "assistant",
		content: [],
		api: model.api,
		provider: model.provider,
		model: model.id,
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: options?.signal?.aborted ? "aborted" : "error",
		errorMessage: error instanceof Error ? error.message : String(error),
		timestamp: Date.now(),
	};
}

export function createBedrockRoutingStream(
	provideToken: RequestTokenProvider,
	resolveRoute: (
		modelId: string,
		options?: RoutingStreamOptions,
	) => BedrockModelRoute | undefined,
	adapters: {
		anthropic?: StreamAdapter;
		openAI?: StreamAdapter;
		runtime?: StreamAdapter;
	} = {},
	mode: "full" | "simple" = "simple",
): StreamAdapter {
	const anthropicApi = anthropicMessagesApi();
	const openAIApi = openAIResponsesApi();
	const runtimeApi = bedrockConverseStreamApi();
	const streamAnthropic =
		adapters.anthropic ??
		(mode === "simple" ? anthropicApi.streamSimple : anthropicApi.stream);
	const streamOpenAI =
		adapters.openAI ??
		(mode === "simple" ? openAIApi.streamSimple : openAIApi.stream);
	const streamRuntime =
		adapters.runtime ??
		(mode === "simple" ? runtimeApi.streamSimple : runtimeApi.stream);
	return (model, context, options) => {
		const stream = createAssistantMessageEventStream();
		void (async () => {
			try {
				const route = resolveRoute(model.id, options);
				if (!route)
					throw new Error(`No Bedrock route is available for ${model.id}`);
				const routedContext = contextForBedrockRoute(context, route);
				let inner: AssistantMessageEventStream;
				if (route.transport === "runtime") {
					inner = streamRuntime(route.target, routedContext, options);
				} else {
					const token = await provideToken(options);
					if (!token.trim())
						throw new Error(
							"Bedrock Mantle token generation returned an empty token",
						);
					if (route.transport === "mantle-openai") {
						inner = streamOpenAI(route.target, routedContext, {
							...options,
							apiKey: token,
						});
					} else {
						inner = streamAnthropic(route.target, routedContext, {
							...options,
							apiKey: undefined,
							headers: {
								...options?.headers,
								authorization: `Bearer ${token}`,
							},
						});
					}
				}
				for await (const event of inner)
					stream.push(normalizeEvent(event, route));
				stream.end();
			} catch (error) {
				const message = errorMessage(model, error, options);
				stream.push({
					type: "error",
					reason: message.stopReason === "aborted" ? "aborted" : "error",
					error: message,
				});
				stream.end();
			}
		})();
		return stream;
	};
}

function loadBedrockRuntimeMetadata(): BedrockModelMetadata[] {
	const settings = JSON.parse(fs.readFileSync(getSettingsPath(), "utf-8")) as Record<string, unknown>;
	const refresh = settings.bedrockRefresh;
	if (!refresh || typeof refresh !== "object" || Array.isArray(refresh)) return [];
	const refreshRecord = refresh as Record<string, unknown>;
	const catalog = Array.isArray(refreshRecord.catalog)
		? refreshRecord.catalog.filter((entry): entry is BedrockModelMetadata =>
				entry !== null &&
				typeof entry === "object" &&
				typeof (entry as Record<string, unknown>).id === "string" &&
				((entry as Record<string, unknown>).kind === "foundation" ||
					(entry as Record<string, unknown>).kind === "inference-profile"),
			)
		: [];
	const catalogIds = new Set(catalog.map((entry) => entry.id));
	const configuredIds = Array.isArray(refreshRecord.models)
		? refreshRecord.models.filter(
				(id): id is string =>
					typeof id === "string" && id.startsWith("us.anthropic.claude-"),
			)
		: [];
	return [
		...catalog,
		...configuredIds
			.filter((id) => !catalogIds.has(id))
			.map((id) => ({ id, kind: "inference-profile" as const })),
	];
}

export function createBedrockModelProvider(
	env: BedrockMantleEnvironment = process.env,
	options: {
		discoverModels?: MantleDiscovery;
		provideToken?: TokenProvider;
		tokenFactory?: TokenProviderFactory;
		runtimeMetadata?: readonly BedrockModelMetadata[];
	} = {},
): Provider<Api> {
	const initialTarget = resolveBedrockMantleTarget(env);
	const provideToken: RequestTokenProvider = options.provideToken
		? () => options.provideToken?.() ?? Promise.reject(new Error("Missing token provider"))
		: createBedrockRequestTokenProvider(initialTarget, env, options.tokenFactory);
	const discoverModels =
		options.discoverModels ?? discoverBedrockMantleModelIds;
	let mantleModelIds: readonly string[] = INITIAL_MANTLE_MODEL_IDS;
	const runtimeMetadata =
		options.runtimeMetadata ?? loadBedrockRuntimeMetadata();
	let routes = buildBedrockModelRoutes(
		mantleModelIds,
		initialTarget,
		runtimeMetadata,
	);
	const resolveRoute = (
		modelId: string,
		streamOptions?: RoutingStreamOptions,
	) => {
		const target = resolveBedrockMantleTarget({
			...env,
			...streamOptions?.env,
		});
		return buildBedrockModelRoutes(mantleModelIds, target, runtimeMetadata).find(
			(route) => route.model.id === modelId,
		);
	};
	const streamSimple = createBedrockRoutingStream(provideToken, resolveRoute);
	const streamFull = createBedrockRoutingStream(
		provideToken,
		resolveRoute,
		{},
		"full",
	);
	const runtimeAuth: Provider<Api>["auth"] = {
		apiKey: {
			name: "AWS credentials or bearer token",
			login: async (interaction) => {
				interaction.signal.throwIfAborted();
				const method = await interaction.prompt({
					type: "select",
					message: "Select Amazon Bedrock authentication method:",
					options: [
						{ id: "bearer-token", label: "Bearer token" },
						{ id: "aws-profile", label: "AWS profile" },
						{
							id: "credential-chain",
							label: "Existing AWS credential chain",
						},
					],
				});
				interaction.signal.throwIfAborted();
				if (method === "bearer-token")
					return {
						type: "api_key",
						key: await interaction.prompt({
							type: "secret",
							message: "Enter Amazon Bedrock bearer token",
						}),
					};
				if (method === "aws-profile")
					return {
						type: "api_key",
						env: {
							AWS_PROFILE: await interaction.prompt({
								type: "text",
								message: "Enter AWS profile name",
							}),
						},
					};
				if (method === "credential-chain") return { type: "api_key" };
				throw new Error(`Unknown Amazon Bedrock auth method: ${method}`);
			},
			resolve: async ({ ctx, credential, signal }) => {
				const env = async (name: string) => {
					signal.throwIfAborted();
					const value = await ctx.env(name);
					signal.throwIfAborted();
					return value;
				};
				if (credential?.key)
					return {
						auth: { apiKey: credential.key },
						env: credential.env,
						source: "stored credential",
					};
				if (credential) {
					const runtimeProfile =
						credential.env?.AWS_PROFILE ?? credential.env?.AWS_DEFAULT_PROFILE;
					return {
						auth: {},
						env: {
							...credential.env,
							...(runtimeProfile ? { AWS_PROFILE: runtimeProfile } : {}),
						},
						source: "stored AWS credential chain",
					};
				}
				const bearerToken = await env("AWS_BEARER_TOKEN_BEDROCK");
				if (bearerToken)
					return {
						auth: { apiKey: bearerToken },
						source: "AWS_BEARER_TOKEN_BEDROCK",
					};
				const mantleProfile = await env("BEDROCK_MANTLE_AWS_PROFILE");
				const runtimeProfile =
					(await env("AWS_PROFILE")) ?? (await env("AWS_DEFAULT_PROFILE"));
				if (mantleProfile)
					return {
						auth: {},
						env: {
							BEDROCK_MANTLE_AWS_PROFILE: mantleProfile,
							...(runtimeProfile ? { AWS_PROFILE: runtimeProfile } : {}),
						},
						source: "BEDROCK_MANTLE_AWS_PROFILE",
					};
				if (runtimeProfile)
					return {
						auth: {},
						env: { AWS_PROFILE: runtimeProfile },
						source: "AWS_PROFILE",
					};
				const accessKeyId = await env("AWS_ACCESS_KEY_ID");
				const secretAccessKey = await env("AWS_SECRET_ACCESS_KEY");
				if (accessKeyId && secretAccessKey) {
					const sessionToken = await env("AWS_SESSION_TOKEN");
					return {
						auth: {},
						env: {
							AWS_ACCESS_KEY_ID: accessKeyId,
							AWS_SECRET_ACCESS_KEY: secretAccessKey,
							...(sessionToken ? { AWS_SESSION_TOKEN: sessionToken } : {}),
						},
						source: "AWS access keys",
					};
				}
				const credentialsFile =
					(await env("AWS_SHARED_CREDENTIALS_FILE")) ?? "~/.aws/credentials";
				if (await ctx.fileExists(credentialsFile))
					return { auth: {}, source: credentialsFile };
				const configFile = (await env("AWS_CONFIG_FILE")) ?? "~/.aws/config";
				if (await ctx.fileExists(configFile))
					return { auth: {}, source: configFile };
				return { auth: {}, source: "AWS credential chain" };
			},
		},
	};

	return {
		id: PROVIDER_ID,
		name: "Amazon Bedrock (Auto)",
		auth: runtimeAuth,
		getModels: () => routes.map((route) => route.model),
		refreshModels: async (context) => {
			if (!context.allowNetwork) {
				if (!context.stored?.models.length) return;
				const restoredIds = context.stored.models.map((model) => model.id);
				const restoredTarget = resolveBedrockMantleTarget(env);
				const restored = buildBedrockModelRoutes(
					restoredIds,
					restoredTarget,
					runtimeMetadata,
				);
				if (restored.length === 0) return;
				await context.publish({
					update: () => {
						mantleModelIds = restoredIds;
						routes = restored;
					},
				});
				return;
			}
			const credentialOptions =
				context.credential?.type === "api_key"
					? {
							apiKey: context.credential.key,
							env: context.credential.env,
						}
					: undefined;
			const target = resolveBedrockMantleTarget({
				...env,
				...credentialOptions?.env,
			});
			const modelIds = await discoverModels(
				target,
				() => provideToken(credentialOptions),
				context.signal,
			);
			const refreshed = buildBedrockModelRoutes(
				modelIds,
				target,
				runtimeMetadata,
			);
			if (refreshed.length === 0)
				throw new Error(
					`Bedrock Mantle discovery found no supported models in ${target.region}`,
				);
			await context.publish({
				persist: {
					models: modelIds.flatMap((modelId) => {
						const route = refreshed.find(
							(candidate) => candidate.model.id === modelId,
						);
						return route ? [route.model] : [];
					}),
					checkedAt: Date.now(),
				},
				update: () => {
					mantleModelIds = modelIds;
					routes = refreshed;
				},
			});
		},
		stream: (model, context, streamOptions) =>
			streamFull(model, context, streamOptions as StreamOptions),
		streamSimple: (model, context, streamOptions) =>
			streamSimple(model, context, streamOptions),
	};
}

export default function registerBedrockMantleProvider(pi: ExtensionAPI): void {
	pi.registerProvider(createBedrockModelProvider());
}
