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

	it("keeps passive custom loaders working without masking later prompts", async () => {
		const pi = createMockPi();
		herdrUiPromptState(pi as never);
		const managedUiHandler = pi.events.on.mock.calls.find(
			([event]) => event === "herdr:managed-custom-ui",
		)?.[1];
		expect(managedUiHandler).toBeTypeOf("function");

		managedUiHandler?.({ active: true });
		await pi._getHook("ui_prompt_start")[0].handler({
			type: "ui_prompt_start",
			reason: "ui_prompt",
			kind: "custom",
		});
		await pi._getHook("ui_prompt_end")[0].handler({
			type: "ui_prompt_end",
			reason: "ui_prompt",
			kind: "custom",
		});
		managedUiHandler?.({ active: false });
		expect(pi.events.emit).not.toHaveBeenCalledWith(
			"herdr:blocked",
			expect.anything(),
		);

		await pi._getHook("ui_prompt_start")[0].handler({
			type: "ui_prompt_start",
			reason: "ui_prompt",
			kind: "confirm",
			title: "Continue?",
		});
		expect(pi.events.emit).toHaveBeenLastCalledWith("herdr:blocked", {
			active: true,
			label: "Waiting for user: Continue?",
		});
	});
});
