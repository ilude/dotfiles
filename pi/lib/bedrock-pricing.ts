export type BedrockCacheWriteTier = "1h";

export interface BedrockTokenUsage {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
}

export interface BedrockPriceInput extends BedrockTokenUsage {
	provider: string;
	model: string;
	cacheWriteTier: BedrockCacheWriteTier;
}

export interface BedrockPriceComponents {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
}

export type BedrockPriceResult =
	| {
			status: "priced";
			components: BedrockPriceComponents;
			total: number;
	  }
	| {
			status: "unpriced";
			reason: string;
	  };

type RatesPerMillion = BedrockPriceComponents;

const FABLE_5_REGIONAL_RATES: RatesPerMillion = {
	input: 10,
	output: 50,
	cacheRead: 1,
	cacheWrite: 20,
};

const CROSS_REGION_MULTIPLIER = 1.1;

export function priceBedrockUsage(input: BedrockPriceInput): BedrockPriceResult {
	if (input.cacheWriteTier !== "1h") {
		return { status: "unpriced", reason: "unsupported cache-write tier" };
	}

	const model = classifyModel(input.provider, input.model);
	if (!model) {
		return { status: "unpriced", reason: "unsupported provider or model" };
	}

	const rates = multiplyRates(
		FABLE_5_REGIONAL_RATES,
		model.crossRegion ? CROSS_REGION_MULTIPLIER : 1,
	);
	const components = {
		input: componentCost(input.inputTokens, rates.input),
		output: componentCost(input.outputTokens, rates.output),
		cacheRead: componentCost(input.cacheReadTokens, rates.cacheRead),
		cacheWrite: componentCost(input.cacheWriteTokens, rates.cacheWrite),
	};
	return {
		status: "priced",
		components,
		total:
			components.input +
			components.output +
			components.cacheRead +
			components.cacheWrite,
	};
}

function classifyModel(
	provider: string,
	model: string,
): { crossRegion: boolean } | undefined {
	if (provider === "bedrock-mantle" && model === "anthropic.claude-fable-5") {
		return { crossRegion: true };
	}
	if (provider !== "amazon-bedrock") return undefined;
	if (model === "us.anthropic.claude-fable-5") return { crossRegion: true };
	if (model === "anthropic.claude-fable-5") return { crossRegion: false };
	return undefined;
}

function multiplyRates(
	rates: RatesPerMillion,
	multiplier: number,
): RatesPerMillion {
	return {
		input: rates.input * multiplier,
		output: rates.output * multiplier,
		cacheRead: rates.cacheRead * multiplier,
		cacheWrite: rates.cacheWrite * multiplier,
	};
}

function componentCost(tokens: number, ratePerMillion: number): number {
	return (tokens / 1_000_000) * ratePerMillion;
}
