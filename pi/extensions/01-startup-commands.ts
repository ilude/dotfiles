import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const WRAPPED_FLAG = "__startupCommandsRegisterCommandWrapped";

function formatCommandList(commandNames: string[]): string[] {
	if (commandNames.length === 0) return [];
	return ["[Commands]", `  ${commandNames.join(", ")}`];
}

export default function registerStartupCommandsExtension(pi: ExtensionAPI) {
	const commandNames = new Set<string>();
	const target = pi as ExtensionAPI & { [WRAPPED_FLAG]?: boolean };

	if (!target[WRAPPED_FLAG] && typeof pi.registerCommand === "function") {
		const originalRegisterCommand = pi.registerCommand.bind(pi);
		target[WRAPPED_FLAG] = true;
		pi.registerCommand = ((name: string, command: Parameters<ExtensionAPI["registerCommand"]>[1]) => {
			commandNames.add(`/${name}`);
			return originalRegisterCommand(name, command);
		}) as typeof pi.registerCommand;
	}

	pi.on("session_start", async (_event, ctx) => {
		setTimeout(() => {
			const names = Array.from(commandNames).sort((a, b) => a.localeCompare(b));
			ctx.ui.setWidget("startup-commands", formatCommandList(names), {
				placement: "aboveEditor",
			});
		}, 0);
	});
}
