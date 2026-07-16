import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

const spawnMock = vi.fn();

vi.mock("node:child_process", () => ({
	spawn: spawnMock,
}));

type MockProcess = EventEmitter & {
	stdout: EventEmitter;
	stderr: EventEmitter;
	kill: ReturnType<typeof vi.fn>;
	killed: boolean;
};

function createMockProcess(): MockProcess {
	const proc = new EventEmitter() as MockProcess;
	proc.stdout = new EventEmitter();
	proc.stderr = new EventEmitter();
	proc.kill = vi.fn();
	proc.killed = false;
	return proc;
}

describe("durable task execution", () => {
	let tmpDir: string;
	let previousOperatorDir: string | undefined;
	let previousMetricsDir: string | undefined;

	beforeEach(async () => {
		tmpDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), "pi-task-execution-"),
		);
		const agentsDir = path.join(tmpDir, ".pi", "agents");
		await fs.promises.mkdir(agentsDir, { recursive: true });
		await fs.promises.writeFile(
			path.join(agentsDir, "tester.md"),
			`---
name: tester
description: Test agent
model: anthropic/claude-sonnet-4-6
effort: high
---

Test agent.
`,
			"utf8",
		);
		previousOperatorDir = process.env.PI_OPERATOR_DIR;
		previousMetricsDir = process.env.PI_METRICS_DIR;
		process.env.PI_OPERATOR_DIR = path.join(tmpDir, "operator");
		process.env.PI_METRICS_DIR = path.join(tmpDir, "metrics");
		spawnMock.mockReset();
	});

	afterEach(async () => {
		if (previousOperatorDir === undefined) delete process.env.PI_OPERATOR_DIR;
		else process.env.PI_OPERATOR_DIR = previousOperatorDir;
		if (previousMetricsDir === undefined) delete process.env.PI_METRICS_DIR;
		else process.env.PI_METRICS_DIR = previousMetricsDir;
		await fs.promises.rm(tmpDir, { recursive: true, force: true });
		vi.clearAllMocks();
	});

	it("runs through the subagent process and Codex child routing", async () => {
		spawnMock.mockImplementation(() => {
			const proc = createMockProcess();
			queueMicrotask(() => {
				proc.stdout.emit(
					"data",
					`${JSON.stringify({
						type: "message_end",
						message: {
							role: "assistant",
							content: [{ type: "text", text: "done" }],
							usage: {
								input: 10,
								output: 5,
								cacheRead: 0,
								cacheWrite: 0,
								cost: { total: 0.01 },
								totalTokens: 15,
							},
							stopReason: "end_turn",
						},
					})}\n`,
				);
				proc.emit("close", 0);
			});
			return proc;
		});
		const pi = createMockPi();
		const tasks = await import("../extensions/tasks.ts");
		const registry = await import("../lib/task-registry.ts");
		tasks.default(pi as Parameters<typeof tasks.default>[0]);
		const task = pi._getTool("task");
		if (!task) throw new Error("task tool not registered");
		const ctx = createMockCtx({ cwd: tmpDir });
		const created = await task.execute(
			"create-task",
			{
				action: "create",
				summary: "durable worker",
				agent: "tester",
				task: "Check the thing",
				agentScope: "project",
			},
			undefined,
			undefined,
			ctx,
		);
		const id = created.details.record.id as string;

		const accepted = await task.execute(
			"execute-task",
			{ action: "execute", id },
			undefined,
			undefined,
			ctx,
		);
		expect(accepted.details.outcome).toBe("accepted");
		await vi.waitFor(() =>
			expect(registry.getTask(id)?.state).toBe("completed"),
		);
		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(spawnMock.mock.calls[0][1]).toContain("openai-codex/gpt-5.6-terra");

		const result = await task.execute(
			"task-output",
			{ action: "output", id },
			undefined,
			undefined,
			ctx,
		);
		expect(result.content[0].text).toContain("done");
		expect(registry.getTask(id)?.execution?.outputPath).toBeTruthy();
	});

	it("emits one terminal event per execution attempt and propagates its run ID", async () => {
		const { TaskExecutionCoordinator } = await import(
			"../extensions/tasks/execution.ts"
		);
		const { createTask, getTask } = await import("../lib/task-registry.ts");
		const runner = vi
			.fn()
			.mockResolvedValueOnce({
				output: "complete",
				exitCode: 0,
				resolvedModel: "openai-codex/gpt-5.6-terra",
				durationMs: 12,
				childTextBytes: 8,
				outputMode: "artifact",
			})
			.mockResolvedValueOnce({ output: "failed", exitCode: 1, durationMs: 8 });
		const coordinator = new TaskExecutionCoordinator(runner);
		const task = createTask({
			origin: "subagent",
			summary: "telemetry task",
			execution: {
				kind: "subagent",
				agent: "tester",
				task: "Run",
				status: "pending",
			},
		});
		expect(coordinator.start(task.id, tmpDir).outcome).toBe("accepted");
		await vi.waitFor(() => expect(getTask(task.id)?.state).toBe("completed"));
		const firstRunId = getTask(task.id)?.execution?.runId;
		expect(firstRunId).toBeTruthy();

		const failed = createTask({
			origin: "subagent",
			summary: "failure telemetry task",
			execution: {
				kind: "subagent",
				agent: "tester",
				task: "Fail",
				status: "pending",
			},
		});
		expect(coordinator.start(failed.id, tmpDir).outcome).toBe("accepted");
		await vi.waitFor(() => expect(getTask(failed.id)?.state).toBe("failed"));
		const events = readRunEvents(path.join(tmpDir, "metrics"));
		expect(events).toHaveLength(2);
		expect(events.map((event) => event.data.status)).toEqual([
			"completed",
			"failed",
		]);
		for (const event of events) {
			expect(event.data.mode).toBe("task-execute");
			expect(event.data.workers).toHaveLength(1);
			expect(event.data.workers[0].runId).toBeTruthy();
		}
		expect(events[0].data.workers[0].taskId).toBe(task.id);
		expect(events[1].data.workers[0].taskId).toBe(failed.id);
		expect(events[0].data.workers[0].runId).toBe(firstRunId);
	});

	it("stamps task execution runs with the registered interaction ID", async () => {
		const { TaskExecutionCoordinator } = await import(
			"../extensions/tasks/execution.ts"
		);
		const { createTask, getTask } = await import("../lib/task-registry.ts");
		const { activateOrchestrationInteraction, resetOrchestrationInteraction } =
			await import("../lib/workflow-friction.ts");
		activateOrchestrationInteraction({
			interactionId: "interaction-task-coordinator",
			sessionId: "session-task-coordinator",
		});
		try {
			const coordinator = new TaskExecutionCoordinator(async () => ({
				output: "complete",
				exitCode: 0,
			}));
			const task = createTask({
				origin: "subagent",
				summary: "interaction task",
				execution: {
					kind: "subagent",
					agent: "tester",
					task: "Run",
					status: "pending",
				},
			});
			expect(coordinator.start(task.id, tmpDir).outcome).toBe("accepted");
			await vi.waitFor(() => expect(getTask(task.id)?.state).toBe("completed"));

			const [event] = readRunEvents(path.join(tmpDir, "metrics"));
			expect(event?.data.interactionId).toBe("interaction-task-coordinator");
		} finally {
			resetOrchestrationInteraction();
		}
	});

	it("settles timeout and orphan executions once without late completion overwrite", async () => {
		const { TaskExecutionCoordinator } = await import(
			"../extensions/tasks/execution.ts"
		);
		const { createTask, getTask } = await import("../lib/task-registry.ts");
		let completeLate: (() => void) | undefined;
		const runner = vi.fn(
			() =>
				new Promise<{ output: string; exitCode: number }>((resolve) => {
					completeLate = () => resolve({ output: "late", exitCode: 0 });
				}),
		);
		const coordinator = new TaskExecutionCoordinator(runner);
		const task = createTask({
			origin: "subagent",
			summary: "timeout task",
			execution: {
				kind: "subagent",
				agent: "tester",
				task: "Wait",
				status: "pending",
			},
		});
		coordinator.start(task.id, tmpDir);
		vi.useFakeTimers();
		const stopped = coordinator.stop(task.id);
		await vi.advanceTimersByTimeAsync(7_000);
		expect((await stopped).outcome).toBe("failed_to_stop");
		expect(getTask(task.id)?.state).toBe("running");
		expect(getTask(task.id)?.execution?.status).toBe("failed_to_stop");
		expect((await coordinator.wait([task.id])).results[0]?.classification).toBe(
			"failed_to_stop",
		);
		completeLate?.();
		await vi.runAllTimersAsync();
		vi.useRealTimers();
		expect(getTask(task.id)?.state).toBe("cancelled");
		expect(getTask(task.id)?.execution?.status).toBe("stopped");
		expect(readRunEvents(path.join(tmpDir, "metrics"))).toHaveLength(1);

		const orphan = createTask({
			origin: "subagent",
			summary: "orphan task",
			state: "running",
			execution: {
				kind: "subagent",
				agent: "tester",
				task: "Wait",
				status: "running",
				ownerPid: 2_147_483_647,
				runId: "attempt-orphan",
				orchestrationId: "orchestration-orphan",
				interactionId: "interaction-orphan",
				startedAt: "2026-01-01T00:00:00.000Z",
			},
		});
		coordinator.reconcileOrphans();
		coordinator.reconcileOrphans();
		const events = readRunEvents(path.join(tmpDir, "metrics"));
		expect(events).toHaveLength(2);
		const orphanEvent = events[1].data;
		expect(orphanEvent.status).toBe("orphaned");
		expect(orphanEvent.orchestrationId).toBe("orchestration-orphan");
		expect(orphanEvent.interactionId).toBe("interaction-orphan");
		expect(orphanEvent.workers[0]).not.toHaveProperty("usage");
		expect(getTask(orphan.id)?.execution?.status).toBe("orphaned");
	});

	it("starts eligible tasks together and preserves request classifications", async () => {
		const { TaskExecutionCoordinator } = await import(
			"../extensions/tasks/execution.ts"
		);
		const { createTask } = await import("../lib/task-registry.ts");
		const releases = new Map<
			string,
			(result: { output: string; exitCode: number }) => void
		>();
		const entries: string[] = [];
		const runner = vi.fn(
			(_execution, _cwd, _signal, _onUpdate, taskId: string) =>
				new Promise<{ output: string; exitCode: number }>((resolve) => {
					entries.push(taskId);
					releases.set(taskId, resolve);
				}),
		);
		const coordinator = new TaskExecutionCoordinator(runner);
		const first = executableTask(createTask, "first");
		const second = executableTask(createTask, "second");
		const manual = createTask({ origin: "other", summary: "manual" });
		const blocker = createTask({ origin: "other", summary: "blocker" });
		const blocked = executableTask(createTask, "blocked", [blocker.id]);

		const result = coordinator.startMany(
			[first.id, manual.id, second.id, blocked.id, "missing"],
			tmpDir,
		);

		expect(result.outcome).toBe("partial");
		expect(result.results.map((item) => item.classification)).toEqual([
			"started",
			"manual_ready",
			"started",
			"blocked",
			"missing",
		]);
		expect(entries).toEqual([first.id, second.id]);
		releases.get(first.id)?.({ output: "first", exitCode: 0 });
		releases.get(second.id)?.({ output: "second", exitCode: 0 });
		const waited = await coordinator.wait([second.id, first.id]);
		expect(waited.results.map((item) => item.classification)).toEqual([
			"terminal",
			"terminal",
		]);
	});

	it("wait aborts only the join and safely observes later rejection", async () => {
		const { TaskExecutionCoordinator } = await import(
			"../extensions/tasks/execution.ts"
		);
		const { createTask, getTask } = await import("../lib/task-registry.ts");
		let rejectRunner: ((error: Error) => void) | undefined;
		let workerSignal: AbortSignal | undefined;
		const coordinator = new TaskExecutionCoordinator(
			async (_execution, _cwd, signal) => {
				workerSignal = signal;
				return new Promise((_resolve, reject) => {
					rejectRunner = reject;
				});
			},
		);
		const task = executableTask(createTask, "abortable");
		coordinator.start(task.id, tmpDir);
		const controller = new AbortController();
		const waiting = coordinator.wait([task.id], controller.signal);
		controller.abort();

		const aborted = await waiting;
		expect(aborted).toMatchObject({
			outcome: "aborted",
			results: [{ id: task.id, classification: "aborted" }],
		});
		expect(workerSignal?.aborted).toBe(false);
		const alreadyAborted = new AbortController();
		alreadyAborted.abort();
		expect(
			(await coordinator.wait([task.id], alreadyAborted.signal)).results[0]
				?.classification,
		).toBe("aborted");
		rejectRunner?.(new Error("late rejection"));
		await vi.waitFor(() => expect(getTask(task.id)?.state).toBe("failed"));
		expect((await coordinator.wait([task.id])).results[0]?.classification).toBe(
			"terminal",
		);
	});

	it("classifies running ownership states with failed-to-stop precedence", async () => {
		const { TaskExecutionCoordinator } = await import(
			"../extensions/tasks/execution.ts"
		);
		const { createTask } = await import("../lib/task-registry.ts");
		const coordinator = new TaskExecutionCoordinator();
		const manual = createTask({
			origin: "other",
			summary: "manual running",
			state: "running",
		});
		const external = createTask({
			origin: "subagent",
			summary: "external",
			state: "running",
			execution: executionFixture("running", process.pid),
		});
		const orphan = createTask({
			origin: "subagent",
			summary: "orphan",
			state: "running",
			execution: executionFixture("stop_requested", 2_147_483_647),
		});
		const unknown = createTask({
			origin: "subagent",
			summary: "unknown",
			state: "running",
			execution: executionFixture("completed", process.pid),
		});
		const failedToStop = createTask({
			origin: "subagent",
			summary: "failed to stop",
			state: "running",
			execution: executionFixture("failed_to_stop", process.pid),
		});

		const result = await coordinator.wait([
			manual.id,
			external.id,
			orphan.id,
			unknown.id,
			failedToStop.id,
		]);
		expect(result.results.map((item) => item.classification)).toEqual([
			"manual_running",
			"external_running",
			"orphaned",
			"ownership_unknown",
			"failed_to_stop",
		]);
		expect(coordinator.start(failedToStop.id, tmpDir).outcome).toBe(
			"failed_to_stop",
		);
	});

	it("compensates ownership persistence failure without starting a runner", async () => {
		const { TaskExecutionCoordinator } = await import(
			"../extensions/tasks/execution.ts"
		);
		const { createTask, getTask, safeTransitionTask } = await import(
			"../lib/task-registry.ts"
		);
		const runner = vi.fn(async () => ({ output: "unexpected", exitCode: 0 }));
		const coordinator = new TaskExecutionCoordinator(
			runner,
			() => {
				throw new Error("disk full");
			},
			safeTransitionTask,
		);
		const task = executableTask(createTask, "write failure");

		const result = coordinator.startMany([task.id], tmpDir);

		expect(result.results[0]).toMatchObject({
			classification: "start_failed",
			state: "blocked",
			error: "disk full",
		});
		expect(getTask(task.id)?.blockReason).toBe(
			"execution metadata persistence failed",
		);
		expect(runner).not.toHaveBeenCalled();
		expect((await coordinator.wait([task.id])).results[0]?.classification).toBe(
			"blocked",
		);
	});
});

function executionFixture(
	status: "running" | "stop_requested" | "completed" | "failed_to_stop",
	ownerPid: number,
) {
	return {
		kind: "subagent" as const,
		agent: "tester",
		task: "Run",
		status,
		ownerPid,
	};
}

function executableTask(
	createTask: typeof import("../lib/task-registry.ts").createTask,
	summary: string,
	blockedBy?: string[],
) {
	return createTask({
		origin: "subagent",
		summary,
		blockedBy,
		execution: {
			kind: "subagent",
			agent: "tester",
			task: "Run",
			status: "pending",
		},
	});
}

interface RunEvent {
	data: {
		status?: string;
		mode?: string;
		orchestrationId?: string;
		interactionId?: string;
		workers: Array<{
			runId?: string;
			taskId?: string;
			usage?: unknown;
		}>;
	};
}

function readRunEvents(dir: string): RunEvent[] {
	const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
	return files.flatMap((file) =>
		fs
			.readFileSync(path.join(dir, file), "utf-8")
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line) as RunEvent)
			.filter((event) => event.event === "orchestration_run"),
	);
}
