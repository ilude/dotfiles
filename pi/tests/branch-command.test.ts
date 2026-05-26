import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import workflowCommands, {
	buildBranchLaunchPlan,
	buildNewInstanceLaunchPlan,
	buildNewTerminalLaunchPlan,
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

		mockSpawnSync.mockClear();
		await shortcut.handler({ cwd: "/c/Users/me/project dir", ui: { notify } });
		expect(mockSpawnSync).toHaveBeenCalledWith(
			"wt",
			expect.arrayContaining(["-Command", "& pi"]),
			expect.objectContaining({ shell: false }),
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
