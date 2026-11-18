import type { Api, Model } from "@earendil-works/pi-ai";
import type { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { compareModelVersions, modelFamilyVersion } from "./model-family.ts";
import { selectLatestGrokModelIds } from "./bedrock/model-policy.ts";

const AWS_PROVIDER_LADDER = [["bedrock-mantle"], ["amazon-bedrock"]] as const;
const PROVIDER_LADDER = [["openai"], ...AWS_PROVIDER_LADDER] as const;
const GPT_PROVIDER_LADDER = [["openai"], ["openai-codex"], ...AWS_PROVIDER_LADDER] as const;

const MODEL_ALIASES: Readonly<Record<string, string>> = {
	astra: "astra",
	fable: "claude-fable",
	luna: "luna",
	opus: "claude-opus",
	sol: "sol",
	terra: "terra",
};
const CODEX_PROVIDER = "openai";
const GPT_FAMILIES = ["astra", "sol", "terra", "luna"] as const;
type OpenAIFamily = typeof GPT_FAMILIES[number];
function isGptFamily(value: string): value is OpenAIFamily {
	return GPT_FAMILIES.some(family => family === value);
}

function isGptId(value: string): boolean {
	return /^gpt-\d/i.test(value);
}

function preferredProviders(requested: string): readonly (readonly string[])[] {
	const name = requested.toLowerCase();
	if (name === "grok") return [["amazon-bedrock"]];
	if (name === "opus" || modelFamilyVersion(name)?.family === "opus") return AWS_PROVIDER_LADDER;
	return isGptFamily(name) || isGptId(name) ? GPT_PROVIDER_LADDER : PROVIDER_LADDER;
}

type Candidate = {
	model: Model<Api>;
	matchScore: number;
	costScore: number;
};

function normalize(value: string): string[] {
	return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function containsSequence(haystack: readonly string[], needle: readonly string[]): boolean {
	if (needle.length === 0 || needle.length > haystack.length) return false;
	for (let start = 0; start <= haystack.length - needle.length; start += 1) {
		if (needle.every((token, offset) => haystack[start + offset] === token)) return true;
	}
	return false;
}

function matchScore(model: Model<Api>, requested: string): number | undefined {
	const request = requested.toLowerCase();
	// An explicit GPT model ID is not a request for a dated variant or a
	// similarly named model. AWS adds a namespace to the same logical ID.
	if (isGptId(request)) {
		const id = model.id.toLowerCase();
		const logicalId = model.provider === "bedrock-mantle" || model.provider === "amazon-bedrock"
			? id.replace(/^(?:(?:us|eu|apac|global)\.)?openai\./, "")
			: id;
		return logicalId === request ? 0 : undefined;
	}
	const values = [model.id, model.name].filter((value): value is string => typeof value === "string");
	if (values.some(value => value.toLowerCase() === request)) return 0;

	const requestedTokens = normalize(requested);
	let best: number | undefined;
	for (const value of values) {
		const tokens = normalize(value);
		if (!containsSequence(tokens, requestedTokens)) continue;
		const score = 100 + tokens.length - requestedTokens.length;
		best = best === undefined ? score : Math.min(best, score);
	}
	return best;
}

function finiteCost(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function costScore(model: Model<Api>): number {
	const cost = model.cost;
	if (!cost) return 0;
	return finiteCost(cost.input) + finiteCost(cost.output) + finiteCost(cost.cacheRead) + finiteCost(cost.cacheWrite);
}

function compareCandidates(left: Candidate, right: Candidate): number {
	return left.matchScore - right.matchScore
		|| left.costScore - right.costScore
		|| left.model.id.localeCompare(right.model.id);
}

export function resolvePreferredModel(
	requested: string,
	registry: Pick<ModelRegistry, "getAll" | "hasConfiguredAuth">,
): Model<Api> {
	const trimmed = requested.trim();
	if (!trimmed) throw new Error("Model name is required");
	if (trimmed.includes("/")) {
		throw new Error(`Expected a bare model name, received explicit reference ${trimmed}`);
	}

	const alias = trimmed.toLowerCase();
	if (isGptFamily(alias)) return resolveLatestFamilyModel(alias, registry, GPT_PROVIDER_LADDER);
	if (alias === "fable") return resolveLatestFamilyModel("fable", registry);
	if (alias === "opus") return resolveLatestFamilyModel("opus", registry, AWS_PROVIDER_LADDER);
	const target = trimmed;
	const authenticated = registry.getAll().filter(model => registry.hasConfiguredAuth(model));
	if (alias === "grok") {
		const native = authenticated.filter(model => model.provider === "amazon-bedrock");
		const [id] = selectLatestGrokModelIds(native.map(model => model.id));
		const selected = native.find(model => model.id === id);
		if (selected) return selected;
		throw new Error('No configured native AWS Bedrock model matches "grok"');
	}

	const providerLadder = preferredProviders(trimmed);
	for (const providers of providerLadder) {
		const candidates = authenticated
			.filter(model => (providers as readonly string[]).includes(model.provider))
			.map(model => {
				const score = matchScore(model, target);
				return score === undefined ? undefined : { model, matchScore: score, costScore: costScore(model) };
			})
			.filter((candidate): candidate is Candidate => candidate !== undefined)
			.sort(compareCandidates);
		if (candidates.length > 0) return candidates[0].model;
	}

	throw new Error(`No configured ${providerLadder === AWS_PROVIDER_LADDER ? "AWS Bedrock" : "subscription or AWS"} model matches "${requested}"`);
}

/** Resolve against current, provider-scoped availability, not the registry's cached auth snapshot. */
export async function resolveAvailablePreferredModel(
	requested: string,
	registry: Pick<ModelRegistry, "getAvailableOfType">,
	signal?: AbortSignal,
): Promise<Model<Api>> {
	const trimmed = requested.trim();
	if (!trimmed || trimmed.includes("/")) throw new Error(`Expected a bare model name, received ${requested}`);
	const providers = preferredProviders(trimmed);
	const failures: string[] = [];
	for (const tier of providers) {
		for (const provider of tier) {
			signal?.throwIfAborted();
			let models: readonly Model<Api>[];
			try {
				models = await registry.getAvailableOfType("chat", provider, { signal });
			} catch {
				signal?.throwIfAborted();
				failures.push(provider);
				continue;
			}
			signal?.throwIfAborted();
			// Selection policy is shared with shortcuts and synchronous catalog callers.
			// Only this provider's fresh, available chat models enter that policy.
			if (models.length === 0) continue;
			try { return resolvePreferredModel(trimmed, { getAll: () => [...models], hasConfiguredAuth: () => true }); }
			catch (error) {
				if (!(error instanceof Error) || !error.message.startsWith("No configured ")) throw error;
			}
		}
	}
	throw new Error(`No available subscription or AWS chat model matches "${requested}". Checked ${providers.flat().join(", ")}.${failures.length ? ` Availability lookup failed for ${failures.join(", ")}.` : ""}`);
}

function latestFamilyModel(family: OpenAIFamily | "fable" | "opus", models: readonly Model<Api>[]): Model<Api> | undefined {
	return models.flatMap(model => {
		const parsed = modelFamilyVersion(model.id);
		return parsed?.family === family ? [{ model, version: parsed.version }] : [];
	}).sort((left, right) => compareModelVersions(right.version, left.version)
		|| costScore(left.model) - costScore(right.model)
		|| left.model.id.localeCompare(right.model.id))[0]?.model;
}

function resolveLatestFamilyModel(
	family: OpenAIFamily | "fable" | "opus",
	registry: Pick<ModelRegistry, "getAll" | "hasConfiguredAuth">,
	providers: readonly (readonly string[])[] = PROVIDER_LADDER,
): Model<Api> {
	const authenticated = registry.getAll().filter(model => registry.hasConfiguredAuth(model));
	for (const providerTier of providers) {
		const model = latestFamilyModel(family, authenticated.filter(candidate => providerTier.includes(candidate.provider)));
		if (model) return model;
	}
	throw new Error(`No configured ${providers === AWS_PROVIDER_LADDER ? "AWS Bedrock" : "subscription or AWS"} model matches "${family}"`);
}

function latestCodexModel(family: OpenAIFamily, models: readonly Model<Api>[]): Model<Api> {
	const model = latestFamilyModel(family, models.filter(candidate => candidate.provider === CODEX_PROVIDER));
	if (!model) throw new Error(`No authenticated ${CODEX_PROVIDER} ${family} model is available`);
	return model;
}

// Keep these entry points separate: both Pi APIs expose getAvailable, but only
// ModelRuntime returns a Promise. Callers already know which API they own.
export function resolveLatestCodexModelFromRegistry(
	family: OpenAIFamily,
	registry: Pick<ModelRegistry, "getAll" | "hasConfiguredAuth">,
): Model<Api> {
	return latestCodexModel(family, registry.getAll().filter(model => model.provider === CODEX_PROVIDER && registry.hasConfiguredAuth(model)));
}

export async function resolveLatestCodexModelFromRuntime(
	family: OpenAIFamily,
	runtime: Pick<ModelRuntime, "getAvailable">,
	signal?: AbortSignal,
): Promise<Model<Api>> {
	signal?.throwIfAborted();
	const models = await runtime.getAvailable(CODEX_PROVIDER, { signal });
	signal?.throwIfAborted();
	return latestCodexModel(family, models);
}

export function resolveLatestShortcutModel(
	family: "astra" | "sol" | "terra" | "luna" | "fable" | "opus",
	registry: Pick<ModelRegistry, "getAll" | "hasConfiguredAuth">,
): Model<Api> {
	return resolveLatestFamilyModel(family, registry, preferredProviders(family));
}

export function modelAliasNames(): readonly string[] {
	return Object.keys(MODEL_ALIASES);
}
