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
	type BackgroundTerminalSnapshot,
} from "../extensions/background-terminal/manager.ts";
import {
	formatBackgroundTerminalActivity,
	reconcileBackgroundTerminalSelection,
} from "../extensions/background-terminal/ui.ts";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function root(): string {
	const value = mkdtempSync(join(tmpdir(), "pi-bg-manager-test-"));
	roots.push(value);
	return value;
}

function nodeSpawner(script: string) {
	return (_command: string, cwd: string): ChildProcessWithoutNullStreams =>
		spawn(process.execPath, ["-e", script], {
			cwd,
			stdio: ["pipe", "pipe", "pipe"],
			windowsHide: true,
		});
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
		const started = manager.start({ command: "synthetic", cwd: tempRoot });
		expect(started.status).toBe("running");

		const { snapshot, consumed } = await settled;
		expect(consumed).toBe(false);
		expect(snapshot.status).toBe("failed");
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
		const manager = new BackgroundTerminalManager({
			tempRoot,
			spawnProcess: nodeSpawner(
				'const value = Buffer.from("A\\u{1F600}B"); process.stdout.write(value.subarray(0, 3)); setTimeout(() => process.stdout.write(value.subarray(3)), 10);',
			),
		});
		const settled = nextSettlement(manager);
		manager.start({ command: "unicode", cwd: tempRoot });
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
		const started = manager.start({ command: "long-running", cwd: tempRoot });
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
		const started = manager.start({ command: "stubborn", cwd: tempRoot });
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
		const first = manager.start({ command: "first", cwd: tempRoot });
		const firstSnapshot = (await settled).snapshot;
		expect(existsSync(firstSnapshot.stdoutPath ?? "")).toBe(true);
		manager.consumeCompletion(first.id);

		settled = nextSettlement(manager);
		manager.start({ command: "second", cwd: tempRoot });
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
		const first = manager.start({ command: "first", cwd: tempRoot });
		await settled;

		expect(() => manager.start({ command: "second", cwd: tempRoot })).toThrow(
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
		manager.start({ command: "one", cwd: tempRoot });
		expect(() => manager.start({ command: "two", cwd: tempRoot })).toThrow(
			BackgroundTerminalCapacityError,
		);
		expect(spawnCount).toBe(1);
		await manager.dispose();
	});
});

describe("background terminal UI projections", () => {
	it("keeps selection stable by terminal ID and summarizes activity", () => {
		const selection = { id: "bg-2", index: 1 };
		reconcileBackgroundTerminalSelection(selection, [
			{ id: "bg-2" },
			{ id: "bg-3" },
		]);
		expect(selection).toEqual({ id: "bg-2", index: 0 });
		expect(
			formatBackgroundTerminalActivity([
				{ status: "running" },
				{ status: "failed" },
			]),
		).toBe("background 1 running, 1 failed (/ps)");
	});
});
