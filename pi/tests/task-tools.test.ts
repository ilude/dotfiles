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
} from "vitest";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

const prevMetricsDir = process.env.PI_METRICS_DIR;
const metricsRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "pi-task-tools-metrics-"),
);
process.env.PI_METRICS_DIR = metricsRoot;

const { registerTaskTools } = await import("../extensions/tasks.ts");
const {
	createTask,
	getTask,
	listTasks,
	pruneTaskRegistry,
	resolveTaskWorkspace,
	transitionTask,
} = await import("../lib/task-registry.ts");

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
	it("accepts additive write scopes on create, batch, and update", async () => {
		const pi = createMockPi();
		registerTaskTools(pi as Parameters<typeof registerTaskTools>[0]);
		const tool = pi._getTool("task");
		const ctx = createMockCtx({ cwd: tmpRoot });
		const created = await tool?.execute(
			"scoped-create",
			{ action: "create", summary: "scoped", scope: ["./src/**"] },
			undefined,
			undefined,
			ctx,
		);
		const id = created.details.record.id as string;
		expect(created.details.record.scope).toEqual(["src/**"]);

		const updated = await tool?.execute(
			"scoped-update",
			{ action: "update", id, scope: ["docs/**"] },
			undefined,
			undefined,
			ctx,
		);
		expect(updated.details.record.scope).toEqual(["docs/**"]);

		const batch = await tool?.execute(
			"scoped-batch",
			{
				action: "batch",
				tasks: [
					{
						key: "worker",
						summary: "worker",
						scope: ["test/**"],
					},
				],
			},
			undefined,
			undefined,
			ctx,
		);
		expect(batch.details.records[0].scope).toEqual(["test/**"]);
	});

	it("uses one registry for planning dependencies and readiness", async () => {
		const pi = createMockPi();
		registerTaskTools(pi as Parameters<typeof registerTaskTools>[0]);
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

	it("advances a durable dependency graph through explicit state updates", async () => {
		const pi = createMockPi();
		registerTaskTools(pi as Parameters<typeof registerTaskTools>[0]);
		const tool = pi._getTool("task");
		const ctx = createMockCtx({ cwd: tmpRoot });
		const batch = await tool?.execute(
			"workflow-batch",
			{
				action: "batch",
				tasks: [
					{ key: "first", summary: "first step" },
					{
						key: "second",
						summary: "second step",
						blockedByKeys: ["first"],
					},
				],
			},
			undefined,
			undefined,
			ctx,
		);
		const [first, second] = batch.details.records as Array<{ id: string }>;

		const initiallyReady = await tool?.execute(
			"workflow-ready-first",
			{ action: "ready" },
			undefined,
			undefined,
			ctx,
		);
		expect(initiallyReady.details.records.map((item: { id: string }) => item.id)).toEqual([
			first.id,
		]);
		for (const state of ["running", "completed"]) {
			const updated = await tool?.execute(
				`workflow-${state}`,
				{ action: "update", id: first.id, state },
				undefined,
				undefined,
				ctx,
			);
			expect(updated.details.record.state).toBe(state);
		}
		const nextReady = await tool?.execute(
			"workflow-ready-second",
			{ action: "ready" },
			undefined,
			undefined,
			ctx,
		);
		expect(nextReady.details.records.map((item: { id: string }) => item.id)).toEqual([
			second.id,
		]);
	});

	it("rejects retired execution actions without changing task state", async () => {
		const pi = createMockPi();
		registerTaskTools(pi as Parameters<typeof registerTaskTools>[0]);
		const tool = pi._getTool("task");
		const ctx = createMockCtx({ cwd: tmpRoot });
		const task = createTask({
			origin: "other",
			summary: "manual execution",
			workspace: resolveTaskWorkspace(tmpRoot),
		});

		for (const action of [
			"execute",
			"execute_many",
			"drain",
			"await",
			"stop",
			"output",
		]) {
			const result = await tool?.execute(
				`retired-${action}`,
				{ action, id: task.id, ids: [task.id] },
				undefined,
				undefined,
				ctx,
			);
			expect(result.details).toMatchObject({
				outcome: "rejected",
				error: expect.stringContaining("is retired"),
			});
		}
		for (const input of [
			{ action: "create", summary: "legacy", agent: "builder", task: "run" },
			{
				action: "batch",
				tasks: [{ summary: "legacy batch", agent: "builder", task: "run" }],
			},
		]) {
			const result = await tool?.execute(
				"retired-field",
				input,
				undefined,
				undefined,
				ctx,
			);
			expect(result.details).toMatchObject({
				outcome: "rejected",
				error: expect.stringContaining("field"),
			});
		}
		expect(getTask(task.id)?.state).toBe("pending");
		expect(listTasks()).toHaveLength(1);
	});

	it("keeps model-visible mutations and collections compact while retaining full details", async () => {
		const pi = createMockPi();
		registerTaskTools(pi as Parameters<typeof registerTaskTools>[0]);
		const ctx = createMockCtx({ cwd: tmpRoot });
		const tool = pi._getTool("task");
		const created = await tool?.execute(
			"compact-create",
			{
				action: "create",
				summary: "durable work",
				notes: "Acceptance: preserve complete durable task details.",
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
		const persistedShape = JSON.parse(JSON.stringify(created.details.record));
		expect(persistedShape).not.toHaveProperty("prompt");
		expect(persistedShape).not.toHaveProperty("execution");

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
			tasks: [{ id, state: "pending", summary: "durable work" }],
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
			{ id, state: "pending", summary: "durable work" },
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
		});
		expect(fullVisible.record).not.toHaveProperty("prompt");
		expect(fullVisible.record).not.toHaveProperty("execution");
		expect(fullVisible.record).toHaveProperty("createdAt");
	});

	it("lists only active scoped workspace tasks unless all is requested", async () => {
		const pi = createMockPi();
		registerTaskTools(pi as Parameters<typeof registerTaskTools>[0]);
		const workspace = resolveTaskWorkspace(tmpRoot);
		const active = createTask({
			origin: "other",
			summary: "active task",
			workspace,
		});
		const completed = createTask({
			origin: "other",
			summary: "completed task",
			workspace,
			state: "running",
		});
		transitionTask(completed.id, "completed");
		const unscoped = createTask({
			origin: "other",
			summary: "unscoped task",
		});
		const foreign = createTask({
			origin: "other",
			summary: "foreign task",
			workspace: path.join(tmpRoot, "other"),
		});
		const tool = pi._getTool("task");
		const ctx = createMockCtx({ cwd: tmpRoot });

		const current = await tool?.execute(
			"current-list",
			{ action: "list" },
			undefined,
			undefined,
			ctx,
		);
		expect(current.details.records.map((record: { id: string }) => record.id)).toEqual([
			active.id,
		]);

		const all = await tool?.execute(
			"all-list",
			{ action: "list", all: true },
			undefined,
			undefined,
			ctx,
		);
		expect(
			new Set(all.details.records.map((record: { id: string }) => record.id)),
		).toEqual(new Set([active.id, completed.id, unscoped.id, foreign.id]));
	});

	it("scopes default lists to the current session", async () => {
		const pi = createMockPi();
		registerTaskTools(pi as Parameters<typeof registerTaskTools>[0]);
		const tool = pi._getTool("task");
		const currentCtx = createMockCtx({
			cwd: tmpRoot,
			sessionManager: { getSessionId: () => "current-session" },
		});
		const otherCtx = createMockCtx({
			cwd: tmpRoot,
			sessionManager: { getSessionId: () => "other-session" },
		});
		const current = await tool?.execute(
			"create-current-session",
			{ action: "create", summary: "current session task" },
			undefined,
			undefined,
			currentCtx,
		);
		const other = await tool?.execute(
			"create-other-session",
			{ action: "create", summary: "other session task" },
			undefined,
			undefined,
			otherCtx,
		);

		const listed = await tool?.execute(
			"list-current-session",
			{ action: "list" },
			undefined,
			undefined,
			currentCtx,
		);
		expect(listed.details.records.map((record: { id: string }) => record.id)).toEqual([
			current.details.record.id,
		]);
		expect(current.details.record.sessionId).toBe("current-session");
		expect(other.details.record.sessionId).toBe("other-session");

		const all = await tool?.execute(
			"list-all-sessions",
			{ action: "list", all: true },
			undefined,
			undefined,
			currentCtx,
		);
		expect(new Set(all.details.records.map((record: { id: string }) => record.id))).toEqual(
			new Set([current.details.record.id, other.details.record.id]),
		);
	});

	it("rejects invalid completed-to-skipped updates without patching fields", async () => {
		const pi = createMockPi();
		registerTaskTools(pi as Parameters<typeof registerTaskTools>[0]);
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
		registerTaskTools(pi as Parameters<typeof registerTaskTools>[0]);
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
		registerTaskTools(pi as Parameters<typeof registerTaskTools>[0]);
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
		registerTaskTools(pi as Parameters<typeof registerTaskTools>[0]);
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

	it("imports legacy todos from an override while preserving the target workspace", async () => {
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
			const mod = await import("../extensions/tasks.ts");
			const records = mod.importLegacyTodos(
				tmpRoot,
				process.env.PI_LEGACY_TODO_SOURCE_DIR,
			);
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

		pruneTaskRegistry();
		expect(listTasks()).toHaveLength(0);
		expect(importLegacyTodos(tmpRoot)).toHaveLength(0);
	});

	it("publishes graph-aware batches and rejects malformed bounds", async () => {
		const pi = createMockPi();
		registerTaskTools(pi as Parameters<typeof registerTaskTools>[0]);
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

});
