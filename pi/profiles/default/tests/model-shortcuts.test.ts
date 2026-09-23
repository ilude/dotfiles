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
		["terra", "openai-codex", "gpt-5.6-terra"],
		["luna", "openai-codex", "gpt-5.6-luna"],
	] as const)("/%s selects its Codex subscription model", async (command, provider, id) => {
		const model = { provider, id };
		const { commands, pi, ctx } = setup([model]);

		await commands.get(command)!.handler("", ctx);

		expect(pi.setModel).toHaveBeenCalledWith(model);
		expect(ctx.ui.notify).toHaveBeenCalledWith(`Switched to ${provider}/${id}.`, "info");
	});

	it("selects the newest version in each family without changing the provider ladder", async () => {
		const models = [
			{ provider: "bedrock-mantle", id: "openai.gpt-7-sol" },
			{ provider: "bedrock-mantle", id: "openai.gpt-7-terra" },
			{ provider: "openai-codex", id: "gpt-5.6-sol" },
			{ provider: "openai-codex", id: "gpt-6-luna" },
			{ provider: "openai-codex", id: "gpt-6-sol" },
			{ provider: "openai-codex", id: "gpt-5.6-luna" },
		];
		const { commands, pi, ctx } = setup(models);
		await commands.get("sol")!.handler("", ctx);
		expect(pi.setModel).toHaveBeenLastCalledWith(models[4]);
		await commands.get("luna")!.handler("", ctx);
		expect(pi.setModel).toHaveBeenLastCalledWith(models[3]);
	});

	it("/terra falls back to Bedrock Mantle when Codex Terra is unavailable", async () => {
		const mantle = { provider: "bedrock-mantle", id: "openai.gpt-7-terra" };
		const { commands, pi, ctx } = setup([mantle]);
		await commands.get("terra")!.handler("", ctx);
		expect(pi.setModel).toHaveBeenCalledWith(mantle);
	});

	it("/fable prefers the Bedrock Mantle route and its newest version", async () => {
		const native = { provider: "amazon-bedrock", id: "us.anthropic.claude-fable-5-1" };
		const mantle = { provider: "bedrock-mantle", id: "anthropic.claude-fable-5-1" };
		const older = { provider: "bedrock-mantle", id: "anthropic.claude-fable-5" };
		const { commands, pi, ctx } = setup([native, older, mantle]);

		await commands.get("fable")!.handler("", ctx);

		expect(pi.setModel).toHaveBeenCalledWith(mantle);
	});

	it("/opus selects the newest authenticated Opus without crossing providers", async () => {
		const native = { provider: "amazon-bedrock", id: "us.anthropic.claude-opus-6" };
		const older = { provider: "bedrock-mantle", id: "anthropic.claude-opus-5" };
		const newest = { provider: "bedrock-mantle", id: "anthropic.claude-opus-5-5" };
		const { commands, pi, ctx } = setup([native, older, newest]);
		await commands.get("opus")!.handler("", ctx);
		expect(pi.setModel).toHaveBeenCalledExactlyOnceWith(newest);
	});

	it("chooses the cheapest same-version model within a provider tier", async () => {
		const expensive = { provider: "openai-codex", id: "gpt-5.6-sol-preview", cost: { input: 5, output: 20 } };
		const cheap = { provider: "openai-codex", id: "gpt-5.6-sol-stable", cost: { input: 1, output: 4 } };
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

	it.each(["astra", "sol", "terra", "luna", "fable", "opus"])("/%s only autocompletes partial effort levels", (command) => {
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
