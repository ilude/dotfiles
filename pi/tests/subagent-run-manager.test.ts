import { visibleWidth } from "@earendil-works/pi-tui";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
	MAX_ACTIVE_SUBAGENT_RUNS,
	MAX_SUBAGENT_LIVE_TOOLS,
	MAX_SUBAGENT_TRANSCRIPT_BYTES,
	MAX_SUBAGENT_TRANSCRIPT_ITEMS,
	MAX_TRACKED_SUBAGENT_RUNS,
	SUBAGENT_RUN_MANAGER_ABI,
	SubagentRunManager,
	getSubagentRunManager,
	type SubagentExecutionFingerprint,
	type TeamLeadContinuationIdentity,
} from "../extensions/subagent/run-manager.ts";
import {
	inspectSubagentStatus,
	formatSubagentStatus,
} from "../extensions/subagent/status.ts";
import {
	formatSubagentActivityStatus,
	openSubagentDashboard,
	reconcileSubagentDashboardSelection,
	type SubagentDashboardSelection,
} from "../extensions/subagent/ui.ts";

const TEAMLEAD_FINGERPRINT: SubagentExecutionFingerprint = {
	agent: "teamlead",
	skills: ["typescript"],
	role: "coordinator",
	depth: 1,
	model: "openai-codex/gpt-5.6-sol",
	effort: "low",
	authorityTools: ["subagent_read"],
};

function teamLeadIdentity(
	overrides: Partial<TeamLeadContinuationIdentity> = {},
): TeamLeadContinuationIdentity {
	return {
		parentSessionId: "root-session",
		workspaceId: process.cwd(),
		taskId: "task-1",
		fingerprint: TEAMLEAD_FINGERPRINT,
		...overrides,
	};
}

function beginRun(
	manager: SubagentRunManager,
	runId: string,
	controller = new AbortController(),
): AbortController {
	manager.begin(
		{
			runId,
			owner: "direct",
			mode: "single",
			agent: "tester",
			task: `run ${runId}`,
			cwd: "/tmp/project",
		},
		controller,
	);
	return controller;
}

describe("SubagentRunManager", () => {
	it("reuses compatible state and handles incompatible reloads safely", () => {
		const key = Symbol.for("dotfiles.pi.subagent-run-manager");
		const globals = globalThis as typeof globalThis & Record<symbol, unknown>;
		const original = globals[key];
		try {
			const compatible = new SubagentRunManager();
			globals[key] = { abi: SUBAGENT_RUN_MANAGER_ABI, manager: compatible };
			expect(getSubagentRunManager()).toBe(compatible);

			const incompatibleQuiescent = new SubagentRunManager();
			globals[key] = { abi: "old", manager: incompatibleQuiescent };
			const replacement = getSubagentRunManager();
			expect(replacement).not.toBe(incompatibleQuiescent);

			const live = new SubagentRunManager();
			beginRun(live, "reload-live");
			globals[key] = { abi: "old", manager: live };
			expect(() => getSubagentRunManager()).toThrow(
				"incompatible subagent run manager",
			);
		} finally {
			if (original === undefined) delete globals[key];
			else globals[key] = original;
		}
	});

	it("owns recursive cancellation and exposes linked tree metadata", () => {
		const manager = new SubagentRunManager();
		const controller = new AbortController();
		const childController = new AbortController();
		const listener = vi.fn();
		manager.subscribe(listener);
		manager.begin(
			{
				correlation: {
					runtime_instance_id: "runtime-test",
					session_id: "session-parent",
					trace_id: "trace-parent",
					orchestration_id: "orchestration-1",
					run_id: "run-1",
					task_id: "task-1",
				},
				runId: "run-1",
				taskId: "task-1",
				orchestrationId: "orchestration-1",
				treeId: "tree-1",
				role: "coordinator",
				depth: 1,
				taskKey: "map-item",
				attempt: 1,
				owner: "task",
				mode: "task-execute",
				agent: "tester",
				task: "Inspect",
				cwd: "/tmp/project",
				model: "provider/model",
			},
			controller,
		);

		manager.begin(
			{
				correlation: {
					runtime_instance_id: "runtime-test",
					session_id: "session-parent",
					trace_id: "trace-parent",
					orchestration_id: "orchestration-1",
					run_id: "run-2",
				},
				runId: "run-2",
				treeId: "tree-1",
				parentRunId: "run-1",
				role: "leaf",
				depth: 2,
				owner: "direct",
				mode: "single",
				agent: "tester",
				task: "Inspect child",
				cwd: "/tmp/project",
			},
			childController,
		);

		expect(manager.get("run-1")).toMatchObject({
			correlation: {
				runtime_instance_id: "runtime-test",
				session_id: "session-parent",
				trace_id: "trace-parent",
				orchestration_id: "orchestration-1",
				run_id: "run-1",
				task_id: "task-1",
			},
			taskId: "task-1",
			treeId: "tree-1",
			role: "coordinator",
			depth: 1,
			owner: "task",
			status: "running",
		});
		expect(manager.cancelTree("run-1")).toEqual(["run-1", "run-2"]);
		expect(controller.signal.aborted).toBe(true);
		expect(childController.signal.aborted).toBe(true);
		expect(listener).toHaveBeenCalled();
	});

	it("records local-display timing inputs for run activity", () => {
		const now = vi.spyOn(Date, "now");
		try {
			now.mockReturnValue(1_000);
			const manager = new SubagentRunManager();
			beginRun(manager, "timed");
			now.mockReturnValue(1_500);
			manager.registerProcess("timed", 123);
			now.mockReturnValue(2_000);
			manager.appendMessage("timed", {
				role: "assistant",
				content: [{ type: "text", text: "working" }],
			} as never);
			now.mockReturnValue(3_000);
			manager.startTool("timed", { id: "tool-1", name: "read" });
			now.mockReturnValue(4_000);
			manager.setLiveText("timed", "streaming");

			expect(manager.get("timed")).toMatchObject({
				pid: 123,
				startedAt: 1_000,
				transcript: [{ timestamp: 2_000, text: "working" }],
				liveTools: [{ id: "tool-1", startedAt: 3_000 }],
				liveTextUpdatedAt: 4_000,
				lastActivityAt: 4_000,
				lastActivityKind: "output",
				activityVersion: 4,
			});
		} finally {
			now.mockRestore();
		}
	});

	it("reports process liveness and progress against a prior activity version", () => {
		const manager = new SubagentRunManager();
		beginRun(manager, "status");
		manager.registerProcess("status", 123);
		manager.appendMessage("status", {
			role: "assistant",
			content: [{ type: "text", text: "progress" }],
		} as never);
		const run = manager.get("status");
		if (!run) throw new Error("status run missing");

		const progressed = inspectSubagentStatus(run, {
			now: run.lastActivityAt + 5_000,
			sinceActivityVersion: 1,
			isProcessAlive: () => true,
		});
		expect(progressed).toMatchObject({
			processState: "alive",
			processAlive: true,
			progressedSince: true,
			activityVersion: 2,
			quietForMs: 5_000,
		});
		expect(formatSubagentStatus(progressed)).toContain(
			"emitted new observable activity",
		);

		const quiet = inspectSubagentStatus(run, {
			now: run.lastActivityAt + 10_000,
			sinceActivityVersion: run.activityVersion,
			isProcessAlive: () => true,
		});
		expect(quiet.progressedSince).toBe(false);
		expect(formatSubagentStatus(quiet)).toContain(
			"may still be waiting on a provider",
		);

		const exited = inspectSubagentStatus(run, {
			isProcessAlive: () => false,
		});
		expect(exited.processState).toBe("exited-unsettled");
	});

	it("classifies responsive quiet, stalled-tool, unresponsive runtime, and dead process states", () => {
		const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
		try {
			const manager = new SubagentRunManager();
			beginRun(manager, "watchdog");
			manager.registerProcess("watchdog", 123);
			now.mockReturnValue(10_000);
			const run = manager.get("watchdog");
			if (!run) throw new Error("watchdog run missing");
			expect(
				inspectSubagentStatus(run, {
					now: 50_000,
					runtimePingAt: 49_000,
					isProcessAlive: () => true,
				}),
			).toMatchObject({ watchdogState: "responsive-quiet" });

			now.mockReturnValue(20_000);
			manager.startTool("watchdog", {
				id: "tool",
				name: "find",
				startedAt: 20_000,
			});
			const toolRun = manager.get("watchdog");
			if (!toolRun) throw new Error("tool run missing");
			expect(
				inspectSubagentStatus(toolRun, {
					now: 150_000,
					runtimePingAt: 149_000,
					isProcessAlive: () => true,
				}),
			).toMatchObject({
				watchdogState: "stalled-tool",
				activeToolDurationMs: 130_000,
			});

			now.mockReturnValue(140_000);
			manager.updateTool("watchdog", "tool", "fresh output");
			expect(
				inspectSubagentStatus(manager.get("watchdog")!, {
					now: 150_000,
					runtimePingAt: 149_000,
					isProcessAlive: () => true,
				}),
			).toMatchObject({ watchdogState: "active" });
			expect(
				inspectSubagentStatus(toolRun, {
					now: 150_000,
					runtimePingAt: 100_000,
					isProcessAlive: () => true,
				}),
			).toMatchObject({ watchdogState: "unresponsive-runtime" });
			expect(
				inspectSubagentStatus(toolRun, {
					now: 150_000,
					isProcessAlive: () => false,
				}),
			).toMatchObject({ watchdogState: "dead-process" });
		} finally {
			now.mockRestore();
		}
	});

	it("bounds transcript items and tracked settled runs", () => {
		const manager = new SubagentRunManager();
		beginRun(manager, "transcript");
		for (let index = 0; index < MAX_SUBAGENT_TRANSCRIPT_ITEMS + 10; index++) {
			manager.appendMessage("transcript", {
				role: "assistant",
				content: [{ type: "text", text: `message-${index}` }],
			} as never);
		}
		expect(manager.get("transcript")?.transcript).toHaveLength(
			MAX_SUBAGENT_TRANSCRIPT_ITEMS,
		);
		expect(manager.get("transcript")?.transcript[0]?.text).toBe("message-10");
		for (let index = 0; index < 10; index++) {
			manager.appendMessage("transcript", {
				role: "assistant",
				content: [{ type: "text", text: "x".repeat(64 * 1024) }],
			} as never);
		}
		const transcriptBytes = manager
			.get("transcript")
			?.transcript.reduce(
				(total, item) => total + Buffer.byteLength(item.text, "utf8"),
				0,
		);
		expect(transcriptBytes).toBeLessThanOrEqual(
			MAX_SUBAGENT_TRANSCRIPT_BYTES,
		);
		for (let index = 0; index < MAX_SUBAGENT_LIVE_TOOLS + 5; index++) {
			manager.startTool("transcript", {
				id: `tool-${index}`,
				name: "read",
			});
		}
		expect(manager.get("transcript")?.liveTools).toHaveLength(
			MAX_SUBAGENT_LIVE_TOOLS,
		);
		manager.settle("transcript", { status: "completed" });

		for (let index = 0; index < MAX_TRACKED_SUBAGENT_RUNS + 5; index++) {
			const id = `settled-${index}`;
			beginRun(manager, id);
			manager.settle(id, { status: "completed" });
		}
		expect(manager.list()).toHaveLength(MAX_TRACKED_SUBAGENT_RUNS);
		expect(manager.get("settled-0")).toBeUndefined();
	});

	it("aborts and releases process-local state during cleanup", () => {
		const manager = new SubagentRunManager();
		const controller = beginRun(manager, "run-1");
		manager.clear({ abortRunning: true });
		expect(controller.signal.aborted).toBe(true);
		expect(manager.list()).toHaveLength(0);
	});

	it("rejects duplicate execution-attempt IDs", () => {
		const manager = new SubagentRunManager();
		beginRun(manager, "run-1");
		expect(() => beginRun(manager, "run-1")).toThrow(
			"run ID run-1 is already registered",
		);
	});

	it("issues and atomically consumes one opaque Team Lead continuation", () => {
		const manager = new SubagentRunManager();
		manager.begin(
			{
				runId: "teamlead-run",
				taskId: "task-1",
				parentSessionId: "root-session",
				workspaceId: process.cwd(),
				owner: "direct",
				mode: "single",
				agent: "teamlead",
				task: "Coordinate",
				cwd: process.cwd(),
				role: "coordinator",
				depth: 1,
				executionFingerprint: TEAMLEAD_FINGERPRINT,
			},
			new AbortController(),
		);
		manager.settle("teamlead-run", {
			status: "completed",
			sessionPath: path.join(process.cwd(), ".tmp", "teamlead-session.jsonl"),
		});

		const continuationId = manager.issueTeamLeadContinuation(
			"teamlead-run",
			20_000,
			10_000,
		);
		expect(continuationId).not.toContain("teamlead-session");
		const continuation = manager.consumeTeamLeadContinuation(
			continuationId,
			teamLeadIdentity(),
			11_000,
		);
		expect(continuation).toMatchObject({
			continuationId,
			sourceRunId: "teamlead-run",
			expiresAt: 20_000,
		});
		expect(continuation.sessionPath).toContain("teamlead-session.jsonl");
		expect(() =>
			manager.consumeTeamLeadContinuation(
				continuationId,
				teamLeadIdentity(),
				11_001,
			),
		).toThrow("already been consumed");
	});

	it("rejects expired, cancelled, and authority-mismatched continuations", () => {
		const manager = new SubagentRunManager();
		manager.begin(
			{
				runId: "teamlead-run",
				taskId: "task-1",
				parentSessionId: "root-session",
				workspaceId: process.cwd(),
				owner: "direct",
				mode: "single",
				agent: "teamlead",
				task: "Coordinate",
				cwd: process.cwd(),
				role: "coordinator",
				depth: 1,
				executionFingerprint: TEAMLEAD_FINGERPRINT,
			},
			new AbortController(),
		);
		manager.settle("teamlead-run", {
			status: "completed",
			sessionPath: path.join(process.cwd(), ".tmp", "teamlead-session.jsonl"),
		});

		const mismatched = manager.issueTeamLeadContinuation("teamlead-run", 20_000, 10_000);
		expect(() =>
			manager.consumeTeamLeadContinuation(
				mismatched,
				teamLeadIdentity({
					fingerprint: {
						...TEAMLEAD_FINGERPRINT,
						authorityTools: [],
					},
				}),
				11_000,
			),
		).toThrow("authority or identity");

		const expired = manager.issueTeamLeadContinuation("teamlead-run", 20_000, 10_000);
		expect(() =>
			manager.consumeTeamLeadContinuation(expired, teamLeadIdentity(), 20_000),
		).toThrow("expired");

		const cancelled = manager.issueTeamLeadContinuation("teamlead-run", 20_000, 10_000);
		manager.cancelTree("teamlead-run");
		expect(() =>
			manager.consumeTeamLeadContinuation(cancelled, teamLeadIdentity(), 11_000),
		).toThrow("Unknown Team Lead continuation");
	});

	it("does not enforce a process-local active-run cap", () => {
		const manager = new SubagentRunManager();
		for (let index = 0; index <= MAX_ACTIVE_SUBAGENT_RUNS; index++)
			beginRun(manager, `active-${index}`);
		expect(manager.list()).toHaveLength(MAX_ACTIVE_SUBAGENT_RUNS + 1);
	});
});

describe("subagent dashboard selection", () => {
	it("renders local timestamps and stays within narrow terminal widths", async () => {
		const now = vi.spyOn(Date, "now");
		const startedAt = new Date(2026, 7, 15, 13, 14, 15).getTime();
		now.mockReturnValue(startedAt);
		const manager = new SubagentRunManager();
		beginRun(manager, "run-1");
		manager.appendMessage("run-1", {
			role: "assistant",
			content: [
				{
					type: "text",
					text: "\u001b]0;unsafe title\u0007a long result for the detail view",
				},
			],
		} as never);
		manager.settle("run-1", { status: "completed" });
		now.mockRestore();
		let customCalls = 0;
		const renderedViews: string[] = [];
		const tui = {
			terminal: { rows: 24 },
			requestRender: vi.fn(),
		};
		const theme = {
			fg: (_color: string, text: string) => text,
			bold: (text: string) => text,
		};
		const keybindings = {
			getKeys: (binding: string) => [binding],
			matches: () => false,
		};
		const custom = vi.fn(async (factory: Function) => {
			customCalls++;
			const component = factory(
				tui,
				theme,
				keybindings,
				vi.fn(),
			) as { render(width: number): string[]; dispose?(): void };
			const lines = component.render(12);
			expect(lines.every((line) => visibleWidth(line) <= 12)).toBe(true);
			expect(lines.join("\n")).not.toContain("\u001b]");
			renderedViews.push(component.render(160).join("\n"));
			component.dispose?.();
			return customCalls === 1 ? "run-1" : null;
		});
		await openSubagentDashboard(
			{
				ui: {
					custom,
					notify: vi.fn(),
				},
			} as never,
			manager,
		);
		expect(custom).toHaveBeenCalledTimes(3);
		expect(renderedViews[0]).toContain("start 13:14:15 local");
		expect(renderedViews[1]).toContain(
			"started 2026-08-15 13:14:15 local",
		);
		expect(renderedViews[1]).toContain("Assignment");
		expect(renderedViews[1]).toContain("run run-1");
		expect(renderedViews[1]).toContain("Execution");
		expect(renderedViews[1]).toContain("model=default | effort=default | tools=none");
		expect(renderedViews[1]).toContain("Activity");
		expect(renderedViews[1]).toContain("completed | last assistant");
		expect(renderedViews[1]).toContain("[13:14:15] assistant:");
	});

	it("formats actionable running and failed footer counts", () => {
		expect(formatSubagentActivityStatus([])).toBeUndefined();
		expect(
			formatSubagentActivityStatus([
				{ status: "completed" },
				{ status: "failed" },
				{ status: "cancelled" },
			]),
		).toBe("subagents 1 failed");
		expect(
			formatSubagentActivityStatus([
				{ status: "running" },
				{ status: "running" },
				{ status: "completed" },
				{ status: "failed" },
				{ status: "cancelled" },
			]),
		).toBe("subagents 2 running, 1 failed");
	});

	it("keeps selection on the same run while live ordering changes", () => {
		const selection: SubagentDashboardSelection = { id: "run-b", index: 1 };
		reconcileSubagentDashboardSelection(selection, [
			{ runId: "run-b" },
			{ runId: "run-a" },
		]);
		expect(selection).toEqual({ id: "run-b", index: 0 });
	});

	it("clamps selection after the selected run disappears", () => {
		const selection: SubagentDashboardSelection = {
			id: "removed",
			index: 5,
		};
		reconcileSubagentDashboardSelection(selection, [
			{ runId: "run-a" },
			{ runId: "run-b" },
		]);
		expect(selection).toEqual({ id: "run-b", index: 1 });
	});
});
