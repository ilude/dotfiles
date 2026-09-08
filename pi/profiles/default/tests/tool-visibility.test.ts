import { describe, expect, it } from "vitest";
import registerToolVisibility, { DEFERRED_TOOL_NAMES } from "../extensions/tool-visibility";
import { activateTools } from "../lib/tool-activation";
import { createMockPi } from "./helpers/mock-pi";

function register(pi: ReturnType<typeof createMockPi>, name: string) {
	pi.registerTool({ name, description: name, parameters: {}, execute: async () => ({ content: [] }) });
}

describe("deferred tool visibility", () => {
	it("hides exactly the deferred tools at session start and preserves unrelated tools", async () => {
		const pi = createMockPi();
		for (const name of ["read", "browser_page", ...DEFERRED_TOOL_NAMES]) register(pi, name);
		registerToolVisibility(pi as never);
		await pi._getHook("session_start")[0]!.handler({}, {});
		expect(pi.getActiveTools()).toEqual(["read", "browser_page"]);
		expect(DEFERRED_TOOL_NAMES).toEqual(["image_inspect", "image_transform", "log_analytics", "herdr_layout", "herdr_pane"]);
	});

	it("retains activation in a session and resets it in the next session", async () => {
		const pi = createMockPi();
		for (const name of ["read", ...DEFERRED_TOOL_NAMES]) register(pi, name);
		registerToolVisibility(pi as never);
		const start = pi._getHook("session_start")[0]!.handler;
		await start({}, {});
		activateTools(pi as never, DEFERRED_TOOL_NAMES);
		expect(pi.getActiveTools()).toEqual(["read", ...DEFERRED_TOOL_NAMES]);
		expect(pi.getActiveTools()).toEqual(["read", ...DEFERRED_TOOL_NAMES]);
		await start({}, {});
		expect(pi.getActiveTools()).toEqual(["read"]);
	});
});
