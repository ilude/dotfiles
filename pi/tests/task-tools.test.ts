import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

const prevMetricsDir = process.env.PI_METRICS_DIR;
const metricsRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "pi-task-tools-metrics-"),
);
process.env.PI_METRICS_DIR = metricsRoot;

const { TaskExecutionCoordinator } = await import(
	"../extensions/tasks/execution.ts"
);
const { registerTasksCommand, registerTaskTools } = await import(
	"../extensions/tasks.ts"
);
const { createTask, getTask, listTasks, resolveTaskWorkspace, transitionTask } =
	await import("../lib/task-registry.ts");

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

	it("keeps model-visible mutations and collections compact while retaining full details", async () => {
		const pi = createMockPi();
		registerTaskTools(
			pi as Parameters<typeof registerTaskTools>[0],
			new TaskExecutionCoordinator(),
		);
		const ctx = createMockCtx({ cwd: tmpRoot });
		const tool = pi._getTool("task");
		const created = await tool?.execute(
			"compact-create",
			{
				action: "create",
				summary: "durable worker",
				notes: "Acceptance: preserve complete durable task details.",
				agent: "builder",
				task: "Inspect the implementation and report detailed evidence.",
			},
			undefined,
			undefined,
			ctx,
		);
		const id = created.details.record.id as string;
		const createVisible = JSON.parse(created.content[0].text);
		expect(createVisible).toEqual({
			outcome: "persisted",
			id,
			state: "pending",
		});
		expect(created.details.record.notes).toContain("complete durable");
		expect(created.details.record.prompt).toContain("detailed evidence");

		const updated = await tool?.execute(
			"compact-update",
			{ action: "update", id, notes: "Updated acceptance check." },
			undefined,
			undefined,
			ctx,
		);
		expect(JSON.parse(updated.content[0].text)).toEqual({
			outcome: "persisted",
			id,
			state: "pending",
		});
		expect(updated.details.record.notes).toBe("Updated acceptance check.");

		const listed = await tool?.execute(
			"compact-list",
			{ action: "list" },
			undefined,
			undefined,
			ctx,
		);
		const listVisible = JSON.parse(listed.content[0].text);
		expect(listVisible).toEqual({
			outcome: "persisted",
			count: 1,
			tasks: [{ id, state: "pending", summary: "durable worker" }],
		});
		expect(listed.details.records[0]).toHaveProperty("createdAt");
		expect(listed.content[0].text.length).toBeLessThan(500);

		const ready = await tool?.execute(
			"compact-ready",
			{ action: "ready" },
			undefined,
			undefined,
			ctx,
		);
		expect(JSON.parse(ready.content[0].text).tasks).toEqual([
			{ id, state: "pending", summary: "durable worker" },
		]);

		const full = await tool?.execute(
			"full-get",
			{ action: "get", id },
			undefined,
			undefined,
			ctx,
		);
		const fullVisible = JSON.parse(full.content[0].text);
		expect(fullVisible.record).toMatchObject({
			id,
			notes: "Updated acceptance check.",
			prompt: "Inspect the implementation and report detailed evidence.",
		});
		expect(fullVisible.record).toHaveProperty("createdAt");
	});

	it("bounds model-visible task collections without trimming TUI details", async () => {
		const pi = createMockPi();
		registerTaskTools(
			pi as Parameters<typeof registerTaskTools>[0],
			new TaskExecutionCoordinator(),
		);
		for (let index = 0; index < 55; index++) {
			createTask({ origin: "other", summary: `task ${index}` });
		}
		const result = await pi
			._getTool("task")
			?.execute(
				"bounded-list",
				{ action: "list" },
				undefined,
				undefined,
				createMockCtx({ cwd: tmpRoot }),
			);
		const visible = JSON.parse(result.content[0].text);
		expect(visible.count).toBe(55);
		expect(visible.tasks).toHaveLength(50);
		expect(visible.truncated).toBe(true);
		expect(result.details.records).toHaveLength(55);
	});

	it("rejects oversized task fields without partial batch creation", async () => {
		const pi = createMockPi();
		const coordinator = new TaskExecutionCoordinator();
		registerTaskTools(
			pi as Parameters<typeof registerTaskTools>[0],
			coordinator,
		);
		const ctx = createMockCtx({ cwd: tmpRoot });
		const tool = pi._getTool("task");

		await expect(
			tool?.execute(
				"long-summary",
				{ action: "create", summary: "s".repeat(101) },
				undefined,
				undefined,
				ctx,
			),
		).rejects.toThrow("summary must be at most 100 characters");
		await expect(
			tool?.execute(
				"multiline-summary",
				{ action: "create", summary: "first\nsecond" },
				undefined,
				undefined,
				ctx,
			),
		).rejects.toThrow("summary must be one line");
		await expect(
			tool?.execute(
				"long-notes",
				{ action: "create", summary: "valid", notes: "n".repeat(501) },
				undefined,
				undefined,
				ctx,
			),
		).rejects.toThrow("notes must be at most 500 characters");
		await expect(
			tool?.execute(
				"long-prompt",
				{
					action: "create",
					summary: "valid",
					agent: "builder",
					task: "t".repeat(2_001),
				},
				undefined,
				undefined,
				ctx,
			),
		).rejects.toThrow("task must be at most 2000 characters");
		await expect(
			tool?.execute(
				"invalid-batch",
				{
					action: "batch",
					tasks: [{ summary: "valid" }, { summary: "s".repeat(101) }],
				},
				undefined,
				undefined,
				ctx,
			),
		).rejects.toThrow("summary must be at most 100 characters");
		expect(listTasks()).toHaveLength(0);
	});

	it("rejects an oversized summary update without transitioning the task", async () => {
		const pi = createMockPi();
		registerTaskTools(
			pi as Parameters<typeof registerTaskTools>[0],
			new TaskExecutionCoordinator(),
		);
		const ctx = createMockCtx({ cwd: tmpRoot });
		const tool = pi._getTool("task");
		const task = createTask({ origin: "other", summary: "pending task" });
		const before = getTask(task.id);

		const rejected = await tool?.execute(
			"invalid-update",
			{
				action: "update",
				id: task.id,
				state: "running",
				summary: "s".repeat(101),
			},
			undefined,
			undefined,
			ctx,
		);
		const missing = await tool?.execute(
			"missing-update",
			{ action: "update", id: "missing-task", summary: "valid" },
			undefined,
			undefined,
			ctx,
		);

		expect(rejected.details.outcome).toBe("rejected");
		expect(getTask(task.id)).toEqual(before);
		expect(missing.details.outcome).toBe("not_found");
	});

	it("rejects invalid completed-to-skipped updates without patching fields", async () => {
		const pi = createMockPi();
		registerTaskTools(
			pi as Parameters<typeof registerTaskTools>[0],
			new TaskExecutionCoordinator(),
		);
		const ctx = createMockCtx({ cwd: tmpRoot });
		const tool = pi._getTool("task");
		const task = createTask({
			origin: "other",
			state: "completed",
			summary: "completed task",
		});
		const before = getTask(task.id);

		const rejected = await tool?.execute(
			"completed-to-skipped",
			{
				action: "update",
				id: task.id,
				state: "skipped",
				summary: "changed summary",
			},
			undefined,
			undefined,
			ctx,
		);

		expect(rejected.details.outcome).toBe("rejected");
		expect(getTask(task.id)).toEqual(before);
	});

	it("rejects invalid notes or blockers without patching or transitioning", async () => {
		const pi = createMockPi();
		registerTaskTools(
			pi as Parameters<typeof registerTaskTools>[0],
			new TaskExecutionCoordinator(),
		);
		const ctx = createMockCtx({ cwd: tmpRoot });
		const tool = pi._getTool("task");
		const task = createTask({ origin: "other", summary: "pending task" });
		const before = getTask(task.id);

		const oversizedNotes = await tool?.execute(
			"oversized-notes",
			{
				action: "update",
				id: task.id,
				state: "running",
				notes: "n".repeat(501),
			},
			undefined,
			undefined,
			ctx,
		);
		expect(oversizedNotes.details.outcome).toBe("rejected");
		expect(getTask(task.id)).toEqual(before);

		const invalidBlockers = await tool?.execute(
			"invalid-blockers",
			{
				action: "update",
				id: task.id,
				state: "running",
				blockedBy: ["missing-task"],
			},
			undefined,
			undefined,
			ctx,
		);
		expect(invalidBlockers.details.outcome).toBe("rejected");
		expect(getTask(task.id)).toEqual(before);
	});

	it("rejects blocked starts through update without applying the patch", async () => {
		const pi = createMockPi();
		registerTaskTools(
			pi as Parameters<typeof registerTaskTools>[0],
			new TaskExecutionCoordinator(),
		);
		const ctx = createMockCtx({ cwd: tmpRoot });
		const tool = pi._getTool("task");
		const blocker = createTask({ origin: "other", summary: "blocker" });
		const waiting = createTask({
			origin: "other",
			summary: "waiting",
			notes: "original",
			blockedBy: [blocker.id],
		});

		const result = await tool?.execute(
			"blocked-start",
			{
				action: "update",
				id: waiting.id,
				state: "running",
				notes: "must not persist",
			},
			undefined,
			undefined,
			ctx,
		);

		expect(result.details.outcome).toBe("rejected");
		expect(result.details.error).toContain(blocker.id.slice(0, 8));
		expect(getTask(waiting.id)?.state).toBe("pending");
		expect(getTask(waiting.id)?.notes).toBe("original");
	});

	it("persists skip reasons and retry counts through update", async () => {
		const pi = createMockPi();
		registerTaskTools(
			pi as Parameters<typeof registerTaskTools>[0],
			new TaskExecutionCoordinator(),
		);
		const ctx = createMockCtx({ cwd: tmpRoot });
		const tool = pi._getTool("task");
		const skipped = createTask({ origin: "other", summary: "skip me" });
		const failed = createTask({
			origin: "other",
			summary: "retry me",
			state: "running",
		});
		transitionTask(failed.id, "failed", { errorReason: "first failure" });

		const skipResult = await tool?.execute(
			"skip-task",
			{
				action: "update",
				id: skipped.id,
				state: "skipped",
				skipReason: "not required",
			},
			undefined,
			undefined,
			ctx,
		);
		const retryResult = await tool?.execute(
			"retry-task",
			{ action: "update", id: failed.id, state: "running" },
			undefined,
			undefined,
			ctx,
		);

		expect(skipResult.details.outcome).toBe("persisted");
		expect(getTask(skipped.id)?.skipReason).toBe("not required");
		expect(retryResult.details.outcome).toBe("persisted");
		expect(getTask(failed.id)?.retryCount).toBe(1);
		expect(getTask(failed.id)?.errorReason).toBeUndefined();
	});

	it("reads legacy todos from an override while preserving the target workspace", async () => {
		const sourceRoot = fs.mkdtempSync(
			path.join(os.tmpdir(), "pi-legacy-source-"),
		);
		const legacyDir = path.join(sourceRoot, ".pi");
		fs.mkdirSync(legacyDir, { recursive: true });
		fs.writeFileSync(
			path.join(legacyDir, "todo.json"),
			JSON.stringify({
				items: [
					{
						id: "override-legacy",
						title: "import from override",
						status: "pending",
					},
				],
			}),
			"utf8",
		);
		const previous = process.env.PI_LEGACY_TODO_SOURCE_DIR;
		process.env.PI_LEGACY_TODO_SOURCE_DIR = sourceRoot;
		try {
			const pi = createMockPi();
			const mod = await import("../extensions/tasks.ts");
			mod.default(pi as Parameters<typeof mod.default>[0]);
			await pi
				._getHook("session_start")[0]
				?.handler({}, createMockCtx({ cwd: tmpRoot }));
			const records = listTasks();
			expect(records).toHaveLength(1);
			expect(records[0].metadata?.legacyTodoId).toBe("override-legacy");
			expect(records[0].workspace).toBe(resolveTaskWorkspace(tmpRoot));
		} finally {
			fs.rmSync(sourceRoot, { recursive: true, force: true });
			if (previous === undefined) delete process.env.PI_LEGACY_TODO_SOURCE_DIR;
			else process.env.PI_LEGACY_TODO_SOURCE_DIR = previous;
		}
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
				agent: "builder",
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
		const visible = JSON.parse(output.content[0].text);
		expect(visible).toMatchObject({
			outcome: "persisted",
			id,
			state: "completed",
			truncated: true,
			output: "file-only",
		});
		expect(output.content[0].text).not.toContain("completed output");
		expect(output.content[0].text.length).toBeLessThan(1_000);
		expect(output.details.output).toContain("completed output");
		expect(output.details.truncated).toBe(true);
		const outputPath = getTask(id)?.execution?.outputPath;
		expect(outputPath).toBeTruthy();
		if (!outputPath) throw new Error("task output path was not persisted");
		expect(visible.execution.outputPath).toBe(outputPath);
		expect(fs.readFileSync(outputPath, "utf-8").length).toBeGreaterThan(
			output.details.output.length,
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
				{ action: "create", agent: "builder", task: "Wait" },
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

	it("cancels active execution through the tasks command", async () => {
		const aborted = vi.fn();
		const pi = createMockPi();
		const coordinator = new TaskExecutionCoordinator(
			async (_execution, _cwd, signal) => {
				await new Promise<void>((_resolve, reject) => {
					signal.addEventListener(
						"abort",
						() => {
							aborted();
							reject(new Error("aborted"));
						},
						{ once: true },
					);
				});
				return { output: "late output", exitCode: 0 };
			},
		);
		registerTaskTools(
			pi as Parameters<typeof registerTaskTools>[0],
			coordinator,
		);
		registerTasksCommand(
			pi as Parameters<typeof registerTasksCommand>[0],
			coordinator,
		);
		const ctx = createMockCtx({ cwd: tmpRoot });
		const tool = pi._getTool("task");
		const created = await tool?.execute(
			"create-command-cancel",
			{
				action: "create",
				agent: "builder",
				task: "Wait",
			},
			undefined,
			undefined,
			ctx,
		);
		const id = created.details.record.id as string;
		await tool?.execute(
			"execute-command-cancel",
			{ action: "execute", id },
			undefined,
			undefined,
			ctx,
		);
		const command = pi._commands.find((item) => item.name === "tasks");
		if (!command) throw new Error("tasks command not registered");

		await command.handler(`cancel ${id}`, ctx);

		expect(aborted).toHaveBeenCalledOnce();
		expect(getTask(id)?.state).toBe("cancelled");
		expect(getTask(id)?.execution?.status).toBe("stopped");
		expect(getTask(id)?.execution?.outputPath).toBeUndefined();
		expect(
			(ctx.ui.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0],
		).toContain("Cancelled");
	});

	it("rejects execution while dependencies are unresolved", () => {
		const blocker = createTask({ origin: "other", summary: "blocker" });
		const task = createTask({
			origin: "subagent",
			summary: "blocked worker",
			blockedBy: [blocker.id],
			execution: {
				kind: "subagent",
				agent: "builder",
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
				agent: "builder",
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

	it("advertises bounded graph and multi-ID schemas", () => {
		const pi = createMockPi();
		registerTaskTools(
			pi as Parameters<typeof registerTaskTools>[0],
			new TaskExecutionCoordinator(),
		);
		const parameters = pi._getTool("task")?.parameters;
		expect(parameters.additionalProperties).toBe(true);
		expect(parameters.properties.ids).toMatchObject({
			minItems: 1,
			maxItems: 8,
		});
		expect(parameters.properties.tasks).toMatchObject({
			minItems: 0,
			maxItems: 16,
		});
		const taskItem = parameters.properties.tasks.items;
		expect(taskItem.additionalProperties).toBe(true);
		expect(taskItem.properties).toHaveProperty("key");
		expect(taskItem.properties.blockedBy.maxItems).toBe(16);
		expect(taskItem.properties.blockedByKeys.maxItems).toBe(16);
		const actions = parameters.properties.action.anyOf.map(
			(item: { const: string }) => item.const,
		);
		expect(actions).toEqual(expect.arrayContaining(["execute_many", "await"]));
	});

	it("publishes graph-aware batches and rejects malformed bounds", async () => {
		const pi = createMockPi();
		registerTaskTools(
			pi as Parameters<typeof registerTaskTools>[0],
			new TaskExecutionCoordinator(),
		);
		const tool = pi._getTool("task");
		const ctx = createMockCtx({ cwd: tmpRoot });
		const empty = await tool?.execute(
			"batch-empty",
			{ action: "batch" },
			undefined,
			undefined,
			ctx,
		);
		expect(JSON.parse(empty.content[0].text)).toEqual({
			outcome: "persisted",
			count: 0,
			tasks: [],
		});
		const result = await tool?.execute(
			"batch-graph",
			{
				action: "batch",
				tasks: [
					{ key: "downstream", summary: "downstream", blockedByKeys: ["root"] },
					{ key: "root", summary: "root" },
				],
			},
			undefined,
			undefined,
			ctx,
		);
		const visible = JSON.parse(result.content[0].text);
		expect(visible.tasks.map((item: { key: string }) => item.key)).toEqual([
			"downstream",
			"root",
		]);
		expect(result.details.aliases).toEqual({
			downstream: visible.tasks[0].id,
			root: visible.tasks[1].id,
		});
		expect(getTask(visible.tasks[0].id)?.blockedBy).toEqual([
			visible.tasks[1].id,
		]);
		expect(
			Buffer.byteLength(result.content[0].text, "utf8"),
		).toBeLessThanOrEqual(4_096);
		const worstCase = await tool?.execute(
			"batch-worst-case",
			{
				action: "batch",
				tasks: Array.from({ length: 16 }, (_, index) => ({
					key: `${String(index).padStart(2, "0")}${"x".repeat(30)}`,
					summary: `task ${index}`,
				})),
			},
			undefined,
			undefined,
			ctx,
		);
		expect(JSON.parse(worstCase.content[0].text).tasks).toHaveLength(16);
		expect(
			Buffer.byteLength(worstCase.content[0].text, "utf8"),
		).toBeLessThanOrEqual(4_096);
		await expect(
			tool?.execute(
				"batch-too-large",
				{
					action: "batch",
					tasks: Array.from({ length: 17 }, (_, index) => ({
						key: `task-${index}`,
						summary: `task ${index}`,
					})),
				},
				undefined,
				undefined,
				ctx,
			),
		).rejects.toThrow("at most 16");
	});

	it("runs a mixed manual and subagent graph through the public one-shot workflow", async () => {
		const releases = new Map<
			string,
			(value: { output: string; exitCode: number }) => void
		>();
		const runnerEntries: string[] = [];
		const runner = vi.fn(
			(_execution, _cwd, _signal, _onUpdate, taskId: string) => {
				runnerEntries.push(taskId);
				return new Promise<{ output: string; exitCode: number }>((resolve) => {
					releases.set(taskId, resolve);
				});
			},
		);
		const coordinator = new TaskExecutionCoordinator(runner);
		const pi = createMockPi();
		registerTaskTools(
			pi as Parameters<typeof registerTaskTools>[0],
			coordinator,
		);
		const ctx = createMockCtx({ cwd: tmpRoot });
		const tool = pi._getTool("task");
		const actionSpy = vi.fn();
		const invoke = async (params: Record<string, unknown>) => {
			actionSpy(params.action);
			return tool?.execute(
				"mixed-graph-workflow",
				params,
				undefined,
				undefined,
				ctx,
			);
		};

		const batch = await invoke({
			action: "batch",
			tasks: [
				{ key: "prepare", summary: "prepare manually" },
				{
					key: "worker-one",
					summary: "run first worker",
					blockedByKeys: ["prepare"],
					agent: "builder",
					task: "Run first worker",
				},
				{
					key: "worker-two",
					summary: "run second worker",
					blockedByKeys: ["prepare"],
					agent: "builder",
					task: "Run second worker",
				},
				{
					key: "finish",
					summary: "finish manually",
					blockedByKeys: ["worker-one", "worker-two"],
				},
			],
		});
		const aliases = batch.details.aliases as Record<string, string>;
		expect(Object.keys(aliases).sort()).toEqual([
			"finish",
			"prepare",
			"worker-one",
			"worker-two",
		]);
		const prepareId = aliases.prepare;
		const workerIds = [aliases["worker-one"], aliases["worker-two"]];
		const finishId = aliases.finish;
		expect(getTask(workerIds[0])?.blockedBy).toEqual([prepareId]);
		expect(getTask(workerIds[1])?.blockedBy).toEqual([prepareId]);
		expect(getTask(finishId)?.blockedBy).toEqual(workerIds);

		const preparing = await invoke({
			action: "update",
			id: prepareId,
			state: "running",
		});
		expect(preparing.details.outcome).toBe("persisted");
		const prepared = await invoke({
			action: "update",
			id: prepareId,
			state: "completed",
		});
		expect(prepared.details.outcome).toBe("persisted");
		const workersReady = await invoke({ action: "ready" });
		expect(
			workersReady.details.records
				.map((record: { id: string }) => record.id)
				.sort(),
		).toEqual([...workerIds].sort());

		const started = await invoke({ action: "execute_many", ids: workerIds });
		expect(
			started.details.results.map(
				(result: { classification: string }) => result.classification,
			),
		).toEqual(["started", "started"]);
		expect(runnerEntries).toEqual(workerIds);

		const waiting = invoke({ action: "await", ids: workerIds });
		for (const workerId of workerIds) {
			releases.get(workerId)?.({
				output: `artifact for ${workerId}`,
				exitCode: 0,
			});
		}
		const awaited = await waiting;
		expect(
			awaited.details.results.map(
				(result: { classification: string }) => result.classification,
			),
		).toEqual(["terminal", "terminal"]);
		for (const workerId of workerIds) {
			const worker = getTask(workerId);
			expect(worker?.state).toBe("completed");
			expect(worker?.execution?.outputPath).toBeTruthy();
			if (!worker?.execution?.outputPath)
				throw new Error("worker artifact was not persisted");
			expect(fs.readFileSync(worker.execution.outputPath, "utf-8")).toContain(
				workerId,
			);
		}

		const finishReady = await invoke({ action: "ready" });
		expect(
			finishReady.details.records.map((record: { id: string }) => record.id),
		).toEqual([finishId]);
		await invoke({ action: "update", id: finishId, state: "running" });
		await invoke({ action: "update", id: finishId, state: "completed" });

		expect(actionSpy.mock.calls.map(([action]) => action)).toEqual([
			"batch",
			"update",
			"update",
			"ready",
			"execute_many",
			"await",
			"ready",
			"update",
			"update",
		]);
		expect(actionSpy.mock.calls.flat()).not.toEqual(
			expect.arrayContaining(["list", "get", "output"]),
		);
		expect(getTask(prepareId)?.state).toBe("completed");
		expect(getTask(finishId)?.state).toBe("completed");
	});

	it("executes and awaits workspace-safe mixed requests in order", async () => {
		const releases = new Map<
			string,
			(value: { output: string; exitCode: number }) => void
		>();
		const runner = vi.fn(
			(_execution, _cwd, _signal, _onUpdate, taskId: string) =>
				new Promise<{ output: string; exitCode: number }>((resolve) => {
					releases.set(taskId, resolve);
				}),
		);
		const coordinator = new TaskExecutionCoordinator(runner);
		const pi = createMockPi();
		registerTaskTools(
			pi as Parameters<typeof registerTaskTools>[0],
			coordinator,
		);
		const ctx = createMockCtx({ cwd: tmpRoot });
		const workspace = resolveTaskWorkspace(tmpRoot);
		const first = createExecutable("first", workspace);
		const unscoped = createExecutable("unscoped");
		const manual = createTask({
			origin: "other",
			summary: "manual",
			workspace,
		});
		const foreign = createExecutable("foreign", `${workspace}-foreign`);
		const ids = [first.id, manual.id, foreign.id, "missing", unscoped.id];
		const started = await pi
			._getTool("task")
			?.execute(
				"execute-many",
				{ action: "execute_many", ids },
				undefined,
				undefined,
				ctx,
			);
		expect(
			started.details.results.map(
				(item: { classification: string }) => item.classification,
			),
		).toEqual([
			"started",
			"manual_ready",
			"foreign_workspace",
			"missing",
			"started",
		]);
		expect(started.details.results[2]).not.toHaveProperty("record");
		expect(started.details.results[3]).not.toHaveProperty("record");
		expect(runner.mock.calls.map((call) => call[4])).toEqual([
			first.id,
			unscoped.id,
		]);
		const waiting = pi
			._getTool("task")
			?.execute(
				"await-many",
				{ action: "await", ids },
				undefined,
				undefined,
				ctx,
			);
		releases.get(first.id)?.({ output: "first", exitCode: 0 });
		releases.get(unscoped.id)?.({ output: "unscoped", exitCode: 0 });
		const awaited = await waiting;
		expect(
			awaited.details.results.map(
				(item: { classification: string }) => item.classification,
			),
		).toEqual([
			"terminal",
			"manual_ready",
			"foreign_workspace",
			"missing",
			"terminal",
		]);
		expect(JSON.parse(awaited.content[0].text).results).toHaveLength(
			ids.length,
		);
	});

	it("passes await abort without cancelling workers and rejects duplicate IDs", async () => {
		let release:
			| ((value: { output: string; exitCode: number }) => void)
			| undefined;
		let workerSignal: AbortSignal | undefined;
		const coordinator = new TaskExecutionCoordinator(
			async (_execution, _cwd, signal) => {
				workerSignal = signal;
				return new Promise((resolve) => {
					release = resolve;
				});
			},
		);
		const pi = createMockPi();
		registerTaskTools(
			pi as Parameters<typeof registerTaskTools>[0],
			coordinator,
		);
		const ctx = createMockCtx({ cwd: tmpRoot });
		const task = createExecutable(
			"abort public",
			resolveTaskWorkspace(tmpRoot),
		);
		await pi
			._getTool("task")
			?.execute(
				"start-public",
				{ action: "execute_many", ids: [task.id] },
				undefined,
				undefined,
				ctx,
			);
		const controller = new AbortController();
		const waiting = pi
			._getTool("task")
			?.execute(
				"await-public",
				{ action: "await", ids: [task.id] },
				controller.signal,
				undefined,
				ctx,
			);
		controller.abort();
		const result = await waiting;
		expect(result.details.results[0].classification).toBe("aborted");
		expect(workerSignal?.aborted).toBe(false);
		await expect(
			pi
				._getTool("task")
				?.execute(
					"duplicate-public",
					{ action: "execute_many", ids: [task.id, task.id] },
					undefined,
					undefined,
					ctx,
				),
		).rejects.toThrow("duplicate task id");
		release?.({ output: "done", exitCode: 0 });
		await vi.waitFor(() => expect(getTask(task.id)?.state).toBe("completed"));
	});

	it("keeps all mandatory results under the Unicode content budget", async () => {
		const tasks = Array.from({ length: 8 }, (_, index) =>
			createExecutable(`failure ${index}`, resolveTaskWorkspace(tmpRoot)),
		);
		const coordinator = new TaskExecutionCoordinator(
			async () => ({ output: "unexpected", exitCode: 0 }),
			() => {
				throw new Error(`write failed ${"😀".repeat(500)}`);
			},
		);
		const pi = createMockPi();
		registerTaskTools(
			pi as Parameters<typeof registerTaskTools>[0],
			coordinator,
		);
		const result = await pi
			._getTool("task")
			?.execute(
				"budget-many",
				{ action: "execute_many", ids: tasks.map((task) => task.id) },
				undefined,
				undefined,
				createMockCtx({ cwd: tmpRoot }),
			);
		const visible = JSON.parse(result.content[0].text);
		expect(
			Buffer.byteLength(result.content[0].text, "utf8"),
		).toBeLessThanOrEqual(4_096);
		expect(visible.results).toHaveLength(8);
		expect(visible.results.map((item: { id: string }) => item.id)).toEqual(
			tasks.map((task) => task.id),
		);
		expect(
			visible.results.every(
				(item: { classification: string }) =>
					item.classification === "start_failed",
			),
		).toBe(true);
	});

	it("budgets long terminal artifact paths after mandatory await fields", async () => {
		const workspace = resolveTaskWorkspace(tmpRoot);
		const tasks = Array.from({ length: 8 }, (_, index) =>
			createTask({
				origin: "subagent",
				summary: `terminal ${index}`,
				workspace,
				state: "completed",
				execution: {
					kind: "subagent",
					agent: "builder",
					task: "Run",
					status: "completed",
					outputPath: `C:/tmp/${"😀".repeat(1_000)}/${index}.md`,
				},
			}),
		);
		const pi = createMockPi();
		registerTaskTools(
			pi as Parameters<typeof registerTaskTools>[0],
			new TaskExecutionCoordinator(),
		);
		const result = await pi
			._getTool("task")
			?.execute(
				"await-artifacts",
				{ action: "await", ids: tasks.map((task) => task.id) },
				undefined,
				undefined,
				createMockCtx({ cwd: tmpRoot }),
			);
		const visible = JSON.parse(result.content[0].text);
		expect(
			Buffer.byteLength(result.content[0].text, "utf8"),
		).toBeLessThanOrEqual(4_096);
		expect(visible.results).toHaveLength(8);
		expect(
			visible.results.every(
				(item: { classification: string }) =>
					item.classification === "terminal",
			),
		).toBe(true);
		expect(result.details.results[0].record.execution.outputPath).toContain(
			"😀".repeat(1_000),
		);
	});

	it("rejects failed-to-stop execution through legacy and multi actions", async () => {
		const workspace = resolveTaskWorkspace(tmpRoot);
		const task = createTask({
			origin: "subagent",
			summary: "failed to stop",
			workspace,
			state: "running",
			execution: {
				kind: "subagent",
				agent: "builder",
				task: "Run",
				status: "failed_to_stop",
				ownerPid: process.pid,
			},
		});
		const pi = createMockPi();
		registerTaskTools(
			pi as Parameters<typeof registerTaskTools>[0],
			new TaskExecutionCoordinator(),
		);
		const tool = pi._getTool("task");
		const ctx = createMockCtx({ cwd: tmpRoot });
		const legacy = await tool?.execute(
			"legacy-failed-to-stop",
			{ action: "execute", id: task.id },
			undefined,
			undefined,
			ctx,
		);
		const many = await tool?.execute(
			"many-failed-to-stop",
			{ action: "execute_many", ids: [task.id] },
			undefined,
			undefined,
			ctx,
		);
		expect(legacy.details.outcome).toBe("failed_to_stop");
		expect(many.details.results[0].classification).toBe("failed_to_stop");
		expect(getTask(task.id)?.execution?.status).toBe("failed_to_stop");
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

function createExecutable(summary: string, workspace?: string) {
	return createTask({
		origin: "subagent",
		summary,
		workspace,
		execution: {
			kind: "subagent",
			agent: "builder",
			task: "Run",
			status: "pending",
		},
	});
}
