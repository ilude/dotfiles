import { expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerProfileCommand, withProfileCommandRegistration } from "../lib/profile-command.ts";

it("echoes the exact invocation and yields before dispatching", async () => {
	const commands = new Map<string, { handler: (args: string, ctx: unknown) => Promise<void> }>();
	const sendMessage = vi.fn();
	const handler = vi.fn(async () => {});
	const pi = {
		registerMessageRenderer: vi.fn(),
		registerCommand: (name: string, definition: { handler: (args: string, ctx: unknown) => Promise<void> }) => commands.set(name, definition),
		sendMessage,
	};
	registerProfileCommand(pi as unknown as ExtensionAPI, "example", { description: "Example", handler });

	const pending = commands.get("example")!.handler("one two", { ui: { notify: vi.fn() } });
	expect(sendMessage).toHaveBeenCalledWith({ customType: "profile-command", content: "/example one two", display: true });
	expect(handler).not.toHaveBeenCalled();
	await new Promise<void>((resolve) => setImmediate(resolve));
	expect(handler).toHaveBeenCalledWith("one two", expect.anything());
	await pending;
});

it("wraps commands registered by an external adapter without changing other API methods", async () => {
	const commands = new Map<string, { handler: (args: string, ctx: unknown) => Promise<void> }>();
	const sendMessage = vi.fn();
	const original = {
		registerMessageRenderer: vi.fn(),
		registerCommand: (name: string, definition: { handler: (args: string, ctx: unknown) => Promise<void> }) => commands.set(name, definition),
		registerTool: vi.fn(),
		sendMessage,
	};
	const facade = withProfileCommandRegistration(original as unknown as ExtensionAPI);
	facade.registerTool({ name: "external" } as never);
	facade.registerCommand("external", { handler: async () => {} });

	await commands.get("external")!.handler("status", { ui: { notify: vi.fn() } });
	expect(original.registerTool).toHaveBeenCalledOnce();
	expect(sendMessage).toHaveBeenCalledWith({ customType: "profile-command", content: "/external status", display: true });
});
