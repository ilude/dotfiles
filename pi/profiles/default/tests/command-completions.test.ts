import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import profileCommands from "../extensions/commands.ts";

// Completion registration uses the real command registry, without initializing
// the private Git/model workflow that is unrelated to editor suggestions.
vi.mock("../commands/commit/reviewer.ts", () => ({
	commitReviewerTool: () => ({ name: "commit_run", execute: vi.fn() }),
}));

function completions() {
	const registered = new Map<string, Parameters<ExtensionAPI["registerCommand"]>[1]>();
	profileCommands({
		registerMessageRenderer: vi.fn(),
		registerTool: vi.fn(),
		registerCommand: (name: string, options: Parameters<ExtensionAPI["registerCommand"]>[1]) => registered.set(name, options),
		on: vi.fn(),
	} as unknown as ExtensionAPI);
	return registered.get("commit")!.getArgumentCompletions!;
}

describe("commit argument completions", () => {
	it.each(["", " ", "push", "push "])("does not intercept submission for %j", (prefix) => {
		expect(completions()(prefix)).toBeNull();
	});

	it.each(["p", "pu", "pus"])("preserves partial completion for %j", (prefix) => {
		expect(completions()(prefix)).toEqual([{ value: "push", label: "push" }]);
	});

	it("does not suggest push for unrelated input", () => {
		expect(completions()("other")).toBeNull();
	});
});
