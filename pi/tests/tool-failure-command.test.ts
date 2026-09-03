import { describe, expect, it, vi } from "vitest";
import toolFailureTriageExtension, { buildFindFailsInvestigationPrompt } from "../extensions/tool-failure-triage.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.js";

function handler(pi: ReturnType<typeof createMockPi>) {
	const command = pi._commands.find((item) => item.name === "find-fails");
	if (!command) throw new Error("find-fails command not registered");
	return command.handler;
}

describe("find-fails investigation command", () => {
	it("builds a deterministic seven-day investigation window", () => {
		const prompt = buildFindFailsInvestigationPrompt(new Date("2026-08-27T12:00:00.000Z"));
		expect(prompt).toContain("Window: 2026-08-20T12:00:00.000Z through 2026-08-27T12:00:00.000Z.");
		expect(prompt).toContain("Group failures into recurring families");
		expect(prompt).toContain("separate totals for expected command nonzero results, actionable failures, expected non-command outcomes, and unclassified failures");
		expect(prompt).toContain("Do not modify files");
		expect(prompt).not.toContain("tool_failure_inspect");
		expect(prompt).not.toContain("tool_failure_decide");
	});

	it("echoes the submitted command into the TUI transcript", async () => {
		const pi = createMockPi(); const ctx = createMockCtx({ mode: "tui" }); toolFailureTriageExtension(pi as never);
		await handler(pi)("", ctx);
		expect(pi.appendEntry).toHaveBeenCalledWith("slash-echo", { kind: "submitted", text: "/find-fails" });
	});

	it("starts one ordinary investigation turn without changing active tools", async () => {
		vi.useFakeTimers();
		const now = new Date("2026-08-27T12:00:00.000Z");
		vi.setSystemTime(now);
		try {
			const pi = createMockPi();
			pi.registerTool({ name: "read", description: "read", parameters: {}, execute: vi.fn() });
			pi.registerTool({ name: "log_analytics", description: "logs", parameters: {}, execute: vi.fn() });
			const activeBefore = pi.getActiveTools();
			const ctx = createMockCtx(); toolFailureTriageExtension(pi as never);
			await handler(pi)("", ctx);
			expect(pi.sendUserMessage).toHaveBeenCalledExactlyOnceWith(buildFindFailsInvestigationPrompt(now));
			expect(pi.getActiveTools()).toEqual(activeBefore);
			expect(pi._getTool("tool_failure_inspect")).toBeUndefined();
			expect(pi._getTool("tool_failure_decide")).toBeUndefined();
			expect(ctx.ui.notify).toHaveBeenCalledWith("Investigating recent tool failures...", "info");
		} finally {
			vi.useRealTimers();
		}
	});

	it("rejects arguments without starting a turn", async () => {
		const pi = createMockPi(); const ctx = createMockCtx(); toolFailureTriageExtension(pi as never);
		await handler(pi)("30", ctx);
		expect(pi.sendUserMessage).not.toHaveBeenCalled();
		expect(ctx.ui.notify).toHaveBeenCalledWith("Usage: /find-fails", "warning");
	});
});
