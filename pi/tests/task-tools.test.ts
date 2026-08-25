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
import { closeTaskDatabase, initializeTaskStore } from "../lib/task-store.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

const prevMetricsDir = process.env.PI_METRICS_DIR;
const metricsRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "pi-task-tools-metrics-"),
);
process.env.PI_METRICS_DIR = metricsRoot;

const tasksExtension = await import("../extensions/tasks.ts");
const { registerTaskTools } = tasksExtension;
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
	initializeTaskStore(tmpRoot);
	process.env.PI_METRICS_DIR = testMetricsDir;
});

afterEach(() => {
	closeTaskDatabase(tmpRoot);
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
	it("rejects durable task mutation from delegated child processes", async () => {
		const pi = createMockPi();
		registerTaskTools(pi as Parameters<typeof registerTaskTools>[0]);
		const tool = pi._getTool("task");
		const previousRole = process.env.PI_SUBAGENT_TREE_ROLE;
		process.env.PI_SUBAGENT_TREE_ROLE = "leaf";
		try {
			const result = await tool?.execute(
				"child-create",
				{ action: "create", summary: "must stay root-owned" },
				undefined,
				undefined,
				createMockCtx({ cwd: tmpRoot }),
			);
			expect(result.details.outcome).toBe("rejected");
			expect(result.details.error).toContain("conversational root");
			expect(listTasks()).toEqual([]);
		} finally {
			if (previousRole === undefined) delete process.env.PI_SUBAGENT_TREE_ROLE;
			else process.env.PI_SUBAGENT_TREE_ROLE = previousRole;
		}
	});

	it("reminds the agent only about assigned root tasks from its session", async () => {
		const workspace = resolveTaskWorkspace(tmpRoot);
		const sessionId = "current-session";
		const first = createTask({
			origin: "other",
			summary: "Preserve the first outcome",
			workspace,
			sessionId,
			notes: "Done when the first acceptance check passes.",
		});
		const second = createTask({
			origin: "other",
			summary: "Preserve the second outcome",
			workspace,
			sessionId,
		});
		const pending = createTask({
			origin: "other",
			summary: "Pending work",
			workspace,
			sessionId,
		});
		const otherSession = createTask({
			origin: "other",
			summary: "Other session work",
			workspace,
			sessionId: "other-session",
		});
		const otherRoot = path.join(tmpRoot, "other");
		fs.mkdirSync(otherRoot, { recursive: true });
		const other = createTask({
			origin: "other",
			summary: "Other workspace work",
			workspace: resolveTaskWorkspace(otherRoot),
		});
		for (const record of [first, second, otherSession, other])
			transitionTask(record.id, "assigned");

		const pi = createMockPi();
		tasksExtension.default(pi as Parameters<typeof tasksExtension.default>[0]);
		const beforeAgentStart = pi._getHook("before_agent_start")[0]?.handler;
		const ctx = createMockCtx({
			cwd: tmpRoot,
			sessionManager: { getSessionId: () => sessionId },
		});
		await beforeAgentStart?.({ systemPrompt: "base" }, ctx);
		const contextHook = pi._getHook("context")[0]?.handler;
		const reminder = await contextHook?.({ messages: [] }, ctx);
		const content = reminder?.messages[0]?.content as string;

		expect(content).toContain(first.id);
		expect(content).toContain(second.id);
		expect(content).toContain("<!-- pi-runtime-context:tasks -->");
		expect(content).toContain(
			"If multiple tasks could own the request, do not choose silently.",
		);
		expect(content).not.toContain(pending.id);
		expect(content).not.toContain(otherSession.id);
		expect(content).not.toContain(other.id);
		expect(
			await beforeAgentStart?.(
				{ systemPrompt: "base" },
				createMockCtx({ cwd: tmpRoot }),
			),
		).toBeUndefined();

		transitionTask(first.id, "completed", {
			outcome: { summary: first.summary, evidence: "reminder fixture" },
		});
		transitionTask(second.id, "completed", {
			outcome: { summary: second.summary, evidence: "reminder fixture" },
		});
		expect(
			await beforeAgentStart?.({ systemPrompt: "base" }, ctx),
		).toBeUndefined();
	});

	it("recovers an explicit cross-session root and supplements the current frontier", () => {
		const workspace = resolveTaskWorkspace(tmpRoot);
		const dependency = createTask({
			origin: "other",
			summary: "durable prerequisite",
			workspace,
			sessionId: "other-session",
			state: "completed",
		});
		const root = createTask({
			origin: "other",
			summary: "Preserve the existing deliverable",
			workspace,
			sessionId: "other-session",
			scope: ["src/**"],
			notes: "Acceptance: focused checks pass.",
			blockedBy: [dependency.id],
			state: "running",
		});

		const reminder = tasksExtension.activeRootTaskReminder(
			tmpRoot,
			"current-session",
			root.id,
		);

		expect(reminder).toContain(root.id);
		expect(reminder).toContain(root.summary);
		expect(reminder).toContain("Boundary: src/**");
		expect(reminder).toContain(`Dependencies: ${dependency.id}`);
		expect(reminder).toContain(
			"Instructions and acceptance checks: Acceptance: focused checks pass.",
		);
		expect(reminder).toContain(
			"supplements the current conversational frontier",
		);
		expect(reminder).not.toContain("conversation history");
		expect(reminder).not.toContain("replacement task");
	});

	it("passes the explicitly propagated root task ID through the hook", async () => {
		const workspace = resolveTaskWorkspace(tmpRoot);
		const root = createTask({
			origin: "other",
			summary: "Recover this delegated root",
			workspace,
			sessionId: "other-session",
			state: "running",
		});
		const previousTaskId = process.env.PI_SUBAGENT_COORDINATOR_TASK_ID;
		process.env.PI_SUBAGENT_COORDINATOR_TASK_ID = root.id;
		try {
			const pi = createMockPi();
			tasksExtension.default(pi as Parameters<typeof tasksExtension.default>[0]);
			const beforeAgentStart = pi._getHook("before_agent_start")[0]?.handler;
			await beforeAgentStart?.(
				{ systemPrompt: "base" },
				createMockCtx({
					cwd: tmpRoot,
					sessionManager: { getSessionId: () => "current-session" },
				}),
			);
			const reminder = await pi._getHook("context")[0]?.handler(
				{ messages: [] },
				createMockCtx({
					cwd: tmpRoot,
					sessionManager: { getSessionId: () => "current-session" },
				}),
			);

			expect(reminder?.messages[0]?.content).toContain(root.id);
			expect(reminder?.messages[0]?.content).toContain(root.summary);
		} finally {
			if (previousTaskId === undefined)
				delete process.env.PI_SUBAGENT_COORDINATOR_TASK_ID;
			else process.env.PI_SUBAGENT_COORDINATOR_TASK_ID = previousTaskId;
		}
	});

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
		expect(created.details.record.boundary).toEqual(["src/**"]);

		const updated = await tool?.execute(
			"scoped-update",
			{ action: "update", id, scope: ["docs/**"] },
			undefined,
			undefined,
			ctx,
		);
		expect(updated.details.record.boundary).toEqual(["docs/**"]);

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
		expect(batch.details.records[0].boundary).toEqual(["test/**"]);
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
		expect(blocker.details.record.instructions).toBe("planning note");
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
		for (const state of ["assigned", "completed"]) {
			const updated = await tool?.execute(
				`workflow-${state}`,
				{
					action: "update",
					id: first.id,
					state,
					...(state === "completed" ? { outcome: { summary: "done", evidence: ["tool fixture"] } } : {}),
				},
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
		const prepareArguments = (
			tool as typeof tool & {
				prepareArguments?: (args: unknown) => unknown;
			}
		)?.prepareArguments;
		if (!prepareArguments) throw new Error("prepareArguments should be registered");
		for (const legacyInput of [
			{ action: "execute", id: task.id },
			{ action: "create", summary: "legacy", agent: "builder" },
		]) {
			const prepared = prepareArguments(legacyInput);
			expect(prepared).toMatchObject({ action: "get" });
			const result = await tool?.execute(
				"resumed-retired-call",
				prepared,
				undefined,
				undefined,
				ctx,
			);
			expect(result.details).toMatchObject({
				outcome: "rejected",
				error: expect.stringContaining("retired"),
			});
		}
		expect(getTask(task.id)?.state).toBe("unassigned");
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
			state: "unassigned",
		});
		expect(created.details.record.instructions).toContain("complete durable");
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
			state: "unassigned",
		});
		expect(updated.details.record.instructions).toBe("Updated acceptance check.");

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
			tasks: [{ id, state: "unassigned", summary: "durable work" }],
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
			{ id, state: "unassigned", summary: "durable work" },
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
			instructions: "Updated acceptance check.",
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
		transitionTask(completed.id, "completed", {
			outcome: { summary: completed.summary, evidence: "scope fixture" },
		});
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
		).toEqual(new Set([active.id, completed.id]));
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

		const recovered = await tool?.execute(
			"get-cross-session-task",
			{ action: "get", id: other.details.record.id },
			undefined,
			undefined,
			currentCtx,
		);
		expect(recovered.details).toMatchObject({
			outcome: "persisted",
			record: { id: other.details.record.id, sessionId: "other-session" },
		});

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
			workspace: resolveTaskWorkspace(tmpRoot),
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
		const task = createTask({
			origin: "other",
			summary: "pending task",
			workspace: resolveTaskWorkspace(tmpRoot),
		});
		const before = getTask(task.id);

		const missing = await tool?.execute(
			"missing-get",
			{ action: "get", id: "missing-task" },
			undefined,
			undefined,
			ctx,
		);
		expect(missing.details).toMatchObject({
			outcome: "not_found",
			error: expect.stringContaining(`task not found in current workspace`),
		});
		expect(missing.details.error).toContain(resolveTaskWorkspace(tmpRoot));

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

		transitionTask(task.id, "assigned");
		const boundedOutcome = await tool?.execute(
			"bounded-outcome",
			{
				action: "update",
				id: task.id,
				state: "completed",
				outcome: {
					summary: "done",
					evidence: Array.from({ length: 9 }, (_, index) => `${index}-private`),
				},
			},
			undefined,
			undefined,
			ctx,
		);
		expect(boundedOutcome.details.outcome).toBe("rejected");
		expect(boundedOutcome.details.error).toMatch(/outcome\.evidence exceeds its bound: count 9, maximum 8, offending index 8/);
		expect(boundedOutcome.details.error).not.toContain("private");

		const oversizedItem = `private-${"x".repeat(2000)}`;
		const oversizedOutcome = await tool?.execute(
			"oversized-outcome-item",
			{
				action: "update",
				id: task.id,
				state: "completed",
				outcome: { summary: "done", evidence: [oversizedItem] },
			},
			undefined,
			undefined,
			ctx,
		);
		expect(oversizedOutcome.details.error).toContain(`offending length ${oversizedItem.length}, item maximum 2000`);
		expect(oversizedOutcome.details.error).not.toContain("private");
	});

	it("rejects blocked starts through update without applying the patch", async () => {
		const pi = createMockPi();
		registerTaskTools(pi as Parameters<typeof registerTaskTools>[0]);
		const ctx = createMockCtx({ cwd: tmpRoot });
		const tool = pi._getTool("task");
		const workspace = resolveTaskWorkspace(tmpRoot);
		const blocker = createTask({
			origin: "other",
			summary: "blocker",
			workspace,
		});
		const waiting = createTask({
			origin: "other",
			summary: "waiting",
			workspace,
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
		expect(getTask(waiting.id)?.state).toBe("unassigned");
		expect(getTask(waiting.id)?.instructions).toBe("original");
	});

	it("persists skip reasons and retry counts through update", async () => {
		const pi = createMockPi();
		registerTaskTools(pi as Parameters<typeof registerTaskTools>[0]);
		const ctx = createMockCtx({ cwd: tmpRoot });
		const tool = pi._getTool("task");
		const workspace = resolveTaskWorkspace(tmpRoot);
		const skipped = createTask({
			origin: "other",
			summary: "skip me",
			workspace,
		});
		const failed = createTask({
			origin: "other",
			summary: "retry me",
			state: "running",
			workspace,
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
		expect(getTask(failed.id)?.endedAt).toBeUndefined();
		expect(JSON.parse(retryResult.content[0].text).readiness).toEqual({
			ready: true,
			unmetBlockers: [],
		});
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
		expect(second?.instructions).toBe("keep this");
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
		await expect(
			tool?.execute(
				"batch-empty",
				{ action: "batch", tasks: [] },
				undefined,
				undefined,
				ctx,
			),
		).rejects.toThrow("at least one task");
		await expect(
			tool?.execute(
				"create-without-summary",
				{ action: "create" },
				undefined,
				undefined,
				ctx,
			),
		).rejects.toThrow("summary is required");
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
