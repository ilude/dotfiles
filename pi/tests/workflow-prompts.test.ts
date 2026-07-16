import { describe, expect, it } from "vitest";
import {
	buildCommitPlanningPrompt,
	buildSecretReviewPrompt,
} from "../lib/workflow-commands/prompts.ts";

describe("workflow prompt contracts", () => {
	it("commit planner prompt requires one-line subjects", () => {
		const prompt = buildCommitPlanningPrompt("", {
			files: ["a.ts"],
			diffStat: "a.ts | 1 +",
			cachedStat: "a.ts | 1 +",
			cachedDiff: "diff --git a/a.ts b/a.ts",
			hint: "",
		});
		expect(prompt).toContain(
			"Use only these commit types: feat, fix, docs, chore, refactor, test, perf, style, ci, build, deps, revert, wip.",
		);
		expect(prompt).toContain("Each subject must be exactly one line");
		expect(prompt).toContain("Do not put a newline before or after the colon");
	});

	it("secret review distinguishes ordinary code from credentials", () => {
		const prompt = buildSecretReviewPrompt([
			{
				id: 1,
				path: "example.ts",
				label: "Hardcoded password/token/secret/key",
				match: "accessToken: string",
				line: 1,
				context: "type Auth = { accessToken: string };",
			},
		]);

		expect(prompt).toContain("false_positive");
		expect(prompt).toContain("keyword-only match");
		expect(prompt).toContain("type annotations");
		expect(prompt).toContain("runtime expressions");
		expect(prompt).toContain("no literal credential value");
		expect(prompt).toContain("every candidate ID exactly once");
		expect(prompt).toContain('"id": 1');
	});
});
