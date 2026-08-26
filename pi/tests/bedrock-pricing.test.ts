import { describe, expect, it } from "vitest";
import { priceBedrockUsage } from "../lib/bedrock-pricing.js";

describe("priceBedrockUsage", () => {
	it("prices every Fable component at Bedrock cross-region rates", () => {
		const result = priceBedrockUsage({
			provider: "amazon-bedrock",
			model: "us.anthropic.claude-fable-5",
			inputTokens: 1_000_000,
			outputTokens: 1_000_000,
			cacheReadTokens: 1_000_000,
			cacheWriteTokens: 1_000_000,
			cacheWriteTier: "1h",
		});

		expect(result.status).toBe("priced");
		if (result.status === "priced") {
			expect(result.components.input).toBeCloseTo(11);
			expect(result.components.output).toBeCloseTo(55);
			expect(result.components.cacheRead).toBeCloseTo(1.1);
			expect(result.components.cacheWrite).toBeCloseTo(22);
			expect(result.total).toBeCloseTo(89.1);
		}
	});

	it("uses regional rates when the model is not cross-region", () => {
		const result = priceBedrockUsage({
			provider: "amazon-bedrock",
			model: "anthropic.claude-fable-5",
			inputTokens: 1_000_000,
			outputTokens: 1_000_000,
			cacheReadTokens: 1_000_000,
			cacheWriteTokens: 1_000_000,
			cacheWriteTier: "1h",
		});
		expect(result.status).toBe("priced");
		if (result.status === "priced") expect(result.total).toBe(81);
	});

	it("prices the CUR-derived one-hour cache-write fixture", () => {
		const result = priceBedrockUsage({
			provider: "bedrock-mantle",
			model: "anthropic.claude-fable-5",
			inputTokens: 0,
			outputTokens: 0,
			cacheReadTokens: 0,
			cacheWriteTokens: 18_949_229,
			cacheWriteTier: "1h",
		});
		expect(result.status).toBe("priced");
		if (result.status === "priced") {
			expect(result.components.cacheWrite).toBeCloseTo(416.883038, 6);
			expect(result.total).toBeCloseTo(416.883038, 6);
		}
	});

	it("leaves unknown models explicitly unpriced", () => {
		expect(
			priceBedrockUsage({
				provider: "bedrock-mantle",
				model: "anthropic.claude-unknown",
				inputTokens: 1,
				outputTokens: 1,
				cacheReadTokens: 1,
				cacheWriteTokens: 1,
				cacheWriteTier: "1h",
			}),
		).toEqual({
			status: "unpriced",
			reason: "unsupported provider or model",
		});
	});
});
