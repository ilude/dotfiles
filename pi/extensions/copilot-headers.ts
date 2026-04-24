import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getOAuthProvider } from "@mariozechner/pi-ai/oauth";

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

const COPILOT_HEADERS: Record<string, string> = {
	"Editor-Version": "VSCode/1.99.1",
	"Copilot-Integration-Id": "vscode/github-copilot",
};

const TARGET_PROVIDER = "github-copilot";

function toProviderModelDefWithHeaders(model: ModelLike) {
	return {
		id: model.id,
		name: model.name,
		api: model.api,
		reasoning: model.reasoning,
		input: model.input,
		cost: model.cost,
		contextWindow: model.contextWindow,
		maxTokens: model.maxTokens,
		headers: {
			...COPILOT_HEADERS,
			...model.headers,
		},
		compat: model.compat as any,
	};
}

function applyCopilotHeaders(ctx: any): { updated: number } | undefined {
	const models = (ctx.modelRegistry.getAll() as ModelLike[]).filter((model) => model.provider === TARGET_PROVIDER);
	if (models.length === 0) return undefined;

	const oauthProvider = getOAuthProvider(TARGET_PROVIDER);
	if (!oauthProvider) return undefined;

	ctx.modelRegistry.registerProvider(TARGET_PROVIDER, {
		baseUrl: models[0].baseUrl,
		oauth: {
			name: oauthProvider.name,
			login: oauthProvider.login,
			refreshToken: oauthProvider.refreshToken,
			getApiKey: oauthProvider.getApiKey,
			usesCallbackServer: oauthProvider.usesCallbackServer,
			modifyModels: oauthProvider.modifyModels,
		},
		models: models.map((model) => toProviderModelDefWithHeaders(model)),
	});

	return { updated: models.length };
}

export default function registerCopilotHeadersExtension(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		const result = applyCopilotHeaders(ctx);
		if (result) {
			ctx.ui.notify(`Copilot API headers injected (${result.updated} models)`, "info");
		}
	});
}

export { applyCopilotHeaders };