import { randomUUID } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerProfileCommand } from "../lib/profile-command.ts";

/** RPC-callable equivalent of Pi's terminal /reload, without replacing the session. */
export default function runtimeReload(pi: ExtensionAPI): void {
	const generation = randomUUID();
	pi.on("session_start", (event, ctx) => {
		pi.appendEntry("runtime-reload", {
			event: "start", reason: event.reason, generation,
			pid: process.pid, sessionId: ctx.sessionManager.getSessionId(),
		});
		if (event.reason === "reload") ctx.ui.notify("Pi resources reloaded in place.", "info");
	});
	pi.on("session_shutdown", (event, ctx) => {
		if (event.reason !== "reload") return;
		pi.appendEntry("runtime-reload", {
			event: "shutdown", reason: event.reason, generation,
			pid: process.pid, sessionId: ctx.sessionManager.getSessionId(),
		});
	});
	registerProfileCommand(pi, "reload-runtime", {
		description: "Reload Pi resources in place; use only after subagents have settled",
		handler: async (args, ctx) => {
			if (args.trim()) throw new Error("Usage: /reload-runtime");
			await ctx.waitForIdle();
			await ctx.reload();
			return;
		},
	});
}
