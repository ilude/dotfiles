import { createHash } from "node:crypto";
import type { Api, Model } from "@earendil-works/pi-ai";

export interface ModelLike {
	provider: string;
	id: string;
	name?: string;
	reasoning?: boolean;
	thinkingLevelMap?: Partial<Record<string, string | null>>;
	contextWindow?: number;
	maxTokens?: number;
	cost?: {
		input: number;
		output: number;
		cacheRead?: number;
		cacheWrite?: number;
	};
}

export type ModelSize =
	| "nano"
	| "mini"
	| "core"
	| "large"
	| "max"
	| "small"
	| "medium";
export type ModelPolicy = "same-provider" | "same-family";

export const ROUTING_OUTCOME_EXPERIMENT_ID = "codex-routing-outcomes-v1";
export const ROUTING_OUTCOME_SAMPLE_RATE = 0.1;
export const ROUTING_OUTCOME_SAMPLE_RATE_ENV = "PI_ROUTING_OUTCOME_SAMPLE_RATE";

export interface RoutingOutcomeArm {
	id: "terra-baseline" | "luna-high" | "sol-low";
	provider: "openai-codex";
	modelId: "gpt-5.6-terra" | "gpt-5.6-luna" | "gpt-5.6-sol";
	effort: "medium" | "high" | "low";
}

export const ROUTING_OUTCOME_ARMS: readonly RoutingOutcomeArm[] = [
	{
		id: "terra-baseline",
		provider: "openai-codex",
		modelId: "gpt-5.6-terra",
		effort: "medium",
	},
	{
		id: "luna-high",
		provider: "openai-codex",
		modelId: "gpt-5.6-luna",
		effort: "high",
	},
	{
		id: "sol-low",
		provider: "openai-codex",
		modelId: "gpt-5.6-sol",
		effort: "low",
	},
];

export interface RoutingOutcomeAssignment extends RoutingOutcomeArm {
	experimentId: typeof ROUTING_OUTCOME_EXPERIMENT_ID;
	taskClass: string;
}

export interface SampledModelResolution<T extends ModelLike> {
	model: T | undefined;
	experiment?: RoutingOutcomeAssignment;
}

export function configuredRoutingOutcomeSampleRate(
	value = process.env[ROUTING_OUTCOME_SAMPLE_RATE_ENV],
): number {
	if (value === undefined || value.trim() === "")
		return ROUTING_OUTCOME_SAMPLE_RATE;
	const rate = Number(value);
	if (!Number.isFinite(rate) || rate < 0 || rate > 1)
		throw new Error(
			`${ROUTING_OUTCOME_SAMPLE_RATE_ENV} must be a number from 0 through 1`,
		);
	return rate;
}

function routingOutcomeBuckets(sampleKey: string): [number, number] {
	const digest = createHash("sha256")
		.update(`${ROUTING_OUTCOME_EXPERIMENT_ID}:${sampleKey}`)
		.digest();
	return [digest.readUInt32BE(0) / 0x1_0000_0000, digest.readUInt32BE(4)];
}

export function assignRoutingOutcomeExperiment(
	sampleKey: string,
	taskClass: string,
	rate = configuredRoutingOutcomeSampleRate(),
): RoutingOutcomeAssignment | undefined {
	if (rate <= 0) return undefined;
	const [sampleBucket, armBucket] = routingOutcomeBuckets(sampleKey);
	if (sampleBucket >= rate) return undefined;
	const arm = ROUTING_OUTCOME_ARMS[armBucket % ROUTING_OUTCOME_ARMS.length];
	return {
		...arm,
		experimentId: ROUTING_OUTCOME_EXPERIMENT_ID,
		taskClass,
	};
}

type AnyModel = Model<Api>;

function asRecord(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === "object"
		? (value as Record<string, unknown>)
		: {};
}

const NANO_HINT_RE = /(nano)/i;
const MINI_HINT_RE = /(mini|small|haiku)/i;
const FAST_HINT_RE = /(fast|turbo|flash|lite)/i;
const LARGE_HINT_RE = /(opus|large|xl|thinking|reasoning)/i;
const VERSION_RE = /(\d+(?:[.-]\d+)*)/;
export const MODEL_ROUTING_POLICY = {
	preferredCodexIds: {
		nano: ["gpt-5.6-luna", "gpt-5.4-nano", "gpt-5.4-mini"],
		mini: ["gpt-5.6-luna", "gpt-5.4-mini"],
		core: ["gpt-5.6-terra", "gpt-5.5", "gpt-5.3-codex"],
		large: ["gpt-5.6-sol", "gpt-5.5", "gpt-5.3-codex"],
		max: ["gpt-5.6-sol", "gpt-5.5", "gpt-5.3-codex"],
		small: ["gpt-5.6-luna", "gpt-5.4-mini"],
		medium: ["gpt-5.6-terra", "gpt-5.5", "gpt-5.3-codex"],
	},
	explicitChoices: {
		fable: "amazon-bedrock/us.anthropic.claude-fable-5",
		foreman: "openai-codex/gpt-5.6-sol",
	},
	premiumCodex: {
		provider: "openai-codex",
		ids: ["gpt-5.5", "gpt-5.6-sol"],
	},
} as const;

export type ExplicitModelPolicy =
	keyof typeof MODEL_ROUTING_POLICY.explicitChoices;
const CODEX_MAX_RE = /codex-max/i;

function isProvider(model: ModelLike, provider: string) {
	return model.provider === provider;
}

function getDisplayName(model: ModelLike) {
	return model.name || model.id;
}

function normalize(value: string | undefined) {
	return (value || "").toLowerCase();
}

export function parseProviderModelString(raw: string): ModelLike | undefined {
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

function modelCost(model: ModelLike): number {
	if (!model.cost) return 0;
	return model.cost.input + model.cost.output;
}

function supportsHighReasoning(model: ModelLike): boolean {
	if (model.reasoning !== true) return false;
	return model.thinkingLevelMap?.high !== null;
}

function scoreModelForSize(
	model: ModelLike,
	size: ModelSize,
	current?: ModelLike,
): number {
	const id = normalize(model.id);
	const name = normalize(model.name);
	const text = `${id} ${name}`;
	const currentSeries = current ? inferSeriesKey(current) : "";
	const modelSeries = inferSeriesKey(model);

	let score = 0;
	if (current && model.provider === current.provider) score += 80;
	if (currentSeries && modelSeries === currentSeries) score += 50;
	if (current && model.id === current.id && model.provider === current.provider)
		score += 25;

	if (text.includes("gpt-5.4")) score += 8;
	if (text.includes("claude")) score += 6;

	const contextWindow = model.contextWindow ?? 0;
	const maxTokens = model.maxTokens ?? 0;
	const cost = modelCost(model);
	if (size === "nano" || size === "mini" || size === "small") {
		score -= Math.min(cost, 100);
		if (contextWindow >= 100_000) score += 5;
	} else if (size === "core" || size === "medium") {
		if (model.reasoning === true) score += 20;
		if (contextWindow >= 128_000) score += 15;
		if (maxTokens >= 16_000) score += 5;
		score -= Math.min(cost, 100) / 4;
	} else {
		if (supportsHighReasoning(model)) score += 45;
		if (contextWindow >= 200_000) score += 30;
		else if (contextWindow >= 128_000) score += 15;
		if (maxTokens >= 32_000) score += 10;
	}

	if (size === "nano") {
		if (NANO_HINT_RE.test(text)) score += 140;
		if (MINI_HINT_RE.test(text)) score += 90;
		if (FAST_HINT_RE.test(text)) score += 20;
		if (LARGE_HINT_RE.test(text) || /opus|o[134]/.test(text)) score -= 60;
		if (
			!NANO_HINT_RE.test(text) &&
			!MINI_HINT_RE.test(text) &&
			!FAST_HINT_RE.test(text)
		)
			score -= 15;
	} else if (size === "mini" || size === "small") {
		if (MINI_HINT_RE.test(text)) score += 120;
		if (NANO_HINT_RE.test(text)) score -= 20;
		if (FAST_HINT_RE.test(text)) score += 20;
		if (LARGE_HINT_RE.test(text) || /opus|o[134]/.test(text)) score -= 60;
		if (!MINI_HINT_RE.test(text) && !FAST_HINT_RE.test(text)) score -= 15;
	} else if (size === "core" || size === "medium") {
		if (FAST_HINT_RE.test(text)) score += 90;
		if (/sonnet|codex/.test(text)) score += 85;
		if (
			!MINI_HINT_RE.test(text) &&
			!LARGE_HINT_RE.test(text) &&
			!/opus|o[134]/.test(text)
		)
			score += 55;
		if (MINI_HINT_RE.test(text) || NANO_HINT_RE.test(text)) score -= 35;
		if (/opus|o[134]/.test(text)) score -= 25;
	} else {
		if (/opus|o[134]/.test(text)) score += 130;
		if (LARGE_HINT_RE.test(text)) score += 100;
		if (
			text.includes("gpt-5.4") &&
			!MINI_HINT_RE.test(text) &&
			!FAST_HINT_RE.test(text)
		)
			score += 95;
		if (/sonnet/.test(text)) score += 35;
		if (
			MINI_HINT_RE.test(text) ||
			NANO_HINT_RE.test(text) ||
			FAST_HINT_RE.test(text)
		)
			score -= 50;
	}

	return score;
}

function compareScoredModels<T extends ModelLike>(
	a: { model: T; score: number },
	b: { model: T; score: number },
) {
	if (b.score !== a.score) return b.score - a.score;
	const providerOrder = a.model.provider.localeCompare(b.model.provider);
	if (providerOrder !== 0) return providerOrder;
	return a.model.id.localeCompare(b.model.id);
}

function pickBestModel<T extends ModelLike>(
	models: readonly T[],
	size: ModelSize,
	current?: ModelLike,
): T | undefined {
	if (models.length === 0) return undefined;
	const codexDefault = pickCodexDefault(models, size);
	if (codexDefault) return codexDefault;
	return models
		.filter((model) => !CODEX_MAX_RE.test(model.id))
		.map((model) => ({ model, score: scoreModelForSize(model, size, current) }))
		.sort(compareScoredModels)[0]?.model;
}

function findExact<T extends ModelLike>(
	models: readonly T[],
	provider: string,
	id: string,
): T | undefined {
	return models.find((model) => model.provider === provider && model.id === id);
}

function pickCodexDefault<T extends ModelLike>(
	models: readonly T[],
	size: ModelSize,
): T | undefined {
	const codexModels = models.filter(
		(model) => model.provider === "openai-codex",
	);
	if (codexModels.length === 0) return undefined;
	for (const id of MODEL_ROUTING_POLICY.preferredCodexIds[size]) {
		const model = findExact(codexModels, "openai-codex", id);
		if (model) return model;
	}
	return undefined;
}

export interface ExplicitModelResolution<T extends ModelLike> {
	model?: T;
	modelId: string;
	diagnostic?: string;
}

export function resolveExplicitModelPolicy<T extends ModelLike>(
	availableModels: readonly T[],
	policy: ExplicitModelPolicy,
): ExplicitModelResolution<T> {
	const modelId = MODEL_ROUTING_POLICY.explicitChoices[policy];
	const parsed = parseProviderModelString(modelId);
	const model = parsed
		? findExact(availableModels, parsed.provider, parsed.id)
		: undefined;
	return model
		? { model, modelId }
		: {
				modelId,
				diagnostic: `Model policy '${policy}' requires ${modelId}, but that capability is not available.`,
			};
}

export function isPremiumCodexModel(model: unknown): boolean {
	if (!model || typeof model !== "object") return false;
	const candidate = model as Record<string, unknown>;
	if (candidate.provider !== MODEL_ROUTING_POLICY.premiumCodex.provider) {
		return false;
	}
	return [candidate.id, candidate.model, candidate.name].some(
		(value) =>
			typeof value === "string" &&
			MODEL_ROUTING_POLICY.premiumCodex.ids.some((id) => id === value),
	);
}

export function isConfiguredPremiumCodex(
	provider: unknown,
	model: unknown,
): boolean {
	return (
		provider === MODEL_ROUTING_POLICY.premiumCodex.provider &&
		typeof model === "string" &&
		MODEL_ROUTING_POLICY.premiumCodex.ids.some((id) => id === model)
	);
}

export function preferredModelId(size: ModelSize): string {
	return `openai-codex/${MODEL_ROUTING_POLICY.preferredCodexIds[size][0]}`;
}

function findFirstMini<T extends ModelLike>(
	models: readonly T[],
	provider: string,
): T | undefined {
	return models.find(
		(model) => isProvider(model, provider) && isMiniModel(model),
	);
}

export function resolveCommitPlanningModel<T extends ModelLike>(
	availableModels: readonly T[],
	currentModel?: ModelLike,
): T | undefined {
	return (
		findExact(availableModels, "openai-codex", "gpt-5.6-luna") ??
		(currentModel
			? resolveDynamicModel(
					availableModels,
					currentModel,
					"mini",
					"same-family",
				)
			: undefined) ??
		findExact(availableModels, "openai", "gpt-5.4-mini") ??
		findExact(availableModels, "github-copilot", "gpt-5.4-mini") ??
		findFirstMini(availableModels, "openai-codex") ??
		findFirstMini(availableModels, "github-copilot") ??
		pickBestModel(availableModels, "mini", currentModel)
	);
}

export async function resolveCommitPlanningModelFromRegistry(
	modelRegistry: { getAvailable(): AnyModel[] },
	ctx?: unknown,
): Promise<AnyModel | undefined> {
	const available = modelRegistry.getAvailable();
	return resolveCommitPlanningModel(
		available,
		ctx ? getCurrentModelHint(ctx, available) : undefined,
	);
}

export function getCurrentModelHint(
	ctx: unknown,
	availableModels: readonly ModelLike[],
): ModelLike | undefined {
	const context = asRecord(ctx);
	const directCandidates = [
		context.model,
		context.currentModel,
		context.selectedModel,
		asRecord(context.session).model,
		asRecord(context.state).model,
	];
	for (const candidate of directCandidates) {
		if (candidate && typeof candidate === "object") {
			const model = asRecord(candidate);
			if (typeof model.provider === "string" && typeof model.id === "string") {
				return model as unknown as ModelLike;
			}
		}
		if (typeof candidate === "string") {
			const parsed = parseProviderModelString(candidate);
			if (parsed) return parsed;
		}
	}

	const settings = asRecord(context.settings);
	const settingsProvider = settings.defaultProvider;
	const settingsModel = settings.defaultModel;
	if (
		typeof settingsProvider === "string" &&
		typeof settingsModel === "string"
	) {
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

	const sameProvider = availableModels.filter(
		(model) => model.provider === currentModel.provider,
	);
	const sameFamily = sameProvider.filter(
		(model) => inferSeriesKey(model) === inferSeriesKey(currentModel),
	);

	if (policy === "same-family") {
		return (
			pickBestModel(sameFamily, size, currentModel) ??
			pickBestModel(sameProvider, size, currentModel) ??
			pickBestModel(availableModels, size, currentModel)
		);
	}

	return (
		pickBestModel(sameProvider, size, currentModel) ??
		pickBestModel(availableModels, size, currentModel)
	);
}

export function resolveSampledDynamicModel<T extends ModelLike>(
	availableModels: readonly T[],
	currentModel: ModelLike | undefined,
	size: ModelSize,
	policy: ModelPolicy,
	sampleKey: string,
	taskClass: string,
	rate = configuredRoutingOutcomeSampleRate(),
): SampledModelResolution<T> {
	const model = resolveDynamicModel(
		availableModels,
		currentModel,
		size,
		policy,
	);
	const experiment = assignRoutingOutcomeExperiment(sampleKey, taskClass, rate);
	if (!experiment) return { model };
	const experimentModel = availableModels.find(
		(candidate) =>
			candidate.provider === experiment.provider &&
			candidate.id === experiment.modelId,
	);
	if (!experimentModel) return { model };
	return { model: experimentModel, experiment };
}

export function resolveSampledDynamicModelFromRegistry(
	modelRegistry: { getAvailable(): AnyModel[] },
	ctx: unknown,
	size: ModelSize,
	policy: ModelPolicy,
	sampleKey: string,
	taskClass: string,
	rate = configuredRoutingOutcomeSampleRate(),
): SampledModelResolution<AnyModel> {
	const available = modelRegistry.getAvailable();
	const current = getCurrentModelHint(ctx, available);
	return resolveSampledDynamicModel(
		available,
		current,
		size,
		policy,
		sampleKey,
		taskClass,
		rate,
	);
}

export function resolveDynamicModelFromRegistry(
	modelRegistry: { getAvailable(): AnyModel[] },
	ctx: unknown,
	size: ModelSize,
	policy: ModelPolicy = "same-provider",
): AnyModel | undefined {
	const available = modelRegistry.getAvailable();
	const current = getCurrentModelHint(ctx, available);
	return resolveDynamicModel(available, current, size, policy);
}

export function resolveModelTierLabel(
	model: ModelLike | undefined,
	size: ModelSize,
) {
	if (model) return getDisplayName(model);
	if (size === "nano") return "Nano model";
	if (size === "mini" || size === "small") return "Mini model";
	if (size === "core" || size === "medium") return "Core model";
	return "Large model";
}
