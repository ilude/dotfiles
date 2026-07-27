import { getTokenProvider } from "@aws/bedrock-token-generator";
import {
	type Api,
	type AssistantMessage,
	type AssistantMessageEventStream,
	type Context,
	createAssistantMessageEventStream,
	type Model,
	type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { openAIResponsesApi } from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PROVIDER_ID = "bedrock-mantle";
const DEFAULT_REGION = "us-east-2";
const TOKEN_EXPIRY_SECONDS = 60 * 60;

export const BEDROCK_MANTLE_MODELS = [
	{
		id: "openai.gpt-5.6-luna",
		name: "GPT-5.6 Luna (Bedrock Mantle)",
		reasoning: true,
		thinkingLevelMap: { off: null, xhigh: "xhigh", max: "max" },
		input: ["text", "image"] as ("text" | "image")[],
		cost: { input: 1.1, output: 6.6, cacheRead: 0.11, cacheWrite: 1.38 },
		contextWindow: 272_000,
		maxTokens: 128_000,
	},
	{
		id: "openai.gpt-5.6-terra",
		name: "GPT-5.6 Terra (Bedrock Mantle)",
		reasoning: true,
		thinkingLevelMap: { off: null, xhigh: "xhigh", max: "max" },
		input: ["text", "image"] as ("text" | "image")[],
		cost: { input: 2.75, output: 16.5, cacheRead: 0.28, cacheWrite: 3.44 },
		contextWindow: 272_000,
		maxTokens: 128_000,
	},
	{
		id: "openai.gpt-5.6-sol",
		name: "GPT-5.6 Sol (Bedrock Mantle)",
		reasoning: true,
		thinkingLevelMap: { off: null, xhigh: "xhigh", max: "max" },
		input: ["text", "image"] as ("text" | "image")[],
		cost: { input: 5.5, output: 33, cacheRead: 0.55, cacheWrite: 6.88 },
		contextWindow: 272_000,
		maxTokens: 128_000,
	},
] as const;

export interface BedrockMantleEnvironment {
	AWS_BEARER_TOKEN_BEDROCK?: string;
	AWS_DEFAULT_PROFILE?: string;
	AWS_DEFAULT_REGION?: string;
	AWS_PROFILE?: string;
	AWS_REGION?: string;
	BEDROCK_MANTLE_AWS_PROFILE?: string;
	BEDROCK_MANTLE_REGION?: string;
}

export interface BedrockMantleTarget {
	profile?: string;
	region: string;
	baseUrl: string;
}

type TokenProvider = () => Promise<string>;
type TokenProviderFactory = typeof getTokenProvider;
type OpenAIResponsesStream = (
	model: Model<"openai-responses">,
	context: Context,
	options?: SimpleStreamOptions,
) => AssistantMessageEventStream;

export function resolveBedrockMantleTarget(
	env: BedrockMantleEnvironment = process.env,
): BedrockMantleTarget {
	const region =
		env.BEDROCK_MANTLE_REGION?.trim() ||
		env.AWS_REGION?.trim() ||
		env.AWS_DEFAULT_REGION?.trim() ||
		DEFAULT_REGION;
	const profile =
		env.BEDROCK_MANTLE_AWS_PROFILE?.trim() ||
		env.AWS_PROFILE?.trim() ||
		env.AWS_DEFAULT_PROFILE?.trim() ||
		undefined;
	return {
		profile,
		region,
		baseUrl: `https://bedrock-mantle.${region}.api.aws/openai/v1`,
	};
}

export function createBedrockMantleTokenProvider(
	env: BedrockMantleEnvironment = process.env,
	factory: TokenProviderFactory = getTokenProvider,
): TokenProvider {
	const bearerToken = env.AWS_BEARER_TOKEN_BEDROCK?.trim();
	if (bearerToken) return async () => bearerToken;

	const target = resolveBedrockMantleTarget(env);
	return factory({
		...(target.profile ? { profile: target.profile } : {}),
		region: target.region,
		expiresInSeconds: TOKEN_EXPIRY_SECONDS,
	});
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

export function createBedrockMantleStream(
	provideToken: TokenProvider,
	streamOpenAI: OpenAIResponsesStream = (model, context, options) =>
		openAIResponsesApi().streamSimple(model, context, options),
): (
	model: Model<Api>,
	context: Context,
	options?: SimpleStreamOptions,
) => AssistantMessageEventStream {
	return (model, context, options) => {
		const stream = createAssistantMessageEventStream();
		void (async () => {
			try {
				const token = await provideToken();
				if (!token.trim())
					throw new Error("Bedrock Mantle token generation returned an empty token");
				const target = resolveBedrockMantleTarget();
				const inner = streamOpenAI(
					{
						...(model as Model<"openai-responses">),
						api: "openai-responses",
						baseUrl: target.baseUrl,
					},
					context,
					{ ...options, apiKey: token },
				);
				for await (const event of inner) stream.push(event);
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

export default function registerBedrockMantleProvider(pi: ExtensionAPI): void {
	const target = resolveBedrockMantleTarget();
	const provideToken = createBedrockMantleTokenProvider();
	pi.registerProvider(PROVIDER_ID, {
		name: "Amazon Bedrock Mantle",
		baseUrl: target.baseUrl,
		apiKey: "short-term-aws-token",
		api: "openai-responses",
		models: BEDROCK_MANTLE_MODELS.map((model) => ({ ...model })),
		streamSimple: createBedrockMantleStream(provideToken),
	});
}
