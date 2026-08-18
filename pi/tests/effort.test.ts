import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import registerEffortCommand, {
	EFFORT_LEVELS,
} from "../extensions/effort.ts";
import { createMockPi } from "./helpers/mock-pi.ts";

function setup(initialLevel = "high") {
	let level = initialLevel;
	const pi = Object.assign(createMockPi(), {
		getThinkingLevel: vi.fn(() => level),
		setThinkingLevel: vi.fn((next: string) => {
			level = next;
		}),
	});
	registerEffortCommand(pi as unknown as ExtensionAPI);
	const command = pi.registerCommand.mock.calls.find(
		([name]) => name === "effort",
	)?.[1];
	if (!command) throw new Error("effort command was not registered");
	return { pi, command };
}

describe("effort command", () => {
	it("offers every supported thinking level", () => {
		const { command } = setup();

		expect(command.getArgumentCompletions("")).toEqual(
			EFFORT_LEVELS.map((value) => ({ value, label: value })),
		);
		expect(command.getArgumentCompletions("lo")).toEqual([
			{ value: "low", label: "low" },
		]);
	});

	it("sets and reports the session thinking level", async () => {
		const { pi, command } = setup();

		await command.handler(" low ");

		expect(pi.setThinkingLevel).toHaveBeenCalledWith("low");
		expect(pi.sendMessage).toHaveBeenCalledWith(
			{
				customType: "effort-command",
				content: "Effort set to low.",
				display: true,
			},
			{ triggerTurn: false },
		);
	});

	it("reports invalid levels without changing the session", async () => {
		const { pi, command } = setup();

		await command.handler("turbo");

		expect(pi.setThinkingLevel).not.toHaveBeenCalled();
		expect(pi.sendMessage).toHaveBeenCalledWith(
		expect.objectContaining({
			content: expect.stringContaining("Invalid effort level: turbo."),
			display: true,
		}),
		{ triggerTurn: false },
	);
	});
});
