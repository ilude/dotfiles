import { fetchProviderCatalog, parseRemoteModels } from "../lib/models/catalog.ts";
import { loadProviderCache, writeProviderCache } from "../lib/models/cache.ts";
import { buildProviderModelDefinitions, buildCachedProviderModelDefinitions } from "../lib/models/reconcile.ts";
import type { ModelLike, ProviderModelDef } from "../lib/models/types.ts";
import { registerSlashCommand } from "../lib/slash-command-echo.js";
import {
	getConfiguredBedrockModelIds,
	shouldHideModel,
} from "./model-visibility.ts";

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
import { getModels } from "@earendil-works/pi-ai/compat";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	getSettingsPath,
	updateJsonObjectAtomic,
} from "../lib/settings-file.ts";

const SUPPORTED_REFRESH_PROVIDERS = new Set([
	"amazon-bedrock",
	"bedrock-mantle",
	"anthropic",
	"openai-codex",
	"openrouter",
	"opencode",
	"opencode-go",
]);

type RefreshScope = {
	provider?: string;
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

type ModelRegistryWithAuthStatus = {
	getAll(): Array<{ provider: string }>;
	getProviderAuthStatus(provider: string): { configured: boolean };
};

type LegacyModelRegistryWithAuth = {
	authStorage: {
		list(): string[];
		get(provider: string): { type?: string } | undefined;
	};
};

export function getCurrentRefreshableProviders(
	modelRegistry: ModelRegistryWithAuthStatus | LegacyModelRegistryWithAuth,
): string[] {
	if ("authStorage" in modelRegistry) {
		return modelRegistry.authStorage.list().filter((provider) => {
			const type = modelRegistry.authStorage.get(provider)?.type;
			return type === "oauth" || type === "api_key";
		});
	}
	const providers = new Set(
		modelRegistry.getAll().map((model) => model.provider),
	);
	return [...providers]
		.filter(
			(provider) => modelRegistry.getProviderAuthStatus(provider).configured,
		)
		.sort();
}

export const getCurrentSubscriptionProviders = getCurrentRefreshableProviders;

async function refreshProviderAvailability(
	ctx: Pick<ExtensionContext, "modelRegistry">,
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
	const allModels = (ctx.modelRegistry.getAll() as ModelLike[]).filter(
		(model) => model.provider === provider,
	);
	if (allModels.length === 0) {
		throw new Error(`No models registered for provider "${provider}"`);
	}

	const apiKey = await ctx.modelRegistry.getApiKeyForProvider(provider);
	if (!apiKey) {
		throw new Error(`No active subscription token for "${provider}"`);
	}

	const modelWithHeaders = allModels.find(
		(model) => model.headers && Object.keys(model.headers).length > 0,
	);
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

	const refreshedModels = buildProviderModelDefinitions(
		provider,
		allModels,
		remoteModels,
	);
	if (refreshedModels.length === 0) {
		throw new Error("Could not build refreshed model definitions");
	}

	// Pi composes this model overlay with the built-in provider authentication.
	ctx.modelRegistry.registerProvider(provider, {
		baseUrl: allModels[0].baseUrl,
		api: allModels[0].api,
		models: refreshedModels,
	});
	await writeProviderCache(provider, remoteModels);

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

function resolveProvider(
	requestedProvider: string,
	knownProviders: string[],
): string | undefined {
	const exact = knownProviders.find(
		(provider) => provider === requestedProvider,
	);
	if (exact) return exact;
	const ci = knownProviders.find(
		(provider) => provider.toLowerCase() === requestedProvider.toLowerCase(),
	);
	return ci;
}

function isRefreshSupportedProvider(provider: string): boolean {
	return SUPPORTED_REFRESH_PROVIDERS.has(provider);
}

function formatModelIdList(ids: string[], maxItems = 12): string {
	if (ids.length <= maxItems) return ids.join(", ");
	const shown = ids.slice(0, maxItems);
	return `${shown.join(", ")} ... (+${ids.length - maxItems} more)`;
}

const CURATED_PROVIDER_ORDER = [
	"openrouter",
	"opencode",
	"opencode-go",
] as const;

export async function syncCuratedModelScope(
	ctx: ExtensionContext,
	bedrockModelIds: readonly string[],
): Promise<{ scope: string[]; changed: boolean }> {
	const available = ctx.modelRegistry.getAll() as ModelLike[];
	const configured = new Set(getCurrentRefreshableProviders(ctx.modelRegistry));
	let scope: string[] = [];
	let changed = false;
	await updateJsonObjectAtomic(getSettingsPath(), (settings) => {
		const existing = Array.isArray(settings.enabledModels)
			? settings.enabledModels.filter(
					(value): value is string => typeof value === "string",
				)
			: [];
		const existingCodex = existing.filter((id) =>
			id.startsWith("openai-codex/"),
		);
		const availableCodex = available
			.filter(
				(model) =>
					model.provider === "openai-codex" &&
					!shouldHideModel("openai-codex", model),
			)
			.map((model) => `openai-codex/${model.id}`);
		const codex = configured.has("openai-codex")
			? availableCodex
			: existingCodex;
		const bedrock =
			configured.has("amazon-bedrock") || configured.has("bedrock-mantle")
				? bedrockModelIds.map((id) => {
						const logicalId = id
							.replace(/^us[.]/, "")
							.replace(/-\d{8}-v\d+:\d+$/, "");
						return `bedrock-mantle/${logicalId}`;
					})
				: [];
		const orderedProviders = [
			...CURATED_PROVIDER_ORDER.filter((provider) => configured.has(provider)),
			...[...new Set(available.map((model) => model.provider))]
				.filter(
					(provider) =>
						configured.has(provider) &&
						provider !== "openai-codex" &&
						provider !== "amazon-bedrock" &&
						provider !== "bedrock-mantle" &&
						!CURATED_PROVIDER_ORDER.includes(
							provider as (typeof CURATED_PROVIDER_ORDER)[number],
						),
				)
				.sort(),
		];
		const remaining = orderedProviders.flatMap((provider) =>
			available
				.filter(
					(model) =>
						model.provider === provider && !shouldHideModel(provider, model),
				)
				.sort((left, right) => left.id.localeCompare(right.id))
				.map((model) => `${provider}/${model.id}`),
		);
		scope = [...new Set([...codex, ...bedrock, ...remaining])];
		if (JSON.stringify(existing) === JSON.stringify(scope)) return settings;
		changed = true;
		return { ...settings, enabledModels: scope };
	});
	return { scope, changed };
}

export function formatRefreshFailure(provider: string, error: unknown): string {
	const detail = error instanceof Error ? error.message : String(error);
	if (
		/HTTP 401|authentication_error|invalid x-api-key|invalid api key/i.test(
			detail,
		)
	) {
		return `${provider}: authentication failed (token may be expired or invalid); re-authenticate this provider and retry. Details: ${detail}`;
	}
	return `${provider}: ${detail}`;
}

function registerCachedProvider(
	pi: ExtensionAPI,
	provider: "openai-codex" | "openrouter" | "opencode" | "opencode-go",
): void {
	const cache = loadProviderCache(provider);
	if (!cache) return;
	const builtInModels = getModels(provider) as ModelLike[];
	if (builtInModels.length === 0) return;
	const models = buildCachedProviderModelDefinitions(
		provider,
		builtInModels,
		cache.models,
		cache.fetchedAt !== "legacy",
	);
	pi.registerProvider(provider, {
		baseUrl: builtInModels[0].baseUrl,
		api: builtInModels[0].api as ProviderModelDef["api"],
		models,
	});
}

export default function registerRefreshModelsCommand(pi: ExtensionAPI) {
	for (const provider of [
		"openai-codex",
		"openrouter",
		"opencode",
		"opencode-go",
	] as const) {
		registerCachedProvider(pi, provider);
	}

	registerSlashCommand(pi)("refresh-models", {
		description:
			"Refresh available models for one configured provider or all configured providers",
		handler: async (args, ctx) => {
			const notify = (
				message: string,
				level: "info" | "warning" | "error" = "info",
			) => {
				ctx.ui.notify(message, level);
			};

			let parsed: RefreshScope;
			try {
				parsed = parseRefreshModelsArgs(args);
			} catch (error) {
				notify(error instanceof Error ? error.message : String(error), "error");
				return;
			}

			const configuredProviders = getCurrentRefreshableProviders(
				ctx.modelRegistry,
			);
			if (configuredProviders.length === 0) {
				notify(
					"No configured OAuth or API-key providers found in auth.json",
					"warning",
				);
				return;
			}

			const requestedProvider = parsed.provider;
			const requestedProviders = requestedProvider
				? (() => {
						const resolved = resolveProvider(
							requestedProvider,
							configuredProviders,
						);
						return resolved ? [resolved] : [];
					})()
				: configuredProviders;

			if (parsed.provider && requestedProviders.length === 0) {
				const message = `Provider "${parsed.provider}" is not configured. Configured: ${configuredProviders.join(", ")}`;
				notify(message, "error");
				return;
			}

			const providers = [
				...new Set(
					requestedProviders
						.filter(isRefreshSupportedProvider)
						.map((provider) =>
							provider === "amazon-bedrock" ? "bedrock-mantle" : provider,
						),
				),
			];
			const skipped = requestedProviders.filter(
				(provider) => !isRefreshSupportedProvider(provider),
			);

			if (parsed.provider && providers.length === 0) {
				const message = `Provider "${requestedProviders[0]}" is configured but not yet supported by /refresh-models. Supported: ${[
					...SUPPORTED_REFRESH_PROVIDERS,
				].join(", ")}`;
				notify(message, "error");
				return;
			}

			if (skipped.length > 0) {
				notify(
					`Skipping unsupported providers: ${skipped.join(", ")} (supported: ${[
						...SUPPORTED_REFRESH_PROVIDERS,
					].join(", ")})`,
					"warning",
				);
			}

			if (providers.length === 0) {
				notify("No supported configured providers to refresh.", "warning");
				return;
			}

			notify(
				`Refreshing model availability for ${providers.join(", ")}...`,
				"info",
			);
			let refreshedBedrockIds = [...getConfiguredBedrockModelIds()];
			const outcomes: Array<
				| {
						provider: string;
						ok: true;
						message: string;
						addedIds: string[];
						removedIds: string[];
						details?: string[];
						changed?: boolean;
				  }
				| {
						provider: string;
						ok: false;
						message: string;
				  }
			> = [];

			for (const provider of providers) {
				try {
					if (provider === "bedrock-mantle") {
						const beforeIds = new Set(
							(ctx.modelRegistry.getAll() as ModelLike[])
								.filter((model) => model.provider === provider)
								.map((model) => model.id),
						);
						const refresh = await ctx.modelRegistry.refresh({
							providers: [provider],
							allowNetwork: true,
							force: true,
						});
						if (refresh.errors.size > 0) throw [...refresh.errors.values()][0];
						refreshedBedrockIds = (ctx.modelRegistry.getAll() as ModelLike[])
							.filter((model) => model.provider === provider)
							.map((model) => model.id);
						const afterIds = new Set(refreshedBedrockIds);
						const addedIds = [...afterIds].filter((id) => !beforeIds.has(id)).sort();
						const removedIds = [...beforeIds].filter((id) => !afterIds.has(id)).sort();
						outcomes.push({
							provider,
							ok: true,
							message: `${provider}: ${beforeIds.size} -> ${afterIds.size} models (added ${addedIds.length}, removed ${removedIds.length})`,
							addedIds,
							removedIds,
						});
						continue;
					}
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
						message: formatRefreshFailure(provider, error),
					});
				}
			}

			const successes = outcomes.filter(
				(
					outcome,
				): outcome is Extract<(typeof outcomes)[number], { ok: true }> =>
					outcome.ok,
			);
			const failures = outcomes.filter(
				(
					outcome,
				): outcome is Extract<(typeof outcomes)[number], { ok: false }> =>
					!outcome.ok,
			);

			let changedModelState = false;
			for (const success of successes) {
				notify(success.message, "info");
				if (
					success.changed ||
					success.addedIds.length > 0 ||
					success.removedIds.length > 0
				) {
					changedModelState = true;
				}
				if (success.details && success.details.length > 0) {
					notify(
						`${success.provider} selection/routing: ${formatModelIdList(success.details)}`,
						"info",
					);
				}
				if (success.addedIds.length > 0) {
					notify(
						`${success.provider} added: ${formatModelIdList(success.addedIds)}`,
						"info",
					);
				}
				if (success.removedIds.length > 0) {
					notify(
						`${success.provider} removed: ${formatModelIdList(success.removedIds)}`,
						"info",
					);
				}
			}
			for (const failure of failures) notify(failure.message, "warning");

			const scopeUpdate = await syncCuratedModelScope(
				ctx,
				refreshedBedrockIds,
			);
			if (scopeUpdate.changed) {
				changedModelState = true;
				notify(
					`Curated model scope updated: ${scopeUpdate.scope.length} models ordered Codex, Bedrock, OpenRouter, then other providers.`,
					"info",
				);
			}

			if (failures.length === 0) {
				notify(`Done. Refreshed ${successes.length} provider(s).`, "info");
			} else {
				notify(
					`Refresh completed with errors (${successes.length} succeeded, ${failures.length} failed).`,
					"warning",
				);
			}

			if (changedModelState) {
				notify(
					"Model catalog changed; reloading Pi resources so /models can see updates.",
					"info",
				);
				if (typeof ctx.reload === "function") await ctx.reload();
			}
		},
	});
}
