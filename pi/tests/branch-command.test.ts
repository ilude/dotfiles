import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import workflowCommands, {
	buildBranchLaunchPlan,
	defaultBranchTitle,
	extractSessionId,
	msysPathToWindows,
} from "../extensions/workflow-commands";
import { createMockPi } from "./helpers/mock-pi.js";

vi.mock("node:child_process", () => ({
	spawnSync: vi.fn(),
}));

const mockSpawnSync = spawnSync as ReturnType<typeof vi.fn>;

describe("/branch", () => {
	beforeEach(() => {
		vi.stubEnv("WT_SESSION", "1");
		mockSpawnSync.mockReset();
		mockSpawnSync.mockReturnValue({ status: 0, stdout: "", stderr: "" });
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("builds Windows Terminal argv through PowerShell in the requested cwd", () => {
		const plan = buildBranchLaunchPlan({
			cwd: "/c/Users/Example User/project dir",
			title: "feat/$HOME && nope",
			sessionFile: "C:/Users/Example User/.pi/session file.jsonl",
			env: { WT_SESSION: "1" } as NodeJS.ProcessEnv,
		});

		expect(plan.executable).toBe("wt");
		expect(plan.args).toEqual([
			"-w",
			"0",
			"new-tab",
			"--title",
			"feat/$HOME && nope",
			"-d",
			"C:\\Users\\Example User\\project dir",
			"pwsh",
			"-NoExit",
			"-Command",
			"& pi '--session' 'C:/Users/Example User/.pi/session file.jsonl'",
		]);
	});

	it("registers a command that branches the current session and launches a tab", async () => {
		const pi = createMockPi();
		workflowCommands(pi as Parameters<typeof workflowCommands>[0]);
		const command = pi._commands.find((entry) => entry.name === "branch");
		expect(command).toBeTruthy();
		if (!command) throw new Error("branch command not registered");
		const notify = vi.fn();
		const createBranchedSession = vi.fn(
			() =>
				"C:/Users/me/.pi/agent/sessions/project/2026-05-04T18-58-02-760Z_019df45a-c587-70ae-bf94-c74cd681715c.jsonl",
		);

		await command.handler("custom title", {
			cwd: "/c/Users/me/project dir",
			ui: { notify },
			sessionManager: {
				getLeafId: vi.fn(() => "leaf-1"),
				createBranchedSession,
			},
		});

		expect(createBranchedSession).toHaveBeenCalledWith("leaf-1");
		expect(mockSpawnSync).toHaveBeenCalledWith(
			"wt",
			expect.arrayContaining([
				"--title",
				"custom title",
				"pwsh",
				"-Command",
				"& pi '--session' '019df45a-c587-70ae-bf94-c74cd681715c'",
			]),
			expect.objectContaining({ shell: false }),
		);
		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("Opened branched Pi session"),
			"info",
		);
	});

	it("falls back to a manual resume command when no supported terminal is detected", () => {
		const plan = buildBranchLaunchPlan({
			cwd: "/tmp/project",
			title: defaultBranchTitle("/tmp/project"),
			sessionFile: "/tmp/session.jsonl",
			env: {},
			platform: "linux",
		});

		expect(plan.executable).toBeUndefined();
		expect(plan.manualCommand).toBe("'pi' '--session' '/tmp/session.jsonl'");
		expect(plan.reason).toContain(
			"No supported terminal tab launcher detected",
		);
	});

	it("reports launch failures with a manual recovery command", async () => {
		mockSpawnSync.mockReturnValue({ status: 1, stdout: "", stderr: "" });
		const pi = createMockPi();
		workflowCommands(pi as Parameters<typeof workflowCommands>[0]);
		const command = pi._commands.find((entry) => entry.name === "branch");
		if (!command) throw new Error("branch command not registered");
		const notify = vi.fn();

		await command.handler("", {
			cwd: "/c/Users/me/project dir",
			ui: { notify },
			sessionManager: {
				getLeafId: vi.fn(() => "leaf-1"),
				createBranchedSession: vi.fn(
					() =>
						"C:/Users/me/.pi/agent/sessions/project/2026-05-04T18-58-02-760Z_019df45a-c587-70ae-bf94-c74cd681715c.jsonl",
				),
			},
		});

		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("Terminal launch failed: wt exited 1"),
			"warning",
		);
		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("Manual resume command:"),
			"warning",
		);
		expect(notify.mock.calls[0][0]).toContain(
			"'pi' '--session' '019df45a-c587-70ae-bf94-c74cd681715c'",
		);
	});
});

describe("branch path helpers", () => {
	it("extracts the Pi session guid from timestamp-prefixed session files", () => {
		expect(
			extractSessionId(
				"C:/Users/me/.pi/agent/sessions/project/2026-05-04T18-58-02-760Z_019df45a-c587-70ae-bf94-c74cd681715c.jsonl",
			),
		).toBe("019df45a-c587-70ae-bf94-c74cd681715c");
	});

	it("converts MSYS drive paths for native terminal launchers", () => {
		expect(msysPathToWindows("/c/Users/Example User/project dir")).toBe(
			"C:\\Users\\Example User\\project dir",
		);
	});
});
