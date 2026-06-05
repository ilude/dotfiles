import { spawnSync } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCodexUsage, formatUsage } from "../extensions/codex-status.ts";
import { createMockPi } from "./helpers/mock-pi.js";

vi.mock("node:child_process", () => ({
	spawnSync: vi.fn(),
}));

vi.mock("../extensions/codex-status.ts", () => ({
	fetchCodexUsage: vi.fn(async () => ({ auth: {}, usage: {} })),
	formatUsage: vi.fn(() => "Codex:\n 5h     7% used"),
}));

const mockSpawnSync = spawnSync as ReturnType<typeof vi.fn>;
const mockFetchCodexUsage = fetchCodexUsage as ReturnType<typeof vi.fn>;
const mockFormatUsage = formatUsage as ReturnType<typeof vi.fn>;

describe("workflow command dispatch", () => {
	let mockPi: ReturnType<typeof createMockPi> & {
		setModel?: ReturnType<typeof vi.fn>;
	};

	beforeEach(async () => {
		vi.clearAllMocks();
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

		expect(mockSpawnSync).toHaveBeenCalledWith(
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
		mockSpawnSync.mockReturnValueOnce({
			status: 1,
			stdout: "",
			stderr: "fatal: not a git repository\n",
		});

		await getHandler("commit")("", { cwd: "/repo", ui: { notify } });

		expect(mockPi.sendMessage).not.toHaveBeenCalledWith(
			expect.objectContaining({ customType: "workflow.hiddenPrompt" }),
			expect.anything(),
		);
		expect(notify).toHaveBeenCalledWith(
			"Commit failed: fatal: not a git repository",
			"error",
		);
	});
});
