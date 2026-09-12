import { describe, expect, it, vi } from "vitest";
import modelShortcuts from "../extensions/model-shortcuts.js";

function setup(models: Array<{ provider: string; id: string; name?: string; cost?: Record<string, number> }>, switchResult = true) {
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
		modelRegistry: { getAll: () => models, hasConfiguredAuth: () => true },
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

	it("/fable prefers the Bedrock Mantle route", async () => {
		const native = { provider: "amazon-bedrock", id: "us.anthropic.claude-fable-5-1" };
		const mantle = { provider: "bedrock-mantle", id: "anthropic.claude-fable-5-1" };
		const { commands, pi, ctx } = setup([native, mantle]);

		await commands.get("fable")!.handler("", ctx);

		expect(pi.setModel).toHaveBeenCalledWith(mantle);
	});

	it("chooses the cheapest equally close model within a provider tier", async () => {
		const expensive = { provider: "openai-codex", id: "preview-gpt-5.6-sol", cost: { input: 5, output: 20 } };
		const cheap = { provider: "openai-codex", id: "stable-gpt-5.6-sol", cost: { input: 1, output: 4 } };
		const { commands, pi, ctx } = setup([expensive, cheap]);

		await commands.get("sol")!.handler("", ctx);

		expect(pi.setModel).toHaveBeenCalledWith(cheap);
	});

	it("does not fall through to unapproved providers", async () => {
		const { commands, pi, ctx } = setup([{ provider: "openrouter", id: "upstage/solar-pro4" }]);

		await commands.get("sol")!.handler("", ctx);

		expect(pi.setModel).not.toHaveBeenCalled();
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

	it.each(["astra", "sol", "luna", "fable"])("/%s only autocompletes partial effort levels", (command) => {
		const { commands } = setup([]);
		const complete = commands.get(command)!.getArgumentCompletions!;

		expect(complete("h")).toEqual([{ value: "high", label: "high" }]);
		expect(complete("")).toBeNull();
		expect(complete("high")).toBeNull();
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
