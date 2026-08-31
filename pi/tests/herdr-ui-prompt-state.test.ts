import { describe, expect, it, vi } from "vitest";
import herdrUiPromptState from "../extensions/herdr-ui-prompt-state.js";
import { createMockPi } from "./helpers/mock-pi.js";

describe("herdr UI prompt state", () => {
	it("bridges UI prompt lifecycle events to Herdr blocked state", async () => {
		const pi = createMockPi();
		pi.events.emit = vi.fn();
		herdrUiPromptState(pi as never);

		await pi._getHook("ui_prompt_start")[0].handler({
			type: "ui_prompt_start",
			reason: "ui_prompt",
			kind: "confirm",
			title: "Allow deployment?",
		});
		expect(pi.events.emit).toHaveBeenLastCalledWith("herdr:blocked", {
			active: true,
			label: "Waiting for user: Allow deployment?",
		});

		await pi._getHook("ui_prompt_end")[0].handler({
			type: "ui_prompt_end",
			reason: "ui_prompt",
			kind: "confirm",
			title: "Allow deployment?",
		});
		expect(pi.events.emit).toHaveBeenLastCalledWith("herdr:blocked", {
			active: false,
		});
	});

	it("uses a bounded generic label when the prompt has no title", async () => {
		const pi = createMockPi();
		pi.events.emit = vi.fn();
		herdrUiPromptState(pi as never);

		await pi._getHook("ui_prompt_start")[0].handler({
			type: "ui_prompt_start",
			reason: "ui_prompt",
			kind: "custom",
		});
		expect(pi.events.emit).toHaveBeenCalledWith("herdr:blocked", {
			active: true,
			label: "Waiting for user",
		});
	});
});
