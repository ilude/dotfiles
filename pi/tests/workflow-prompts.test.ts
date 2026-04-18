import { describe, expect, it } from "vitest";
import * as fs from "node:fs";

function readPrompt(relativePath: string) {
	return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

describe("workflow prompt contracts", () => {
	it("/do-it explicitly supports .specs/*/plan.md execution", () => {
		const prompt = readPrompt("skills/workflow/do-it.md");
		expect(prompt).toContain("Plan file");
		expect(prompt).toContain(".specs/my-feature/plan.md");
		expect(prompt).toContain("Execute Plan File");
		expect(prompt).toContain("wave by wave");
	});

	it("/plan-it requires agent assignment and self-validation", () => {
		const prompt = readPrompt("skills/workflow/plan-it.md");
		expect(prompt).toContain("| Scope | Indicators | Model | Agent |");
		expect(prompt).toContain("Every task has both a **Model** and an **Agent** assigned");
		expect(prompt).toContain("## Step 7: Self-Validate Before Presenting");
		expect(prompt).toContain("| # | Task | Files | Type | Model | Agent | Depends On |");
	});

	it("/review-it requires fixed standard reviewers plus dynamic expert reviewers", () => {
		const prompt = readPrompt("skills/workflow/review-it.md");
		expect(prompt).toContain("3 standard reviewers");
		expect(prompt).toContain("at least 3 additional domain-specific expert reviewers");
		expect(prompt).toContain("modelSize: \"medium\"");
		expect(prompt).toContain("modelPolicy: \"same-family\"");
		expect(prompt).toContain("Contested or Dismissed Findings");
	});

	it("/commit documents hybrid candidate extraction plus LLM adjudication", () => {
		const prompt = readPrompt("skills/workflow/commit.md");
		expect(prompt).toContain("two-step secret review");
		expect(prompt).toContain("deterministic pattern matching");
		expect(prompt).toContain("small/mini LLM");
		expect(prompt).toContain("likely real secret");
	});
});
