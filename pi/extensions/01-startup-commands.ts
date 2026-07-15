import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function formatCommandList(commandNames: string[]): string[] {
	if (commandNames.length === 0) return [];
	return ["[Commands]", `  ${commandNames.join(", ")}`];
}

export default function registerStartupCommandsExtension(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		setTimeout(() => {
			const names = pi
				.getCommands()
				.map((command) => `/${command.name}`)
				.sort((a, b) => a.localeCompare(b));
			ctx.ui.setWidget("startup-commands", formatCommandList(names), {
				placement: "aboveEditor",
			});
		}, 0);
	});
}
