import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type, type Static } from "typebox";
import { Check } from "typebox/value";
import { activeProfileName } from "../lib/profile.ts";
import { createSessionMessages, type SessionMessagesInput } from "../lib/session-messages.ts";
import { PROFILE_IDS, runtimeProfiles, type ProfileRegistry } from "../lib/log-analytics/profiles.ts";

export const SESSION_PROFILE_ENTRY = "session-profile";
export const sessionMessagesSchema = Type.Object({
	session_id: Type.String({ minLength: 1, maxLength: 256, description: "Native Pi sessionId, including the sessionId returned for a subagent. Do not use subagentId here." }),
	profile: Type.Optional(StringEnum(PROFILE_IDS)),
}, { additionalProperties: false });
export type SessionMessagesToolInput = Static<typeof sessionMessagesSchema>;

/** Register the history projection separately so tests and offline callers can inject the profile registry. */
export function registerSessionMessages(
	pi: ExtensionAPI,
	resolveProfiles: () => Promise<ProfileRegistry> = runtimeProfiles,
): void {
	pi.registerTool({
		name: "session_messages",
		label: "Session Messages",
		description: "Project one registered Pi session to an extension-owned temporary JSONL file containing user and assistant/model messages only. session_id is the native Pi sessionId, not a subagentId. Omit profile to use the active registered profile. Malformed body lines are skipped; the operation is cancellable.",
		parameters: sessionMessagesSchema,
		async execute(_id, params, signal) {
			if (!Check(sessionMessagesSchema, params)) throw new Error("invalid session_messages arguments");
			const result = await createSessionMessages(await resolveProfiles(), params as SessionMessagesInput, signal);
			return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
		},
	});
}

export default function sessionProfile(pi: ExtensionAPI): void {
	registerSessionMessages(pi);
	pi.registerTool({
		name: "pi_session",
		label: "Pi Session",
		description: "Return the current Pi session ID and active profile.",
		promptSnippet: "Report the current Pi session ID and active profile",
		parameters: Type.Object({}, { additionalProperties: false }),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const result = {
				session_id: ctx.sessionManager.getSessionId(),
				profile: activeProfileName(),
			};
			return {
				content: [{ type: "text", text: JSON.stringify(result) }],
				details: result,
			};
		},
	});

	pi.on("session_start", (_event, ctx) => {
		const profile = activeProfileName();
		const alreadyRecorded = ctx.sessionManager.getEntries().some(
			(entry) => entry.type === "custom" && entry.customType === SESSION_PROFILE_ENTRY && (entry.data as { profile?: string } | undefined)?.profile === profile,
		);
		if (!alreadyRecorded) pi.appendEntry(SESSION_PROFILE_ENTRY, { profile });
	});
}
