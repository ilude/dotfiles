import { describe, expect, it } from "vitest";

import { buildSkillPrompt } from "../lib/workflow-commands/prompts.js";

describe("buildSkillPrompt", () => {
	it("replaceArguments=true: path appears exactly once, no trailing Args suffix", () => {
		const template = "Review the plan at $ARGUMENTS and summarise.";
		const args = "/some/plan.md";
		const result = buildSkillPrompt(template, args, { replaceArguments: true });
		const count = result.split(args).length - 1;
		expect(count).toBe(1);
		expect(result).not.toContain("Args:");
	});

	it("replaceArguments=false: trailing Args suffix is present", () => {
		const template = "Review the following plan and summarise.";
		const args = "/some/plan.md";
		const result = buildSkillPrompt(template, args, { replaceArguments: false });
		expect(result).toContain(`Args: ${args}`);
	});

	it("replaceArguments omitted (default): trailing Args suffix is present", () => {
		const template = "Review the following plan and summarise.";
		const args = "/some/plan.md";
		const result = buildSkillPrompt(template, args);
		expect(result).toContain(`Args: ${args}`);
	});
});
