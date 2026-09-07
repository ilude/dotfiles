import { describe, expect, it, vi } from "vitest";
import modelShortcuts from "../extensions/model-shortcuts.js";

function setup(models: Array<{ provider: string; id: string }>, switchResult = true) {
	const commands = new Map<string, (args: string, ctx: any) => Promise<void>>();
	const pi = {
		registerCommand: vi.fn((name: string, definition: { handler: (args: string, ctx: any) => Promise<void> }) => {
			commands.set(name, definition.handler);
		}),
		setModel: vi.fn(async () => switchResult),
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

		await commands.get(command)!("", ctx);

		expect(pi.setModel).toHaveBeenCalledWith(model);
		expect(ctx.ui.notify).toHaveBeenCalledWith(`Switched to ${provider}/${id}.`, "info");
	});

	it("/fable prefers the curated Bedrock Mantle route", async () => {
		const native = { provider: "amazon-bedrock", id: "us.anthropic.claude-fable-5-1" };
		const mantle = { provider: "bedrock-mantle", id: "anthropic.claude-fable-5-1" };
		const { commands, pi, ctx } = setup([native, mantle]);

		await commands.get("fable")!("", ctx);

		expect(pi.setModel).toHaveBeenCalledWith(mantle);
	});

	it("reports unavailable models without changing the active model", async () => {
		const { commands, pi, ctx } = setup([]);

		await commands.get("sol")!("", ctx);

		expect(pi.setModel).not.toHaveBeenCalled();
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("No configured sol model"), "error");
	});

	it("rejects arguments instead of starting a model turn", async () => {
		const { commands, pi, ctx } = setup([{ provider: "openai-codex", id: "gpt-5.6-sol" }]);

		await commands.get("sol")!("do work", ctx);

		expect(pi.setModel).not.toHaveBeenCalled();
		expect(ctx.ui.notify).toHaveBeenCalledWith("/sol does not accept arguments.", "warning");
	});
});
