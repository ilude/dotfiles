import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const SLASH_COMMAND_ECHO_TYPE = "slash-echo";

export interface SlashCommandEchoOptions {
	excludeCommands?: readonly string[];
}

export function formatSlashCommandInvocation(
	command: string,
	rawArgs: string,
): string {
	return rawArgs.length > 0 ? `/${command} ${rawArgs}` : `/${command}`;
}

export function wrapCommandRegistration(
	pi: ExtensionAPI,
	options: SlashCommandEchoOptions = {},
): void {
	const excludedCommands = new Set(options.excludeCommands ?? []);
	const registerCommand = pi.registerCommand.bind(pi);

	pi.registerCommand = (name, command) => {
		if (excludedCommands.has(name)) {
			registerCommand(name, command);
			return;
		}

		const handler = command.handler;
		registerCommand(name, {
			...command,
			handler: async (args, ctx) => {
				pi.sendMessage(
					{
						customType: SLASH_COMMAND_ECHO_TYPE,
						content: formatSlashCommandInvocation(name, args),
						display: true,
					},
					{ triggerTurn: false },
				);
				await handler(args, ctx);
			},
		});
	};
}
