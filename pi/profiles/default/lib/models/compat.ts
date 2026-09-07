import type { ModelLike, ThinkingLevelMap } from "./types.ts";

type ThinkingModel = { thinkingLevelMap?: ThinkingLevelMap; compat?: unknown };

export function compatWithoutReasoningEffortMap(compat: unknown): unknown {
	if (!compat || typeof compat !== "object" || Array.isArray(compat)) return compat;
	const { reasoningEffortMap: _legacy, ...rest } = compat as Record<string, unknown>;
	return Object.keys(rest).length > 0 ? rest : undefined;
}

export function getThinkingLevelMap(model?: ThinkingModel): ThinkingLevelMap | undefined {
	const compat = model?.compat as { reasoningEffortMap?: unknown } | undefined;
	const legacy = compat?.reasoningEffortMap;
	return model?.thinkingLevelMap ?? (legacy && typeof legacy === "object" && !Array.isArray(legacy)
		? legacy as ThinkingLevelMap : undefined);
}

type DefinitionSource = Omit<ModelLike, "provider" | "baseUrl">;

/** Only model-definition fields, never provider credentials or base URLs. */
export function toModelDefinition(model: DefinitionSource) {
	return {
		id: model.id, name: model.name, api: model.api, reasoning: model.reasoning,
		input: model.input, cost: model.cost, contextWindow: model.contextWindow,
		maxTokens: model.maxTokens, headers: model.headers,
		thinkingLevelMap: model.thinkingLevelMap,
		compat: compatWithoutReasoningEffortMap(model.compat),
	};
}
