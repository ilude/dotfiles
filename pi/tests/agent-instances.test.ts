import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import agentInstancesExtension, {
	formatOccupancyWarning,
} from "../extensions/agent-instances.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

describe("Pi agent instance occupancy", () => {
	const originalSubagentRunId = process.env.PI_SUBAGENT_RUN_ID;

	beforeEach(() => {
		vi.useFakeTimers();
		delete process.env.PI_SUBAGENT_RUN_ID;
	});

	afterEach(() => {
		vi.useRealTimers();
		if (originalSubagentRunId === undefined)
			delete process.env.PI_SUBAGENT_RUN_ID;
		else process.env.PI_SUBAGENT_RUN_ID = originalSubagentRunId;
		vi.restoreAllMocks();
	});

	function setup(
		active: Array<{ client: string; sessionId: string; pid: number }>,
	) {
		const pi = createMockPi();
		pi.exec.mockImplementation(async (_command, args) => ({
			code: 0,
			stdout: JSON.stringify(
				args?.includes("release")
					? { released: true }
					: { active, malformed: [], removed: [] },
			),
			stderr: "",
		}));
		agentInstancesExtension(pi as never);
		const ctx = createMockCtx({
			cwd: "C:/repo",
			sessionManager: { getSessionId: () => "pi-session" },
		});
		return { pi, ctx };
	}

	it("registers, warns in context and status, heartbeats, then releases", async () => {
		const { pi, ctx } = setup([
			{ client: "pi", sessionId: "pi-session", pid: process.pid },
			{ client: "claude", sessionId: "claude-session", pid: 200 },
		]);
		const start = pi._getHook("session_start")[0].handler;
		const shutdown = pi._getHook("session_shutdown")[0].handler;

		await start({ reason: "startup" }, ctx);

		expect(pi.exec).toHaveBeenCalledTimes(1);
		expect(pi.exec.mock.calls[0][0]).toBe("python");
		expect(pi.exec.mock.calls[0][1]).toEqual(
			expect.arrayContaining([
				"register",
				"--worktree",
				"C:/repo",
				"--client",
				"pi",
				"--session-id",
				"pi-session",
			]),
		);
		expect(ctx.ui.setStatus).toHaveBeenCalledWith("instances", "instances 2 !");
		expect(pi.sendMessage).toHaveBeenCalledWith(
			{
				customType: "agent-instance-occupancy",
				content: formatOccupancyWarning(1),
				display: true,
			},
			{ deliverAs: "nextTurn" },
		);

		await vi.advanceTimersByTimeAsync(60_000);
		expect(pi.exec).toHaveBeenCalledTimes(2);
		expect(pi.sendMessage).toHaveBeenCalledTimes(1);

		await shutdown({}, ctx);
		expect(pi.exec).toHaveBeenCalledTimes(3);
		expect(pi.exec.mock.calls[2][1]).toContain("release");
		expect(ctx.ui.setStatus).toHaveBeenLastCalledWith("instances", "");
		await vi.advanceTimersByTimeAsync(60_000);
		expect(pi.exec).toHaveBeenCalledTimes(3);
	});

	it("shows sole occupancy without warning", async () => {
		const { pi, ctx } = setup([
			{ client: "pi", sessionId: "pi-session", pid: process.pid },
		]);

		await pi._getHook("session_start")[0].handler({ reason: "startup" }, ctx);

		expect(ctx.ui.setStatus).toHaveBeenCalledWith("instances", "instances 1");
		expect(pi.sendMessage).not.toHaveBeenCalled();
	});

	it("does not register nested subagent processes", async () => {
		process.env.PI_SUBAGENT_RUN_ID = "child-run";
		const { pi, ctx } = setup([]);

		await pi._getHook("session_start")[0].handler({ reason: "startup" }, ctx);

		expect(pi.exec).not.toHaveBeenCalled();
		expect(ctx.ui.setStatus).not.toHaveBeenCalled();
	});

	it("fails open when the lease helper fails", async () => {
		const { pi, ctx } = setup([]);
		pi.exec.mockResolvedValue({ code: 1, stdout: "", stderr: "failed" });

		await pi._getHook("session_start")[0].handler({ reason: "startup" }, ctx);

		expect(ctx.ui.setStatus).toHaveBeenCalledWith("instances", "");
		expect(pi.sendMessage).not.toHaveBeenCalled();
	});
});
