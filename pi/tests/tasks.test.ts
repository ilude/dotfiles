import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

let tmpRoot: string;
let prevOperatorDir: string | undefined;

beforeEach(() => {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-tasks-cmd-"));
	prevOperatorDir = process.env.PI_OPERATOR_DIR;
	process.env.PI_OPERATOR_DIR = tmpRoot;
});

afterEach(() => {
	if (prevOperatorDir === undefined) delete process.env.PI_OPERATOR_DIR;
	else process.env.PI_OPERATOR_DIR = prevOperatorDir;
	fs.rmSync(tmpRoot, { recursive: true, force: true });
});

async function loadTasks() {
	const pi = createMockPi();
	const mod = await import("../extensions/tasks.ts");
	mod.default(pi as any);
	const cmd = pi._commands.find((c) => c.name === "tasks");
	if (!cmd) throw new Error("tasks command not registered");
	return { pi, cmd };
}

describe("parseTasksArgs", () => {
	it("treats empty as list", async () => {
		const mod = await import("../extensions/tasks.ts");
		expect(mod.parseTasksArgs("")).toEqual({ verb: "list" });
	});

	it("recognizes cancel and retry verbs", async () => {
		const mod = await import("../extensions/tasks.ts");
		expect(mod.parseTasksArgs("cancel abc12345")).toEqual({ verb: "cancel", idArg: "abc12345" });
		expect(mod.parseTasksArgs("retry abc12345")).toEqual({ verb: "retry", idArg: "abc12345" });
	});

	it("treats a single token as show", async () => {
		const mod = await import("../extensions/tasks.ts");
		expect(mod.parseTasksArgs("abc12345")).toEqual({ verb: "show", idArg: "abc12345" });
	});
});

describe("groupTasksByUrgency", () => {
	it("orders blocked > failed > running > pending > completed > cancelled", async () => {
		const mod = await import("../extensions/tasks.ts");
		const fake = (state: string, id: string) => ({
			schemaVersion: 1 as const,
			id,
			origin: "subagent" as const,
			state: state as any,
			summary: state,
			createdAt: "2026-04-27T00:00:00.000Z",
			updatedAt: "2026-04-27T00:00:00.000Z",
			retryCount: 0,
		});
		const tasks = [
			fake("completed", "c1"),
			fake("blocked", "b1"),
			fake("running", "r1"),
			fake("pending", "p1"),
			fake("failed", "f1"),
			fake("cancelled", "x1"),
		];
		const groups = mod.groupTasksByUrgency(tasks);
		expect(groups.map((g) => g.state)).toEqual([
			"blocked",
			"failed",
			"running",
			"pending",
			"completed",
			"cancelled",
		]);
	});
});

describe("/tasks command", () => {
	it("notifies 'No tasks recorded' when registry is empty", async () => {
		const { cmd } = await loadTasks();
		const ctx = createMockCtx();
		await cmd.handler("", ctx);
		const notify = ctx.ui.notify as ReturnType<typeof vi.fn>;
		expect(notify).toHaveBeenCalled();
		expect(notify.mock.calls[0][0]).toContain("No tasks recorded");
	});

	it("groups by urgency in the default list view", async () => {
		const { createTask, transitionTask } = await import("../lib/task-registry.ts");
		const blocked = createTask({ origin: "subagent", summary: "needs creds", state: "running" });
		transitionTask(blocked.id, "blocked", { blockReason: "no creds" });
		createTask({ origin: "subagent", summary: "running 1", state: "running" });

		const { cmd } = await loadTasks();
		const ctx = createMockCtx();
		await cmd.handler("", ctx);
		const text = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
		// blocked must come before running in the output
		expect(text.indexOf("blocked")).toBeLessThan(text.indexOf("running"));
	});

	it("show by id-prefix returns the detail view", async () => {
		const { createTask } = await import("../lib/task-registry.ts");
		const t = createTask({ origin: "subagent", summary: "hello", agentName: "validator" });

		const { cmd } = await loadTasks();
		const ctx = createMockCtx();
		await cmd.handler(t.id.slice(0, 8), ctx);
		const text = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
		expect(text).toContain(t.id);
		expect(text).toContain("agent: validator");
		expect(text).toContain("summary: hello");
	});

	it("cancel transitions a running task to cancelled", async () => {
		const { createTask, getTask } = await import("../lib/task-registry.ts");
		const t = createTask({ origin: "subagent", summary: "long-runner", state: "running" });

		const { cmd } = await loadTasks();
		const ctx = createMockCtx();
		await cmd.handler(`cancel ${t.id}`, ctx);

		const after = getTask(t.id);
		expect(after?.state).toBe("cancelled");
		expect(after?.summary).toBe("long-runner"); // summary preserved
	});

	it("retry on a failed task transitions it to running and bumps retryCount", async () => {
		const { createTask, transitionTask, getTask } = await import("../lib/task-registry.ts");
		const t = createTask({ origin: "subagent", summary: "x", state: "running" });
		transitionTask(t.id, "failed", { errorReason: "boom" });

		const { cmd } = await loadTasks();
		const ctx = createMockCtx();
		await cmd.handler(`retry ${t.id}`, ctx);

		const after = getTask(t.id);
		expect(after?.state).toBe("running");
		expect(after?.retryCount).toBe(1);
		expect(after?.errorReason).toBeUndefined();
	});

	it("retry rejects when task is not in failed state", async () => {
		const { createTask } = await import("../lib/task-registry.ts");
		const t = createTask({ origin: "subagent", summary: "x", state: "running" });

		const { cmd } = await loadTasks();
		const ctx = createMockCtx();
		await cmd.handler(`retry ${t.id}`, ctx);

		const notify = ctx.ui.notify as ReturnType<typeof vi.fn>;
		expect(notify.mock.calls[0][1]).toBe("warning");
		expect(notify.mock.calls[0][0]).toContain("Retry only valid for failed tasks");
	});

	it("rejects cancel on already-terminal task", async () => {
		const { createTask, transitionTask } = await import("../lib/task-registry.ts");
		const t = createTask({ origin: "subagent", summary: "x", state: "running" });
		transitionTask(t.id, "completed");

		const { cmd } = await loadTasks();
		const ctx = createMockCtx();
		await cmd.handler(`cancel ${t.id}`, ctx);

		const notify = ctx.ui.notify as ReturnType<typeof vi.fn>;
		expect(notify.mock.calls[0][1]).toBe("warning");
		expect(notify.mock.calls[0][0]).toContain("already completed");
	});

	it("warns when id prefix is ambiguous or missing", async () => {
		const { cmd } = await loadTasks();
		const ctx = createMockCtx();
		await cmd.handler("cancel zz", ctx);
		const notify = ctx.ui.notify as ReturnType<typeof vi.fn>;
		expect(notify.mock.calls[0][1]).toBe("warning");
		expect(notify.mock.calls[0][0]).toContain("No unique task");
	});
});
