import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Value } from "typebox/value";
import { createMockPi } from "./helpers/mock-pi.js";
import registerBrowserControl from "../extensions/browser-control.js";
import * as control from "../lib/browser-control.js";

const state: control.BrowserSessionState = { sessionId: "input-session", sessionMode: "attached", profileMode: "real", cdpPort: 9222, pid: 42, processStartTime: "start", executablePath: "/brave", userDataDir: "/profile", profileDirectory: "Default", extensionMode: "enabled", comparisonGeneration: 0 };
afterEach(() => vi.restoreAllMocks());
function setup() {
	vi.spyOn(control, "loadBrowserState").mockReturnValue(state);
	const pi = createMockPi(); registerBrowserControl(pi as never);
	return pi._getTool("browser_page")!;
}

describe("registered browser input actions", () => {
	it("dispatches a keyboard chord with its exact frame, focus selector and call timeout", async () => {
		const execute = vi.spyOn(control.BrowserPageProtocol.prototype, "press").mockResolvedValue();
		const tool = setup();
		const input = { action: "press", session_id: state.sessionId, target_id: "page", frame_id: "frame", selector: "#editor", key: "Control+a", timeout_ms: 60_000 };
		expect(Value.Check(tool.parameters, input)).toBe(true);
		const result = await tool.execute("press", input);
		expect(execute).toHaveBeenCalledWith(state, "page", "Control+a", expect.any(AbortSignal), "frame", "#editor", 60_000);
		expect(Value.Check(tool.outputSchema!, result.structuredContent)).toBe(true);
	});
	it("dispatches multiline paste unchanged and supports the focused element", async () => {
		const execute = vi.spyOn(control.BrowserPageProtocol.prototype, "paste").mockResolvedValue();
		const tool = setup(), value = "A\tB\nC\tD";
		const result = await tool.execute("paste", { action: "paste", session_id: state.sessionId, target_id: "page", value });
		expect(execute).toHaveBeenCalledWith(state, "page", value, undefined, undefined, undefined, undefined);
		expect(Value.Check(tool.outputSchema!, result.structuredContent)).toBe(true);
	});
	it("resolves upload paths in the tool context and retains file-input targeting", async () => {
		const execute = vi.spyOn(control.BrowserPageProtocol.prototype, "upload").mockResolvedValue();
		const tool = setup(), cwd = process.cwd();
		const result = await tool.execute("upload", { action: "upload", session_id: state.sessionId, target_id: "page", frame_id: "frame", selector: "#file", files: ["test.txt"] }, undefined, undefined, { cwd } as never);
		expect(execute).toHaveBeenCalledWith(state, "page", "#file", [path.resolve(cwd, "test.txt")], undefined, "frame", undefined);
		expect(Value.Check(tool.outputSchema!, result.structuredContent)).toBe(true);
	});
	it.each(["press", "paste", "upload"])("rejects missing %s arguments before dispatch", async action => {
		const tool = setup();
		await expect(tool.execute(action, { action, session_id: state.sessionId, target_id: "page" })).rejects.toMatchObject({ code: expect.stringMatching(/required/) });
	});
});
