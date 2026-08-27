import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";

export const SLASH_COMMAND_ECHO_TYPE = "slash-echo";

export type SlashCommandEchoKind = "submitted" | "next-command";

export interface SlashCommandEchoEntry {
	kind: SlashCommandEchoKind;
	text: string;
}

export function formatSlashCommand(command: string, args: string): string {
	const trimmedArgs = args.trim();
	return trimmedArgs ? `/${command} ${trimmedArgs}` : `/${command}`;
}

export function registerSlashCommand(pi: ExtensionAPI): ExtensionAPI["registerCommand"] {
	return (command, options) => {
		pi.registerCommand(command, {
			...options,
			handler: async (args, ctx) => {
				appendSlashCommandAcknowledgement(pi, ctx, command, args);
				return options.handler(args, ctx);
			},
		});
	};
}

export function appendSlashCommandAcknowledgement(
	pi: Pick<ExtensionAPI, "appendEntry">,
	ctx: Pick<ExtensionCommandContext, "mode">,
	command: string,
	args: string,
): string {
	const text = formatSlashCommand(command, args);
	if (ctx?.mode === "tui") {
		pi.appendEntry<SlashCommandEchoEntry>(SLASH_COMMAND_ECHO_TYPE, {
			kind: "submitted",
			text,
		});
	}
	return text;
}

export function stripTrailingNextCommand(text: string, command: string): string {
	const escapedCommand = command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const section = new RegExp(
		`\\n\\s*Next command:\\s*\\n\\s*(?:\\x60){3}[^\\r\\n]*\\r?\\n\\s*${escapedCommand}\\s*\\r?\\n\\s*(?:\\x60){3}\\s*$`,
		"i",
	);
	return text.replace(section, "").trimEnd();
}

export function stripTrailingNextCommandContent<T extends { type?: unknown; text?: unknown }>(
	content: T[],
	command: string,
): T[] {
	let lastTextIndex = -1;
	for (let index = content.length - 1; index >= 0; index--) {
		const part = content[index];
		if (part.type === "text" && typeof part.text === "string") {
			lastTextIndex = index;
			break;
		}
	}
	if (lastTextIndex < 0) return content;
	const part = content[lastTextIndex];
	const text = stripTrailingNextCommand(part.text as string, command);
	if (text === part.text) return content;
	return content.map((entry, index) =>
		index === lastTextIndex ? { ...entry, text } : entry,
	);
}

export function appendNextCommand(
	pi: Pick<ExtensionAPI, "appendEntry">,
	ctx: Pick<ExtensionCommandContext, "mode">,
	command: string,
): void {
	if (ctx?.mode === "tui") {
		pi.appendEntry<SlashCommandEchoEntry>(SLASH_COMMAND_ECHO_TYPE, {
			kind: "next-command",
			text: command,
		});
	}
}
