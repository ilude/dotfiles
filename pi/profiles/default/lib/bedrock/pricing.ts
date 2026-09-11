import { getBuiltinModels } from "@earendil-works/pi-ai/providers/all";
import { loadPricingEntries, type PricingRates } from "./pricing-store.js";

export interface TokenUsage { input?: number; output?: number; cacheRead?: number; cacheWrite?: number }
export interface PriceResult {
	status: "estimated" | "unpriced";
	basis: string;
	catalogTarget?: string;
	source?: string;
	date?: string;
	reason?: string;
	components?: { input: number; output: number; cacheRead: number; cacheWrite: number };
	total?: number;
}

export const PRICING_BASIS = "pi-0.85.0-catalog+mantle-aliases@2026-09-11";
export const RESEARCHED_PRICING_BASIS = "aws-bedrock-research";
export const PRICING_SOURCE = "https://aws.amazon.com/bedrock/pricing/";

// Explicit same-release Mantle aliases, not family/prefix matching. Keep exact
// regional Runtime entries authoritative because their prices can differ.
const MANTLE_PRICE_TARGETS = new Map([
	["anthropic.claude-opus-5", "global.anthropic.claude-opus-5"],
	["anthropic.claude-haiku-4-5", "global.anthropic.claude-haiku-4-5-20251001-v1:0"],
]);
function catalogModelForTarget(targetId: string) {
	const catalog = getBuiltinModels("amazon-bedrock");
	return catalog.find(model => model.id === targetId)
		?? catalog.find(model => model.id === MANTLE_PRICE_TARGETS.get(targetId));
}
export function ratesForTarget(targetId: string): PricingRates | undefined {
	const catalog = catalogModelForTarget(targetId);
	if (catalog?.cost) return catalog.cost;
	const researched = loadPricingEntries()[targetId];
	return researched ? { input: researched.input, output: researched.output, cacheRead: researched.cacheRead, cacheWrite: researched.cacheWrite } : undefined;
}

export function hasKnownPricing(targetId: string): boolean {
	return ratesForTarget(targetId) !== undefined;
}

export function bedrockModelCost(_provider: string, logicalId: string) {
	return ratesForTarget(logicalId) ?? ratesForTarget(`global.${logicalId}`);
}

export function estimateUsage(targetId: string | undefined, usage: TokenUsage): PriceResult {
	if (!targetId) return { status: "unpriced", basis: PRICING_BASIS, reason: "actual target model was not recorded" };
	const model = catalogModelForTarget(targetId);
	const catalogRates = model?.cost;
	const researched = catalogRates ? undefined : loadPricingEntries()[targetId];
	const rates = catalogRates ?? (researched ? {
		input: researched.input,
		output: researched.output,
		cacheRead: researched.cacheRead,
		cacheWrite: researched.cacheWrite,
	} : undefined);
	if (!rates) return { status: "unpriced", basis: PRICING_BASIS, reason: `no catalog price or researched AWS price for ${targetId}` };
	const n = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
	const components = {
		input: n(usage.input) * rates.input / 1_000_000,
		output: n(usage.output) * rates.output / 1_000_000,
		cacheRead: n(usage.cacheRead) * rates.cacheRead / 1_000_000,
		cacheWrite: n(usage.cacheWrite) * rates.cacheWrite / 1_000_000,
	};
	return {
		status: "estimated",
		basis: model ? PRICING_BASIS : RESEARCHED_PRICING_BASIS,
		...(model ? { catalogTarget: model.id } : {}),
		...(researched ? { source: researched.source, date: researched.date } : {}),
		components,
		total: Object.values(components).reduce((a, b) => a + b, 0),
	};
}
