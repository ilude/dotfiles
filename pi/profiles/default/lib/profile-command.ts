import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { yieldForUi } from "./ui-yield.ts";

const ENTRY_TYPE = "profile-command";
const initialized = new WeakSet<ExtensionAPI>();
type CommandDefinition = Parameters<ExtensionAPI["registerCommand"]>[1];

function initialize(pi: ExtensionAPI): void {
	if (initialized.has(pi)) return;
	initialized.add(pi);
	if (typeof pi.registerEntryRenderer !== "function") return;
	pi.registerEntryRenderer<string>(ENTRY_TYPE, (entry) =>
		new Text(typeof entry.data === "string" ? entry.data : "", 0, 0));
}

/** Register a profile-owned command with shared acknowledgment UX. */
export function registerProfileCommand(pi: ExtensionAPI, name: string, definition: CommandDefinition): void {
	initialize(pi);
	pi.registerCommand(name, {
		...definition,
		handler: async (args, ctx) => {
			const invocation = args ? `/${name} ${args}` : `/${name}`;
			try {
				if (typeof pi.appendEntry !== "function") ctx.ui.notify(invocation, "info");
				else pi.appendEntry(ENTRY_TYPE, invocation);
			} catch (error) {
				// Lightweight extension test loaders can expose registration without
				// initializing action methods. Real command runtimes use appendEntry.
				if (!(error instanceof Error) || !error.message.includes("Extension runtime not initialized")) throw error;
				ctx.ui.notify(invocation, "info");
			}
			await yieldForUi();
			await definition.handler(args, ctx);
		},
	});
}

/** Give an externally owned adapter the profile's command registration UX. */
export function withProfileCommandRegistration(pi: ExtensionAPI): ExtensionAPI {
	const bound = new Map<PropertyKey, unknown>();
	return new Proxy(pi, {
		get(target, property) {
			if (property === "registerCommand") return (name: string, definition: CommandDefinition) => registerProfileCommand(target, name, definition);
			const value = Reflect.get(target, property, target);
			if (typeof value !== "function") return value;
			if (!bound.has(property)) bound.set(property, value.bind(target));
			return bound.get(property);
		},
	});
}
