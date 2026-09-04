import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeTaskDatabase, initializeTaskStore, openTaskDatabase, readStoredTask, writeStoredTask } from "../lib/task-store.js";
import {
	createTask,
	compareReadyTasks,
	createTaskBatch,
	getTask,
	getUnmetBlockers,
	isTaskReady,
	listTasks,
	partitionReadyTasks,
	pruneTaskRegistry,
	startTask,
	TaskRegistryError,
	tasksByIdSnapshot,
	tombstoneTask,
	transitionTask,
	updateTask,
} from "../lib/task-registry.js";
import { formatTaskDetail } from "../lib/task-renderer.js";

let tmpRoot: string;
let prevOperatorDir: string | undefined;

beforeEach(() => {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-task-deps-"));
	prevOperatorDir = process.env.PI_OPERATOR_DIR;
	process.env.PI_OPERATOR_DIR = tmpRoot;
	initializeTaskStore(tmpRoot);
});

afterEach(() => {
	closeTaskDatabase(tmpRoot);
	if (prevOperatorDir === undefined) delete process.env.PI_OPERATOR_DIR;
	else process.env.PI_OPERATOR_DIR = prevOperatorDir;
	fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("createTaskBatch validation and recovery", () => {
	const workspace = "/workspace";

	it("rejects invalid prospective graphs before any write", () => {
		const existing = createTask({
			origin: "other",
			summary: "existing",
			workspace,
		});
		const tombstoned = createTask({
			origin: "other",
			summary: "tombstoned",
			workspace,
		});
		tombstoneTask(tombstoned.id);
		const foreign = createTask({
			origin: "other",
			summary: "foreign",
			workspace: "/foreign",
		});
		const before = listTasks({ includeTombstones: true }).map((task) => task.id).sort();
		const invalidBatches = [
			[
				{ origin: "other" as const, summary: "duplicate keys", key: "same" },
				{ origin: "other" as const, summary: "duplicate keys", key: "same" },
			],
			[
				{
					origin: "other" as const,
					summary: "duplicate dependencies",
					blockedBy: [existing.id, existing.id],
				},
			],
			[
				{
					origin: "other" as const,
					summary: "invalid dependency",
					blockedBy: ["../invalid"],
				},
			],
			[
				{
					origin: "other" as const,
					summary: "missing dependency",
					blockedBy: ["missing-task"],
				},
			],
			[
				{
					origin: "other" as const,
					summary: "unknown key",
					blockedByKeys: ["missing"],
				},
			],
			[
				{
					origin: "other" as const,
					summary: "tombstone",
					blockedBy: [tombstoned.id],
				},
			],
			[
				{
					origin: "other" as const,
					summary: "foreign",
					blockedBy: [foreign.id],
				},
			],
			[
				{
					origin: "other" as const,
					summary: "self",
					key: "self",
					blockedByKeys: ["self"],
				},
			],
			[
				{
					origin: "other" as const,
					summary: "a",
					key: "a",
					blockedByKeys: ["b"],
				},
				{
					origin: "other" as const,
					summary: "b",
					key: "b",
					blockedByKeys: ["a"],
				},
			],
		];
		for (const batch of invalidBatches) {
			expect(() => createTaskBatch(batch, workspace)).toThrow(
				TaskRegistryError,
			);
			expect(listTasks({ includeTombstones: true }).map((task) => task.id).sort()).toEqual(before);
			expect(getTask(existing.id)?.blocks).toEqual([]);
		}
	});

	it("accepts more than sixteen dependencies and batch tasks", () => {
		const blockers = Array.from({ length: 17 }, (_, index) =>
			createTask({
				origin: "other",
				summary: `blocker ${index}`,
				workspace,
			}),
		);
		const dependent = createTask({
			origin: "other",
			summary: "many dependencies",
			workspace,
			blockedBy: blockers.map((blocker) => blocker.id),
		});
		expect(dependent.blockedBy).toHaveLength(17);

		const batch = createTaskBatch(
			[
				...Array.from({ length: 17 }, (_, index) => ({
					origin: "other" as const,
					summary: `batch ${index}`,
					key: `batch-${index}`,
				})),
				{
					origin: "other",
					summary: "batch dependent",
					blockedByKeys: Array.from({ length: 17 }, (_, index) => `batch-${index}`),
				},
			],
			workspace,
		);
		expect(batch.outcome).toBe("persisted");
		if (batch.outcome === "persisted")
			expect(batch.records).toHaveLength(18);
	});

	it("reports only authorized dependency cycle members", () => {
		const unrelated = createTask({
			origin: "other",
			summary: "unrelated",
			workspace,
		});
		let failure: unknown;
		try {
			createTaskBatch(
				[
					{ origin: "other", summary: "a", key: "a", blockedByKeys: ["b"] },
					{ origin: "other", summary: "b", key: "b", blockedByKeys: ["a"] },
				],
				workspace,
			);
		} catch (error) {
			failure = error;
		}

		expect(failure).toBeInstanceOf(TaskRegistryError);
		const message = (failure as Error).message;
		expect(message).toMatch(
			/^dependency cycle rejected: [0-9a-f-]{36}, [0-9a-f-]{36}$/,
		);
		expect(message).not.toContain(unrelated.id);
	});

	it("reports partial writes and supports ordered public recovery", () => {
		const blocker = createTask({
			origin: "other",
			summary: "blocker",
			workspace,
		});
		let writes = 0;
		const beforeWrite = () => {
			writes += 1;
			if (writes === 2) throw new Error("injected write failure");
		};
		const result = createTaskBatch(
			[
				{
					origin: "other",
					summary: "first",
					key: "first",
					blockedBy: [blocker.id],
				},
				{
					origin: "other",
					summary: "second",
					key: "second",
					blockedByKeys: ["first"],
				},
			],
			workspace,
			{ beforeWrite },
		);
		expect(result).toMatchObject({
			outcome: "write_failed",
			failedPhase: "write_records",
			persistedIds: [],
		});
		if (result.outcome !== "write_failed") throw new Error("write should fail");
		expect(result.operationId).toMatch(/^[A-Za-z0-9-]+$/);
		expect(listTasks()).toHaveLength(1);
		expect(getTask(blocker.id)?.blocks).toEqual([]);
	});

	it("writes each batch record once and derives reverse edges from blockedBy", () => {
		let writes = 0;
		const result = createTaskBatch(
			[
				{ origin: "other", summary: "first", key: "first" },
				{ origin: "other", summary: "second", blockedByKeys: ["first"] },
			],
			workspace,
			{ beforeWrite: () => (writes += 1) },
		);
		expect(result.outcome).toBe("persisted");
		expect(writes).toBe(2);
		if (result.outcome !== "persisted") throw new Error("batch should persist");
		const blockerId = result.records[0]?.id;
		const dependentId = result.records[1]?.id;
		if (!blockerId || !dependentId) throw new Error("records should exist");
		expect(getTask(blockerId)?.blocks).toEqual([dependentId]);
		for (const id of [blockerId, dependentId]) {
			expect(readStoredTask(id, openTaskDatabase(tmpRoot))).not.toHaveProperty("blocks");
		}
	});
});

describe("task registry pruning", () => {
	it("removes retired records and completed graphs without breaking active dependencies", () => {
		const activeRoot = createTask({ origin: "other", summary: "active root" });
		const retired = createTask({
			origin: "other",
			summary: "retired child",
			blockedBy: [activeRoot.id],
		});
		writeStoredTask({ ...retired, agentName: "builder", prompt: "old execution" }, openTaskDatabase(tmpRoot));
		const completedBlocker = transitionTask(
			createTask({ origin: "other", summary: "completed blocker", state: "assigned" })
				.id,
			"completed",
			{ outcome: { evidence: "dependency fixture" } },
		);
		const pending = createTask({
			origin: "other",
			summary: "pending dependent",
			blockedBy: [completedBlocker.id],
		});
		const standalone = createTask({
			origin: "other",
			summary: "standalone completed",
			state: "completed",
		});

		const first = pruneTaskRegistry();

		expect(first.removedIds).toEqual(
			expect.arrayContaining([retired.id, standalone.id]),
		);
		expect(first.retiredRemoved).toBe(1);
		expect(getTask(retired.id)).toBeNull();
		expect(getTask(standalone.id)).toBeNull();
		expect(getTask(completedBlocker.id)).not.toBeNull();
		expect(getTask(activeRoot.id)?.blocks).toEqual([]);

		transitionTask(pending.id, "assigned");
		transitionTask(pending.id, "completed", {
			outcome: { evidence: "dependency fixture" },
		});
		const second = pruneTaskRegistry();
		expect(second.removedIds).toEqual(
			expect.arrayContaining([completedBlocker.id, pending.id]),
		);
	});
});

describe("task dependencies and tombstones", () => {
	it("derives bidirectional dependency edges without persisting reverse edges", () => {
		const blocker = createTask({ origin: "other", summary: "blocker" });
		const dependent = createTask({
			origin: "other",
			summary: "dependent",
			blockedBy: [blocker.id],
		});
		expect(getTask(dependent.id)?.blockedBy).toEqual([blocker.id]);
		expect(getTask(blocker.id)?.blocks).toContain(dependent.id);
		const storedBlocker = readStoredTask(blocker.id, openTaskDatabase(tmpRoot));
		expect(storedBlocker).not.toHaveProperty("blocks");
	});

	it("migrates legacy stored blocks on write while preserving reader and renderer output", () => {
		const blocker = createTask({ origin: "other", summary: "legacy blocker" });
		const dependent = createTask({
			origin: "other",
			summary: "dependent",
			blockedBy: [blocker.id],
		});
		writeStoredTask({ ...blocker, blocks: ["stale-dependent"] }, openTaskDatabase(tmpRoot));

		const read = getTask(blocker.id);
		expect(read?.blocks).toEqual([dependent.id]);
		if (!read) throw new Error("legacy blocker should be readable");
		expect(formatTaskDetail(read)).toContain(`blocks: ${dependent.id}`);

		updateTask(blocker.id, { notes: "migrated" });
		const migrated = readStoredTask(blocker.id, openTaskDatabase(tmpRoot));
		expect(migrated).not.toHaveProperty("blocks");
		expect(getTask(blocker.id)?.blocks).toEqual([dependent.id]);
	});

	it("rejects direct cycles", () => {
		const first = createTask({ origin: "other", summary: "first" });
		const second = createTask({
			origin: "other",
			summary: "second",
			blockedBy: [first.id],
		});
		expect(() => updateTask(first.id, { blockedBy: [second.id] })).toThrow(
			/cycle/,
		);
	});

	it("keeps tombstones out of default lists but available for repair", () => {
		const task = createTask({ origin: "other", summary: "old" });
		tombstoneTask(task.id);
		expect(listTasks().map((item) => item.id)).not.toContain(task.id);
		expect(
			listTasks({ includeTombstones: true }).map((item) => item.id),
		).toContain(task.id);
	});

	it("normalizes optional metadata and orders only ready tasks by the graph projection", () => {
		const producer = createTask({
			origin: "other",
			summary: "producer",
			goalId: "goal-1",
			covers: ["condition-1"],
			produces: ["artifact"],
			consumes: [],
			priority: 2,
		});
		const consumer = createTask({
			origin: "other",
			summary: "consumer",
			consumes: ["artifact"],
			priority: 1,
		});
		const neutral = createTask({ origin: "other", summary: "neutral" });
		expect(producer).toMatchObject({
			goalId: "goal-1",
			covers: ["condition-1"],
			produces: ["artifact"],
			priority: 2,
		});
		expect(producer).not.toHaveProperty("consumes");
		expect(partitionReadyTasks([consumer, producer, neutral]).ready.map((task) => task.id)).toEqual([
			producer.id,
			consumer.id,
			neutral.id,
		]);
		expect(listTasks().map((task) => task.id)).toEqual([neutral.id, consumer.id, producer.id]);
		const updated = updateTask(neutral.id, { produces: [], consumes: [], priority: 3 });
		expect(updated).toMatchObject({ priority: 3 });
		expect(updated).not.toHaveProperty("produces");
		expect(updated).not.toHaveProperty("consumes");
	});

	it("uses deterministic dependent counts and ID ties after metadata ordering", () => {
		const blocker = createTask({ origin: "other", summary: "blocker" });
		const dependent = createTask({ origin: "other", summary: "dependent", blockedBy: [blocker.id] });
		const peer = createTask({ origin: "other", summary: "peer" });
		const all = [blocker, dependent, peer];
		expect(compareReadyTasks(blocker, peer, all)).toBeLessThan(0);
		expect(partitionReadyTasks(all).ready.map((task) => task.id)).toEqual([blocker.id, peer.id]);
	});

	it("classifies ready and waiting tasks from an in-memory snapshot", () => {
		const pending = createTask({ origin: "other", summary: "pending blocker" });
		const done = transitionTask(
			createTask({ origin: "other", summary: "done", state: "assigned" }).id,
			"completed",
			{ outcome: { evidence: "readiness fixture" } },
		);
		const skipped = createTask({
			origin: "other",
			summary: "skip",
			state: "skipped",
		});
		const ready = createTask({ origin: "other", summary: "ready" });
		const unblocked = createTask({
			origin: "other",
			summary: "unblocked",
			blockedBy: [done.id, skipped.id],
		});
		const waiting = createTask({
			origin: "other",
			summary: "waiting",
			blockedBy: [pending.id],
		});
		const byId = tasksByIdSnapshot(listTasks({ includeTombstones: true }));
		expect(isTaskReady(ready, byId)).toBe(true);
		expect(isTaskReady(unblocked, byId)).toBe(true);
		expect(isTaskReady(waiting, byId)).toBe(false);
		expect(getUnmetBlockers(waiting, byId)).toEqual([
			expect.objectContaining({ id: pending.id, status: "unassigned" }),
		]);
		const partitioned = partitionReadyTasks(
			listTasks({ includeTombstones: true }),
		);
		expect(partitioned.ready.map((task) => task.id)).toContain(ready.id);
		expect(partitioned.waiting.map((task) => task.id)).toContain(waiting.id);
	});

	it("treats legacy missing and tombstoned blockers as unmet without mutating files", () => {
		const tombstoned = createTask({ origin: "other", summary: "old blocker" });
		const dependent = createTask({
			origin: "other",
			summary: "dependent",
			blockedBy: [tombstoned.id],
		});
		tombstoneTask(tombstoned.id);
		const db = openTaskDatabase(tmpRoot);
		writeStoredTask({ ...dependent, blockedBy: ["missing-blocker", tombstoned.id] }, db);
		const before = JSON.stringify(readStoredTask(dependent.id, db));
		const byId = tasksByIdSnapshot(listTasks({ includeTombstones: true }));
		const migratedDependent = getTask(dependent.id);
		if (!migratedDependent) throw new Error("dependent should exist");
		expect(
			getUnmetBlockers(migratedDependent, byId).map((item) => item.status),
		).toEqual(["tombstoned", "missing"]);
		const start = startTask(dependent.id);
		expect(start.readiness).toMatchObject({
			ready: false,
			unmetBlockers: [
				{ id: tombstoned.id, status: "tombstoned" },
				{ id: "missing-blocker", status: "missing" },
			],
		});
		expect(JSON.stringify(readStoredTask(dependent.id, db))).toBe(before);
	});
});
