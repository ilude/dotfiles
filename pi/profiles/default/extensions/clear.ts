import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isProfileReloadNeeded } from "./operator-footer.ts";

export default function clearCommand(pi: ExtensionAPI): void {
	pi.registerCommand("clear", {
		description: "Alias for /new; reload when needed",
		handler: async (args, ctx) => {
			if (args.trim()) throw new Error("Usage: /clear");
			const reloadNeeded = isProfileReloadNeeded();
			await ctx.newSession({
				withSession: async (ctx) => {
					if (reloadNeeded) await ctx.reload();
				},
			});
		},
	});
}
