import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { activeProfileName } from "../lib/profile.ts";

export const SESSION_PROFILE_ENTRY = "session-profile";

export default function sessionProfile(pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		const profile = activeProfileName();
		const alreadyRecorded = ctx.sessionManager.getEntries().some(
			(entry) => entry.type === "custom" && entry.customType === SESSION_PROFILE_ENTRY && (entry.data as { profile?: string } | undefined)?.profile === profile,
		);
		if (!alreadyRecorded) pi.appendEntry(SESSION_PROFILE_ENTRY, { profile });
	});
}
