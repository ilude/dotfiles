import { compatWithoutReasoningEffortMap, getThinkingLevelMap, toModelDefinition } from "./compat.ts";
import type { ModelLike, ProviderModelDef, RemoteModelInfo } from "./types.ts";
const DEFAULT_REFRESH_CONTEXT_WINDOW = 256_000;

function defaultCost() {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}

function toProviderModelDefinition(model: ModelLike): ProviderModelDef {
	return toModelDefinition(model) as ProviderModelDef;
}

export function buildProviderModelDefinitions(
	_provider: string,
	existingModels: ModelLike[],
	remoteModels: RemoteModelInfo[],
): ProviderModelDef[] {
	if (existingModels.length === 0) return [];

	const template = existingModels[0];
	const existingById = new Map(
		existingModels.map((model) => [model.id, model]),
	);
	const effectiveRemote = remoteModels;

	return effectiveRemote.map((remote) => {
		const existing = existingById.get(remote.id);
		const api = remote.api ?? existing?.api ?? template.api;
		const contextWindow =
			remote.contextWindow ??
			existing?.contextWindow ??
			DEFAULT_REFRESH_CONTEXT_WINDOW;
		const maxTokens =
			remote.maxTokens ??
			existing?.maxTokens ??
			template.maxTokens ??
			Math.min(16384, contextWindow);
		const compat = compatWithoutReasoningEffortMap(
			existing?.compat,
		) as ProviderModelDef["compat"];
		const thinkingLevelMap = remote.thinkingLevelMap ?? getThinkingLevelMap(existing);

		return {
			id: remote.id,
			name: remote.name ?? existing?.name ?? remote.id,
			api,
			reasoning:
				remote.reasoning ?? existing?.reasoning ?? template.reasoning ?? false,
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

export function buildCachedProviderModelDefinitions(
	provider: string,
	existingModels: ModelLike[],
	remoteModels: RemoteModelInfo[],
	applyKnownContextWindows: boolean,
): ProviderModelDef[] {
	const existingIds = new Set(existingModels.map((model) => model.id));
	const remoteById = new Map(remoteModels.map((model) => [model.id, model]));
	const knownModels = existingModels.map((model) => {
		const definition = toProviderModelDefinition(model);
		const remoteContextWindow = remoteById.get(model.id)?.contextWindow;
		return applyKnownContextWindows && remoteContextWindow !== undefined
			? { ...definition, contextWindow: remoteContextWindow }
			: definition;
	});
	const discoveredModels = buildProviderModelDefinitions(
		provider,
		existingModels,
		remoteModels,
	).filter((model) => !existingIds.has(model.id));
	return [...knownModels, ...discoveredModels];
}

