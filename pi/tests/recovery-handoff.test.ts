import { describe, expect, it, vi } from "vitest";
import {
	buildRecoverableLocalFailureHandoff,
	handoffRecoverableLocalFailure,
} from "../lib/recovery-handoff.js";

describe("recoverable local failure handoff", () => {
	it("bounds and redacts recovery context without changing safety authority", () => {
		const prompt = buildRecoverableLocalFailureHandoff({
			command: "/commit push",
			failure: `Authorization: Bearer ${"x".repeat(80)} ${"failure ".repeat(400)}`,
			cwd: "C:/repo",
		});
		expect(prompt).toContain("[REDACTED]");
		expect(prompt.length).toBeLessThan(2_000);
	});

	it("does not hand off cancellation, safety, or credential failures", () => {
		const pi = { sendMessage: vi.fn() };
		for (const failure of [
			"Operation cancelled",
			"This operation was aborted",
			"safety block",
			"credential unavailable",
		]) {
			expect(handoffRecoverableLocalFailure(pi as never, {
				command: "/commit",
				failure,
			})).toBe(false);
		}
		expect(pi.sendMessage).not.toHaveBeenCalled();
	});

	it("hands off a recoverable local failure as one follow-up context message", () => {
		const pi = { sendMessage: vi.fn() };
		expect(handoffRecoverableLocalFailure(pi as never, {
			command: "/find-fails",
			failure: "snapshot failed",
		})).toBe(true);
		expect(pi.sendMessage).toHaveBeenCalledOnce();
		expect(pi.sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({ customType: "workflow.recoverable-local-failure" }),
		{ triggerTurn: true, deliverAs: "followUp" },
	);
	});
});
