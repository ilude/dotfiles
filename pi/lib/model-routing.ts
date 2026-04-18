import type { Model } from "@mariozechner/pi-ai";

export interface ModelLike {
	provider: string;
	id: string;
	name?: string;
}

const MINI_HINT_RE = /(mini|small)/i;

function isProvider(model: ModelLike, provider: string) {
	return model.provider === provider;
}

function isMiniModel(model: ModelLike) {
	return MINI_HINT_RE.test(model.id) || (model.name ? MINI_HINT_RE.test(model.name) : false);
}

function findExact(models: readonly ModelLike[], provider: string, id: string) {
	return models.find((model) => model.provider === provider && model.id === id);
}

function findFirstMini(models: readonly ModelLike[], provider: string) {
	return models.find((model) => isProvider(model, provider) && isMiniModel(model));
}

/**
 * Prefer gpt-5.4-mini on openai-codex, then any mini OpenAI model, then any mini GitHub model.
 * Returns undefined when no acceptable mini model is available.
 */
export function resolveCommitPlanningModel<T extends ModelLike>(
	availableModels: readonly T[],
): T | undefined {
	return (
		findExact(availableModels, "openai-codex", "gpt-5.4-mini") ??
		findExact(availableModels, "github-copilot", "gpt-5.4-mini") ??
		findFirstMini(availableModels, "openai-codex") ??
		findFirstMini(availableModels, "github-copilot")
	);
}

export async function resolveCommitPlanningModelFromRegistry(
	modelRegistry: { getAvailable(): Model<any>[] },
): Promise<Model<any> | undefined> {
	return resolveCommitPlanningModel(modelRegistry.getAvailable());
}
