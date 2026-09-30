import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { SessionManager } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js";
import { Check } from "typebox/value";
import { piSessionOutputSchema, sessionMessagesOutputSchema } from "../extensions/session-profile.ts";
import sessionProfile, { SESSION_PROFILE_ENTRY } from "../extensions/session-profile.ts";

afterEach(() => vi.unstubAllEnvs());

describe("session profile logging", () => {
	function setup() {
		const sessionManager = SessionManager.inMemory();
		let start: ((event: unknown, ctx: unknown) => void) | undefined;
		let tool: Record<string, unknown> | undefined;
		const pi = {
			on: (name: string, handler: typeof start) => { if (name === "session_start") start = handler; },
			appendEntry: (type: string, data: unknown) => sessionManager.appendCustomEntry(type, data),
			registerTool: (definition: Record<string, unknown>) => { tool = definition; },
		};
		sessionProfile(pi as unknown as ExtensionAPI);
		return { sessionManager, start, tool };
	}

	it("records the active profile once without adding model context", async () => {
		vi.stubEnv("PI_CODING_AGENT_DIR", "C:\\Users\\operator\\.pi\\profiles\\work");
		const { sessionManager, start } = setup();
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

	it("reports only the current session ID and profile", async () => {
		vi.stubEnv("PI_CODING_AGENT_DIR", "C:\\Users\\operator\\.pi\\profiles\\work");
		const { sessionManager, tool } = setup();
		expect(tool).toMatchObject({
			name: "pi_session",
			parameters: { type: "object", properties: {}, additionalProperties: false },
		});

		const execute = tool?.execute as ((...args: unknown[]) => Promise<{ content: Array<{ text: string }>; details: unknown; structuredContent?: unknown }>) | undefined;
		const result = await execute?.("call", {}, undefined, undefined, { sessionManager });
		const expected = { session_id: sessionManager.getSessionId(), profile: "work" };
		expect(result?.details).toEqual(expected);
		expect(Check(piSessionOutputSchema, result?.structuredContent)).toBe(true);
		expect(Check(sessionMessagesOutputSchema, { local_path: "/tmp/messages.jsonl", session_id: expected.session_id, profile: "work", user_messages: 1, assistant_messages: 2 })).toBe(true);
		expect(JSON.parse(result?.content[0]?.text ?? "null")).toEqual(expected);
		expect(Object.keys(result?.details as object)).toEqual(["session_id", "profile"]);
		const theme = { fg: (_color: string, value: string) => value, bold: (value: string) => value };
		const renderResult = tool?.renderResult as ((result: unknown, options: unknown, theme: unknown) => { render(width: number): string[] }) | undefined;
		expect(renderResult?.(result, { expanded: false }, theme).render(80).join("\n").trimEnd()).toBe("profile · work");
		expect(renderResult?.(result, { expanded: true }, theme).render(200).join("\n")).toContain(expected.session_id);
		expect(sessionManager.getEntries()).toEqual([]);
	});
});
