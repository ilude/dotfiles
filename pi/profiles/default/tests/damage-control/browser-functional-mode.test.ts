import { describe, expect, it } from "vitest";
import type { ToolCallEvent } from "@earendil-works/pi-coding-agent";
import { harness } from "./fixtures/fake-pi.js";

describe("functionality-first browser tool dispatch", () => {
	it.each([
		["browser_session", { action: "start", profile_mode: "real", profile_alias: "operator" }],
		["browser_page", { action: "open", session_id: "session", url: "file:///tmp/local.html" }],
		["browser_page", { action: "press", session_id: "session", target_id: "page", key: "Control+a" }],
		["browser_page", { action: "paste", session_id: "session", target_id: "page", value: "A\tB\nC\tD" }],
		["browser_page", { action: "upload", session_id: "session", target_id: "page", selector: "#file", files: ["local.txt"] }],
	] as const)("leaves %s action %j to the registered browser executor", async (toolName, input) => {
		const h = await harness();
		const result = await h.gate.handle({ type: "tool_call", toolCallId: "browser-call", toolName, input } as ToolCallEvent, h.ctx);
		expect(result).toBeUndefined();
		expect(h.review).not.toHaveBeenCalled();
		expect(h.select).not.toHaveBeenCalled();
		expect(h.abort).not.toHaveBeenCalled();
	});
	it("does not apply the failed-call watchdog to browser operations", async () => {
		const h = await harness();
		for (let index = 0; index < 15; index++) {
			const toolCallId = `browser-${index}`;
			expect(await h.gate.handle({ type: "tool_call", toolCallId, toolName: "browser_page", input: { action: "snapshot", session_id: "session", target_id: "page" } } as ToolCallEvent, h.ctx)).toBeUndefined();
			await h.emit("tool_result", { toolCallId, isError: true });
		}
		expect(h.abort).not.toHaveBeenCalled();
	});
});
