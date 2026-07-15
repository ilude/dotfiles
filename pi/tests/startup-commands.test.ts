import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import echoSlashCommands from "../extensions/00-echo-slash-commands";
import startupCommands from "../extensions/01-startup-commands";

describe("startup command inventory", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("renders the current extension, prompt, and skill commands on each session start", async () => {
		let sessionStart:
			| ((event: unknown, ctx: unknown) => Promise<void>)
			| undefined;
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
		await sessionStart?.({ reason: "startup" }, { ui: { setWidget } });
		vi.runAllTimers();
		expect(setWidget).toHaveBeenLastCalledWith(
			"startup-commands",
			["[Commands]", "  /plan, /review, /review:1, /skill:youtube-transcript"],
			{ placement: "aboveEditor" },
		);

		await sessionStart?.({ reason: "reload" }, { ui: { setWidget } });
		vi.runAllTimers();
		expect(setWidget).toHaveBeenLastCalledWith(
			"startup-commands",
			["[Commands]", "  /reload-added"],
			{ placement: "aboveEditor" },
		);
		expect(getCommands).toHaveBeenCalledTimes(2);
	});

	it("does not add another command wrapper or duplicate slash echoes", async () => {
		const commands = new Map<
			string,
			{ handler: (args: string, ctx: unknown) => Promise<void> }
		>();
		const sendMessage = vi.fn();
		const handler = vi.fn(async () => {});
		const pi = {
			getCommands: vi.fn(() => []),
			on: vi.fn(),
			registerCommand: vi.fn(
				(
					name: string,
					command: { handler: (args: string, ctx: unknown) => Promise<void> },
				) => {
					commands.set(name, command);
				},
			),
			registerMessageRenderer: vi.fn(),
			sendMessage,
		};
		const extensionApi = pi as unknown as ExtensionAPI;

		echoSlashCommands(extensionApi);
		const echoRegisterCommand = pi.registerCommand;
		startupCommands(extensionApi);
		expect(pi.registerCommand).toBe(echoRegisterCommand);

		extensionApi.registerCommand("example", { handler });
		await commands.get("example")?.handler("argument", {});

		expect(handler).toHaveBeenCalledTimes(1);
		expect(sendMessage).toHaveBeenCalledTimes(1);
		expect(sendMessage).toHaveBeenCalledWith({
			customType: "slash-echo",
			content: "/example argument",
			display: true,
		});
	});
});
