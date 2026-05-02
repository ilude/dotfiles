// Convention exception: this extension is a single user-initiated slash
//   command (`/refresh-models`) whose UI is a sequence of progress messages
//   followed by a per-provider success/error summary; the messages are part
//   of the command's own output flow, not ambient notifications.
// Risk: a future reader assumes uiNotify is required and either swaps every
//   site (breaking the existing assertion shapes in refresh-models.test.ts
//   like `expect.stringContaining("Done. Refreshed 2")`) or splits the call
//   sites between the helper and direct ctx.ui.notify, producing inconsistent
//   prefix behavior inside one command flow.
// Why shared helper is inappropriate: the helper's prefix wrapper exists for
//   ambient/background notifications. A user who just typed `/refresh-models`
//   already knows the source; a `[refresh-models]` prefix on every progress
//   line would only add noise. The handler's own `notify(...)` closure
//   already centralizes the call site.
import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getModels } from "@mariozechner/pi-ai";
import { getOAuthProvider } from "@mariozechner/pi-ai/oauth";

const CODEX_CLIENT_VERSION_CANDIDATES = ["999.0.0", "1.0.0", "0.99.0"];
const SUPPORTED_SUBSCRIPTION_PROVIDERS = new Set(["anthropic", "openai-codex", "github-copilot"]);

type RefreshScope = {
	provider?: string;
};

type InputKind = "text" | "image";

type ThinkingLevelMap = Record<string, string | null>;

type ModelLike = {
	provider: string;
	id: string;
	name: string;
	api: string;
	baseUrl: string;
	reasoning: boolean;
	input: InputKind[];
	cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
	contextWindow: number;
	maxTokens: number;
	headers?: Record<string, string>;
	thinkingLevelMap?: ThinkingLevelMap;
	compat?: unknown;
};

type ProviderModelDef = {
	id: string;
	name: string;
	api: string;
	reasoning: boolean;
	input: InputKind[];
	cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
	contextWindow: number;
	maxTokens: number;
	headers?: Record<string, string>;
	thinkingLevelMap?: ThinkingLevelMap;
	compat?: unknown;
};

type RemoteModelInfo = {
	id: string;
	name?: string;
	api?: string;
	reasoning?: boolean;
	input?: InputKind[];
	contextWindow?: number;
	maxTokens?: number;
	thinkingLevelMap?: ThinkingLevelMap;
	disabled?: boolean;
	eligible?: boolean;
};

export function parseRefreshModelsArgs(raw: string): RefreshScope {
	const trimmed = raw.trim();
	if (!trimmed) return {};
	const parts = trimmed.split(/\s+/).filter(Boolean);
	if (parts.length > 1) {
		throw new Error("Usage: /refresh-models [provider]");
	}
	return { provider: parts[0] };
}

export function getCurrentSubscriptionProviders(modelRegistry: any): string[] {
	const authStorage = modelRegistry?.authStorage;
	if (!authStorage || typeof authStorage.list !== "function" || typeof authStorage.get !== "function") {
		return [];
	}
	return authStorage
		.list()
		.filter((provider: string) => authStorage.get(provider)?.type === "oauth");
}

function normalizeBaseUrl(raw: string): string {
	return raw.replace(/\/+$/, "");
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === "string");
}

function defaultCost() {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}

function getBuiltInCopilotHeaders(): Record<string, string> {
	try {
		const modelWithHeaders = getModels("github-copilot").find(
			(model) => !!model.headers && Object.keys(model.headers).length > 0,
		);
		return modelWithHeaders?.headers ? { ...modelWithHeaders.headers } : {};
	} catch {
		return {};
	}
}

function inferCopilotApi(remote: Record<string, unknown>): string {
	const endpoints = asStringArray(remote.supported_endpoints);
	if (endpoints.some((endpoint) => endpoint.includes("/v1/messages"))) return "anthropic-messages";
	if (endpoints.some((endpoint) => endpoint.includes("/responses"))) return "openai-responses";
	return "openai-completions";
}

function defaultCopilotCompat(api: string) {
	if (api !== "openai-completions") return undefined;
	return {
		supportsStore: false,
		supportsDeveloperRole: false,
		supportsReasoningEffort: false,
	};
}

const PI_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;

function buildThinkingLevelMap(supportedLevels: string[]): ThinkingLevelMap | undefined {
	const supported = new Set(supportedLevels.filter(Boolean));
	if (supported.size === 0) return undefined;
	return Object.fromEntries(
		PI_THINKING_LEVELS.map((level) => [level, supported.has(level) ? level : null]),
	) as ThinkingLevelMap;
}

function compatWithoutReasoningEffortMap(compat: unknown): unknown {
	if (!compat || typeof compat !== "object" || Array.isArray(compat)) return compat;
	const { reasoningEffortMap: _reasoningEffortMap, ...rest } = compat as Record<string, unknown>;
	return Object.keys(rest).length > 0 ? rest : undefined;
}

function getThinkingLevelMap(existing?: ModelLike, remote?: RemoteModelInfo): ThinkingLevelMap | undefined {
	const compat = existing?.compat as { reasoningEffortMap?: unknown } | undefined;
	const legacyMap =
		compat?.reasoningEffortMap && typeof compat.reasoningEffortMap === "object" && !Array.isArray(compat.reasoningEffortMap)
			? (compat.reasoningEffortMap as ThinkingLevelMap)
			: undefined;
	return remote?.thinkingLevelMap ?? existing?.thinkingLevelMap ?? legacyMap;
}

function decodeJwtPayload(token: string): Record<string, unknown> | undefined {
	const parts = token.split(".");
	if (parts.length !== 3) return undefined;
	try {
		const payload = Buffer.from(parts[1], "base64url").toString("utf8");
		const parsed = JSON.parse(payload);
		if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
	} catch {
		return undefined;
	}
	return undefined;
}

function extractChatGptAccountId(token: string): string | undefined {
	const payload = decodeJwtPayload(token);
	const authClaim = payload?.["https://api.openai.com/auth"];
	if (!authClaim || typeof authClaim !== "object") return undefined;
	return asString((authClaim as Record<string, unknown>).chatgpt_account_id);
}

function extractModelIds(payload: unknown): string[] {
	const extractFromArray = (arr: unknown[]): string[] => {
		const ids: string[] = [];
		for (const item of arr) {
			if (typeof item === "string" && item.trim()) {
				ids.push(item.trim());
				continue;
			}
			if (!item || typeof item !== "object") continue;
			const record = item as Record<string, unknown>;
			const id = asString(record.id) ?? asString(record.model) ?? asString(record.slug);
			if (id) ids.push(id);
		}
		return ids;
	};

	if (Array.isArray(payload)) return Array.from(new Set(extractFromArray(payload)));
	if (!payload || typeof payload !== "object") return [];

	const record = payload as Record<string, unknown>;
	const listCandidates = [record.models, record.data, record.items].filter(Array.isArray) as unknown[][];
	for (const list of listCandidates) {
		const ids = extractFromArray(list);
		if (ids.length > 0) return Array.from(new Set(ids));
	}
	return [];
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
	const response = await fetch(url, { method: "GET", headers });
	const text = await response.text().catch(() => "");
	const snippet = text.replace(/\s+/g, " ").trim().slice(0, 240);
	if (!response.ok) {
		throw new Error(`${url} returned HTTP ${response.status}${snippet ? `: ${snippet}` : ""}`);
	}
	if (!text) return {};
	try {
		return JSON.parse(text) as unknown;
	} catch {
		throw new Error(`${url} returned non-JSON response${snippet ? `: ${snippet}` : ""}`);
	}
}

async function fetchOpenAICodexCatalog(baseUrl: string, apiKey: string, headers?: Record<string, string>) {
	const accountId = extractChatGptAccountId(apiKey);
	if (!accountId) {
		throw new Error("Could not extract chatgpt_account_id from OpenAI Codex token");
	}

	const normalized = normalizeBaseUrl(baseUrl);
	const requestHeaders: Record<string, string> = {
		Accept: "application/json",
		Authorization: `Bearer ${apiKey}`,
		"chatgpt-account-id": accountId,
		originator: "pi",
		"User-Agent": "pi",
		...(headers ?? {}),
	};

	let lastError = "Unknown error";
	for (const clientVersion of CODEX_CLIENT_VERSION_CANDIDATES) {
		const url = `${normalized}/codex/models?client_version=${encodeURIComponent(clientVersion)}`;
		try {
			const payload = await fetchJson(url, requestHeaders);
			const ids = extractModelIds(payload);
			if (ids.length === 0) {
				lastError = `${url} returned no model ids`;
				continue;
			}
			return payload;
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
		}
	}

	throw new Error(lastError);
}

async function fetchGitHubCopilotCatalog(baseUrl: string, apiKey: string, headers?: Record<string, string>) {
	const normalized = normalizeBaseUrl(baseUrl);
	const fallbackHeaders = getBuiltInCopilotHeaders();
	const requestHeaders: Record<string, string> = {
		Accept: "application/json",
		...fallbackHeaders,
		...(headers ?? {}),
		Authorization: `Bearer ${apiKey}`,
		"openai-intent": "models",
		"x-interaction-type": "models",
	};

	return fetchJson(`${normalized}/models`, requestHeaders);
}

async function fetchAnthropicCatalog(baseUrl: string, apiKey: string, headers?: Record<string, string>) {
	const normalized = normalizeBaseUrl(baseUrl);
	const requestHeaders: Record<string, string> = {
		Accept: "application/json",
		...(headers ?? {}),
		"x-api-key": apiKey,
		"anthropic-version": "2023-06-01",
		"anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
		"user-agent": "claude-cli/2.1.75",
		"x-app": "cli",
	};
	return fetchJson(`${normalized}/v1/models?limit=100`, requestHeaders);
}

async function fetchProviderCatalog(params: {
	provider: string;
	baseUrl: string;
	apiKey: string;
	headers?: Record<string, string>;
}): Promise<unknown> {
	if (params.provider === "openai-codex") {
		return fetchOpenAICodexCatalog(params.baseUrl, params.apiKey, params.headers);
	}
	if (params.provider === "github-copilot") {
		return fetchGitHubCopilotCatalog(params.baseUrl, params.apiKey, params.headers);
	}
	if (params.provider === "anthropic") {
		return fetchAnthropicCatalog(params.baseUrl, params.apiKey, params.headers);
	}

	const normalized = normalizeBaseUrl(params.baseUrl);
	const headers: Record<string, string> = {
		Accept: "application/json",
		Authorization: `Bearer ${params.apiKey}`,
		...(params.headers ?? {}),
	};
	return fetchJson(`${normalized}/models`, headers);
}

function parseOpenAICodexRemoteModels(payload: unknown): RemoteModelInfo[] {
	if (!payload || typeof payload !== "object") return [];
	const models = (payload as Record<string, unknown>).models;
	if (!Array.isArray(models)) return [];

	const parsed: RemoteModelInfo[] = [];
	for (const item of models) {
		if (!item || typeof item !== "object") continue;
		const record = item as Record<string, unknown>;
		const id = asString(record.slug) ?? asString(record.id) ?? asString(record.model);
		if (!id) continue;

		const visibility = asString(record.visibility)?.toLowerCase();
		if (visibility === "hide" || visibility === "hidden") continue;
		if (record.supported_in_api === false) continue;

		const inputModalities = asStringArray(record.input_modalities);
		const input: InputKind[] = inputModalities.includes("image") ? ["text", "image"] : ["text"];
		const supportedReasoning = asStringArray(record.supported_reasoning_levels);
		const reasoning = supportedReasoning.length > 0 || !!asString(record.default_reasoning_level);

		parsed.push({
			id,
			name: asString(record.display_name) ?? asString(record.name),
			api: "openai-codex-responses",
			reasoning,
			input,
			contextWindow: asNumber(record.context_window) ?? asNumber(record.max_context_window),
			thinkingLevelMap: buildThinkingLevelMap(supportedReasoning),
		});
	}
	return parsed;
}

function parseGitHubCopilotRemoteModels(payload: unknown): RemoteModelInfo[] {
	if (!payload || typeof payload !== "object") return [];
	const data = (payload as Record<string, unknown>).data;
	if (!Array.isArray(data)) return [];

	const parsed: RemoteModelInfo[] = [];
	for (const item of data) {
		if (!item || typeof item !== "object") continue;
		const record = item as Record<string, unknown>;
		const id = asString(record.id) ?? asString(record.model);
		if (!id) continue;

		const supportedEndpoints = asStringArray(record.supported_endpoints);
		const modelPickerEnabled = record.model_picker_enabled === true;
		const capabilities =
			record.capabilities && typeof record.capabilities === "object"
				? (record.capabilities as Record<string, unknown>)
				: undefined;
		const supports =
			capabilities?.supports && typeof capabilities.supports === "object"
				? (capabilities.supports as Record<string, unknown>)
				: undefined;
		const limits =
			capabilities?.limits && typeof capabilities.limits === "object"
				? (capabilities.limits as Record<string, unknown>)
				: undefined;
		const policy =
			record.policy && typeof record.policy === "object"
				? (record.policy as Record<string, unknown>)
				: undefined;

		const supportedReasoningEffort = asStringArray(supports?.reasoning_effort);
		const reasoningEffort = supportedReasoningEffort.length > 0;
		const reasoning = reasoningEffort || Boolean(supports?.adaptive_thinking);
		const vision = Boolean(supports?.vision);
		const disabled = asString(policy?.state)?.toLowerCase() === "disabled";
		const endpointsLookUsable =
			supportedEndpoints.length === 0 || hasCopilotUsableEndpoint(supportedEndpoints);
		const eligible =
			modelPickerEnabled &&
			endpointsLookUsable &&
			!isCopilotInternalId(id) &&
			!isCopilotEmbeddingId(id) &&
			!isCopilotSyntheticRouterId(id);

		parsed.push({
			id,
			name: asString(record.name),
			api: inferCopilotApi(record),
			reasoning,
			input: vision ? ["text", "image"] : ["text"],
			contextWindow: asNumber(limits?.max_context_window_tokens),
			maxTokens: asNumber(limits?.max_output_tokens) ?? asNumber(limits?.max_non_streaming_output_tokens),
			thinkingLevelMap: buildThinkingLevelMap(supportedReasoningEffort),
			disabled,
			eligible,
		});
	}
	return parsed;
}

function parseAnthropicRemoteModels(payload: unknown): RemoteModelInfo[] {
	if (!payload || typeof payload !== "object") return [];
	const data = (payload as Record<string, unknown>).data;
	if (!Array.isArray(data)) return [];

	const parsed: RemoteModelInfo[] = [];
	for (const item of data) {
		if (!item || typeof item !== "object") continue;
		const record = item as Record<string, unknown>;
		const id = asString(record.id) ?? asString(record.model) ?? asString(record.slug);
		if (!id) continue;

		const capabilities =
			record.capabilities && typeof record.capabilities === "object"
				? (record.capabilities as Record<string, unknown>)
				: undefined;
		const effort =
			capabilities?.effort && typeof capabilities.effort === "object"
				? (capabilities.effort as Record<string, unknown>)
				: undefined;
		const effortSupported = typeof effort?.supported === "boolean" ? effort.supported : undefined;

		parsed.push({
			id,
			name: asString(record.display_name) ?? asString(record.name),
			api: "anthropic-messages",
			reasoning: effortSupported,
			contextWindow: asNumber(record.max_input_tokens),
			maxTokens: asNumber(record.max_tokens),
		});
	}
	return parsed;
}

function parseGenericRemoteModels(payload: unknown): RemoteModelInfo[] {
	const ids = extractModelIds(payload);
	return ids.map((id) => ({ id }));
}

function parseRemoteModels(provider: string, payload: unknown): RemoteModelInfo[] {
	if (provider === "openai-codex") return parseOpenAICodexRemoteModels(payload);
	if (provider === "github-copilot") return parseGitHubCopilotRemoteModels(payload);
	if (provider === "anthropic") return parseAnthropicRemoteModels(payload);
	return parseGenericRemoteModels(payload);
}

function isCopilotInternalId(id: string): boolean {
	return id.startsWith("accounts/");
}

function isCopilotEmbeddingId(id: string): boolean {
	return id.toLowerCase().includes("embedding");
}

function isCopilotSyntheticRouterId(id: string): boolean {
	return id.startsWith("oswe-");
}

function hasCopilotUsableEndpoint(endpoints: string[]): boolean {
	return endpoints.some(
		(endpoint) =>
			endpoint.includes("/chat/completions") || endpoint.includes("/responses") || endpoint.includes("/v1/messages"),
	);
}

function buildProviderModelDefinitions(
	provider: string,
	existingModels: ModelLike[],
	remoteModels: RemoteModelInfo[],
): ProviderModelDef[] {
	if (existingModels.length === 0) return [];

	const template = existingModels[0];
	const existingById = new Map(existingModels.map((model) => [model.id, model]));
	const remoteById = new Map(remoteModels.map((model) => [model.id, model]));
	const activeRemote = remoteModels.filter((model) => !model.disabled);
	const effectiveRemote = activeRemote.length > 0 ? activeRemote : remoteModels;
	const effectiveById = new Map(effectiveRemote.map((model) => [model.id, model]));

	if (provider === "github-copilot") {
		// Keep existing known models unless explicitly disabled by remote policy,
		// and append newly discovered picker-enabled models.
		const orderedIds: string[] = [];
		const seen = new Set<string>();

		for (const existing of existingModels) {
			if (isCopilotInternalId(existing.id)) continue;
			const remote = remoteById.get(existing.id);
			if (remote?.disabled) continue;
			if (remote && remote.eligible === false) continue;
			if (!remote && (isCopilotEmbeddingId(existing.id) || isCopilotSyntheticRouterId(existing.id))) continue;
			if (!seen.has(existing.id)) {
				orderedIds.push(existing.id);
				seen.add(existing.id);
			}
		}

		for (const remote of effectiveRemote) {
			if (remote.disabled) continue;
			if (remote.eligible === false) continue;
			if (isCopilotInternalId(remote.id)) continue;
			if (!seen.has(remote.id)) {
				orderedIds.push(remote.id);
				seen.add(remote.id);
			}
		}

		return orderedIds.map((id) => {
			const existing = existingById.get(id);
			const remote = effectiveById.get(id);
			const api = remote?.api ?? existing?.api ?? template.api;
			const contextWindow = remote?.contextWindow ?? existing?.contextWindow ?? template.contextWindow ?? 128000;
			const maxTokens = remote?.maxTokens ?? existing?.maxTokens ?? template.maxTokens ?? Math.min(16384, contextWindow);
			const compat = compatWithoutReasoningEffortMap(existing?.compat) ?? defaultCopilotCompat(api);
			const thinkingLevelMap = getThinkingLevelMap(existing, remote);

			return {
				id,
				name: remote?.name ?? existing?.name ?? id,
				api,
				reasoning: remote?.reasoning ?? existing?.reasoning ?? template.reasoning ?? false,
				input: remote?.input ?? existing?.input ?? template.input ?? ["text"],
				cost: existing?.cost ?? template.cost ?? defaultCost(),
				contextWindow,
				maxTokens,
				headers: existing?.headers ?? template.headers,
				thinkingLevelMap,
				compat,
			};
		});
	}

	return effectiveRemote.map((remote) => {
		const existing = existingById.get(remote.id);
		const api = remote.api ?? existing?.api ?? template.api;
		const contextWindow = remote.contextWindow ?? existing?.contextWindow ?? template.contextWindow ?? 128000;
		const maxTokens = remote.maxTokens ?? existing?.maxTokens ?? template.maxTokens ?? Math.min(16384, contextWindow);
		const compat =
			compatWithoutReasoningEffortMap(existing?.compat) ??
			(provider === "github-copilot" ? defaultCopilotCompat(api) : undefined);
		const thinkingLevelMap = getThinkingLevelMap(existing, remote);

		return {
			id: remote.id,
			name: remote.name ?? existing?.name ?? remote.id,
			api,
			reasoning: remote.reasoning ?? existing?.reasoning ?? template.reasoning ?? false,
			input: remote.input ?? existing?.input ?? template.input ?? ["text"],
			cost: existing?.cost ?? template.cost ?? defaultCost(),
			contextWindow,
			maxTokens,
			headers: existing?.headers ?? template.headers,
			thinkingLevelMap,
			compat,
		};
	});
}

async function refreshProviderAvailability(
	ctx: any,
	provider: string,
): Promise<{
	provider: string;
	before: number;
	after: number;
	added: number;
	removed: number;
	addedIds: string[];
	removedIds: string[];
}> {
	const allModels = (ctx.modelRegistry.getAll() as ModelLike[]).filter((model) => model.provider === provider);
	if (allModels.length === 0) {
		throw new Error(`No models registered for provider \"${provider}\"`);
	}

	const apiKey = await ctx.modelRegistry.getApiKeyForProvider(provider);
	if (!apiKey) {
		throw new Error(`No active subscription token for \"${provider}\"`);
	}

	const modelWithHeaders = allModels.find((model) => model.headers && Object.keys(model.headers).length > 0);
	const payload = await fetchProviderCatalog({
		provider,
		baseUrl: allModels[0].baseUrl,
		apiKey,
		headers: modelWithHeaders?.headers,
	});
	const remoteModels = parseRemoteModels(provider, payload);
	if (remoteModels.length === 0) {
		throw new Error("Provider endpoint returned no model data");
	}

	const refreshedModels = buildProviderModelDefinitions(provider, allModels, remoteModels);
	if (refreshedModels.length === 0) {
		throw new Error("Could not build refreshed model definitions");
	}

	const oauthProvider = getOAuthProvider(provider);
	if (!oauthProvider) {
		throw new Error(`Provider \"${provider}\" is not an OAuth subscription provider`);
	}

	ctx.modelRegistry.registerProvider(provider, {
		baseUrl: allModels[0].baseUrl,
		oauth: {
			name: oauthProvider.name,
			login: oauthProvider.login,
			refreshToken: oauthProvider.refreshToken,
			getApiKey: oauthProvider.getApiKey,
			usesCallbackServer: oauthProvider.usesCallbackServer,
			modifyModels: oauthProvider.modifyModels,
		},
		models: refreshedModels,
	});

	const beforeIds = new Set(allModels.map((model) => model.id));
	const afterIds = new Set(refreshedModels.map((model) => model.id));
	const addedIds = [...afterIds].filter((id) => !beforeIds.has(id)).sort();
	const removedIds = [...beforeIds].filter((id) => !afterIds.has(id)).sort();

	return {
		provider,
		before: beforeIds.size,
		after: afterIds.size,
		added: addedIds.length,
		removed: removedIds.length,
		addedIds,
		removedIds,
	};
}

function resolveProvider(requestedProvider: string, knownProviders: string[]): string | undefined {
	const exact = knownProviders.find((provider) => provider === requestedProvider);
	if (exact) return exact;
	const ci = knownProviders.find((provider) => provider.toLowerCase() === requestedProvider.toLowerCase());
	return ci;
}

function isRefreshSupportedProvider(provider: string): boolean {
	return SUPPORTED_SUBSCRIPTION_PROVIDERS.has(provider);
}

function formatModelIdList(ids: string[], maxItems = 12): string {
	if (ids.length <= maxItems) return ids.join(", ");
	const shown = ids.slice(0, maxItems);
	return `${shown.join(", ")} ... (+${ids.length - maxItems} more)`;
}

export default function registerRefreshModelsCommand(pi: ExtensionAPI) {
	pi.registerCommand("refresh-models", {
		description: "Refresh available subscription models for one provider or all current subscriptions",
		handler: async (args, ctx) => {
			const notify = (message: string, level: "info" | "warning" | "error" = "info") => {
				ctx.ui.notify(message, level);
			};

			let parsed: RefreshScope;
			try {
				parsed = parseRefreshModelsArgs(args);
			} catch (error) {
				notify(error instanceof Error ? error.message : String(error), "error");
				return;
			}

			const activeSubscriptions = getCurrentSubscriptionProviders(ctx.modelRegistry);
			if (activeSubscriptions.length === 0) {
				notify("No active subscription providers found in auth.json", "warning");
				return;
			}

			const requestedProviders = parsed.provider
				? (() => {
					const resolved = resolveProvider(parsed.provider!, activeSubscriptions);
					return resolved ? [resolved] : [];
				  })()
				: activeSubscriptions;

			if (parsed.provider && requestedProviders.length === 0) {
				notify(
					`Provider \"${parsed.provider}\" is not an active subscription. Active: ${activeSubscriptions.join(", ")}`,
					"error",
				);
				return;
			}

			const providers = requestedProviders.filter(isRefreshSupportedProvider);
			const skipped = requestedProviders.filter((provider) => !isRefreshSupportedProvider(provider));

			if (parsed.provider && providers.length === 0) {
				notify(
					`Provider \"${requestedProviders[0]}\" is active but not yet supported by /refresh-models. Supported: ${[
						...SUPPORTED_SUBSCRIPTION_PROVIDERS,
					].join(", ")}`,
					"error",
				);
				return;
			}

			if (skipped.length > 0) {
				notify(
					`Skipping unsupported providers: ${skipped.join(", ")} (supported: ${[
						...SUPPORTED_SUBSCRIPTION_PROVIDERS,
					].join(", ")})`,
					"warning",
				);
			}

			if (providers.length === 0) {
				notify("No supported subscription providers to refresh.", "warning");
				return;
			}

			notify(`Refreshing model availability for ${providers.join(", ")}...`, "info");
			const outcomes: Array<
				| {
						provider: string;
						ok: true;
						message: string;
						addedIds: string[];
						removedIds: string[];
				  }
				| {
						provider: string;
						ok: false;
						message: string;
				  }
			> = [];

			for (const provider of providers) {
				try {
					const result = await refreshProviderAvailability(ctx, provider);
					outcomes.push({
						provider,
						ok: true,
						message: `${provider}: ${result.before} -> ${result.after} models (added ${result.added}, removed ${result.removed})`,
						addedIds: result.addedIds,
						removedIds: result.removedIds,
					});
				} catch (error) {
					outcomes.push({
						provider,
						ok: false,
						message: `${provider}: ${error instanceof Error ? error.message : String(error)}`,
					});
				}
			}

			const successes = outcomes.filter((outcome): outcome is Extract<(typeof outcomes)[number], { ok: true }> => outcome.ok);
			const failures = outcomes.filter((outcome): outcome is Extract<(typeof outcomes)[number], { ok: false }> => !outcome.ok);

			for (const success of successes) {
				notify(success.message, "info");
				if (success.addedIds.length > 0) {
					notify(`${success.provider} added: ${formatModelIdList(success.addedIds)}`, "info");
				}
				if (success.removedIds.length > 0) {
					notify(`${success.provider} removed: ${formatModelIdList(success.removedIds)}`, "info");
				}
			}
			for (const failure of failures) notify(failure.message, "error");

			if (failures.length === 0) {
				notify(`Done. Refreshed ${successes.length} subscription provider(s).`, "info");
			} else {
				notify(
					`Refresh completed with errors (${successes.length} succeeded, ${failures.length} failed).`,
					"warning",
				);
			}
		},
	});
}
