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
		completeLate?.();
		await vi.runAllTimersAsync();
		vi.useRealTimers();
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
});

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
