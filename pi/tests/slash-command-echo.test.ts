import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import echoSlashCommands from "../extensions/00-echo-slash-commands";
import {
	SLASH_COMMAND_ECHO_TYPE,
	wrapCommandRegistration,
} from "../lib/slash-command-echo";

type CommandOptions = Parameters<ExtensionAPI["registerCommand"]>[1];

function createExtensionApi() {
	const commands = new Map<string, CommandOptions>();
	const registerCommand = vi.fn((name: string, command: CommandOptions) => {
		commands.set(name, command);
	});
	const registerMessageRenderer = vi.fn();
	const sendMessage = vi.fn();
	const api = {
		registerCommand,
		registerMessageRenderer,
		sendMessage,
	} as unknown as ExtensionAPI;
	return {
		api,
		commands,
		registerCommand,
		registerMessageRenderer,
		sendMessage,
	};
}

async function invoke(
	commands: Map<string, CommandOptions>,
	name: string,
	args: string,
): Promise<void> {
	await commands.get(name)?.handler(args, {} as ExtensionCommandContext);
}

describe("slash command echo registration", () => {
	it("works when the renderer and command owner receive separate APIs", async () => {
		const renderer = createExtensionApi();
		const commandOwner = createExtensionApi();
		const rendererRegisterCommand = renderer.api.registerCommand;
		const handler = vi.fn(async () => {});

		echoSlashCommands(renderer.api);
		wrapCommandRegistration(commandOwner.api);
		commandOwner.api.registerCommand("example", { handler });
		await invoke(commandOwner.commands, "example", "argument");

		expect(renderer.api.registerCommand).toBe(rendererRegisterCommand);
		expect(renderer.registerMessageRenderer).toHaveBeenCalledWith(
			SLASH_COMMAND_ECHO_TYPE,
			expect.any(Function),
		);
		expect(renderer.sendMessage).not.toHaveBeenCalled();
		expect(commandOwner.sendMessage).toHaveBeenCalledTimes(1);
		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("emits one visible raw invocation without triggering a turn", async () => {
		const commandOwner = createExtensionApi();
		const handler = vi.fn(async () => {});
		wrapCommandRegistration(commandOwner.api);
		commandOwner.api.registerCommand("example", { handler });

		await invoke(commandOwner.commands, "example", "  alpha  beta  ");

		expect(commandOwner.sendMessage).toHaveBeenCalledOnce();
		expect(commandOwner.sendMessage).toHaveBeenCalledWith(
			{
				customType: SLASH_COMMAND_ECHO_TYPE,
				content: "/example   alpha  beta  ",
				display: true,
			},
			{ triggerTurn: false },
		);
		expect(handler).toHaveBeenCalledWith("  alpha  beta  ", expect.any(Object));
	});

	it("leaves excluded commands unchanged", async () => {
		const commandOwner = createExtensionApi();
		const handler = vi.fn(async () => {});
		wrapCommandRegistration(commandOwner.api, {
			excludeCommands: ["mature-command"],
		});
		commandOwner.api.registerCommand("mature-command", { handler });

		await invoke(commandOwner.commands, "mature-command", "raw args");

		expect(commandOwner.sendMessage).not.toHaveBeenCalled();
		expect(handler).toHaveBeenCalledTimes(1);
	});
});
