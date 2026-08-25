import { describe, expect, it } from "vitest";
import {
	DIAGNOSTIC_DECISION_TOOL_NAME,
	DIAGNOSTIC_INSPECTION_TOOL_NAME,
	registerDiagnosticTurnLifecycle,
	startDiagnosticTurn,
} from "../lib/tool-failure-diagnostic-turn.ts";
import { createMockPi } from "./helpers/mock-pi.ts";

function register(pi: ReturnType<typeof createMockPi>, names: string[]): void {
	for (const name of names)
		pi.registerTool({ name, description: name, parameters: {}, execute: async () => ({ content: [] }) });
}

describe("tool-failure diagnostic turn authority", () => {
	it("allows only bounded inspection and recomputes desired tools on settlement", () => {
		const pi = createMockPi();
		register(pi, ["read", "edit", DIAGNOSTIC_INSPECTION_TOOL_NAME, DIAGNOSTIC_DECISION_TOOL_NAME, "later"]);
		const turn = startDiagnosticTurn(pi, "session-1");
		expect(pi.getActiveTools()).toEqual([DIAGNOSTIC_INSPECTION_TOOL_NAME, DIAGNOSTIC_DECISION_TOOL_NAME]);
		pi.setActiveTools(["read", DIAGNOSTIC_INSPECTION_TOOL_NAME]);
		turn.settle();
		expect(pi.getActiveTools()).toEqual(["read", "edit", DIAGNOSTIC_INSPECTION_TOOL_NAME, DIAGNOSTIC_DECISION_TOOL_NAME, "later"]);
	});

	it("removes ownership on cancellation and session transition without restoring a snapshot", () => {
		const pi = createMockPi();
		register(pi, ["read", "edit", DIAGNOSTIC_INSPECTION_TOOL_NAME, DIAGNOSTIC_DECISION_TOOL_NAME]);
		registerDiagnosticTurnLifecycle(pi);
		const turn = startDiagnosticTurn(pi, "session-2");
		pi.setActiveTools(["edit", DIAGNOSTIC_INSPECTION_TOOL_NAME]);
		pi._getHook("session_before_switch")[0].handler();
		expect(pi.getActiveTools()).toEqual(["read", "edit", DIAGNOSTIC_INSPECTION_TOOL_NAME, DIAGNOSTIC_DECISION_TOOL_NAME]);
		turn.settle();
		expect(() => startDiagnosticTurn(pi, "session-3")).not.toThrow();
	});
});
