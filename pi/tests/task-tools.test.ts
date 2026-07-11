import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

const prevMetricsDir = process.env.PI_METRICS_DIR;
const metricsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-task-tools-metrics-"));
process.env.PI_METRICS_DIR = metricsRoot;

const { TaskExecutionCoordinator } = await import("../extensions/tasks/execution.ts");
const { registerTaskTools } = await import("../extensions/tasks.ts");
const { createTask, getTask, listTasks } = await import("../lib/task-registry.ts");

let tmpRoot: string;
let prevOperatorDir: string | undefined;
let testMetricsDir: string;

beforeEach(() => {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-task-tools-"));
	testMetricsDir = path.join(tmpRoot, "metrics");
	prevOperatorDir = process.env.PI_OPERATOR_DIR;
	process.env.PI_OPERATOR_DIR = tmpRoot;
	process.env.PI_METRICS_DIR = testMetricsDir;
});

afterEach(() => {
	if (prevOperatorDir === undefined) delete process.env.PI_OPERATOR_DIR;
	else process.env.PI_OPERATOR_DIR = prevOperatorDir;
	process.env.PI_METRICS_DIR = metricsRoot;
	fs.rmSync(tmpRoot, { recursive: true, force: true });
});

afterAll(() => {
	if (prevMetricsDir === undefined) delete process.env.PI_METRICS_DIR;
	else process.env.PI_METRICS_DIR = prevMetricsDir;
	fs.rmSync(metricsRoot, { recursive: true, force: true });
});

describe("task tools", () => {
	it("registers one unified task tool", async () => {
		const pi = createMockPi();
		const mod = await import("../extensions/tasks.ts");
		mod.default(pi as Parameters<typeof mod.default>[0]);
		expect(pi._getTool("task")).toBeDefined();
		for (const name of [
			"todo",
			"task_create",
			"task_batch_create",
			"task_list",
			"task_get",
			"task_update",
			"task_execute",
			"task_stop",
			"task_output",
		]) {
			expect(pi._getTool(name)).toBeUndefined();
		}
	});

	it("uses one registry for planning dependencies and readiness", async () => {
		const pi = createMockPi();
		const coordinator = new TaskExecutionCoordinator();
		registerTaskTools(
			pi as Parameters<typeof registerTaskTools>[0],
			coordinator,
		);
		const ctx = createMockCtx({ cwd: tmpRoot });
		const tool = pi._getTool("task");
		const blocker = await tool?.execute(
			"create-blocker",
			{ action: "create", summary: "first", notes: "planning note" },
			undefined,
			undefined,
			ctx,
		);
		const blockerId = blocker.details.record.id as string;
		const waiting = await tool?.execute(
			"create-waiting",
			{ action: "create", summary: "second", blockedBy: [blockerId] },
			undefined,
			undefined,
			ctx,
		);
		const ready = await tool?.execute(
			"ready",
			{ action: "ready" },
			undefined,
			undefined,
			ctx,
		);
		expect(blocker.details.record.notes).toBe("planning note");
		expect(waiting.details.record.blockedBy).toEqual([blockerId]);
		expect(
			ready.details.records.map((record: { id: string }) => record.id),
		).toEqual([blockerId]);
	});

	it("imports legacy todo state idempotently", async () => {
		const legacyDir = path.join(tmpRoot, ".pi");
		fs.mkdirSync(legacyDir, { recursive: true });
		fs.writeFileSync(
			path.join(legacyDir, "todo.json"),
			JSON.stringify({
				items: [
					{ id: "old-1", title: "first", status: "done", depends_on: [] },
					{
						id: "old-2",
						title: "second",
						status: "pending",
						depends_on: ["old-1"],
						notes: "keep this",
					},
				],
			}),
			"utf-8",
		);
		const { importLegacyTodos } = await import("../extensions/tasks.ts");
		expect(importLegacyTodos(tmpRoot)).toHaveLength(2);
		expect(importLegacyTodos(tmpRoot)).toHaveLength(0);
		const records = listTasks();
		expect(records).toHaveLength(2);
		const first = records.find(
			(record) => record.metadata?.legacyTodoId === "old-1",
		);
		const second = records.find(
			(record) => record.metadata?.legacyTodoId === "old-2",
		);
		expect(first?.state).toBe("completed");
		expect(second?.notes).toBe("keep this");
		expect(second?.blockedBy).toEqual([first?.id]);
	});

	it("executes an explicit subagent task and retains bounded output", async () => {
		const pi = createMockPi();
		const coordinator = new TaskExecutionCoordinator(
			async (_execution, _cwd, _signal, onUpdate) => {
				onUpdate("running output");
				return { output: "completed output\n".repeat(1_000), exitCode: 0 };
			},
		);
		registerTaskTools(
			pi as Parameters<typeof registerTaskTools>[0],
			coordinator,
		);
		const ctx = createMockCtx({ cwd: tmpRoot });
		const created = await pi._getTool("task")?.execute(
			"create",
			{
				action: "create",
				summary: "worker task",
				agent: "coding-light",
				task: "Read one file",
			},
			undefined,
			undefined,
			ctx,
		);
		const id = created.details.record.id as string;

		const started = await pi
			._getTool("task")
			?.execute(
				"execute",
				{ action: "execute", id },
				undefined,
				undefined,
				ctx,
			);
		expect(started.details.outcome).toBe("accepted");
		await vi.waitFor(() => expect(getTask(id)?.state).toBe("completed"));

		const output = await pi
			._getTool("task")
			?.execute("output", { action: "output", id }, undefined, undefined, ctx);
		expect(output.content[0].text).toContain("completed output");
		expect(output.details.truncated).toBe(true);
		const outputPath = getTask(id)?.execution?.outputPath;
		expect(outputPath).toBeTruthy();
		if (!outputPath) throw new Error("task output path was not persisted");
		expect(fs.readFileSync(outputPath, "utf-8").length).toBeGreaterThan(
			output.content[0].text.length,
		);
	});

	it("stops a running subagent task", async () => {
		const pi = createMockPi();
		const coordinator = new TaskExecutionCoordinator(
			async (_execution, _cwd, signal, onUpdate) => {
				onUpdate("still running");
				await new Promise<void>((_resolve, reject) => {
					signal.addEventListener("abort", () => reject(new Error("aborted")), {
						once: true,
					});
				});
				return { output: "", exitCode: 1 };
			},
		);
		registerTaskTools(
			pi as Parameters<typeof registerTaskTools>[0],
			coordinator,
		);
		const ctx = createMockCtx({ cwd: tmpRoot });
		const created = await pi
			._getTool("task")
			?.execute(
				"create",
				{ action: "create", agent: "coding-light", task: "Wait" },
				undefined,
				undefined,
				ctx,
			);
		const id = created.details.record.id as string;
		await pi
			._getTool("task")
			?.execute(
				"execute",
				{ action: "execute", id },
				undefined,
				undefined,
				ctx,
			);

		const stopped = await pi
			._getTool("task")
			?.execute("stop", { action: "stop", id }, undefined, undefined, ctx);
		expect(stopped.details.outcome).toBe("persisted");
		expect(getTask(id)?.state).toBe("cancelled");
		expect(getTask(id)?.execution?.status).toBe("stopped");
	});

	it("rejects execution while dependencies are unresolved", () => {
		const blocker = createTask({ origin: "other", summary: "blocker" });
		const task = createTask({
			origin: "subagent",
			summary: "blocked worker",
			blockedBy: [blocker.id],
			execution: {
				kind: "subagent",
				agent: "coding-light",
				task: "Wait for blocker",
				status: "pending",
			},
		});
		const runner = vi.fn(async () => ({ output: "", exitCode: 0 }));
		const coordinator = new TaskExecutionCoordinator(runner);

		const result = coordinator.start(task.id, tmpRoot);

		expect(result.outcome).toBe("rejected");
		expect(result.error).toContain(blocker.id);
		expect(runner).not.toHaveBeenCalled();
	});

	it("marks abandoned background executions as orphaned", () => {
		const record = createTask({
			origin: "subagent",
			summary: "abandoned task",
			state: "running",
			execution: {
				kind: "subagent",
				agent: "coding-light",
				task: "Wait",
				status: "running",
				ownerPid: 2_147_483_647,
			},
		});
		const coordinator = new TaskExecutionCoordinator();

		coordinator.reconcileOrphans();

		expect(getTask(record.id)?.state).toBe("blocked");
		expect(getTask(record.id)?.execution?.status).toBe("orphaned");
	});

	it("registers provider-safe object schemas for Codex/OpenAI", async () => {
		const pi = createMockPi();
		const mod = await import("../extensions/tasks.ts");
		mod.default(pi as Parameters<typeof mod.default>[0]);
		for (const tool of pi._tools) {
			expect(tool.parameters.type).toBe("object");
			expect(tool.parameters).toHaveProperty("properties");
			expect(tool.parameters.properties).toBeTypeOf("object");
		}
	});
});
