import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { uiNotify } from "../lib/extension-utils";

export default function registerStartupCommandsExtension(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.setWidget("startup-commands", undefined);
		setTimeout(() => {
			const names = pi
				.getCommands()
				.filter((command) => command.source === "extension")
				.map((command) => `/${command.name}`)
				.sort((a, b) => a.localeCompare(b));
			if (names.length > 0) {
				uiNotify(ctx, "info", names.join(", "), { prefix: "Commands" });
			}
		}, 0);
	});
}
