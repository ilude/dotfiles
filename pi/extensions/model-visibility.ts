import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getOAuthProvider } from "@mariozechner/pi-ai/oauth";
import { uiNotify } from "../lib/extension-utils.js";

type ModelLike = {
	provider: string;
	id: string;
	name: string;
	api: string;
	baseUrl: string;
	reasoning: boolean;
	input: ("text" | "image")[];
	cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
	contextWindow: number;
	maxTokens: number;
	headers?: Record<string, string>;
	compat?: unknown;
};

const TARGET_PROVIDERS = ["openai-codex", "github-copilot", "opencode", "opencode-go", "openrouter"] as const;

const HIDE_EXACT_IDS = {
	"openai-codex": new Set(["codex-auto-review"]),
	opencode: new Set(["claude-3-5-haiku", "claude-opus-4-1", "claude-sonnet-4"]),
	"opencode-go": new Set<string>(),
	openrouter: new Set([
		"ai21/jamba-large-1.7",
		"alibaba/tongyi-deepresearch-30b-a3b",
		"allenai/olmo-3.1-32b-instruct",
		"arcee-ai/trinity-large-thinking",
		"arcee-ai/trinity-mini",
		"arcee-ai/virtuoso-large",
		"amazon/nova-2-lite-v1",
		"amazon/nova-lite-v1",
		"amazon/nova-micro-v1",
		"amazon/nova-premier-v1",
		"amazon/nova-pro-v1",
		"anthropic/claude-3-haiku",
		"anthropic/claude-3.5-haiku",
		"anthropic/claude-3.7-sonnet",
		"anthropic/claude-3.7-sonnet:thinking",
		"anthropic/claude-opus-4",
		"anthropic/claude-opus-4.1",
		"baidu/ernie-4.5-21b-a3b",
		"baidu/ernie-4.5-vl-28b-a3b",
		"bytedance-seed/seed-1.6",
		"bytedance-seed/seed-1.6-flash",
		"bytedance-seed/seed-2.0-lite",
		"bytedance-seed/seed-2.0-mini",
		"deepseek/deepseek-chat",
		"deepseek/deepseek-chat-v3-0324",
		"deepseek/deepseek-chat-v3.1",
		"deepseek/deepseek-r1",
		"deepseek/deepseek-r1-0528",
		"deepseek/deepseek-v3.1-terminus",
		"essentialai/rnj-1-instruct",
		"google/gemini-2.0-flash-001",
		"google/gemini-2.0-flash-lite-001",
		"google/gemini-2.5-flash",
		"google/gemini-2.5-flash-lite",
		"google/gemini-2.5-flash-lite-preview-09-2025",
		"google/gemini-2.5-pro",
		"google/gemini-2.5-pro-preview",
		"google/gemini-2.5-pro-preview-05-06",
		"google/gemini-3-flash-preview",
		"google/gemini-3.1-flash-lite-preview",
		"google/gemini-3.1-pro-preview",
		"google/gemini-3.1-pro-preview-customtools",
		"inception/mercury-2",
		"inclusionai/ling-2.6-flash:free",
		"kwaipilot/kat-coder-pro-v2",
		"minimax/minimax-m1",
		"minimax/minimax-m2",
		"minimax/minimax-m2.1",
		"moonshotai/kimi-k2",
		"moonshotai/kimi-k2-0905",
		"moonshotai/kimi-k2-thinking",
		"nex-agi/deepseek-v3.1-nex-n1",
		"nvidia/llama-3.1-nemotron-70b-instruct",
		"nvidia/llama-3.3-nemotron-super-49b-v1.5",
		"nvidia/nemotron-3-nano-30b-a3b",
		"nvidia/nemotron-3-super-120b-a12b",
		"nvidia/nemotron-nano-9b-v2",
		"openai/gpt-3.5-turbo",
		"openai/gpt-3.5-turbo-0613",
		"openai/gpt-3.5-turbo-16k",
		"openai/gpt-4",
		"openai/gpt-4-0314",
		"openai/gpt-4-1106-preview",
		"openai/gpt-4-turbo",
		"openai/gpt-4-turbo-preview",
		"openai/gpt-4.1",
		"openai/gpt-audio",
		"openai/gpt-audio-mini",
		"openai/gpt-4.1-mini",
		"openai/gpt-4.1-nano",
		"openai/gpt-4o",
		"openai/gpt-4o-2024-05-13",
		"openai/gpt-4o-2024-08-06",
		"openai/gpt-4o-2024-11-20",
		"openai/gpt-4o-audio-preview",
		"openai/gpt-4o-mini",
		"openai/gpt-4o-mini-2024-07-18",
		"openai/o1",
		"openai/o3",
		"openai/o3-deep-research",
		"openai/o3-mini",
		"openai/o3-mini-high",
		"openai/o3-pro",
		"openai/o4-mini",
		"openai/o4-mini-deep-research",
		"openai/o4-mini-high",
		"prime-intellect/intellect-3",
		"qwen/qwen-2.5-72b-instruct",
		"qwen/qwen-2.5-7b-instruct",
		"qwen/qwen-max",
		"qwen/qwen-plus",
		"qwen/qwen-plus-2025-07-28",
		"qwen/qwen-plus-2025-07-28:thinking",
		"qwen/qwen-turbo",
		"qwen/qwen-vl-max",
		"qwen/qwen3-14b",
		"qwen/qwen3-235b-a22b",
		"qwen/qwen3-235b-a22b-2507",
		"qwen/qwen3-235b-a22b-thinking-2507",
		"qwen/qwen3-30b-a3b",
		"qwen/qwen3-30b-a3b-instruct-2507",
		"qwen/qwen3-30b-a3b-thinking-2507",
		"qwen/qwen3-32b",
		"qwen/qwen3-8b",
		"qwen/qwen3-coder",
		"qwen/qwen3-coder-30b-a3b-instruct",
		"qwen/qwen3-coder-flash",
		"qwen/qwen3-coder-next",
		"qwen/qwen3-coder-plus",
		"qwen/qwen3-coder:free",
		"qwen/qwen3-max",
		"qwen/qwen3-max-thinking",
		"qwen/qwen3-next-80b-a3b-instruct",
		"qwen/qwen3-next-80b-a3b-instruct:free",
		"qwen/qwen3-next-80b-a3b-thinking",
		"qwen/qwen3-vl-235b-a22b-instruct",
		"qwen/qwen3-vl-235b-a22b-thinking",
		"qwen/qwen3-vl-30b-a3b-instruct",
		"qwen/qwen3-vl-30b-a3b-thinking",
		"qwen/qwen3-vl-32b-instruct",
		"qwen/qwen3-vl-8b-instruct",
		"qwen/qwen3-vl-8b-thinking",
		"qwen/qwq-32b",
		"rekaai/reka-edge",
		"relace/relace-search",
		"sao10k/l3-euryale-70b",
		"sao10k/l3.1-euryale-70b",
		"stepfun/step-3.5-flash",
		"thedrummer/rocinante-12b",
		"thedrummer/unslopnemo-12b",
		"tngtech/deepseek-r1t2-chimera",
		"upstage/solar-pro-3",
		"x-ai/grok-3",
		"x-ai/grok-3-beta",
		"x-ai/grok-3-mini",
		"x-ai/grok-3-mini-beta",
		"x-ai/grok-4",
		"x-ai/grok-4-fast",
		"z-ai/glm-4-32b",
		"z-ai/glm-4.5",
		"z-ai/glm-4.5-air",
		"z-ai/glm-4.5-air:free",
		"z-ai/glm-4.5v",
		"z-ai/glm-4.6",
		"z-ai/glm-4.6v",
		"z-ai/glm-4.7",
		"z-ai/glm-4.7-flash",
	]),
	"github-copilot": new Set<string>(),
} as const;

const HIDE_PREFIXES = {
	openrouter: ["meta-llama/", "mistralai/", "xiaomi/"],
	"openai-codex": [] as string[],
	opencode: [] as string[],
	"opencode-go": [] as string[],
	"github-copilot": [] as string[],
} as const;

function isDatedOrVersionSuffix(id: string): boolean {
	const lowered = id.toLowerCase();
	if (/-(?:19|20)\d{2}-\d{2}-\d{2}$/.test(lowered)) return true; // yyyy-mm-dd
	if (/-(?:19|20)\d{6}$/.test(lowered)) return true; // yyyymmdd
	if (/-\d{4}$/.test(lowered)) return true; // legacy short snapshots like -0613
	return false;
}

function isPreviewSnapshot(id: string, name: string): boolean {
	const combined = `${id} ${name}`.toLowerCase();
	return combined.includes("preview");
}

function shouldHideByCustomRules(provider: string, id: string): boolean {
	const exact = HIDE_EXACT_IDS[provider as keyof typeof HIDE_EXACT_IDS];
	if (exact?.has(id)) return true;
	const prefixes = HIDE_PREFIXES[provider as keyof typeof HIDE_PREFIXES] ?? [];
	return prefixes.some((prefix) => id.startsWith(prefix));
}

export function shouldHideModel(provider: string, model: Pick<ModelLike, "id" | "name">): boolean {
	if (shouldHideByCustomRules(provider, model.id)) return true;
	return isDatedOrVersionSuffix(model.id) || isPreviewSnapshot(model.id, model.name);
}

function toProviderModelDef(model: ModelLike) {
	return {
		id: model.id,
		name: model.name,
		api: model.api,
		reasoning: model.reasoning,
		input: model.input,
		cost: model.cost,
		contextWindow: model.contextWindow,
		maxTokens: model.maxTokens,
		headers: model.headers,
		compat: model.compat as any,
	};
}

function applyProviderFilter(ctx: any, provider: string): { before: number; after: number } | undefined {
	const models = (ctx.modelRegistry.getAll() as ModelLike[]).filter((model) => model.provider === provider);
	if (models.length === 0) return undefined;

	const filtered = models.filter((model) => !shouldHideModel(provider, model));
	if (filtered.length === models.length) {
		return { before: models.length, after: filtered.length };
	}
	if (filtered.length === 0) {
		return { before: models.length, after: 0 };
	}

	if (provider === "github-copilot" || provider === "openai-codex") {
		const oauthProvider = getOAuthProvider(provider);
		if (!oauthProvider) return { before: models.length, after: models.length };
		ctx.modelRegistry.registerProvider(provider, {
			baseUrl: models[0].baseUrl,
			oauth: {
				name: oauthProvider.name,
				login: oauthProvider.login,
				refreshToken: oauthProvider.refreshToken,
				getApiKey: oauthProvider.getApiKey,
				usesCallbackServer: oauthProvider.usesCallbackServer,
				modifyModels: oauthProvider.modifyModels,
			},
			models: filtered.map((model) => toProviderModelDef(model)),
		});
		return { before: models.length, after: filtered.length };
	}

	const apiKeyEnv =
		provider === "opencode" || provider === "opencode-go"
			? "OPENCODE_API_KEY"
			: provider === "openrouter"
			  ? "OPENROUTER_API_KEY"
			  : undefined;
	if (!apiKeyEnv) return { before: models.length, after: models.length };
	ctx.modelRegistry.registerProvider(provider, {
		baseUrl: models[0].baseUrl,
		apiKey: apiKeyEnv,
		api: models[0].api as any,
		models: filtered.map((model) => toProviderModelDef(model)),
	});
	return { before: models.length, after: filtered.length };
}

export default function registerModelVisibilityExtension(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		const messages: string[] = [];
		for (const provider of TARGET_PROVIDERS) {
			const result = applyProviderFilter(ctx, provider);
			if (!result) continue;
			if (result.after < result.before) {
				messages.push(`${provider}: ${result.before} -> ${result.after}`);
			}
		}
		if (messages.length > 0) {
			uiNotify(ctx, "info", `Hidden older/blocked models (${messages.join(", ")})`, {
				prefix: "model-visibility",
			});
		}
	});
}
