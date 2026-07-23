import { describe, expect, it } from "vitest";
import toolVisibility, {
	DEFERRED_TOOL_NAMES,
} from "../extensions/tool-visibility.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

describe("tool visibility", () => {
	it("removes niche tools from the default session tool set", async () => {
		const pi = createMockPi();
		for (const name of ["read", "task", ...DEFERRED_TOOL_NAMES]) {
			pi.registerTool({
				name,
				description: name,
				parameters: {},
				execute: async () => ({ content: [] }),
			});
		}
		toolVisibility(pi as Parameters<typeof toolVisibility>[0]);

		await pi._getHook("session_start")[0].handler({}, createMockCtx());

		expect(pi.getActiveTools()).toEqual(["read", "task"]);
	});
});
