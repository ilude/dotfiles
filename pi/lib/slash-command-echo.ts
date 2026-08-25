import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";

export const SLASH_COMMAND_ECHO_TYPE = "slash-echo";

export interface SlashCommandEchoEntry {
	text: string;
}

export function formatSlashCommand(command: string, args: string): string {
	const trimmedArgs = args.trim();
	return trimmedArgs ? `/${command} ${trimmedArgs}` : `/${command}`;
}

export function appendSlashCommandAcknowledgement(
	pi: Pick<ExtensionAPI, "appendEntry">,
	ctx: Pick<ExtensionCommandContext, "mode">,
	command: string,
	args: string,
): string {
	const text = formatSlashCommand(command, args);
	if (ctx.mode === "tui") {
		pi.appendEntry<SlashCommandEchoEntry>(SLASH_COMMAND_ECHO_TYPE, { text });
	}
	return text;
}
