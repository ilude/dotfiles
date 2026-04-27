import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createTask,
	getTask,
	listTasks,
	TaskRegistryError,
	transitionTask,
	updateTask,
} from "../lib/task-registry.js";

let tmpRoot: string;
let prevOverride: string | undefined;

beforeEach(() => {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-task-registry-"));
	prevOverride = process.env.PI_OPERATOR_DIR;
	process.env.PI_OPERATOR_DIR = tmpRoot;
});

afterEach(() => {
	if (prevOverride === undefined) delete process.env.PI_OPERATOR_DIR;
	else process.env.PI_OPERATOR_DIR = prevOverride;
	fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("createTask", () => {
	it("creates a pending task by default and persists it to disk", () => {
		const task = createTask({ origin: "subagent", summary: "explore repo" });
		expect(task.schemaVersion).toBe(1);
		expect(task.state).toBe("pending");
		expect(task.retryCount).toBe(0);
		expect(task.summary).toBe("explore repo");
		expect(task.createdAt).toBe(task.updatedAt);
		expect(task.startedAt).toBeUndefined();

		const reread = getTask(task.id);
		expect(reread).not.toBeNull();
		expect(reread?.id).toBe(task.id);
	});

	it("sets startedAt when initial state is running", () => {
		const task = createTask({ origin: "team", summary: "build feature", state: "running" });
		expect(task.state).toBe("running");
		expect(task.startedAt).toBeDefined();
	});

	it("preserves optional fields (parentId, agentName, repoSlug, metadata)", () => {
		const task = createTask({
			origin: "subagent",
			summary: "lint",
			parentId: "parent-123",
			agentName: "validator",
			repoSlug: "gh/owner/repo",
			metadata: { ticket: "OPS-42" },
		});
		expect(task.parentId).toBe("parent-123");
		expect(task.agentName).toBe("validator");
		expect(task.repoSlug).toBe("gh/owner/repo");
		expect(task.metadata).toEqual({ ticket: "OPS-42" });
	});

	it("generates distinct ids for concurrent creations", () => {
		const ids = new Set(
			Array.from({ length: 5 }).map(
				() => createTask({ origin: "shell", summary: "t" }).id,
			),
		);
		expect(ids.size).toBe(5);
	});
});

describe("transitionTask", () => {
	it("rejects an invalid transition", () => {
		const task = createTask({ origin: "subagent", summary: "x" });
		expect(() => transitionTask(task.id, "completed")).toThrow(TaskRegistryError);
	});

	it("rejects a no-op transition to the same state", () => {
		const task = createTask({ origin: "subagent", summary: "x" });
		expect(() => transitionTask(task.id, "pending")).toThrow(/already in state/);
	});

	it("walks pending -> running -> completed and stamps timestamps", () => {
		const task = createTask({ origin: "subagent", summary: "x" });
		const running = transitionTask(task.id, "running");
		expect(running.state).toBe("running");
		expect(running.startedAt).toBeDefined();
		expect(running.endedAt).toBeUndefined();

		const done = transitionTask(task.id, "completed");
		expect(done.state).toBe("completed");
		expect(done.endedAt).toBeDefined();
	});

	it("captures blockReason when transitioning to blocked", () => {
		const task = createTask({ origin: "subagent", summary: "x", state: "running" });
		const blocked = transitionTask(task.id, "blocked", { blockReason: "needs creds" });
		expect(blocked.state).toBe("blocked");
		expect(blocked.blockReason).toBe("needs creds");
	});

	it("captures errorReason when transitioning to failed", () => {
		const task = createTask({ origin: "subagent", summary: "x", state: "running" });
		const failed = transitionTask(task.id, "failed", { errorReason: "subprocess exit 1" });
		expect(failed.state).toBe("failed");
		expect(failed.errorReason).toBe("subprocess exit 1");
		expect(failed.endedAt).toBeDefined();
	});

	it("retry path: failed -> running increments retryCount and clears errorReason", () => {
		const task = createTask({ origin: "subagent", summary: "x", state: "running" });
		transitionTask(task.id, "failed", { errorReason: "first attempt failed" });
		const retried = transitionTask(task.id, "running");
		expect(retried.state).toBe("running");
		expect(retried.retryCount).toBe(1);
		expect(retried.errorReason).toBeUndefined();
	});

	it("rejects transition from completed (terminal)", () => {
		const task = createTask({ origin: "subagent", summary: "x", state: "running" });
		transitionTask(task.id, "completed");
		expect(() => transitionTask(task.id, "running")).toThrow(TaskRegistryError);
	});

	it("rejects transition from cancelled (terminal)", () => {
		const task = createTask({ origin: "subagent", summary: "x" });
		transitionTask(task.id, "cancelled");
		expect(() => transitionTask(task.id, "running")).toThrow(TaskRegistryError);
	});

	it("preserves usage when supplied on transition", () => {
		const task = createTask({ origin: "subagent", summary: "x", state: "running" });
		const done = transitionTask(task.id, "completed", {
			usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
		});
		expect(done.usage).toEqual({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
	});
});

describe("updateTask", () => {
	it("patches summary/preview/usage without changing state", () => {
		const task = createTask({ origin: "subagent", summary: "x" });
		const updated = updateTask(task.id, { summary: "x v2", preview: "first line" });
		expect(updated.summary).toBe("x v2");
		expect(updated.preview).toBe("first line");
		expect(updated.state).toBe("pending");
		expect(updated.updatedAt >= task.updatedAt).toBe(true);
	});

	it("throws when the task does not exist", () => {
		expect(() => updateTask("does-not-exist", { summary: "y" })).toThrow(TaskRegistryError);
	});
});

describe("getTask", () => {
	it("returns null for unknown id", () => {
		expect(getTask("not-real")).toBeNull();
	});

	it("rejects invalid ids without throwing", () => {
		expect(getTask("../escape")).toBeNull();
		expect(getTask("")).toBeNull();
	});
});

describe("listTasks", () => {
	it("returns newest-first by createdAt", async () => {
		const t1 = createTask({ origin: "subagent", summary: "first" });
		await new Promise((r) => setTimeout(r, 5));
		const t2 = createTask({ origin: "subagent", summary: "second" });
		const list = listTasks();
		expect(list.length).toBe(2);
		expect(list[0].id).toBe(t2.id);
		expect(list[1].id).toBe(t1.id);
	});

	it("filters by state", () => {
		const a = createTask({ origin: "subagent", summary: "a" });
		const b = createTask({ origin: "subagent", summary: "b", state: "running" });
		void a;
		const running = listTasks({ states: ["running"] });
		expect(running.map((t) => t.id)).toEqual([b.id]);
	});

	it("filters by origin", () => {
		createTask({ origin: "subagent", summary: "s" });
		const team = createTask({ origin: "team", summary: "t" });
		const got = listTasks({ origins: ["team"] });
		expect(got.map((t) => t.id)).toEqual([team.id]);
	});

	it("filters by repoSlug", () => {
		createTask({ origin: "subagent", summary: "a", repoSlug: "gh/owner/repo-a" });
		const matching = createTask({ origin: "subagent", summary: "b", repoSlug: "gh/owner/repo-b" });
		const got = listTasks({ repoSlug: "gh/owner/repo-b" });
		expect(got.map((t) => t.id)).toEqual([matching.id]);
	});

	it("respects limit", () => {
		for (let i = 0; i < 5; i++) createTask({ origin: "shell", summary: `t${i}` });
		expect(listTasks({ limit: 2 }).length).toBe(2);
	});

	it("returns [] when the tasks dir does not exist", () => {
		expect(listTasks()).toEqual([]);
	});
});

describe("durable storage", () => {
	it("does not parse transcripts -- registry only writes <state-dir>/tasks/<id>.json", () => {
		const task = createTask({ origin: "subagent", summary: "x" });
		const expected = path.join(tmpRoot, "tasks", `${task.id}.json`);
		expect(fs.existsSync(expected)).toBe(true);
		const onDisk = JSON.parse(fs.readFileSync(expected, "utf-8"));
		expect(onDisk.id).toBe(task.id);
		expect(onDisk.schemaVersion).toBe(1);
	});
});
