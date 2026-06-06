import { spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCodexUsage, formatUsage } from "../extensions/codex-status.ts";
import { createMockPi } from "./helpers/mock-pi.js";

vi.mock("node:child_process", () => ({
	spawn: vi.fn(),
	spawnSync: vi.fn(),
}));

vi.mock("../extensions/codex-status.ts", () => ({
	fetchCodexUsage: vi.fn(async () => ({ auth: {}, usage: {} })),
	formatUsage: vi.fn(() => "Codex:\n 5h     7% used"),
}));

const mockSpawn = spawn as ReturnType<typeof vi.fn>;
const mockSpawnSync = spawnSync as ReturnType<typeof vi.fn>;
const mockFetchCodexUsage = fetchCodexUsage as ReturnType<typeof vi.fn>;
const mockFormatUsage = formatUsage as ReturnType<typeof vi.fn>;

describe("workflow command dispatch", () => {
	let mockPi: ReturnType<typeof createMockPi> & {
		setModel?: ReturnType<typeof vi.fn>;
	};

	function mockGitSpawn(
		result: {
			stdout?: string;
			stderr?: string;
			code?: number;
			autoClose?: boolean;
			pid?: number;
		} = {},
	) {
		const child = new EventEmitter() as EventEmitter & {
			pid?: number;
			stdout: EventEmitter & { setEncoding: ReturnType<typeof vi.fn> };
			stderr: EventEmitter & { setEncoding: ReturnType<typeof vi.fn> };
		};
		child.pid = result.pid;
		child.stdout = new EventEmitter() as EventEmitter & {
			setEncoding: ReturnType<typeof vi.fn>;
		};
		child.stderr = new EventEmitter() as EventEmitter & {
			setEncoding: ReturnType<typeof vi.fn>;
		};
		child.stdout.setEncoding = vi.fn();
		child.stderr.setEncoding = vi.fn();
		if (result.autoClose !== false) {
			queueMicrotask(() => {
				if (result.stdout) child.stdout.emit("data", result.stdout);
				if (result.stderr) child.stderr.emit("data", result.stderr);
				child.emit("close", result.code ?? 0, null);
			});
		}
		return child;
	}

	beforeEach(async () => {
		vi.clearAllMocks();
		mockSpawn.mockImplementation(() => mockGitSpawn());
		mockSpawnSync.mockReturnValue({ status: 0, stdout: "", stderr: "" });
		mockPi = createMockPi() as typeof mockPi;
		mockPi.setModel = vi.fn(async () => {});
		const mod = await import("../extensions/workflow-commands.ts");
		mod.default(mockPi as Parameters<typeof mod.default>[0]);
	});

	function getHandler(name: string) {
		const cmd = mockPi._commands.find((candidate) => candidate.name === name);
		if (!cmd) throw new Error(`${name} command not registered`);
		return cmd.handler as (args: string, ctx: unknown) => Promise<void>;
	}

	it("initializes the new session with Codex status before previous usage", async () => {
		type NewSessionOptions = {
			setup?: (sessionManager: {
				appendCustomMessageEntry: ReturnType<typeof vi.fn>;
			}) => Promise<void>;
		};

		const appendCustomMessageEntry = vi.fn();
		const order: string[] = [];
		mockFetchCodexUsage.mockImplementationOnce(async () => {
			order.push("fetch-codex-status");
			return { auth: { source: "pi" }, usage: { rate_limit: {} } };
		});
		mockFormatUsage.mockImplementationOnce(() => {
			order.push("format-codex-status");
			return "Codex:\n 5h     7% used";
		});
		appendCustomMessageEntry.mockImplementation((_type, content) => {
			order.push(
				String(content).startsWith("Codex:") ? "codex-status" : "usage",
			);
		});
		const newSession = vi.fn(async (options?: NewSessionOptions) => {
			await options?.setup?.({ appendCustomMessageEntry });
			order.push("new-session");
			return { cancelled: false };
		});
		const ctx = {
			getContextUsage: vi.fn(() => ({
				tokens: 12_345,
				contextWindow: 100_000,
				percent: 12.345,
			})),
			newSession,
			ui: { notify: vi.fn() },
		};

		await getHandler("clear")("", ctx);

		expect(newSession).toHaveBeenCalledWith(
			expect.objectContaining({
				setup: expect.any(Function),
			}),
		);
		expect(mockFormatUsage).toHaveBeenCalledWith(
			{ rate_limit: {} },
			{ source: "pi" },
			{ color: true },
		);
		expect(appendCustomMessageEntry).toHaveBeenNthCalledWith(
			1,
			"workflow-clear-codex-status",
			"Codex:\n 5h     7% used",
			true,
		);
		expect(appendCustomMessageEntry).toHaveBeenNthCalledWith(
			2,
			"workflow-clear-usage",
			"Previous session usage: 12% (12k/100k tokens)",
			true,
		);
		expect(order).toEqual([
			"fetch-codex-status",
			"format-codex-status",
			"codex-status",
			"usage",
			"new-session",
		]);
	});

	it("runs /commit directly without dispatching a workflow prompt", async () => {
		const notify = vi.fn();

		await getHandler("commit")("", { cwd: "/repo", ui: { notify } });

		expect(mockSpawn).toHaveBeenCalledWith(
			expect.any(String),
			["status", "--short"],
			expect.objectContaining({ cwd: "/repo" }),
		);
		expect(mockPi.sendMessage).not.toHaveBeenCalledWith(
			expect.objectContaining({ customType: "workflow.hiddenPrompt" }),
			expect.anything(),
		);
		expect(notify).toHaveBeenCalledWith("Working tree is clean", "info");
	});

	it("reports /commit executor failures without dispatching a workflow prompt", async () => {
		const notify = vi.fn();
		mockSpawn.mockImplementationOnce(() =>
			mockGitSpawn({ code: 1, stderr: "fatal: not a git repository\n" }),
		);

		await getHandler("commit")("", { cwd: "/repo", ui: { notify } });

		expect(mockPi.sendMessage).not.toHaveBeenCalledWith(
			expect.objectContaining({ customType: "workflow.hiddenPrompt" }),
			expect.anything(),
		);
		expect(mockPi.sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				customType: "workflow-commit-activity",
				content: "Error: Commit failed: fatal: not a git repository",
				display: true,
			}),
		);
		expect(notify).toHaveBeenCalledWith(
			"Commit failed: fatal: not a git repository",
			"error",
		);
	});

	it("cancels /commit before launching git when the command signal is already aborted", async () => {
		const notify = vi.fn();
		const controller = new AbortController();
		controller.abort();

		await getHandler("commit")("", {
			cwd: "/repo",
			signal: controller.signal,
			ui: { notify },
		});

		expect(mockSpawn).not.toHaveBeenCalled();
		expect(mockPi.sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				customType: "workflow-commit-activity",
				content: "Error: Commit failed: Operation cancelled",
				display: true,
			}),
		);
		expect(notify).toHaveBeenCalledWith(
			"Commit failed: Operation cancelled",
			"error",
		);
	});

	it("terminates the running git process tree when /commit is aborted", async () => {
		const notify = vi.fn();
		const controller = new AbortController();
		const child = mockGitSpawn({ autoClose: false, pid: 123 });
		const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
		mockSpawn.mockImplementationOnce(() => child);

		const pending = getHandler("commit")("", {
			cwd: "/repo",
			signal: controller.signal,
			ui: { notify },
		});
		await Promise.resolve();
		controller.abort();
		child.emit("close", null, "SIGTERM");
		await pending;

		if (process.platform === "win32") {
			expect(mockSpawn).toHaveBeenCalledWith(
				"taskkill",
				["/pid", "123", "/t", "/f"],
				expect.objectContaining({ windowsHide: true }),
			);
		} else {
			expect(killSpy).toHaveBeenCalledWith(-123, "SIGTERM");
		}
		expect(notify).toHaveBeenCalledWith(
			"Commit failed: Operation cancelled",
			"error",
		);
		killSpy.mockRestore();
	});
});
