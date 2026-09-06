import { describe, expect, it } from "vitest";

import { isRelevantPath, parseReviewedCommit } from "../scripts/ponytail-upstream.mjs";

describe("ponytail upstream tracking", () => {
	it("parses the exact reviewed commit", () => {
		expect(
			parseReviewedCommit(
				"# Tracking\n\n- Reviewed commit: `2ed6c52c9d7e5e56942508591085fd45dea277d3`\n",
			),
		).toBe("2ed6c52c9d7e5e56942508591085fd45dea277d3");
	});

	it("rejects abbreviated and missing checkpoints", () => {
		expect(() => parseReviewedCommit("- Reviewed commit: `2ed6c52`\n")).toThrow(
			"missing 40-character Reviewed commit",
		);
	});

	it("classifies review-relevant upstream paths", () => {
		expect(isRelevantPath("skills/ponytail/SKILL.md")).toBe(true);
		expect(isRelevantPath("hooks/ponytail-subagent.js")).toBe(true);
		expect(isRelevantPath("pi-extension/index.js")).toBe(true);
		expect(isRelevantPath("benchmarks/agentic/run.py")).toBe(true);
		expect(isRelevantPath("tests/hooks-windows.test.js")).toBe(true);
		expect(isRelevantPath("README.es.md")).toBe(false);
		expect(isRelevantPath(".grok-plugin/plugin.json")).toBe(false);
	});
});
