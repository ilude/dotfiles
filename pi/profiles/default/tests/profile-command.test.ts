import { expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerProfileCommand, withProfileCommandRegistration } from "../lib/profile-command.ts";

it("records the exact invocation outside model context and yields before dispatching", async () => {
	const commands = new Map<string, { handler: (args: string, ctx: unknown) => Promise<void> }>();
	const appendEntry = vi.fn();
	const sendMessage = vi.fn();
	const handler = vi.fn(async () => {});
	const pi = {
		registerEntryRenderer: vi.fn(),
		registerCommand: (name: string, definition: { handler: (args: string, ctx: unknown) => Promise<void> }) => commands.set(name, definition),
		appendEntry,
		sendMessage,
	};
	registerProfileCommand(pi as unknown as ExtensionAPI, "example", { description: "Example", handler });

	const pending = commands.get("example")!.handler("one two", { ui: { notify: vi.fn() } });
	expect(appendEntry).toHaveBeenCalledWith("profile-command", "/example one two");
	expect(sendMessage).not.toHaveBeenCalled();
	expect(handler).not.toHaveBeenCalled();
	await new Promise<void>((resolve) => setImmediate(resolve));
	expect(handler).toHaveBeenCalledWith("one two", expect.anything());
	await pending;
});

it("wraps commands registered by an external adapter without changing other API methods", async () => {
	const commands = new Map<string, { handler: (args: string, ctx: unknown) => Promise<void> }>();
	const appendEntry = vi.fn();
	const original = {
		registerEntryRenderer: vi.fn(),
		registerCommand: (name: string, definition: { handler: (args: string, ctx: unknown) => Promise<void> }) => commands.set(name, definition),
		registerTool: vi.fn(),
		appendEntry,
	};
	const facade = withProfileCommandRegistration(original as unknown as ExtensionAPI);
	facade.registerTool({ name: "external" } as never);
	facade.registerCommand("external", { handler: async () => {} });

	await commands.get("external")!.handler("status", { ui: { notify: vi.fn() } });
	expect(original.registerTool).toHaveBeenCalledOnce();
	expect(appendEntry).toHaveBeenCalledWith("profile-command", "/external status");
});
