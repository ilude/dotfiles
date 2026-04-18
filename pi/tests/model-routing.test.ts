import { describe, it, expect } from "vitest";
import { resolveCommitPlanningModel } from "../lib/model-routing.ts";

describe("resolveCommitPlanningModel", () => {
	it("prefers openai-codex gpt-5.4-mini", () => {
		const models = [
			{ provider: "github-copilot", id: "gpt-4.1-mini" },
			{ provider: "openai-codex", id: "gpt-5.4-mini" },
		];
		expect(resolveCommitPlanningModel(models)).toEqual(models[1]);
	});

	it("falls back to any openai mini model", () => {
		const models = [
			{ provider: "openai-codex", id: "gpt-4.1-mini" },
			{ provider: "openai-codex", id: "gpt-5.4" },
		];
		expect(resolveCommitPlanningModel(models)).toEqual(models[0]);
	});

	it("falls back to any github mini model when no openai mini exists", () => {
		const models = [
			{ provider: "github-copilot", id: "gpt-4.1-mini" },
			{ provider: "openai-codex", id: "gpt-5.4" },
		];
		expect(resolveCommitPlanningModel(models)).toEqual(models[0]);
	});

	it("returns undefined when no acceptable mini model exists", () => {
		const models = [
			{ provider: "openai-codex", id: "gpt-5.4" },
			{ provider: "github-copilot", id: "o3" },
		];
		expect(resolveCommitPlanningModel(models)).toBeUndefined();
	});
});
