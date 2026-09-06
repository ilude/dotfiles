import * as net from "node:net";
import { describe, expect, it, vi } from "vitest";
import {
	getSubagentTreeBroker,
	SubagentTreeAdmissionError,
	SubagentTreeBroker,
	SubagentTreeClient,
	SubagentTreeRootClient,
	SUBAGENT_TREE_PROTOCOL_VERSION,
	SUBAGENT_TREE_RESTART_REQUIRED,
	treeClientFromEnvironment,
} from "../extensions/subagent/tree-runtime.ts";

type SocketRequestTarget = {
	request(
		request:
			| { readonly type: "handshake" }
			| {
					readonly type: "acquire";
					readonly request: {
						readonly treeId: string;
						readonly parentRunId: string;
						readonly runId: string;
						readonly role: "leaf";
					};
				},
		options?: {
			readonly signal?: AbortSignal;
			readonly connectTimeoutMs?: number;
			readonly responseTimeoutMs?: number;
			readonly timeoutMode?: "response" | "idle";
			readonly probeAcquireIdle?: boolean;
		},
	): Promise<unknown>;
};

type SocketServerFixture = {
	readonly server: net.Server;
	readonly port: number;
	readonly sockets: Set<net.Socket>;
};

async function createSocketServer(
	onConnection: (socket: net.Socket) => void,
): Promise<SocketServerFixture> {
	const sockets = new Set<net.Socket>();
	const server = net.createServer((socket) => {
		sockets.add(socket);
		socket.once("close", () => sockets.delete(socket));
		onConnection(socket);
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			server.off("error", reject);
			resolve();
		});
	});
	const address = server.address();
	if (!address || typeof address === "string") {
		server.close();
		throw new Error("Socket test server did not bind a TCP port.");
	}
	return { server, port: address.port, sockets };
}

async function closeSocketServer(fixture: SocketServerFixture): Promise<void> {
	for (const socket of fixture.sockets) socket.destroy();
	if (!fixture.server.listening) return;
	await new Promise<void>((resolve) => fixture.server.close(() => resolve()));
}

function createSocketClient(port: number): SubagentTreeClient {
	return new SubagentTreeClient(
		{
			host: "127.0.0.1",
			port,
			token: "broker-token",
			protocolVersion: SUBAGENT_TREE_PROTOCOL_VERSION,
			runtimeGeneration: "socket-test-runtime",
		},
		{ treeId: "tree", runId: "root", role: "root", depth: 0 },
		"caller-token",
	);
}

function socketRequestTarget(client: SubagentTreeClient): SocketRequestTarget {
	return client as unknown as SocketRequestTarget;
}

async function connectSocket(port: number): Promise<net.Socket> {
	const socket = net.createConnection({ host: "127.0.0.1", port });
	await new Promise<void>((resolve, reject) => {
		socket.once("connect", resolve);
		socket.once("error", reject);
	});
	return socket;
}

function readSocketLine(socket: net.Socket): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		let buffer = "";
		let settled = false;
		const cleanup = () => {
			socket.off("data", receive);
			socket.off("error", fail);
			socket.off("close", closed);
		};
		const finish = (line: string) => {
			if (settled) return;
			settled = true;
			cleanup();
			resolve(line);
		};
		const fail = (error: Error) => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(error);
		};
		const closed = () => fail(new Error("Socket closed before a response line."));
		const receive = (chunk: string) => {
			buffer += chunk;
			const newline = buffer.indexOf("\n");
			if (newline >= 0) finish(buffer.slice(0, newline));
		};
		socket.setEncoding("utf8");
		socket.on("data", receive);
		socket.once("error", fail);
		socket.once("close", closed);
	});
}

describe("SubagentTreeBroker", () => {
	it("rejects oversized request frames without retaining the input", async () => {
		const broker = new SubagentTreeBroker();
		const credentials = await broker.listen();
		const socket = await connectSocket(credentials.port);
		try {
			const response = readSocketLine(socket);
			socket.write("x".repeat(70 * 1024));
			expect(JSON.parse(await response)).toMatchObject({
				ok: false,
				error: expect.stringContaining("request frame exceeds"),
			});
		} finally {
			socket.destroy();
			await broker.dispose();
		}
	});

	it("rejects oversized client request frames before connecting", async () => {
		const request = socketRequestTarget(createSocketClient(1));
		await expect(
			request.request({
				type: "acquire",
				request: {
					treeId: "x".repeat(70 * 1024),
					parentRunId: "root",
					runId: "oversized",
					role: "leaf",
				},
			}),
		).rejects.toThrow("request frame exceeds");
	});

	it("rejects oversized response frames", async () => {
		const fixture = await createSocketServer((socket) => {
			socket.write("x".repeat(70 * 1024));
		});
		try {
			const request = socketRequestTarget(createSocketClient(fixture.port));
			await expect(request.request({ type: "handshake" })).rejects.toThrow(
				"response frame exceeds",
			);
		} finally {
			await closeSocketServer(fixture);
		}
	});

	it("rejects a connection that closes without a response", async () => {
		const fixture = await createSocketServer((socket) => {
			socket.once("data", () => socket.end());
		});
		try {
			const request = socketRequestTarget(createSocketClient(fixture.port));
			await expect(request.request({ type: "handshake" })).rejects.toThrow(
				"closed without a response",
			);
		} finally {
			await closeSocketServer(fixture);
		}
	});

	it("applies a response deadline after connecting", async () => {
		let requestReceived: (() => void) | undefined;
		const received = new Promise<void>((resolve) => {
			requestReceived = resolve;
		});
		const fixture = await createSocketServer((socket) => {
			socket.once("data", () => requestReceived?.());
		});
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		try {
			const request = socketRequestTarget(createSocketClient(fixture.port));
			const pending = request.request(
				{ type: "handshake" },
				{ connectTimeoutMs: 1_000, responseTimeoutMs: 100 },
			);
			const assertion = expect(pending).rejects.toThrow("response timed out");
			await received;
			await vi.advanceTimersByTimeAsync(100);
			await assertion;
		} finally {
			vi.useRealTimers();
			await closeSocketServer(fixture);
		}
	});

	it("resets the acquire idle deadline on broker heartbeats", async () => {
		let requestSocket: ((socket: net.Socket) => void) | undefined;
		const received = new Promise<net.Socket>((resolve) => {
			requestSocket = resolve;
		});
		const fixture = await createSocketServer((socket) => {
			socket.once("data", () => requestSocket?.(socket));
		});
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		try {
			const request = socketRequestTarget(createSocketClient(fixture.port));
			const pending = request.request(
				{
					type: "acquire",
					request: {
						treeId: "tree",
						parentRunId: "root",
						runId: "queued",
						role: "leaf",
					},
				},
				{
					connectTimeoutMs: 1_000,
					responseTimeoutMs: 100,
					timeoutMode: "idle",
					probeAcquireIdle: false,
				},
			);
			const assertion = expect(pending).resolves.toMatchObject({
				ok: true,
				ownerToken: "permit-token",
			});
			const socket = await received;
			await vi.advanceTimersByTimeAsync(90);
			socket.write(" ");
			await new Promise<void>((resolve) => setImmediate(resolve));
			await new Promise<void>((resolve) => setImmediate(resolve));
			await vi.advanceTimersByTimeAsync(90);
			socket.end(
				`${JSON.stringify({
					ok: true,
					metadata: {
						treeId: "tree",
						parentRunId: "root",
						runId: "queued",
						role: "leaf",
						depth: 1,
					},
					ownerToken: "permit-token",
				})}\n`,
			);
			await assertion;
		} finally {
			vi.useRealTimers();
			await closeSocketServer(fixture);
		}
	});

	it("destroys an in-flight client request when it is aborted", async () => {
		let requestSocket: ((socket: net.Socket) => void) | undefined;
		const received = new Promise<net.Socket>((resolve) => {
			requestSocket = resolve;
		});
		const fixture = await createSocketServer((socket) => {
			socket.once("data", () => requestSocket?.(socket));
		});
		try {
			const request = socketRequestTarget(createSocketClient(fixture.port));
			const controller = new AbortController();
			const pending = request.request(
				{ type: "handshake" },
				{ signal: controller.signal },
			);
			const assertion = expect(pending).rejects.toThrow("socket abort");
			const socket = await received;
			const closed = new Promise<void>((resolve) => socket.once("close", resolve));
			controller.abort(new Error("socket abort"));
			await assertion;
			await closed;
		} finally {
			await closeSocketServer(fixture);
		}
	});

	it("bounds best-effort cancellation when an aborted acquire broker is silent", async () => {
		let acquireReceived: (() => void) | undefined;
		const received = new Promise<void>((resolve) => {
			acquireReceived = resolve;
		});
		const fixture = await createSocketServer((socket) => {
			let buffer = "";
			socket.setEncoding("utf8");
			socket.on("data", (chunk: string) => {
				buffer += chunk;
				const newline = buffer.indexOf("\n");
				if (newline < 0) return;
				const candidate = JSON.parse(buffer.slice(0, newline)) as {
					readonly type?: unknown;
				};
				if (candidate.type === "handshake") {
					socket.end(
						`${JSON.stringify({
							ok: true,
							protocolVersion: SUBAGENT_TREE_PROTOCOL_VERSION,
							runtimeGeneration: "socket-test-runtime",
						})}\n`,
					);
				} else if (candidate.type === "acquire") {
					acquireReceived?.();
				}
			});
		});
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		try {
			const client = createSocketClient(fixture.port);
			const controller = new AbortController();
			const pending = client.acquire(
				{ runId: "bounded-abort", role: "leaf" },
				controller.signal,
			);
			const assertion = expect(pending).rejects.toThrow("cancelled");
			await received;
			controller.abort();
			await vi.advanceTimersByTimeAsync(5_000);
			await assertion;
		} finally {
			vi.useRealTimers();
			await closeSocketServer(fixture);
		}
	});

	it("gives every child authenticated broker access for runtime pings", async () => {
		const broker = new SubagentTreeBroker();
		const listen = vi.spyOn(broker, "listen");
		const root = broker.createTree({ treeId: "tree", rootRunId: "root" });
		const client = new SubagentTreeRootClient(broker, root);

		const leaf = await client.acquire({ runId: "leaf", role: "leaf" });
		expect(listen).toHaveBeenCalledTimes(1);
		const leafEnvironment = client.childEnvironment(leaf);
		expect(leafEnvironment).toMatchObject({
			PI_SUBAGENT_TREE_RUN_ID: "leaf",
			PI_SUBAGENT_TREE_ROLE: "leaf",
			PI_SUBAGENT_TREE_PROTOCOL_VERSION: String(
				SUBAGENT_TREE_PROTOCOL_VERSION,
			),
		});
		const leafClient = treeClientFromEnvironment(leafEnvironment);
		expect(leafClient).toBeDefined();
		await leafClient?.ping();
		expect(
			broker.list().find((run) => run.runId === "leaf")?.runtimePingAt,
		).toEqual(expect.any(Number));
		expect(
			broker.list().find((run) => run.runId === "leaf")?.runtimePingCount,
		).toBe(1);
		await leaf.release();

		const coordinator = await client.acquire({
			runId: "coordinator",
			role: "coordinator",
		});
		expect(listen).toHaveBeenCalledTimes(2);
		expect(client.childEnvironment(coordinator)).toMatchObject({
			PI_SUBAGENT_TREE_ROLE: "coordinator",
			PI_SUBAGENT_TREE_PROTOCOL_VERSION: String(
				SUBAGENT_TREE_PROTOCOL_VERSION,
			),
			PI_SUBAGENT_TREE_RUNTIME_GENERATION: broker.runtimeGeneration,
		});
		await coordinator.release();
		await broker.dispose();
	});

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

	it("reports overlapping work markers without rejecting admission", async () => {
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

		const overlap = await broker.acquire({
			treeId: root.treeId,
			parentRunId: root.rootRunId,
			runId: "overlap",
			role: "leaf",
			scopeLease: {
				repositoryRoot: process.cwd(),
				scopes: ["src"],
			},
		});
		expect(broker.list().find((run) => run.runId === "overlap")).toMatchObject({
			state: "active",
			scopeLease: { scopes: ["src"] },
		});

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
		await overlap.release();
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
		const broker = new SubagentTreeBroker({ maxActiveDescendants: 1 });
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
		const overlap = await broker.acquire({
			treeId: root.treeId,
			parentRunId: root.rootRunId,
			runId: "premature-replacement",
			role: "leaf",
			scopeLease: {
				repositoryRoot: process.cwd(),
				scopes: ["src/cancelled"],
			},
		});

		let settled = false;
		const settlement = first.release().then(() => {
			settled = true;
		});
		await Promise.resolve();
		expect(settled).toBe(false);
		finishCancellation?.();
		await settlement;
		await overlap.release();
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

	it("allows a failed local release to be retried safely", async () => {
		const broker = new SubagentTreeBroker();
		const root = broker.createTree();
		const permit = await broker.acquire({
			treeId: root.treeId,
			parentRunId: root.rootRunId,
			runId: "retry-local-release",
			role: "leaf",
		});
		const originalRelease = broker.release.bind(broker);
		const release = vi
			.spyOn(broker, "release")
			.mockRejectedValueOnce(new Error("local release failed"))
			.mockImplementation(originalRelease);

		await expect(permit.release()).rejects.toThrow("local release failed");
		await expect(permit.release()).resolves.toBeUndefined();
		expect(release).toHaveBeenCalledTimes(2);
		expect(
			broker.list().find((run) => run.runId === "retry-local-release")?.state,
		).toBe("settled");
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

	it("enforces coordinator admission cutoff and settles active and queued descendants", async () => {
		vi.useFakeTimers();
		try {
			const now = Date.now();
			const cutoffAt = now + 1_000;
			const broker = new SubagentTreeBroker({ maxActiveDescendants: 1 });
			const root = broker.createTree();
			const coordinator = await broker.acquire({
				treeId: root.treeId,
				parentRunId: root.rootRunId,
				runId: "deadline-coordinator",
				role: "coordinator",
				hardDeadlineAt: now + 5_000,
				admissionCutoffAt: cutoffAt,
			});
			const first = await broker.acquire({
				treeId: root.treeId,
				parentRunId: coordinator.metadata.runId,
				runId: "before-cutoff",
				role: "leaf",
			});
			const cancelActive = vi.fn();
			await first.registerProcess({ pid: 1234, cancel: cancelActive });
			const queued = broker.acquire({
				treeId: root.treeId,
				parentRunId: coordinator.metadata.runId,
				runId: "queued-across-cutoff",
				role: "leaf",
			});
			const queuedRejection = expect(queued).rejects.toThrow("reconciliation reserve");
			await vi.advanceTimersByTimeAsync(1_000);
			await queuedRejection;
			expect(cancelActive).toHaveBeenCalledOnce();
			expect(broker.list().find((run) => run.runId === "before-cutoff")?.state).toBe(
				"cancelled",
			);
			await expect(
				broker.acquire({
					treeId: root.treeId,
					parentRunId: coordinator.metadata.runId,
					runId: "at-cutoff",
					role: "leaf",
				}),
			).rejects.toThrow("admission cutoff");
			await vi.advanceTimersByTimeAsync(1);
			await expect(
				broker.acquire({
					treeId: root.treeId,
					parentRunId: coordinator.metadata.runId,
					runId: "after-cutoff",
					role: "leaf",
				}),
			).rejects.toThrow("admission cutoff");
			await first.release();
			await coordinator.release();
			await broker.dispose();
		} finally {
			vi.useRealTimers();
		}
	});

	it("yields coordinator capacity while direct leaves run", async () => {
		const broker = new SubagentTreeBroker({ maxActiveDescendants: 1 });
		const root = broker.createTree();
		const coordinator = await broker.acquire({
			treeId: root.treeId,
			parentRunId: root.rootRunId,
			runId: "coordinator",
			role: "coordinator",
		});
		const credentials = await broker.listen();
		const client = new SubagentTreeClient(
			credentials,
			coordinator.metadata,
			coordinator.ownerToken,
		);

		const first = await client.acquire({ runId: "leaf-1", role: "leaf" });
		expect(broker.list().find((run) => run.runId === "coordinator")?.state).toBe(
			"waiting",
		);
		const secondPending = client.acquire({ runId: "leaf-2", role: "leaf" });
		await vi.waitFor(() =>
			expect(broker.list().find((run) => run.runId === "leaf-2")?.state).toBe(
				"queued",
			),
		);
		await first.release();
		const second = await secondPending;
		await second.release();
		expect(broker.list().find((run) => run.runId === "coordinator")?.state).toBe(
			"active",
		);
		await coordinator.release();
		await broker.dispose();
	});

	it("admits queued leaves before queued coordinators", async () => {
		const broker = new SubagentTreeBroker({ maxActiveDescendants: 2 });
		const root = broker.createTree();
		const firstCoordinator = await broker.acquire({
			treeId: root.treeId,
			parentRunId: root.rootRunId,
			runId: "coordinator-1",
			role: "coordinator",
		});
		const blocker = await broker.acquire({
			treeId: root.treeId,
			parentRunId: root.rootRunId,
			runId: "blocker",
			role: "leaf",
		});
		const queuedCoordinator = broker.acquire({
			treeId: root.treeId,
			parentRunId: root.rootRunId,
			runId: "coordinator-2",
			role: "coordinator",
		});
		const leaf = broker.acquire({
			treeId: root.treeId,
			parentRunId: firstCoordinator.metadata.runId,
			runId: "priority-leaf",
			role: "leaf",
		});

		const admittedLeaf = await leaf;
		expect(broker.list().find((run) => run.runId === "coordinator-2")?.state).toBe(
			"queued",
		);
		await admittedLeaf.release();
		await firstCoordinator.release();
		const secondCoordinator = await queuedCoordinator;
		await secondCoordinator.release();
		await blocker.release();
		await broker.dispose();
	});

	it("does not deadlock when every admitted coordinator requests a leaf", async () => {
		const broker = new SubagentTreeBroker({ maxActiveDescendants: 8 });
		const root = broker.createTree();
		const credentials = await broker.listen();
		const coordinators = await Promise.all(
			Array.from({ length: 8 }, (_, index) =>
				broker.acquire({
					treeId: root.treeId,
					parentRunId: root.rootRunId,
					runId: `coordinator-${index}`,
					role: "coordinator",
				}),
			),
		);
		const leaves = await Promise.all(
			coordinators.map((coordinator, index) =>
				new SubagentTreeClient(
					credentials,
					coordinator.metadata,
					coordinator.ownerToken,
				).acquire({ runId: `leaf-${index}`, role: "leaf" }),
			),
		);
		expect(leaves).toHaveLength(8);
		await Promise.all(leaves.map((leaf) => leaf.release()));
		await Promise.all(coordinators.map((coordinator) => coordinator.release()));
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
		const secondLeaf = await secondClient.acquire({
			runId: "leaf-2",
			role: "leaf",
		});
		expect(
			broker.list().filter((run) => run.state === "active" && run.role !== "root"),
		).toHaveLength(2);
		await firstLeaf.release();
		expect(secondLeaf.metadata.runId).toBe("leaf-2");
		await secondLeaf.release();
		await firstCoordinator.release();
		await secondCoordinator.release();
		await broker.dispose();
	});

	it("rejects remote generation mismatches before permit acquisition", async () => {
		const broker = new SubagentTreeBroker();
		const root = broker.createTree({ treeId: "tree", rootRunId: "root" });
		const credentials = await broker.listen();
		const stale = new SubagentTreeClient(
			{ ...credentials, runtimeGeneration: "stale-generation" },
			{
				treeId: root.treeId,
				runId: root.rootRunId,
				role: "root",
				depth: 0,
			},
			root.ownerToken,
		);

		await expect(
			stale.acquire({ runId: "must-not-start", role: "leaf" }),
		).rejects.toThrow(SUBAGENT_TREE_RESTART_REQUIRED);
		expect(broker.list().map((run) => run.runId)).toEqual(["root"]);
		await broker.dispose();
	});

	it("rejects a stale broker response without requesting a permit", async () => {
		const broker = new SubagentTreeBroker();
		const root = broker.createTree({ treeId: "tree", rootRunId: "root" });
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
		const requestTarget = client as unknown as {
			request: (request: unknown) => Promise<{ ok: true }>;
		};
		const request = vi
			.spyOn(requestTarget, "request")
			.mockResolvedValue({ ok: true });

		await expect(
			client.acquire({ runId: "must-not-start", role: "leaf" }),
		).rejects.toThrow(SUBAGENT_TREE_RESTART_REQUIRED);
		expect(request).toHaveBeenCalledTimes(1);
		expect(request).toHaveBeenCalledWith({ type: "handshake" });
		expect(broker.list().map((run) => run.runId)).toEqual(["root"]);
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

	it("preserves an active incompatible broker and replaces it after settlement", async () => {
		const key = Symbol.for("dotfiles.pi.subagent-tree-broker");
		const globals = globalThis as typeof globalThis & Record<symbol, unknown>;
		const previous = globals[key];
		const compatible = new SubagentTreeBroker({
			protocolVersion: SUBAGENT_TREE_PROTOCOL_VERSION,
		});
		let replacement: SubagentTreeBroker | undefined;
		try {
			globals[key] = {
				protocolVersion: SUBAGENT_TREE_PROTOCOL_VERSION,
				broker: compatible,
			};
			expect(getSubagentTreeBroker()).toBe(compatible);

			const incompatible = new SubagentTreeBroker({ protocolVersion: 1 });
			const active = incompatible.createTree({
				treeId: "old-tree",
				rootRunId: "old-root",
			});
			globals[key] = { protocolVersion: 1, broker: incompatible };
			expect(() => getSubagentTreeBroker()).toThrow(
				SUBAGENT_TREE_RESTART_REQUIRED,
			);
			expect(incompatible.hasOutstandingWork()).toBe(true);

			await incompatible.release(active.rootRunId);
			expect(incompatible.hasOutstandingWork()).toBe(false);
			replacement = getSubagentTreeBroker();
			expect(replacement).not.toBe(incompatible);
			expect(replacement.protocolVersion).toBe(
				SUBAGENT_TREE_PROTOCOL_VERSION,
			);
			expect(getSubagentTreeBroker()).toBe(replacement);
		} finally {
			if (previous === undefined) delete globals[key];
			else globals[key] = previous;
			await replacement?.dispose();
			await compatible.dispose();
		}
	});

	it("rejects ceilings above the hard limit", () => {
		expect(() => new SubagentTreeBroker({ maxActiveDescendants: 17 })).toThrow(
		"1 through 16",
		);
	});
});
