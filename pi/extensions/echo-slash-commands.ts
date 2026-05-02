/**
 * Echo Slash Commands Extension
 *
 * Pi executes extension commands before normal input hooks, so an `on("input")`
 * listener cannot see handled slash commands. Wrap `registerCommand` instead:
 * every subsequently registered extension command echoes the raw invocation to
 * the visible transcript immediately before its handler runs.
 */

import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

const ECHO_TYPE = "slash-echo";
const WRAPPED_FLAG = "__slashEchoRegisterCommandWrapped";

function formatInvocation(command: string, args: string) {
	const trimmedArgs = args.trim();
	return trimmedArgs ? `/${command} ${trimmedArgs}` : `/${command}`;
}

function emitEcho(pi: ExtensionAPI, command: string, args: string) {
	if (typeof pi.sendMessage !== "function") return;
	pi.sendMessage({
		customType: ECHO_TYPE,
		content: formatInvocation(command, args),
		display: true,
	});
}

export default function (pi: ExtensionAPI) {
	if (typeof pi.registerMessageRenderer === "function") {
		pi.registerMessageRenderer(ECHO_TYPE, (message, _options, theme) => {
			const text = typeof message.content === "string" ? message.content : String(message.content ?? "");
			return new Text(theme.bold(theme.fg("success", "> ")) + theme.bold(theme.fg("text", text)), 0, 0);
		});
	}

	const target = pi as ExtensionAPI & { [WRAPPED_FLAG]?: boolean };
	if (target[WRAPPED_FLAG] || typeof pi.registerCommand !== "function") return;

	const originalRegisterCommand = pi.registerCommand.bind(pi);
	target[WRAPPED_FLAG] = true;
	pi.registerCommand = ((name: string, command: any) => {
		const originalHandler = command.handler;
		return originalRegisterCommand(name, {
			...command,
			handler: async (args: string, ctx: any) => {
				emitEcho(pi, name, args ?? "");
				return originalHandler(args, ctx);
			},
		});
	}) as typeof pi.registerCommand;
}
