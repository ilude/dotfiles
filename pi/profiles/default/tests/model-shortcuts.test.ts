import { describe, expect, it, vi } from "vitest";
import modelShortcuts from "../extensions/model-shortcuts.js";

function setup(models: Array<{ provider: string; id: string }>, switchResult = true) {
	const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void>; getArgumentCompletions?: (prefix: string) => Array<{ value: string; label: string }> | null }>();
	let thinkingLevel = "medium";
	const pi = {
		registerCommand: vi.fn((name: string, definition: { handler: (args: string, ctx: any) => Promise<void>; getArgumentCompletions?: (prefix: string) => Array<{ value: string; label: string }> | null }) => {
			commands.set(name, definition);
		}),
		setModel: vi.fn(async () => switchResult),
		setThinkingLevel: vi.fn((level: string) => { thinkingLevel = level; }),
		getThinkingLevel: vi.fn(() => thinkingLevel),
	};
	modelShortcuts(pi as any);
	const ctx = {
		modelRegistry: { getAvailable: () => models },
		ui: { notify: vi.fn() },
	};
	return { commands, pi, ctx };
}

describe("model shortcuts", () => {
	it.each([
		["astra", "openai-codex", "gpt-6-astra"],
		["sol", "openai-codex", "gpt-5.6-sol"],
		["luna", "openai-codex", "gpt-5.6-luna"],
	] as const)("/%s selects its Codex subscription model", async (command, provider, id) => {
		const model = { provider, id };
		const { commands, pi, ctx } = setup([model]);

		await commands.get(command)!.handler("", ctx);

		expect(pi.setModel).toHaveBeenCalledWith(model);
		expect(ctx.ui.notify).toHaveBeenCalledWith(`Switched to ${provider}/${id}.`, "info");
	});

	it("/fable prefers the curated Bedrock Mantle route", async () => {
		const native = { provider: "amazon-bedrock", id: "us.anthropic.claude-fable-5-1" };
		const mantle = { provider: "bedrock-mantle", id: "anthropic.claude-fable-5-1" };
		const { commands, pi, ctx } = setup([native, mantle]);

		await commands.get("fable")!.handler("", ctx);

		expect(pi.setModel).toHaveBeenCalledWith(mantle);
	});

	it("reports unavailable models without changing the active model", async () => {
		const { commands, pi, ctx } = setup([]);

		await commands.get("sol")!.handler("", ctx);

		expect(pi.setModel).not.toHaveBeenCalled();
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("No configured sol model"), "error");
	});

	it("sets an optional effort after switching models", async () => {
		const { commands, pi, ctx } = setup([{ provider: "openai-codex", id: "gpt-5.6-sol" }]);

		await commands.get("sol")!.handler("high", ctx);

		expect(pi.setModel).toHaveBeenCalled();
		expect(pi.setThinkingLevel).toHaveBeenCalledWith("high");
		expect(ctx.ui.notify).toHaveBeenCalledWith("Switched to openai-codex/gpt-5.6-sol at high effort.", "info");
	});

	it("autocompletes supported effort levels", () => {
		const { commands } = setup([]);

		expect(commands.get("astra")!.getArgumentCompletions!("h")).toEqual([
			{ value: "high", label: "high" },
		]);
		expect(commands.get("astra")!.getArgumentCompletions!("")).toHaveLength(4);
	});

	it("rejects unsupported effort levels", async () => {
		const { commands, pi, ctx } = setup([{ provider: "openai-codex", id: "gpt-5.6-sol" }]);

		await commands.get("sol")!.handler("max", ctx);

		expect(pi.setModel).not.toHaveBeenCalled();
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			"Invalid effort level for /sol: max. Available levels: low, medium, high, xhigh.",
			"warning",
		);
	});
});
