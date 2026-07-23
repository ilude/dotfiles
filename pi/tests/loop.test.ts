import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() =>
	vi.fn(() => ({ pid: 4242, unref: vi.fn() })),
);
const executeCommitCommandMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:child_process")>();
	return { ...actual, spawn: spawnMock };
});
vi.mock("../extensions/workflow-commands.ts", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../extensions/workflow-commands.ts")>();
	return { ...actual, executeCommitCommand: executeCommitCommandMock };
});

import loopRuntimeLogging from "../extensions/loop/runtime-logging.ts";
import loop, { loopTestApi } from "../extensions/loop.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pi-loop-test-"));
	temporaryDirectories.push(directory);
	return directory;
}

function writeJobFixture(
	stateRoot: string,
	id: string,
	pid: number,
	iteration?: number,
): void {
	const directory = path.join(stateRoot, id);
	fs.mkdirSync(directory, { recursive: true });
	fs.writeFileSync(
		path.join(directory, "job.json"),
		`${JSON.stringify({
			version: 1,
			id,
			cwd: "C:/repo",
			plans: ["plan.md"],
			pid,
			startedAt: "2026-07-17T00:00:00.000Z",
			initialHead: "abc123",
			maxIterations: 100,
		})}\n`,
	);
	if (iteration !== undefined)
		fs.writeFileSync(
			path.join(directory, "loop.log"),
			`2026-07-17T00:00:00.000Z iteration=${iteration} attempt=1 started\n`,
		);
}

function initializeRepository(workspace: string): void {
	execFileSync("git", ["init", "-q"], { cwd: workspace });
	execFileSync("git", ["config", "user.email", "loop-test@example.invalid"], {
		cwd: workspace,
	});
	execFileSync("git", ["config", "user.name", "Loop Test"], {
		cwd: workspace,
	});
	execFileSync("git", ["add", "--", "plan.md"], { cwd: workspace });
	execFileSync("git", ["commit", "-q", "-m", "test: add plan"], {
		cwd: workspace,
	});
}

afterEach(() => {
	vi.useRealTimers();
	vi.clearAllMocks();
	for (const directory of temporaryDirectories.splice(0))
		fs.rmSync(directory, { recursive: true, force: true });
});

describe("loop extension", () => {
	it("parses explicit actions, quoted plans, and bare start arguments", () => {
		expect(loopTestApi.parseRequest("")).toEqual({
			action: "help",
			values: [],
		});
		expect(
			loopTestApi.parseRequest('start "plans/phase one.md" plans/two.md'),
		).toEqual({
			action: "start",
			values: ["plans/phase one.md", "plans/two.md"],
		});
		expect(loopTestApi.parseRequest("status abc123")).toEqual({
			action: "status",
			values: ["abc123"],
		});
		expect(loopTestApi.parseRequest("plans/one.md")).toEqual({
			action: "start",
			values: ["plans/one.md"],
		});
	});

	it("resolves only plan files contained by the workspace", () => {
		const workspace = temporaryDirectory();
		const outside = temporaryDirectory();
		fs.mkdirSync(path.join(workspace, "plans"));
		fs.writeFileSync(path.join(workspace, "plans", "one.md"), "plan\n");
		fs.writeFileSync(path.join(outside, "outside.md"), "outside\n");

		expect(loopTestApi.resolvePlans(workspace, ["plans/one.md"])).toEqual([
			"plans/one.md",
		]);
		expect(() =>
			loopTestApi.resolvePlans(workspace, [path.join(outside, "outside.md")]),
		).toThrow("Plan must stay under the current workspace");
	});

	it("uses stable job ids for the same workspace and plan set", () => {
		const first = loopTestApi.boundedId("C:/repo", ["a.md", "b.md"]);
		expect(first).toHaveLength(12);
		expect(loopTestApi.boundedId("C:/repo", ["a.md", "b.md"])).toBe(first);
		expect(loopTestApi.boundedId("C:/repo", ["b.md", "a.md"])).not.toBe(first);
	});

	it("shows live loop iteration in the footer and clears it on shutdown", async () => {
		vi.useFakeTimers();
		const stateRoot = temporaryDirectory();
		writeJobFixture(stateRoot, "active-job", process.pid, 12);
		writeJobFixture(stateRoot, "dead-job", 999_999, 4);
		const priorRoot = process.env.PI_LOOP_DIR;
		process.env.PI_LOOP_DIR = stateRoot;
		const pi = createMockPi();
		const setStatus = vi.fn();
		const ctx = createMockCtx({
			hasUI: true,
			mode: "tui",
			ui: { setStatus, notify: vi.fn() },
		});
		loop(pi as unknown as ExtensionAPI);

		try {
			for (const hook of pi._getHook("session_start"))
				await hook.handler({ reason: "startup" }, ctx);
			await vi.waitFor(() =>
				expect(setStatus).toHaveBeenLastCalledWith(
					"loop",
					"loop active-job T:12/100",
				),
			);

			await vi.advanceTimersByTimeAsync(5_000);
			await vi.waitFor(() => expect(vi.getTimerCount()).toBe(1));
			expect(setStatus).toHaveBeenCalledTimes(1);

			fs.appendFileSync(
				path.join(stateRoot, "active-job", "loop.log"),
				`${JSON.stringify({
					schema_version: 1,
					timestamp: "2026-07-17T00:00:05.000Z",
					event: "invocation_started",
					iteration: 13,
					attempt: 1,
				})}\n`,
			);
			await vi.advanceTimersByTimeAsync(5_000);
			await vi.waitFor(() =>
				expect(setStatus).toHaveBeenLastCalledWith(
					"loop",
					"loop active-job T:13/100",
				),
			);

			for (const hook of pi._getHook("session_shutdown"))
				await hook.handler({ reason: "quit" }, ctx);
			expect(setStatus).toHaveBeenLastCalledWith("loop", undefined);
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			if (priorRoot === undefined) delete process.env.PI_LOOP_DIR;
			else process.env.PI_LOOP_DIR = priorRoot;
		}
	});

	it("records child Pi lifecycle events with loop correlation fields", async () => {
		const stateRoot = temporaryDirectory();
		const logPath = path.join(stateRoot, "loop.log");
		const environment = {
			PI_LOOP_LOG_PATH: logPath,
			PI_LOOP_JOB_ID: "job-123",
			PI_LOOP_SUPERVISOR_PID: "321",
			PI_LOOP_ITERATION: "7",
			PI_LOOP_ATTEMPT: "2",
		};
		const prior = Object.fromEntries(
			Object.keys(environment).map((key) => [key, process.env[key]]),
		);
		const pi = createMockPi();
		const ctx = createMockCtx({
			sessionManager: { getSessionId: () => "session-456" },
		});

		try {
			Object.assign(process.env, environment);
			loopRuntimeLogging(pi as unknown as ExtensionAPI);
			for (const hook of pi._getHook("session_start"))
				await hook.handler({ reason: "startup" }, ctx);
			for (const hook of pi._getHook("session_shutdown"))
				await hook.handler({ reason: "quit" }, ctx);
		} finally {
			for (const [key, value] of Object.entries(prior)) {
				if (value === undefined) delete process.env[key];
				else process.env[key] = value;
			}
		}

		const records = fs
			.readFileSync(logPath, "utf8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		expect(records).toHaveLength(2);
		expect(records[0]).toMatchObject({
			schema_version: 1,
			event: "pi_process_started",
			job_id: "job-123",
			supervisor_pid: 321,
			pi_pid: process.pid,
			iteration: 7,
			attempt: 2,
			session_id: "session-456",
		});
		expect(records[1]).toMatchObject({
			event: "pi_process_stopped",
			reason: "quit",
			session_id: "session-456",
		});
		expect(records[1].duration_ms).toEqual(expect.any(Number));
	});

	it("starts through the registered command after a clean Git preflight", async () => {
		const workspace = temporaryDirectory();
		const stateRoot = temporaryDirectory();
		fs.writeFileSync(path.join(workspace, "plan.md"), "# Plan\n");
		initializeRepository(workspace);
		const priorRoot = process.env.PI_LOOP_DIR;
		process.env.PI_LOOP_DIR = stateRoot;
		const pi = createMockPi();
		pi.exec.mockImplementation(async (_command: string, args: string[]) => {
			const key = args.join(" ");
			if (key === "rev-parse --show-toplevel")
				return { stdout: `${workspace}\n`, stderr: "", code: 0, killed: false };
			if (key === "status --porcelain")
				return { stdout: "", stderr: "", code: 0, killed: false };
			if (key === "rev-parse HEAD")
				return { stdout: "abc123\n", stderr: "", code: 0, killed: false };
			throw new Error(`Unexpected command: ${key}`);
		});
		loop(pi as unknown as ExtensionAPI);
		const command = pi._commands.find((item) => item.name === "loop");
		const shutdown = vi.fn();

		try {
			await command?.handler(
				"start plan.md",
				createMockCtx({ cwd: workspace, mode: "tui", shutdown }),
			);
		} finally {
			if (priorRoot === undefined) delete process.env.PI_LOOP_DIR;
			else process.env.PI_LOOP_DIR = priorRoot;
		}

		expect(spawnMock).toHaveBeenCalledOnce();
		expect(shutdown).toHaveBeenCalledOnce();
		const records = fs
			.readdirSync(stateRoot, { recursive: true })
			.filter((entry) => String(entry).endsWith("job.json"));
		expect(records).toHaveLength(1);
	});

	it("runs the commit workflow before starting from a clean baseline", async () => {
		const workspace = temporaryDirectory();
		const stateRoot = temporaryDirectory();
		const dirtyPath = path.join(workspace, "source.ts");
		fs.writeFileSync(path.join(workspace, "plan.md"), "# Plan\n");
		initializeRepository(workspace);
		fs.writeFileSync(dirtyPath, "dirty\n");
		const priorRoot = process.env.PI_LOOP_DIR;
		process.env.PI_LOOP_DIR = stateRoot;
		const pi = createMockPi();
		pi.exec.mockImplementation(async (_command: string, args: string[]) => {
			const key = args.join(" ");
			if (key === "rev-parse --show-toplevel")
				return { stdout: `${workspace}\n`, stderr: "", code: 0, killed: false };
			if (key === "status --porcelain")
				return { stdout: "", stderr: "", code: 0, killed: false };
			if (key === "rev-parse HEAD")
				return { stdout: "abc123\n", stderr: "", code: 0, killed: false };
			throw new Error(`Unexpected command: ${key}`);
		});
		executeCommitCommandMock.mockImplementationOnce(async () => {
			fs.rmSync(dirtyPath);
		});
		loop(pi as unknown as ExtensionAPI);
		const command = pi._commands.find((item) => item.name === "loop");
		const ctx = createMockCtx({ cwd: workspace, mode: "tui", shutdown: vi.fn() });

		try {
			await command?.handler("start plan.md", ctx);
		} finally {
			if (priorRoot === undefined) delete process.env.PI_LOOP_DIR;
			else process.env.PI_LOOP_DIR = priorRoot;
		}

		expect(executeCommitCommandMock).toHaveBeenCalledWith(pi, "", ctx);
		expect(pi.sendUserMessage).not.toHaveBeenCalled();
		expect(spawnMock).toHaveBeenCalledOnce();
		expect(ctx.shutdown).toHaveBeenCalledOnce();
	});

	it("does not start when the commit workflow leaves changes", async () => {
		const workspace = temporaryDirectory();
		const stateRoot = temporaryDirectory();
		fs.writeFileSync(path.join(workspace, "plan.md"), "# Plan\n");
		initializeRepository(workspace);
		fs.writeFileSync(path.join(workspace, "source.ts"), "dirty\n");
		const priorRoot = process.env.PI_LOOP_DIR;
		process.env.PI_LOOP_DIR = stateRoot;
		const pi = createMockPi();
		executeCommitCommandMock.mockResolvedValueOnce(undefined);
		loop(pi as unknown as ExtensionAPI);
		const command = pi._commands.find((item) => item.name === "loop");
		const ctx = createMockCtx({ cwd: workspace, mode: "tui", shutdown: vi.fn() });

		try {
			await command?.handler("start plan.md", ctx);
		} finally {
			if (priorRoot === undefined) delete process.env.PI_LOOP_DIR;
			else process.env.PI_LOOP_DIR = priorRoot;
		}

		expect(executeCommitCommandMock).toHaveBeenCalledOnce();
		expect(spawnMock).not.toHaveBeenCalled();
		expect(ctx.shutdown).not.toHaveBeenCalled();
		expect(pi.sendMessage).toHaveBeenLastCalledWith(
			expect.objectContaining({
				content: expect.stringContaining(
					"The /commit baseline left outstanding changes.",
				),
			}),
			{ triggerTurn: false },
		);
	});

	it("registers /loop and renders help without starting a model turn", async () => {
		const pi = createMockPi();
		loop(pi as unknown as ExtensionAPI);
		const command = pi._commands.find((item) => item.name === "loop");
		expect(command).toBeTruthy();

		await command?.handler("help", createMockCtx());

		expect(pi.sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				customType: "loop-status",
				content: expect.stringContaining("/loop start"),
				display: true,
			}),
			{ triggerTurn: false },
		);
	});
});
