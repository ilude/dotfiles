import { describe, expect, it, vi } from "vitest";

vi.mock("@mariozechner/pi-ai", () => ({
	completeSimple: vi.fn(),
}));

vi.mock("@mariozechner/pi-tui", () => ({
	Text: class Text {
		constructor(public text: string) {}
	},
}));

import workflowCommands from "../extensions/workflow-commands";
import { createMockPi } from "./helpers/mock-pi.js";

describe("workflow session commands", () => {
	it("registers /new as an extension command that starts a new session", async () => {
		const pi = createMockPi();
		workflowCommands(pi as any);

		const command = pi._commands.find((entry) => entry.name === "new");
		expect(command).toBeDefined();

		const ctx = { newSession: vi.fn(async () => ({ cancelled: false })) };
		await command!.handler("", ctx);

		expect(ctx.newSession).toHaveBeenCalledTimes(1);
		expect(pi.sendUserMessage).not.toHaveBeenCalledWith("/new");
	});

	it("implements /clear via ctx.newSession instead of injecting /new as user text", async () => {
		const pi = createMockPi();
		workflowCommands(pi as any);

		const command = pi._commands.find((entry) => entry.name === "clear");
		expect(command).toBeDefined();

		const ctx = { newSession: vi.fn(async () => ({ cancelled: false })) };
		await command!.handler("", ctx);

		expect(ctx.newSession).toHaveBeenCalledTimes(1);
		expect(pi.sendUserMessage).not.toHaveBeenCalledWith("/new");
	});
});
