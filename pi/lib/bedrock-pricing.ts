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

const FABLE_REGIONAL_RATES: Readonly<Record<string, RatesPerMillion>> = {
	"anthropic.claude-fable-5": {
		input: 10,
		output: 50,
		cacheRead: 1,
		cacheWrite: 20,
	},
	"anthropic.claude-fable-5-1": {
		input: 10,
		output: 50,
		cacheRead: 0.25,
		cacheWrite: 20,
	},
};

const CROSS_REGION_MULTIPLIER = 1.1;

export function bedrockModelCost(
	provider: string,
	model: string,
): RatesPerMillion | undefined {
	const classified = classifyModel(provider, model);
	if (!classified) return undefined;
	return multiplyRates(
		classified.rates,
		classified.crossRegion ? CROSS_REGION_MULTIPLIER : 1,
	);
}

export function priceBedrockUsage(input: BedrockPriceInput): BedrockPriceResult {
	if (input.cacheWriteTier !== "1h") {
		return { status: "unpriced", reason: "unsupported cache-write tier" };
	}

	const rates = bedrockModelCost(input.provider, input.model);
	if (!rates) {
		return { status: "unpriced", reason: "unsupported provider or model" };
	}
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
): { crossRegion: boolean; rates: RatesPerMillion } | undefined {
	if (provider === "bedrock-mantle") {
		const rates = FABLE_REGIONAL_RATES[model];
		return rates ? { crossRegion: true, rates } : undefined;
	}
	if (provider !== "amazon-bedrock") return undefined;
	const regionalId = model.replace(/^us[.]/, "");
	const rates = FABLE_REGIONAL_RATES[regionalId];
	if (!rates) return undefined;
	return { crossRegion: model.startsWith("us."), rates };
}

function multiplyRates(
	rates: RatesPerMillion,
	multiplier: number,
): RatesPerMillion {
	return {
		input: roundedRate(rates.input * multiplier),
		output: roundedRate(rates.output * multiplier),
		cacheRead: roundedRate(rates.cacheRead * multiplier),
		cacheWrite: roundedRate(rates.cacheWrite * multiplier),
	};
}

function roundedRate(value: number): number {
	return Number(value.toFixed(12));
}

function componentCost(tokens: number, ratePerMillion: number): number {
	return (tokens / 1_000_000) * ratePerMillion;
}
