import { expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerProfileCommand } from "../lib/profile-command.ts";

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
