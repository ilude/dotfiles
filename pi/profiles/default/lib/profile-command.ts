import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { yieldForUi } from "./ui-yield.ts";

const MESSAGE_TYPE = "profile-command";
const initialized = new WeakSet<ExtensionAPI>();
type CommandDefinition = Parameters<ExtensionAPI["registerCommand"]>[1];

function initialize(pi: ExtensionAPI): void {
	if (initialized.has(pi)) return;
	initialized.add(pi);
	if (typeof pi.registerMessageRenderer !== "function") return;
	pi.registerMessageRenderer(MESSAGE_TYPE, (message, { outputPad }) =>
		new Text(typeof message.content === "string" ? message.content : "", outputPad, 0));
}

/** Register a profile-owned command with shared acknowledgment UX. */
export function registerProfileCommand(pi: ExtensionAPI, name: string, definition: CommandDefinition): void {
	initialize(pi);
	pi.registerCommand(name, {
		...definition,
		handler: async (args, ctx) => {
			const invocation = args ? `/${name} ${args}` : `/${name}`;
			try {
				if (typeof pi.sendMessage !== "function") ctx.ui.notify(invocation, "info");
				else pi.sendMessage({ customType: MESSAGE_TYPE, content: invocation, display: true });
			} catch (error) {
				// Lightweight extension test loaders can expose registration without
				// initializing action methods. Real command runtimes use sendMessage.
				if (!(error instanceof Error) || !error.message.includes("Extension runtime not initialized")) throw error;
				ctx.ui.notify(invocation, "info");
			}
			await yieldForUi();
			await definition.handler(args, ctx);
		},
	});
}
