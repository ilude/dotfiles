import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { uiNotify } from "../lib/extension-utils.js";

function quoteCliArg(value: string): string {
	return `"${value.replace(/"/g, '\\"')}"`;
}

function buildReconnectCommand(sessionFile: string): string {
	return `pi --session ${quoteCliArg(sessionFile)}`;
}

export default function reconnectHint(pi: ExtensionAPI) {
	pi.on("session_shutdown", async (event, ctx) => {
		if (event.reason !== "quit") return;

		const sessionFile = ctx.sessionManager.getSessionFile();
		if (!sessionFile) return;

		const command = buildReconnectCommand(sessionFile);
		uiNotify(ctx, "info", `Reconnect to this session with:\n${command}`, {
			prefix: "reconnect",
		});
	});
}
