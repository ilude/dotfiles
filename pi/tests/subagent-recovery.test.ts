import { describe, expect, it } from "vitest";
import {
	assertInterruptedRecoverySucceeded,
	executeInterruptedRecovery,
	INTERRUPTED_TOOL_RECOVERY_MESSAGE,
	prepareInterruptedRecovery,
} from "../extensions/subagent/recovery.ts";
import type { SubagentRunSnapshot } from "../extensions/subagent/run-manager.ts";

function liveRun(
	overrides: Partial<SubagentRunSnapshot> = {},
): SubagentRunSnapshot {
	return {
		runId: "run-1",
		parentSessionId: "root-session",
		owner: "direct",
		mode: "single",
		agent: "builder",
		task: "work",
		cwd: "/workspace/child",
		workspaceId: "/workspace",
		authorityTools: ["read", "grep"],
		background: false,
		status: "running",
		pid: 123,
		startedAt: 1,
		lastActivityAt: 10,
		lastActivityKind: "tool-started",
		activityVersion: 4,
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			contextPeakTokens: 0,
			turns: 0,
			cost: null,
		},
		transcript: [],
		liveText: "",
		liveTools: [{ id: "tool-1", name: "find", startedAt: 10 }],
		finalText: "",
		...overrides,
	};
}

const request = {
	runId: "run-1",
	toolCallId: "tool-1",
	activityVersion: 4,
	parentSessionId: "root-session",
} as const;

describe("subagent interrupted-tool recovery", () => {
	it("requires an exact fresh parent-owned active tool and persisted session", () => {
		expect(
			prepareInterruptedRecovery(liveRun(), request, () => "/sessions/run-1.jsonl"),
		).toMatchObject({
			sessionPath: "/sessions/run-1.jsonl",
			toolCallId: "tool-1",
			workspaceRoot: "/workspace",
			authorityTools: ["read", "grep"],
			recoveryMessage: INTERRUPTED_TOOL_RECOVERY_MESSAGE,
		});
		expect(() =>
			prepareInterruptedRecovery(
				liveRun({ activityVersion: 5 }),
				request,
				() => "/sessions/run-1.jsonl",
			),
		).toThrow("Stale interruption request");
		expect(() =>
			prepareInterruptedRecovery(
				liveRun({ parentSessionId: "sibling" }),
				request,
				() => "/sessions/run-1.jsonl",
			),
		).toThrow("another root session");
		expect(() =>
			prepareInterruptedRecovery(
				liveRun(),
				{ ...request, toolCallId: "wrong-tool" },
				() => "/sessions/run-1.jsonl",
			),
		).toThrow("not active");
		expect(() =>
			prepareInterruptedRecovery(liveRun(), request, () => undefined),
		).toThrow("no persisted child session");
	});

	it("settles before resuming the persisted session and never resumes after failure", async () => {
		const prepared = prepareInterruptedRecovery(
			liveRun(),
			request,
			() => "/sessions/run-1.jsonl",
		);
		const calls: string[] = [];
		await expect(
			executeInterruptedRecovery(prepared, {
				terminate: async () => {
					calls.push("terminate");
					return true;
				},
				waitForSettlement: async () => {
					calls.push("settle");
					return true;
				},
				resume: async (recovery) => {
					calls.push("resume");
					return recovery.sessionPath;
				},
			}),
		).resolves.toBe("/sessions/run-1.jsonl");
		expect(calls).toEqual(["terminate", "settle", "resume"]);

		calls.length = 0;
		await expect(
			executeInterruptedRecovery(prepared, {
				terminate: async () => {
					calls.push("terminate");
					return true;
				},
				waitForSettlement: async () => {
					calls.push("settle");
					return false;
				},
				resume: async () => {
					calls.push("resume");
					return "unexpected";
				},
			}),
		).rejects.toThrow("did not settle");
		expect(calls).toEqual(["terminate", "settle"]);
	});

	it("does not acknowledge a failed replacement", () => {
		expect(() => assertInterruptedRecoverySucceeded(false)).toThrow(
			"replacement work failed",
		);
		expect(() => assertInterruptedRecoverySucceeded(true)).not.toThrow();
	});

	it("marks interrupted output and side effects unknown", () => {
		expect(INTERRUPTED_TOOL_RECOVERY_MESSAGE).toContain(
			"output and side effects are unknown",
		);
		expect(INTERRUPTED_TOOL_RECOVERY_MESSAGE).toContain(
			"last durable session context",
		);
	});
});
