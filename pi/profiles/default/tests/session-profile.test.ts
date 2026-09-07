import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { SessionManager } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js";
import sessionProfile, { SESSION_PROFILE_ENTRY } from "../extensions/session-profile.ts";

afterEach(() => vi.unstubAllEnvs());

describe("session profile logging", () => {
	it("records the active profile once without adding model context", async () => {
		vi.stubEnv("PI_CODING_AGENT_DIR", "C:\\Users\\operator\\.pi\\profiles\\work");
		const sessionManager = SessionManager.inMemory();
		let start: ((event: unknown, ctx: unknown) => void) | undefined;
		const pi = {
			on: (name: string, handler: typeof start) => { if (name === "session_start") start = handler; },
			appendEntry: (type: string, data: unknown) => sessionManager.appendCustomEntry(type, data),
		};
		sessionProfile(pi as unknown as ExtensionAPI);
		const ctx = { sessionManager };
		await start?.({ reason: "startup" }, ctx);
		await start?.({ reason: "reload" }, ctx);

		const entries = sessionManager.getEntries().filter(
			(entry) => entry.type === "custom" && entry.customType === SESSION_PROFILE_ENTRY,
		);
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({ data: { profile: "work" } });
		expect(sessionManager.buildSessionContext().messages).toEqual([]);
	});
});
