import type { Model } from "@mariozechner/pi-ai";

export interface ModelLike {
	provider: string;
	id: string;
	name?: string;
}

export type ModelSize = "small" | "medium" | "large";
export type ModelPolicy = "same-provider" | "same-family";

const MINI_HINT_RE = /(mini|small|haiku)/i;
const FAST_HINT_RE = /(fast|turbo|flash|lite)/i;
const LARGE_HINT_RE = /(opus|large|xl|thinking|reasoning)/i;
const VERSION_RE = /(\d+(?:[.-]\d+)*)/;

function isProvider(model: ModelLike, provider: string) {
	return model.provider === provider;
}

function getDisplayName(model: ModelLike) {
	return model.name || model.id;
}

function normalize(value: string | undefined) {
	return (value || "").toLowerCase();
}

function parseProviderModelString(raw: string): ModelLike | undefined {
	const slash = raw.indexOf("/");
	if (slash <= 0 || slash === raw.length - 1) return undefined;
	return { provider: raw.slice(0, slash), id: raw.slice(slash + 1) };
}

function extractSeriesVersion(text: string) {
	const match = text.match(VERSION_RE);
	return match?.[1] || "";
}

function inferSeriesKey(model: ModelLike): string {
	const id = normalize(model.id);
	const name = normalize(model.name);
	const text = `${id} ${name}`;

	if (/(^|\b)gpt-5(?:[.-]\d+)?/.test(text)) {
		const match = text.match(/gpt-5(?:[.-]\d+)?/);
		return match?.[0] || "gpt-5";
	}
	if (/(^|\b)gpt-4\.1/.test(text)) return "gpt-4.1";
	if (/(^|\b)gpt-4o/.test(text)) return "gpt-4o";
	if (text.includes("claude")) {
		const version = extractSeriesVersion(text);
		return version ? `claude-${version}` : "claude";
	}
	if (/(^|\b)o[134]/.test(text)) {
		const match = text.match(/o[134](?:[.-]\d+)?/);
		return match?.[0] || "o-series";
	}
	if (text.includes("gemini")) {
		const match = text.match(/gemini(?:-[\w.]+)?/);
		return match?.[0] || "gemini";
	}
	return model.provider;
}

function isMiniModel(model: ModelLike) {
	const text = `${model.id} ${model.name || ""}`;
	return MINI_HINT_RE.test(text);
}

function scoreModelForSize(model: ModelLike, size: ModelSize, current?: ModelLike): number {
	const id = normalize(model.id);
	const name = normalize(model.name);
	const text = `${id} ${name}`;
	const currentSeries = current ? inferSeriesKey(current) : "";
	const modelSeries = inferSeriesKey(model);

	let score = 0;
	if (current && model.provider === current.provider) score += 80;
	if (currentSeries && modelSeries === currentSeries) score += 50;
	if (current && model.id === current.id && model.provider === current.provider) score += 25;

	if (text.includes("gpt-5.4")) score += 8;
	if (text.includes("claude")) score += 6;

	if (size === "small") {
		if (MINI_HINT_RE.test(text)) score += 120;
		if (FAST_HINT_RE.test(text)) score += 20;
		if (LARGE_HINT_RE.test(text) || /opus|o[134]/.test(text)) score -= 60;
		if (!MINI_HINT_RE.test(text) && !FAST_HINT_RE.test(text)) score -= 15;
	} else if (size === "medium") {
		if (FAST_HINT_RE.test(text)) score += 90;
		if (/sonnet|codex/.test(text)) score += 85;
		if (!MINI_HINT_RE.test(text) && !LARGE_HINT_RE.test(text) && !/opus|o[134]/.test(text)) score += 55;
		if (MINI_HINT_RE.test(text)) score -= 35;
		if (/opus|o[134]/.test(text)) score -= 25;
	} else {
		if (/opus|o[134]/.test(text)) score += 130;
		if (LARGE_HINT_RE.test(text)) score += 100;
		if (text.includes("gpt-5.4") && !MINI_HINT_RE.test(text) && !FAST_HINT_RE.test(text)) score += 95;
		if (/sonnet/.test(text)) score += 35;
		if (MINI_HINT_RE.test(text) || FAST_HINT_RE.test(text)) score -= 50;
	}

	return score;
}

function compareScoredModels<T extends ModelLike>(a: { model: T; score: number }, b: { model: T; score: number }) {
	if (b.score !== a.score) return b.score - a.score;
	return getDisplayName(a.model).localeCompare(getDisplayName(b.model));
}

function pickBestModel<T extends ModelLike>(models: readonly T[], size: ModelSize, current?: ModelLike): T | undefined {
	if (models.length === 0) return undefined;
	return models
		.map((model) => ({ model, score: scoreModelForSize(model, size, current) }))
		.sort(compareScoredModels)[0]?.model;
}

function findExact(models: readonly ModelLike[], provider: string, id: string) {
	return models.find((model) => model.provider === provider && model.id === id);
}

function findFirstMini(models: readonly ModelLike[], provider: string) {
	return models.find((model) => isProvider(model, provider) && isMiniModel(model));
}

export function resolveCommitPlanningModel<T extends ModelLike>(
	availableModels: readonly T[],
	currentModel?: ModelLike,
): T | undefined {
	return (
		(currentModel ? resolveDynamicModel(availableModels, currentModel, "small", "same-family") : undefined) ??
		findExact(availableModels, "openai-codex", "gpt-5.4-mini") ??
		findExact(availableModels, "github-copilot", "gpt-5.4-mini") ??
		findFirstMini(availableModels, "openai-codex") ??
		findFirstMini(availableModels, "github-copilot") ??
		pickBestModel(availableModels, "small", currentModel)
	);
}

export async function resolveCommitPlanningModelFromRegistry(
	modelRegistry: { getAvailable(): Model<any>[] },
	ctx?: any,
): Promise<Model<any> | undefined> {
	const available = modelRegistry.getAvailable();
	return resolveCommitPlanningModel(available, ctx ? getCurrentModelHint(ctx, available) : undefined);
}

export function getCurrentModelHint(ctx: any, availableModels: readonly ModelLike[]): ModelLike | undefined {
	const directCandidates = [ctx?.model, ctx?.currentModel, ctx?.selectedModel, ctx?.session?.model, ctx?.state?.model];
	for (const candidate of directCandidates) {
		if (candidate && typeof candidate === "object" && typeof candidate.provider === "string" && typeof candidate.id === "string") {
			return candidate as ModelLike;
		}
		if (typeof candidate === "string") {
			const parsed = parseProviderModelString(candidate);
			if (parsed) return parsed;
		}
	}

	const settingsProvider = ctx?.settings?.defaultProvider;
	const settingsModel = ctx?.settings?.defaultModel;
	if (typeof settingsProvider === "string" && typeof settingsModel === "string") {
		return { provider: settingsProvider, id: settingsModel };
	}

	if (availableModels.length === 1) return availableModels[0];
	return undefined;
}

export function resolveDynamicModel<T extends ModelLike>(
	availableModels: readonly T[],
	currentModel: ModelLike | undefined,
	size: ModelSize,
	policy: ModelPolicy = "same-provider",
): T | undefined {
	if (availableModels.length === 0) return undefined;
	if (!currentModel) return pickBestModel(availableModels, size);

	const sameProvider = availableModels.filter((model) => model.provider === currentModel.provider);
	const sameFamily = sameProvider.filter((model) => inferSeriesKey(model) === inferSeriesKey(currentModel));

	if (policy === "same-family") {
		return pickBestModel(sameFamily, size, currentModel) ?? pickBestModel(sameProvider, size, currentModel) ?? pickBestModel(availableModels, size, currentModel);
	}

	return pickBestModel(sameProvider, size, currentModel) ?? pickBestModel(availableModels, size, currentModel);
}

export function resolveDynamicModelFromRegistry(
	modelRegistry: { getAvailable(): Model<any>[] },
	ctx: any,
	size: ModelSize,
	policy: ModelPolicy = "same-provider",
): Model<any> | undefined {
	const available = modelRegistry.getAvailable();
	const current = getCurrentModelHint(ctx, available);
	return resolveDynamicModel(available, current, size, policy);
}

export function resolveModelTierLabel(model: ModelLike | undefined, size: ModelSize) {
	return model ? getDisplayName(model) : size === "small" ? "Small model" : size === "medium" ? "Medium model" : "Large model";
}
