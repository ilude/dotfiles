import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import workflowCommands, {
	buildBranchLaunchPlan,
	buildNewInstanceLaunchPlan,
	buildNewTerminalLaunchPlan,
	extractSessionId,
	isHerdrManagedEnvironment,
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
		vi.stubEnv("HERDR_ENV", "");
		vi.stubEnv("HERDR_WORKSPACE_ID", "");
		vi.stubEnv("HERDR_BIN_PATH", "");
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
			"--suppressApplicationTitle",
			"-d",
			"C:\\Users\\Example User\\project dir",
			"pwsh",
			"-NoExit",
			"-Command",
			"& pi '--session' 'C:/Users/Example User/.pi/session file.jsonl'",
		]);
	});

	it("builds new-instance argv without session restore", () => {
		const plan = buildNewInstanceLaunchPlan({
			cwd: "/c/Users/me/project dir",
			title: "project dir",
			env: { WT_SESSION: "1" } as NodeJS.ProcessEnv,
		});

		expect(plan.executable).toBe("wt");
		expect(plan.args).toEqual([
			"-w",
			"0",
			"new-tab",
			"--title",
			"project dir",
			"--suppressApplicationTitle",
			"-d",
			"C:\\Users\\me\\project dir",
			"pwsh",
			"-NoExit",
			"-Command",
			"& pi",
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
				"--suppressApplicationTitle",
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
		expect(pi.sendMessage).not.toHaveBeenCalled();
	});

	it("opens a branched Pi session in Herdr when managed", async () => {
		vi.stubEnv("HERDR_ENV", "1");
		vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
		vi.stubEnv("HERDR_PANE_ID", "w1:p1");
		vi.stubEnv("HERDR_BIN_PATH", "C:\\Herdr\\herdr.exe");
		const pi = createMockPi();
		pi.exec
			.mockResolvedValueOnce({
				code: 0,
				stdout: JSON.stringify({
					result: {
						root_pane: { pane_id: "w1:p2" },
						tab: { tab_id: "w1:t2" },
					},
				}),
				stderr: "",
			})
			.mockResolvedValueOnce({ code: 0, stdout: "{}", stderr: "" });
		workflowCommands(pi as Parameters<typeof workflowCommands>[0]);
		const command = pi._commands.find((entry) => entry.name === "branch");
		if (!command) throw new Error("branch command not registered");
		const notify = vi.fn();

		await command.handler("review", {
			cwd: "C:\\Users\\me\\project",
			ui: { notify },
			sessionManager: {
				getLeafId: vi.fn(() => "leaf-1"),
				createBranchedSession: vi.fn(
					() =>
						"C:/Users/me/.pi/agent/sessions/project/2026-05-04T18-58-02-760Z_019df45a-c587-70ae-bf94-c74cd681715c.jsonl",
				),
			},
		});

		expect(pi.exec).toHaveBeenNthCalledWith(
			1,
			"C:\\Herdr\\herdr.exe",
			[
				"tab",
				"create",
				"--workspace",
				"w1",
				"--cwd",
				"C:\\Users\\me\\project",
				"--label",
				"review",
				"--focus",
			],
			expect.objectContaining({ cwd: "C:\\Users\\me\\project" }),
		);
		expect(pi.exec).toHaveBeenNthCalledWith(
			2,
			"C:\\Herdr\\herdr.exe",
			[
				"agent",
				"start",
				"pi-w1-p2",
				"--kind",
				"pi",
				"--pane",
				"w1:p2",
				"--",
				"--session",
				"019df45a-c587-70ae-bf94-c74cd681715c",
			],
			expect.objectContaining({ cwd: "C:\\Users\\me\\project" }),
		);
		expect(mockSpawnSync).not.toHaveBeenCalled();
		expect(notify).toHaveBeenCalledWith(
			"Opened branched Pi session in a Herdr tab: review",
			"info",
		);
	});

	it("builds new-terminal argv for Windows Terminal", () => {
		const plan = buildNewTerminalLaunchPlan({
			cwd: "/c/Users/me/project dir",
			title: "project dir",
			env: { WT_SESSION: "1" } as NodeJS.ProcessEnv,
		});

		expect(plan.executable).toBe("wt");
		expect(plan.args).toEqual([
			"-w",
			"0",
			"new-tab",
			"--title",
			"project dir",
			"-d",
			"C:\\Users\\me\\project dir",
			"pwsh",
		]);
	});

	it("builds Ghostty AppleScript for macOS terminal launches", () => {
		const plan = buildNewTerminalLaunchPlan({
			cwd: "/Users/me/project dir",
			title: "project dir",
			platform: "darwin",
			env: {} as NodeJS.ProcessEnv,
		});

		expect(plan.executable).toBe("osascript");
		expect(plan.args).toEqual([
			"-e",
			expect.stringContaining(
				'set initial working directory of cfg to "/Users/me/project dir"',
			),
		]);
		expect(plan.args.join("\n")).toContain('set command of cfg to "/bin/zsh"');
	});

	it("builds Ghostty AppleScript for macOS Pi launches", () => {
		const branchPlan = buildBranchLaunchPlan({
			cwd: "/Users/me/project dir",
			title: "project dir",
			sessionFile:
				"/Users/me/.pi/agent/sessions/project/2026-05-04T18-58-02-760Z_019df45a-c587-70ae-bf94-c74cd681715c.jsonl",
			platform: "darwin",
			env: {} as NodeJS.ProcessEnv,
		});
		const instancePlan = buildNewInstanceLaunchPlan({
			cwd: "/Users/me/project dir",
			title: "project dir",
			platform: "darwin",
			env: {} as NodeJS.ProcessEnv,
		});

		expect(branchPlan.executable).toBe("osascript");
		expect(branchPlan.args.join("\n")).toContain(
			"pi '--session' '019df45a-c587-70ae-bf94-c74cd681715c'",
		);
		expect(instancePlan.executable).toBe("osascript");
		expect(instancePlan.args.join("\n")).toContain('input text "pi');
	});

	it("registers new-instance command and ctrl+t shortcut", async () => {
		const pi = createMockPi();
		workflowCommands(pi as Parameters<typeof workflowCommands>[0]);
		const command = pi._commands.find((entry) => entry.name === "new-instance");
		expect(command).toBeTruthy();
		if (!command) throw new Error("new-instance command not registered");
		const shortcut = pi._shortcuts[0];
		expect(shortcut).toBeTruthy();
		const notify = vi.fn();

		await command.handler("custom title", {
			cwd: "/c/Users/me/project dir",
			ui: { notify },
		});

		expect(mockSpawnSync).toHaveBeenCalledWith(
			"wt",
			expect.arrayContaining([
				"--title",
				"custom title",
				"--suppressApplicationTitle",
				"-d",
				"C:\\Users\\me\\project dir",
				"pwsh",
				"-Command",
				"& pi",
			]),
			expect.objectContaining({ shell: false }),
		);
		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("Opened new Pi instance"),
			"info",
		);
		expect(pi.sendMessage).not.toHaveBeenCalled();

		mockSpawnSync.mockClear();
		await shortcut.handler({ cwd: "/c/Users/me/project dir", ui: { notify } });
		expect(mockSpawnSync).toHaveBeenCalledWith(
			"wt",
			expect.arrayContaining(["-Command", "& pi"]),
			expect.objectContaining({ shell: false }),
		);
	});

	it("opens a new Pi instance in Herdr without session arguments", async () => {
		vi.stubEnv("HERDR_ENV", "1");
		vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
		const pi = createMockPi();
		pi.exec
			.mockResolvedValueOnce({
				code: 0,
				stdout: JSON.stringify({
					result: {
						root_pane: { pane_id: "w1:p3" },
						tab: { tab_id: "w1:t3" },
					},
				}),
				stderr: "",
			})
			.mockResolvedValueOnce({ code: 0, stdout: "{}", stderr: "" });
		workflowCommands(pi as Parameters<typeof workflowCommands>[0]);
		const command = pi._commands.find((entry) => entry.name === "new-instance");
		if (!command) throw new Error("new-instance command not registered");
		const notify = vi.fn();

		await command.handler("helper", {
			cwd: "C:\\Users\\me\\project",
			ui: { notify },
		});

		expect(pi.exec).toHaveBeenNthCalledWith(
			2,
			"herdr",
			[
				"agent",
				"start",
				"pi-w1-p3",
				"--kind",
				"pi",
				"--pane",
				"w1:p3",
			],
			expect.any(Object),
		);
		expect(mockSpawnSync).not.toHaveBeenCalled();
		expect(notify).toHaveBeenCalledWith(
			"Opened new Pi instance in a Herdr tab: helper",
			"info",
		);
	});

	it("registers new-terminal command", async () => {
		const pi = createMockPi();
		workflowCommands(pi as Parameters<typeof workflowCommands>[0]);
		const command = pi._commands.find((entry) => entry.name === "new-terminal");
		expect(command).toBeTruthy();
		if (!command) throw new Error("new-terminal command not registered");
		const notify = vi.fn();

		await command.handler("custom title", {
			cwd: "/c/Users/me/project dir",
			ui: { notify },
		});

		expect(mockSpawnSync).toHaveBeenCalledWith(
			"wt",
			expect.arrayContaining([
				"--title",
				"custom title",
				"-d",
				"C:\\Users\\me\\project dir",
				"pwsh",
			]),
			expect.objectContaining({ shell: false }),
		);
		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("Opened new terminal"),
			"info",
		);
		expect(pi.sendMessage).not.toHaveBeenCalled();
	});

	it("opens a shell-only Herdr tab without starting an agent", async () => {
		vi.stubEnv("HERDR_ENV", "1");
		vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
		const pi = createMockPi();
		pi.exec.mockResolvedValueOnce({
			code: 0,
			stdout: JSON.stringify({
				result: {
					root_pane: { pane_id: "w1:p4" },
					tab: { tab_id: "w1:t4" },
				},
			}),
			stderr: "",
		});
		workflowCommands(pi as Parameters<typeof workflowCommands>[0]);
		const command = pi._commands.find((entry) => entry.name === "new-terminal");
		if (!command) throw new Error("new-terminal command not registered");
		const notify = vi.fn();

		await command.handler("shell", {
			cwd: "C:\\Users\\me\\project",
			ui: { notify },
		});

		expect(pi.exec).toHaveBeenCalledOnce();
		expect(pi.exec).toHaveBeenCalledWith(
			"herdr",
			expect.arrayContaining(["tab", "create", "--label", "shell"]),
			expect.any(Object),
		);
		expect(mockSpawnSync).not.toHaveBeenCalled();
		expect(notify).toHaveBeenCalledWith(
			"Opened new Herdr tab in this cwd: shell",
			"info",
		);
	});

	it("reports launch failures without a manual recovery command", async () => {
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
		expect(notify.mock.calls[0][0]).not.toContain("Manual resume command:");
	});
});

describe("branch path helpers", () => {
	it("detects only an explicit Herdr environment", () => {
		expect(isHerdrManagedEnvironment({ HERDR_ENV: "1" })).toBe(true);
		expect(isHerdrManagedEnvironment({ HERDR_ENV: "0" })).toBe(false);
		expect(isHerdrManagedEnvironment({})).toBe(false);
	});

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
