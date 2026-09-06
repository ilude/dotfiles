import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
	BackgroundTerminalCapacityError,
	BackgroundTerminalManager,
	getBackgroundTerminalManager,
	type BackgroundTerminalSnapshot,
} from "../extensions/background-terminal/manager.ts";
import { reconcileBackgroundTerminalSelection } from "../extensions/background-terminal/ui.ts";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function root(): string {
	const value = mkdtempSync(join(tmpdir(), "pi-bg-manager-test-"));
	roots.push(value);
	return value;
}

function origin(cwd: string, parentSessionId = "test-session") {
	return { parentSessionId, parentWorkspaceId: cwd };
}

function nodeSpawner(script: string) {
	return (_command: string, cwd: string): ChildProcessWithoutNullStreams =>
		spawn(process.execPath, ["-e", script], {
			cwd,
			stdio: ["pipe", "pipe", "pipe"],
			windowsHide: true,
		});
}

function controlledProcess(): ChildProcessWithoutNullStreams {
	const child = new EventEmitter() as ChildProcessWithoutNullStreams;
	child.stdout = new PassThrough();
	child.stderr = new PassThrough();
	child.stdin = new PassThrough();
	return child;
}

function nextSettlement(manager: BackgroundTerminalManager): Promise<{
	snapshot: BackgroundTerminalSnapshot;
	consumed: boolean;
}> {
	return new Promise((resolve) => {
		const unsubscribe = manager.onSettled((snapshot, consumed) => {
			unsubscribe();
			resolve({ snapshot, consumed });
		});
	});
}

describe("BackgroundTerminalManager", () => {
	it("captures bounded output, preserves capped spill logs, and settles failures", async () => {
		const tempRoot = root();
		const manager = new BackgroundTerminalManager({
			tempRoot,
			memoryBytes: 32,
			spillBytes: 64,
			spawnProcess: nodeSpawner(
				'process.stdout.write("A".repeat(100)); process.stderr.write("ERR"); process.exit(2);',
			),
		});
		const settled = nextSettlement(manager);
		const started = manager.start({ origin: origin(tempRoot), command: "synthetic", cwd: tempRoot });
		expect(started.status).toBe("running");

		const { snapshot, consumed } = await settled;
		expect(consumed).toBe(false);
		expect(snapshot.status).toBe("failed");
		expect(snapshot.startedAt).toBeLessThanOrEqual(snapshot.endedAt ?? Infinity);
		expect(snapshot.exitCode).toBe(2);
		expect(snapshot.stdout).toBe("A".repeat(32));
		expect(snapshot.stderr).toBe("ERR");
		expect(snapshot.stdoutTruncated).toBe(true);
		expect(Buffer.byteLength(readFileSync(snapshot.stdoutPath!, "utf8"))).toBe(64);
		expect(manager.pendingCompletions().map((item) => item.id)).toEqual([
		snapshot.id,
	]);
		expect(manager.hasPendingCompletion(snapshot.id)).toBe(true);
		manager.consumeCompletion(snapshot.id);
		expect(manager.pendingCompletions()).toEqual([]);

		const stdoutPath = snapshot.stdoutPath!;
		await manager.dispose();
		expect(existsSync(stdoutPath)).toBe(false);
	});

	it("preserves UTF-8 characters split across output chunks", async () => {
		const tempRoot = root();
		const child = controlledProcess();
		const manager = new BackgroundTerminalManager({
			tempRoot,
			spawnProcess: () => child,
		});
		const settled = nextSettlement(manager);
		manager.start({ origin: origin(tempRoot), command: "unicode", cwd: tempRoot });
		const value = Buffer.from("A\u{1F600}B");
		child.stdout.emit("data", value.subarray(0, 3));
		child.stdout.emit("data", value.subarray(3));
		child.emit("close", 0);
		expect((await settled).snapshot.stdout).toBe("A\u{1F600}B");
		await manager.dispose();
	});

	it("terminates a process tree and marks an awaited kill as consumed", async () => {
		const tempRoot = root();
		const manager = new BackgroundTerminalManager({
			tempRoot,
			spawnProcess: nodeSpawner("setInterval(() => {}, 1000);"),
			terminateProcess: async (child, force) => {
				child.kill(force ? "SIGKILL" : "SIGTERM");
			},
		});
		const settled = nextSettlement(manager);
		const started = manager.start({ origin: origin(tempRoot), command: "long-running", cwd: tempRoot });
		const results = await manager.kill([started.id], true);
		const completion = await settled;

		expect(results).toMatchObject([
			{ id: started.id, found: true, wasRunning: true },
		]);
		expect(results[0]?.snapshot?.status).toBe("killed");
		expect(completion.snapshot.status).toBe("killed");
		expect(completion.consumed).toBe(true);
		await manager.dispose();
	});

	it("keeps tracking a process when termination cannot be confirmed", async () => {
		const tempRoot = root();
		let child: ChildProcessWithoutNullStreams | undefined;
		const spawnProcess = nodeSpawner("setInterval(() => {}, 1000);");
		const manager = new BackgroundTerminalManager({
			tempRoot,
			killGraceMs: 10,
			spawnProcess: (command, cwd) => {
				child = spawnProcess(command, cwd);
				return child;
			},
			terminateProcess: async () => {},
		});
		const settled = nextSettlement(manager);
		const started = manager.start({ origin: origin(tempRoot), command: "stubborn", cwd: tempRoot });
		const results = await manager.kill([started.id], true);
		expect(results[0]?.snapshot).toMatchObject({
			status: "running",
			error: expect.stringContaining("may still be running"),
		});
		expect(existsSync(results[0]?.snapshot?.stdoutPath ?? "")).toBe(true);

		child?.kill("SIGTERM");
		expect((await settled).snapshot.status).toBe("killed");
		await manager.dispose();
	});

	it("removes spill logs when settled entries are pruned", async () => {
		const tempRoot = root();
		const manager = new BackgroundTerminalManager({
			tempRoot,
			maxTracked: 1,
			spawnProcess: nodeSpawner('process.stdout.write("done");'),
		});
		let settled = nextSettlement(manager);
		const first = manager.start({ origin: origin(tempRoot), command: "first", cwd: tempRoot });
		const firstSnapshot = (await settled).snapshot;
		expect(existsSync(firstSnapshot.stdoutPath ?? "")).toBe(true);
		manager.consumeCompletion(first.id);

		settled = nextSettlement(manager);
		manager.start({ origin: origin(tempRoot), command: "second", cwd: tempRoot });
		await settled;
		expect(manager.get(first.id)).toBeUndefined();
		expect(existsSync(firstSnapshot.stdoutPath ?? "")).toBe(false);
		await manager.dispose();
	});

	it("retains undelivered completions instead of pruning them", async () => {
		const tempRoot = root();
		const manager = new BackgroundTerminalManager({
			tempRoot,
			maxTracked: 1,
			spawnProcess: nodeSpawner('process.stdout.write("done");'),
		});
		const settled = nextSettlement(manager);
		const first = manager.start({ origin: origin(tempRoot), command: "first", cwd: tempRoot });
		await settled;

		expect(() => manager.start({ origin: origin(tempRoot), command: "second", cwd: tempRoot })).toThrow(
			BackgroundTerminalCapacityError,
		);
		expect(manager.hasPendingCompletion(first.id)).toBe(true);
		await manager.dispose();
	});

	it("creates no session directory until the first process starts", async () => {
		const tempRoot = root();
		const manager = new BackgroundTerminalManager({ tempRoot });
		expect(readdirSync(tempRoot)).toEqual([]);
		await manager.dispose();
		expect(readdirSync(tempRoot)).toEqual([]);
	});

	it("enforces the active process limit before spawning another terminal", async () => {
		const tempRoot = root();
		let spawnCount = 0;
		const spawnProcess = nodeSpawner("setInterval(() => {}, 1000);");
		const manager = new BackgroundTerminalManager({
			tempRoot,
			maxActive: 1,
			spawnProcess: (command, cwd) => {
				spawnCount++;
				return spawnProcess(command, cwd);
			},
			terminateProcess: async (child) => {
				child.kill("SIGTERM");
			},
		});
		manager.start({ origin: origin(tempRoot), command: "one", cwd: tempRoot });
		expect(() => manager.start({ origin: origin(tempRoot), command: "two", cwd: tempRoot })).toThrow(
			BackgroundTerminalCapacityError,
		);
		expect(spawnCount).toBe(1);
		await manager.dispose();
	});
});

describe("background terminal manager retention and delivery state", () => {
	it("retains a compatible manager and guards incompatible replacement with pending state", async () => {
		const key = Symbol.for("dotfiles.pi.background-terminal-manager");
		const globals = globalThis as typeof globalThis & Record<symbol, unknown>;
		const previous = globals[key];
		const tempRoot = root();
		const child = controlledProcess();
		const pendingManager = new BackgroundTerminalManager({ tempRoot, spawnProcess: () => child });
		try {
			globals[key] = { version: 2, manager: pendingManager };
			expect(getBackgroundTerminalManager()).toBe(pendingManager);
			const settled = nextSettlement(pendingManager);
			const started = pendingManager.start({ origin: origin(tempRoot), command: "pending", cwd: tempRoot });
			child.emit("close", 0);
			await settled;
			expect(pendingManager.hasPendingCompletion(started.id)).toBe(true);
			globals[key] = { version: 1, manager: pendingManager };
			expect(() => getBackgroundTerminalManager()).toThrow(
				/incompatible background terminal manager/,
			);
		} finally {
			if (previous === undefined) delete globals[key];
			else globals[key] = previous;
			await pendingManager.dispose();
		}
	});

	it("pauses discarded receipts, retries rejected receipts, and holds uncertain receipts", async () => {
		const tempRoot = root();
		const child = controlledProcess();
		const manager = new BackgroundTerminalManager({ tempRoot, spawnProcess: () => child });
		const started = manager.start({ command: "delivery", cwd: tempRoot, origin: origin(tempRoot) });
		child.emit("close", 0);
		await new Promise<void>((resolve) => setImmediate(resolve));
		expect(manager.beginCompletionDelivery(started.id)?.delivery?.phase).toBe("in-flight");
		manager.finishCompletionDelivery(started.id, origin(tempRoot), {
			status: "rejected",
			deliveryId: `background-terminal:${started.id}`,
			sessionId: "test-session",
			reason: "preflight_failed",
			error: new Error("synthetic"),
		});
		expect(manager.beginCompletionDelivery(started.id)).toBeUndefined();
		manager.resumeCompletionDeliveries("session-start", origin(tempRoot));
		expect(manager.beginCompletionDelivery(started.id)?.delivery?.phase).toBe("in-flight");
		manager.finishCompletionDelivery(started.id, origin(tempRoot), {
			status: "discarded",
			deliveryId: `background-terminal:${started.id}`,
			sessionId: "test-session",
			reason: "session_replaced",
		});
		manager.resumeCompletionDeliveries("session-start", origin(tempRoot));
		expect(manager.beginCompletionDelivery(started.id)).toBeUndefined();
		manager.resumeCompletionDeliveries("interactive", origin(tempRoot));
		expect(manager.beginCompletionDelivery(started.id)?.delivery?.phase).toBe("in-flight");
		manager.finishCompletionDelivery(started.id, origin(tempRoot), {
			status: "uncertain",
			deliveryId: `background-terminal:${started.id}`,
			sessionId: "test-session",
			error: new Error("unknown"),
		});
		manager.resumeCompletionDeliveries("interactive", origin(tempRoot));
		expect(manager.beginCompletionDelivery(started.id)).toBeUndefined();
		expect(manager.hasPendingCompletion(started.id)).toBe(true);
		manager.consumeCompletion(started.id);
		await manager.dispose();
	});

	it("resumes only rejected entries from the requested parent origin", async () => {
		const tempRoot = root();
		const firstChild = controlledProcess();
		const secondChild = controlledProcess();
		const children = [firstChild, secondChild];
		const manager = new BackgroundTerminalManager({
			tempRoot,
			spawnProcess: () => children.shift()!,
		});
		const originA = origin(tempRoot, "session-a");
		const originB = origin(tempRoot, "session-b");
		const first = manager.start({ command: "first", cwd: tempRoot, origin: originA });
		const second = manager.start({ command: "second", cwd: tempRoot, origin: originB });
		firstChild.emit("close", 0);
		secondChild.emit("close", 0);
		await new Promise<void>((resolve) => setImmediate(resolve));

		for (const [id, entryOrigin] of [[first.id, originA], [second.id, originB]] as const) {
			expect(manager.beginCompletionDelivery(id)).toBeDefined();
			expect(manager.finishCompletionDelivery(id, entryOrigin, {
				status: "rejected",
				deliveryId: `background-terminal:${id}`,
				sessionId: entryOrigin.parentSessionId,
				reason: "preflight_failed",
				error: new Error("synthetic"),
			})).toBe(true);
		}

		manager.resumeCompletionDeliveries("session-start", originB);
		expect(manager.beginCompletionDelivery(first.id)).toBeUndefined();
		expect(manager.beginCompletionDelivery(second.id)).toBeDefined();
		await manager.dispose();
	});

});

describe("background terminal UI projections", () => {
	it("keeps dashboard selection stable by terminal ID", () => {
		const selection = { id: "bg-2", index: 1 };
		reconcileBackgroundTerminalSelection(selection, [
			{ id: "bg-2" },
			{ id: "bg-3" },
		]);
		expect(selection).toEqual({ id: "bg-2", index: 0 });
	});
});
