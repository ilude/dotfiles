import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import startupCommands from "../extensions/01-startup-commands";

describe("startup command inventory", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("notifies with extension commands without leaving a persistent widget", async () => {
		let sessionStart:
			| ((event: unknown, ctx: unknown) => Promise<void>)
			| undefined;
		const notify = vi.fn();
		const setWidget = vi.fn();
		const getCommands = vi
			.fn()
			.mockReturnValueOnce([
				{ name: "review:1", source: "extension" },
				{ name: "skill:youtube-transcript", source: "skill" },
				{ name: "plan", source: "prompt" },
				{ name: "review", source: "extension" },
			])
			.mockReturnValueOnce([{ name: "reload-added", source: "extension" }]);
		const registerCommand = vi.fn();
		const pi = {
			getCommands,
			registerCommand,
			on: vi.fn((event: string, handler: typeof sessionStart) => {
				if (event === "session_start") sessionStart = handler;
			}),
		};

		startupCommands(pi as unknown as ExtensionAPI);

		expect(pi.registerCommand).toBe(registerCommand);
		expect(sessionStart).toBeDefined();
		await sessionStart?.({ reason: "startup" }, { ui: { notify, setWidget } });
		vi.runAllTimers();
		expect(setWidget).toHaveBeenLastCalledWith("startup-commands", undefined);
		expect(notify).toHaveBeenLastCalledWith(
			"[Commands] /review, /review:1",
			"info",
		);

		await sessionStart?.({ reason: "reload" }, { ui: { notify, setWidget } });
		vi.runAllTimers();
		expect(setWidget).toHaveBeenLastCalledWith("startup-commands", undefined);
		expect(notify).toHaveBeenLastCalledWith("[Commands] /reload-added", "info");
		expect(getCommands).toHaveBeenCalledTimes(2);
	});
});
