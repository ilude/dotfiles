import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerSessionMessages } from "../extensions/session-profile.ts";
import { createMockPi } from "./helpers/mock-pi.js";
import { analyticsFixture } from "./helpers/analytics-fixture.js";

let fixture: Awaited<ReturnType<typeof analyticsFixture>>;
const projections: string[] = [];

beforeEach(async () => { fixture = await analyticsFixture(); });
afterEach(async () => {
	await Promise.all(projections.splice(0).map(async (file) => fs.rm(path.dirname(file), { recursive: true, force: true })));
	await fixture.dispose();
});

function tool() {
	const pi = createMockPi();
	registerSessionMessages(pi as never, async () => fixture.registry);
	return pi._getTool("session_messages")!;
}

function readResult(result: { details: unknown; content: Array<{ text: string }> }) {
	const details = result.details as { local_path: string };
	projections.push(details.local_path);
	return details;
}

describe("session_messages", () => {
	it("projects user and assistant/model messages without putting the projection in the result", async () => {
		const userText = "user sentinel";
		const thinkingText = "thinking sentinel";
		const assistantText = "assistant sentinel";
		const toolArgument = "tool argument sentinel";
		await fixture.session("default", "messages", [
			{ type: "message", id: "user", message: { role: "user", content: [{ type: "text", text: userText }] } },
			{ type: "message", id: "assistant", message: { role: "assistant", provider: "fixture", content: [
				{ type: "thinking", thinking: thinkingText }, { type: "text", text: assistantText },
				{ type: "toolCall", id: "call", name: "bash", arguments: { command: toolArgument } },
			] } },
			{ type: "message", id: "model", message: { role: "model", content: [{ type: "text", text: "model sentinel" }] } },
			{ type: "message", id: "tool-only", message: { role: "assistant", content: [{ type: "toolCall", id: "only-call", name: "read", arguments: { path: "ignored" } }] } },
			{ type: "message", id: "result", message: { role: "toolResult", content: [{ type: "text", text: "tool result sentinel" }] } },
			{ type: "custom", customType: "metadata", data: { text: "custom sentinel" } },
			{ type: "message", id: "system", message: { role: "system", content: [{ type: "text", text: "system sentinel" }] } },
			"not-json",
		]);

		const result = await tool().execute("call", { session_id: "messages" });
		const details = readResult(result);
		const lines = (await fs.readFile(details.local_path, "utf8")).trim().split("\n").map((line) => JSON.parse(line));

		expect(details).toEqual({ local_path: details.local_path, session_id: "messages", profile: "default", user_messages: 1, assistant_messages: 2 });
		expect(Object.keys(details)).toEqual(["local_path", "session_id", "profile", "user_messages", "assistant_messages"]);
		expect(lines.map((entry) => entry.message.role)).toEqual(["user", "assistant", "model"]);
		expect(lines[1].message.content).toEqual([{ type: "thinking", thinking: thinkingText }, { type: "text", text: assistantText }]);
		expect(JSON.stringify(lines)).not.toContain("toolResult");
		expect(JSON.stringify(lines)).not.toContain("toolCall");
		expect(JSON.stringify(lines)).not.toContain("custom sentinel");
		expect(JSON.stringify(lines)).not.toContain("system sentinel");
		expect(JSON.stringify(lines)).not.toContain("tool-only");
		const returned = result.content[0]?.text ?? "";
		for (const sentinel of [userText, thinkingText, assistantText, toolArgument, "tool result sentinel", "custom sentinel", "system sentinel"]) expect(returned).not.toContain(sentinel);
	});

	it("uses the active profile when omitted and accepts the explicitly selected legacy profile", async () => {
		await fixture.session("default", "same-id");
		await fixture.session("legacy", "legacy-id");
		const registered = tool();
		const active = readResult(await registered.execute("active", { session_id: "same-id" }));
		const legacy = readResult(await registered.execute("legacy", { session_id: "legacy-id", profile: "legacy" }));
		expect(active).toMatchObject({ session_id: "same-id", profile: "default" });
		expect(legacy).toMatchObject({ session_id: "legacy-id", profile: "legacy" });
	});

	it("rejects unknown and ambiguous native IDs and responds to cancellation", async () => {
		await fixture.session("default", "duplicate", [], "a.jsonl");
		await fixture.session("default", "duplicate", [], "b.jsonl");
		const registered = tool();
		await expect(registered.execute("unknown", { session_id: "missing" })).rejects.toThrow("unknown");
		await expect(registered.execute("ambiguous", { session_id: "duplicate" })).rejects.toThrow("ambiguous");
		await expect(registered.execute("cancelled", { session_id: "duplicate" }, AbortSignal.abort())).rejects.toThrow("cancelled");
		await expect(registered.execute("malformed", { session_id: "duplicate", profile: "other" })).rejects.toThrow();
	});
});
