import { describe, expect, it, vi } from "vitest";
import {
	SubagentTreeAdmissionError,
	SubagentTreeBroker,
	SubagentTreeClient,
	treeClientFromEnvironment,
} from "../extensions/subagent/tree-runtime.ts";

describe("SubagentTreeBroker", () => {
	it("admits only root to coordinator or leaf and coordinator to leaf", async () => {
		const broker = new SubagentTreeBroker();
		const root = broker.createTree({ treeId: "tree", rootRunId: "root" });
		const coordinator = await broker.acquire({
			treeId: root.treeId,
			parentRunId: root.rootRunId,
			runId: "coordinator",
			role: "coordinator",
		});
		const leaf = await broker.acquire({
			treeId: root.treeId,
			parentRunId: coordinator.metadata.runId,
			runId: "leaf",
			role: "leaf",
		});

		await expect(
			broker.acquire({
				treeId: root.treeId,
				parentRunId: coordinator.metadata.runId,
				runId: "nested-coordinator",
				role: "coordinator",
			}),
		).rejects.toBeInstanceOf(SubagentTreeAdmissionError);
		await expect(
			broker.acquire({
				treeId: root.treeId,
				parentRunId: leaf.metadata.runId,
				runId: "nested-leaf",
				role: "leaf",
			}),
		).rejects.toThrow("leaf runs cannot spawn leaf runs");
		await expect(
			broker.acquire({
				treeId: root.treeId,
				parentRunId: root.rootRunId,
				runId: "wrong-depth",
				role: "leaf",
				depth: 2,
			}),
		).rejects.toThrow("depth");
		await coordinator.release();
		await leaf.release();
	});

	it("queues permits until an active descendant releases its slot", async () => {
		const broker = new SubagentTreeBroker({ maxActiveDescendants: 1 });
		const root = broker.createTree();
		const first = await broker.acquire({
			treeId: root.treeId,
			parentRunId: root.rootRunId,
			runId: "first",
			role: "leaf",
		});
		const second = broker.acquire({
			treeId: root.treeId,
			parentRunId: root.rootRunId,
			runId: "second",
			role: "leaf",
		});
		await Promise.resolve();
		expect(broker.list().find((run) => run.runId === "second")?.state).toBe(
			"queued",
		);
		await first.release();
		expect((await second).metadata.runId).toBe("second");
	});

	it("rejects overlapping modification leases atomically", async () => {
		const broker = new SubagentTreeBroker();
		const root = broker.createTree();
		const first = await broker.acquire({
			treeId: root.treeId,
			parentRunId: root.rootRunId,
			runId: "first",
			role: "leaf",
			scopeLease: {
				repositoryRoot: process.cwd(),
				scopes: ["src/api"],
			},
		});

		await expect(
			broker.acquire({
				treeId: root.treeId,
				parentRunId: root.rootRunId,
				runId: "overlap",
				role: "leaf",
				scopeLease: {
					repositoryRoot: process.cwd(),
					scopes: ["src"],
				},
			}),
		).rejects.toThrow("overlaps an active or queued descendant lease");
		expect(broker.list().some((run) => run.runId === "overlap")).toBe(false);

		const disjoint = await broker.acquire({
			treeId: root.treeId,
			parentRunId: root.rootRunId,
			runId: "disjoint",
			role: "leaf",
			scopeLease: {
				repositoryRoot: process.cwd(),
				scopes: ["tests/api"],
			},
		});
		expect(disjoint.metadata).not.toHaveProperty("scopeLease");
		await first.release();
		await disjoint.release();
	});

	it("retains registered descendant processes", async () => {
		const broker = new SubagentTreeBroker();
		const root = broker.createTree();
		const leaf = await broker.acquire({
			treeId: root.treeId,
			parentRunId: root.rootRunId,
			runId: "leaf",
			role: "leaf",
		});
		await leaf.registerProcess({ pid: 12345 });
		expect(broker.list().find((run) => run.runId === "leaf")?.pid).toBe(
			12345,
		);
		await leaf.release();
	});

	it("recursively cancels active and queued descendants", async () => {
		const broker = new SubagentTreeBroker({ maxActiveDescendants: 2 });
		const root = broker.createTree();
		const coordinator = await broker.acquire({
			treeId: root.treeId,
			parentRunId: root.rootRunId,
			runId: "coordinator",
			role: "coordinator",
		});
		const leaf = await broker.acquire({
			treeId: root.treeId,
			parentRunId: coordinator.metadata.runId,
			runId: "leaf",
			role: "leaf",
		});
		const queued = broker.acquire({
			treeId: root.treeId,
			parentRunId: coordinator.metadata.runId,
			runId: "queued",
			role: "leaf",
		});
		const cancelled = broker.cancel(coordinator.metadata.runId);

		expect(cancelled).toEqual(["coordinator", "leaf", "queued"]);
		expect(broker.list().map((run) => run.state)).toEqual([
			"active",
			"cancelled",
			"cancelled",
			"cancelled",
		]);
		await expect(queued).rejects.toThrow("queued was cancelled");
		await coordinator.release();
		await leaf.release();
	});

	it("authorizes cancellation and release only within the caller subtree", async () => {
		const broker = new SubagentTreeBroker();
		const root = broker.createTree({ treeId: "tree", rootRunId: "root" });
		const coordinator = await broker.acquire({
			treeId: root.treeId,
			parentRunId: root.rootRunId,
			runId: "coordinator",
			role: "coordinator",
		});
		const child = await broker.acquire({
			treeId: root.treeId,
			parentRunId: coordinator.metadata.runId,
			runId: "child",
			role: "leaf",
		});
		const sibling = await broker.acquire({
			treeId: root.treeId,
			parentRunId: root.rootRunId,
			runId: "sibling",
			role: "leaf",
		});

		expect(() =>
			broker.cancel(coordinator.metadata.runId, sibling.metadata.runId),
		).toThrow("itself or its descendants");
		await expect(
			broker.release(coordinator.metadata.runId, sibling.metadata.runId),
		).rejects.toThrow("itself or its descendants");
		expect(broker.cancel(coordinator.metadata.runId, child.metadata.runId)).toEqual([
			"child",
		]);
		expect(broker.list().find((run) => run.runId === "sibling")?.state).toBe(
			"active",
		);
		await coordinator.release();
		await sibling.release();
	});

	it("settles cancelled queued permits without retaining capacity or leases", async () => {
		const broker = new SubagentTreeBroker({ maxActiveDescendants: 1 });
		const root = broker.createTree();
		const credentials = await broker.listen();
		const rootClient = new SubagentTreeClient(
			credentials,
			{
				treeId: root.treeId,
				runId: root.rootRunId,
				role: "root",
				depth: 0,
			},
			root.ownerToken,
		);
		const first = await rootClient.acquire({ runId: "first", role: "leaf" });
		const controller = new AbortController();
		const queued = rootClient.acquire(
			{
				runId: "queued",
				role: "leaf",
				scopeLease: {
					repositoryRoot: process.cwd(),
					scopes: ["src/queued"],
				},
			},
			controller.signal,
		);
		await vi.waitFor(() =>
			expect(broker.list().find((run) => run.runId === "queued")?.state).toBe(
				"queued",
			),
		);
		controller.abort();
		await expect(queued).rejects.toThrow("cancelled");
		await Promise.all([first.release(), first.release()]);

		const replacement = await rootClient.acquire({
			runId: "replacement",
			role: "leaf",
			scopeLease: {
				repositoryRoot: process.cwd(),
				scopes: ["src/queued"],
			},
		});
		expect(replacement.metadata.runId).toBe("replacement");
		await replacement.release();

		const admissionController = new AbortController();
		const admissionRace = rootClient.acquire(
			{
				runId: "admission-race",
				role: "leaf",
				scopeLease: {
					repositoryRoot: process.cwd(),
					scopes: ["src/admission-race"],
				},
			},
			admissionController.signal,
		);
		admissionController.abort();
		await expect(admissionRace).rejects.toBeDefined();
		const afterAdmissionRace = await rootClient.acquire({
			runId: "after-admission-race",
			role: "leaf",
			scopeLease: {
				repositoryRoot: process.cwd(),
				scopes: ["src/admission-race"],
			},
		});
		await afterAdmissionRace.release();
		await broker.dispose();
	});

	it("holds an active scope cancelled before PID registration until settlement", async () => {
		const broker = new SubagentTreeBroker({ maxActiveDescendants: 2 });
		const root = broker.createTree();
		const first = await broker.acquire({
			treeId: root.treeId,
			parentRunId: root.rootRunId,
			runId: "cancelled-before-registration",
			role: "leaf",
			scopeLease: {
				repositoryRoot: process.cwd(),
				scopes: ["src/pre-registration"],
			},
		});
		broker.cancel(first.metadata.runId);
		await expect(
			broker.acquire({
				treeId: root.treeId,
				parentRunId: root.rootRunId,
				runId: "premature-pre-registration-replacement",
				role: "leaf",
				scopeLease: {
					repositoryRoot: process.cwd(),
					scopes: ["src/pre-registration"],
				},
			}),
		).rejects.toThrow("overlaps");
		await first.release();
		const replacement = await broker.acquire({
			treeId: root.treeId,
			parentRunId: root.rootRunId,
			runId: "post-registration-window-replacement",
			role: "leaf",
			scopeLease: {
				repositoryRoot: process.cwd(),
				scopes: ["src/pre-registration"],
			},
		});
		await replacement.release();
	});

	it("holds a cancelled process scope lease until its permit settles", async () => {
		const broker = new SubagentTreeBroker({ maxActiveDescendants: 2 });
		const root = broker.createTree();
		const first = await broker.acquire({
			treeId: root.treeId,
			parentRunId: root.rootRunId,
			runId: "cancelled-process",
			role: "leaf",
			scopeLease: {
				repositoryRoot: process.cwd(),
				scopes: ["src/cancelled"],
			},
		});
		let finishCancellation: (() => void) | undefined;
		await first.registerProcess({
			pid: 2_147_483_647,
			cancel: () =>
				new Promise<void>((resolve) => {
					finishCancellation = resolve;
				}),
		});
		broker.cancel(first.metadata.runId);
		await expect(
			broker.acquire({
				treeId: root.treeId,
				parentRunId: root.rootRunId,
				runId: "premature-replacement",
				role: "leaf",
				scopeLease: {
					repositoryRoot: process.cwd(),
					scopes: ["src/cancelled"],
				},
			}),
		).rejects.toThrow("overlaps");

		let settled = false;
		const settlement = first.release().then(() => {
			settled = true;
		});
		await Promise.resolve();
		expect(settled).toBe(false);
		finishCancellation?.();
		await settlement;
		const replacement = await broker.acquire({
			treeId: root.treeId,
			parentRunId: root.rootRunId,
			runId: "replacement-after-settle",
			role: "leaf",
			scopeLease: {
				repositoryRoot: process.cwd(),
				scopes: ["src/cancelled"],
			},
		});
		await replacement.release();
	});

	it("allows a failed release acknowledgement to be retried safely", async () => {
		const broker = new SubagentTreeBroker();
		const root = broker.createTree();
		const credentials = await broker.listen();
		const client = new SubagentTreeClient(
			credentials,
			{
				treeId: root.treeId,
				runId: root.rootRunId,
				role: "root",
				depth: 0,
			},
			root.ownerToken,
		);
		const permit = await client.acquire({ runId: "retry-release", role: "leaf" });
		const requestTarget = client as unknown as {
			request: (request: unknown) => Promise<unknown>;
		};
		const originalRequest = requestTarget.request.bind(client);
		const request = vi
			.spyOn(requestTarget, "request")
			.mockRejectedValueOnce(new Error("release acknowledgement lost"))
			.mockImplementation(originalRequest);

		await expect(permit.release()).rejects.toThrow("acknowledgement lost");
		await expect(permit.release()).resolves.toBeUndefined();
		expect(request).toHaveBeenCalledTimes(2);
		expect(
			broker.list().find((run) => run.runId === "retry-release")?.state,
		).toBe("settled");
		await broker.dispose();
	});

	it("prevents an authenticated child client from cancelling its parent", async () => {
		const broker = new SubagentTreeBroker();
		const root = broker.createTree();
		const credentials = await broker.listen();
		const rootClient = new SubagentTreeClient(
			credentials,
			{
				treeId: root.treeId,
				runId: root.rootRunId,
				role: "root",
				depth: 0,
			},
			root.ownerToken,
		);
		const coordinator = await rootClient.acquire({
			runId: "coordinator",
			role: "coordinator",
		});
		const childClient = treeClientFromEnvironment(
			rootClient.childEnvironment(coordinator),
		);
		if (!childClient) throw new Error("child client fixture failed");

		await expect(childClient.cancel(root.rootRunId)).rejects.toThrow(
			"itself or its descendants",
		);
		expect(broker.list().find((run) => run.runId === root.rootRunId)?.state).toBe(
			"active",
		);
		await coordinator.release();
		await broker.dispose();
	});

	it("shares one descendant ceiling across coordinator clients", async () => {
		const broker = new SubagentTreeBroker({ maxActiveDescendants: 3 });
		const root = broker.createTree();
		const credentials = await broker.listen();
		const rootClient = new SubagentTreeClient(
			credentials,
			{
				treeId: root.treeId,
				runId: root.rootRunId,
				role: "root",
				depth: 0,
			},
			root.ownerToken,
		);
		const firstCoordinator = await rootClient.acquire({
			runId: "coordinator-1",
			role: "coordinator",
		});
		const secondCoordinator = await rootClient.acquire({
			runId: "coordinator-2",
			role: "coordinator",
		});
		const firstClient = treeClientFromEnvironment(
			rootClient.childEnvironment(firstCoordinator),
		);
		const secondClient = treeClientFromEnvironment(
			rootClient.childEnvironment(secondCoordinator),
		);
		if (!firstClient || !secondClient) throw new Error("client fixture failed");
		const firstLeaf = await firstClient.acquire({
			runId: "leaf-1",
			role: "leaf",
		});
		const secondLeaf = secondClient.acquire({
			runId: "leaf-2",
			role: "leaf",
		});
		await vi.waitFor(() =>
			expect(
				broker.list().find((run) => run.runId === "leaf-2")?.state,
			).toBe("queued"),
		);
		await firstLeaf.release();
		expect((await secondLeaf).metadata.runId).toBe("leaf-2");
		await firstCoordinator.release();
		await secondCoordinator.release();
		await broker.dispose();
	});

	it("authenticates cross-process clients and propagates child metadata", async () => {
		const broker = new SubagentTreeBroker();
		const root = broker.createTree();
		const credentials = await broker.listen();
		const rootClient = new SubagentTreeClient(
			credentials,
			{
				treeId: root.treeId,
				runId: root.rootRunId,
				role: "root",
				depth: 0,
			},
			root.ownerToken,
		);
		const coordinator = await rootClient.acquire({
			runId: "coordinator",
			role: "coordinator",
			workflowPhase: "map",
		});
		const environment = rootClient.childEnvironment(coordinator);
		const child = treeClientFromEnvironment(environment);

		expect(child?.parent).toMatchObject({
			runId: "coordinator",
			role: "coordinator",
			depth: 1,
		});
		const unauthenticated = new SubagentTreeClient(
			{ ...credentials, token: "not-the-broker-token" },
			rootClient.parent,
			root.ownerToken,
		);
		await expect(
			unauthenticated.acquire({ runId: "rejected", role: "leaf" }),
		).rejects.toThrow("authentication failed");
		await coordinator.release();
		await broker.dispose();
	});

	it("rejects ceilings above the hard limit", () => {
		expect(() => new SubagentTreeBroker({ maxActiveDescendants: 17 })).toThrow(
		"1 through 16",
		);
	});
});
