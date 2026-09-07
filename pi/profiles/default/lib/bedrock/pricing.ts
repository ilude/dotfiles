import { getBuiltinModels } from "@earendil-works/pi-ai/providers/all";

export interface TokenUsage { input?: number; output?: number; cacheRead?: number; cacheWrite?: number }
export interface PriceResult {
	status: "estimated" | "unpriced";
	basis: string;
	reason?: string;
	components?: { input: number; output: number; cacheRead: number; cacheWrite: number };
	total?: number;
}

export const PRICING_BASIS = "pi-0.85.0-catalog@2026-09-07";
export const PRICING_SOURCE = "https://aws.amazon.com/bedrock/pricing/";

export function ratesForTarget(targetId: string) {
	return getBuiltinModels("amazon-bedrock").find(model => model.id === targetId)?.cost;
}

export function bedrockModelCost(_provider: string, logicalId: string) {
	return ratesForTarget(logicalId) ?? ratesForTarget(`global.${logicalId}`);
}

export function estimateUsage(targetId: string | undefined, usage: TokenUsage): PriceResult {
	if (!targetId) return { status: "unpriced", basis: PRICING_BASIS, reason: "actual target model was not recorded" };
	const rates = ratesForTarget(targetId);
	if (!rates) return { status: "unpriced", basis: PRICING_BASIS, reason: `no exact catalog price for ${targetId}` };
	const n = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
	const components = {
		input: n(usage.input) * rates.input / 1_000_000,
		output: n(usage.output) * rates.output / 1_000_000,
		cacheRead: n(usage.cacheRead) * rates.cacheRead / 1_000_000,
		cacheWrite: n(usage.cacheWrite) * rates.cacheWrite / 1_000_000,
	};
	return { status: "estimated", basis: PRICING_BASIS, components, total: Object.values(components).reduce((a, b) => a + b, 0) };
}
