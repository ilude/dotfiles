import { describe, expect, it, vi } from "vitest";
import fableCommand, { buildFablePrompt } from "../extensions/fable.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

describe("fable command", () => {
	it("builds an orchestration prompt with explicit Codex subagent model", () => {
		const prompt = buildFablePrompt("Fix the display");
		expect(prompt).toContain("Fix the display");
		expect(prompt).toContain('model: "openai-codex/gpt-5.6-sol"');
		expect(prompt).toContain("planning, dispatch, coordination, and synthesis");
	});

	it("switches to Fable high and sends the orchestration prompt", async () => {
		const pi = Object.assign(createMockPi(), {
			setModel: vi.fn(async () => true),
			setThinkingLevel: vi.fn(),
		});
		fableCommand(pi as Parameters<typeof fableCommand>[0]);
		const command = pi._commands.find(
			(candidate) => candidate.name === "fable",
		);
		if (!command) throw new Error("fable command not registered");

		const fableModel = {
			provider: "amazon-bedrock",
			id: "us.anthropic.claude-fable-5",
		};
		const ctx = createMockCtx({
			modelRegistry: {
				getAvailable: vi.fn(() => [fableModel]),
			},
		});

		await command.handler("Ship the feature", ctx);

		expect(pi.setModel).toHaveBeenCalledWith(fableModel);
		expect(pi.setThinkingLevel).toHaveBeenCalledWith("high");
		expect(pi.sendUserMessage).toHaveBeenCalledWith(
			expect.stringContaining("Ship the feature"),
		);
		expect(pi.sendUserMessage).toHaveBeenCalledWith(
			expect.stringContaining('model: "openai-codex/gpt-5.6-sol"'),
		);
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			"amazon-bedrock/us.anthropic.claude-fable-5[high] orchestration started.",
			"info",
		);
	});

	it("warns without dispatching when no task is provided", async () => {
		const pi = Object.assign(createMockPi(), {
			setModel: vi.fn(async () => true),
			setThinkingLevel: vi.fn(),
		});
		fableCommand(pi as Parameters<typeof fableCommand>[0]);
		const command = pi._commands.find(
			(candidate) => candidate.name === "fable",
		);
		if (!command) throw new Error("fable command not registered");
		const ctx = createMockCtx();

		await command.handler("   ", ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(
			"Usage: /fable <task>",
			"warning",
		);
		expect(pi.setModel).not.toHaveBeenCalled();
		expect(pi.sendUserMessage).not.toHaveBeenCalled();
	});
});
