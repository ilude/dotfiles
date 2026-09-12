import type { Api, Model } from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";

const PROVIDER_LADDER = [
	["openai-codex"],
	["bedrock-mantle"],
	["amazon-bedrock"],
] as const;

const MODEL_ALIASES: Readonly<Record<string, string>> = {
	astra: "gpt-6-astra",
	fable: "claude-fable",
	luna: "gpt-5.6-luna",
	sol: "gpt-5.6-sol",
};

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

	const target = MODEL_ALIASES[trimmed.toLowerCase()] ?? trimmed;
	const authenticated = registry.getAll().filter(model => registry.hasConfiguredAuth(model));

	for (const providers of PROVIDER_LADDER) {
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

	throw new Error(`No configured subscription or AWS model matches "${requested}"`);
}

export function modelAliasNames(): readonly string[] {
	return Object.keys(MODEL_ALIASES);
}
