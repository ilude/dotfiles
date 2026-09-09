import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { requestReloadState } from "../lib/profile-reload-events.ts";
import { requestSubagentRuntimeReset } from "../lib/subagents/runtime.ts";

export default function clearCommand(pi: ExtensionAPI): void {
	pi.registerCommand("clear", {
		description: "Alias for /new; reload when needed",
		handler: async (args, ctx) => {
			if (args.trim()) throw new Error("Usage: /clear");
			const state = requestReloadState(pi);
			if (!state) ctx.ui.notify("Reload monitoring unavailable; starting a new session without automatic reload.", "warning");
			const reloadNeeded = Boolean(state?.needed && !state.error);
			try {
				await requestSubagentRuntimeReset(pi);
			} catch (error) {
				ctx.ui.notify(`Cannot clear while subagent cleanup is unresolved: ${error instanceof Error ? error.message : String(error)}`, "error");
				return;
			}
			await ctx.newSession({
				withSession: async (ctx) => {
					if (reloadNeeded) await ctx.reload();
				},
			});
		},
	});
}
