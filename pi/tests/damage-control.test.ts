import { beforeEach, describe, expect, it, vi } from "vitest";

function setPlatform(value: NodeJS.Platform) {
	Object.defineProperty(process, "platform", {
		value,
		configurable: true,
	});
}

describe("damage-control extension", () => {
	const originalPlatform = process.platform;

	beforeEach(() => {
		vi.restoreAllMocks();
		setPlatform(originalPlatform);
	});

	it("asks for docker compose down on linux and blocks when not confirmed", async () => {
		setPlatform("linux");
		const mod = await import("../extensions/damage-control.ts");

		const result = await mod.evaluateDangerousCommand(
			"docker compose down",
			[
				{
					pattern: "docker compose down",
					reason: "docker compose down stops and removes containers",
					action: "ask",
					platforms: ["linux"],
				},
			],
			{
				hasUI: true,
				ui: { confirm: vi.fn(async () => false) },
			},
		);

		expect(result).toEqual({
			block: true,
			reason:
				'Confirmation required for dangerous command (matched "docker compose down"): docker compose down stops and removes containers',
		});
	});

	it("allows docker compose down on linux when confirmed", async () => {
		setPlatform("linux");
		const mod = await import("../extensions/damage-control.ts");
		const confirm = vi.fn(async () => true);

		const result = await mod.evaluateDangerousCommand(
			"docker compose down",
			[
				{
					pattern: "docker compose down",
					reason: "docker compose down stops and removes containers",
					action: "ask",
					platforms: ["linux"],
				},
			],
			{
				hasUI: true,
				ui: { confirm },
			},
		);

		expect(confirm).toHaveBeenCalledWith(
			"Confirm dangerous command",
			"docker compose down stops and removes containers",
		);
		expect(result).toBeUndefined();
	});

	it("allows docker compose down on macOS and Windows because linux-only rule does not apply", async () => {
		const mod = await import("../extensions/damage-control.ts");

		setPlatform("darwin");
		const macResult = await mod.evaluateDangerousCommand(
			"docker compose down",
			[
				{
					pattern: "docker compose down",
					reason: "docker compose down stops and removes containers",
					action: "ask",
					platforms: ["linux"],
				},
			],
		);

		setPlatform("win32");
		const windowsResult = await mod.evaluateDangerousCommand("docker down", [
			{
				pattern: "docker down",
				reason: "docker down stops and removes containers",
				action: "ask",
				platforms: ["linux"],
			},
		]);

		expect(macResult).toBeUndefined();
		expect(windowsResult).toBeUndefined();
	});

	it("preserves action and platform metadata when parsing rules", async () => {
		const mod = await import("../extensions/damage-control.ts");
		const parsed = mod.parseDamageControlRules(`
dangerous_commands:
  - pattern: "docker compose down"
    reason: "docker compose down stops and removes containers"
    action: "ask"
    platforms: ["linux"]
    tools: ["bash"]

zero_access_paths: []
no_delete_paths: []
`);

		expect(parsed.dangerous_commands).toEqual([
			{
				pattern: "docker compose down",
				reason: "docker compose down stops and removes containers",
				action: "ask",
				platforms: ["linux"],
				tools: ["bash"],
			},
		]);
	});

	it("applies dangerous command rules only to targeted tools", async () => {
		const mod = await import("../extensions/damage-control.ts");
		const rules = [
			{
				pattern: "pwsh invoke expression",
				regex: "\\b(?:Invoke-Expression|iex)\\b",
				reason: "Invoke-Expression executes dynamically constructed code",
				tools: ["pwsh"],
			},
		];

		const bashResult = await mod.evaluateDangerousCommand("iex foo", rules, {
			toolName: "bash",
		});
		const pwshResult = await mod.evaluateDangerousCommand("iex foo", rules, {
			toolName: "pwsh",
		});

		expect(bashResult).toBeUndefined();
		expect(pwshResult?.block).toBe(true);
	});

	it("supports default, whitelist, and noshell shell modes", async () => {
		const mod = await import("../extensions/damage-control.ts");

		expect(
			mod.evaluateShellMode("bash", "git status --short", "default"),
		).toBeUndefined();
		expect(
			mod.evaluateShellMode("bash", "git status --short", "whitelist"),
		).toBeUndefined();
		expect(mod.evaluateShellMode("bash", "echo hi", "whitelist")?.block).toBe(
			true,
		);
		expect(
			mod.evaluateShellMode("pwsh", "Get-Location", "whitelist"),
		).toBeUndefined();
		expect(
			mod.evaluateShellMode("pwsh", "Get-Location; Get-ChildItem", "whitelist")
				?.block,
		).toBe(true);
		expect(
			mod.evaluateShellMode("pwsh", "Get-Location", "noshell")?.block,
		).toBe(true);
	});

	it("registers /damage-control and /dc session-local mode commands", async () => {
		const mod = await import("../extensions/damage-control.ts");
		const commands: Record<
			string,
			{
				handler: (
					args: string,
					ctx: { ui: Record<string, ReturnType<typeof vi.fn>> },
				) => Promise<void>;
			}
		> = {};
		const pi = {
			on: vi.fn(),
			registerCommand: vi.fn(
				(name: string, command: (typeof commands)[string]) => {
					commands[name] = command;
				},
			),
		};
		const ctx = {
			ui: {
				notify: vi.fn(),
				setStatus: vi.fn(),
			},
		};

		mod.default(pi as Parameters<typeof mod.default>[0]);
		await commands.dc.handler("mode whitelist", ctx);
		await commands["damage-control"].handler("status", ctx);

		expect(pi.registerCommand).toHaveBeenCalledWith(
			"damage-control",
			expect.any(Object),
		);
		expect(pi.registerCommand).toHaveBeenCalledWith("dc", expect.any(Object));
		expect(ctx.ui.setStatus).toHaveBeenCalledWith(
			"damage-control",
			expect.stringContaining("whitelist"),
		);
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("mode: whitelist"),
			"info",
		);
	});

	it("preserves regex metadata and matches command variants", async () => {
		const mod = await import("../extensions/damage-control.ts");
		const rules = [
			{
				pattern: "rm recursive force",
				regex:
					"\\brm\\s+(?:-[A-Za-z]*r[A-Za-z]*f[A-Za-z]*|-[A-Za-z]*f[A-Za-z]*r[A-Za-z]*)\\b",
				reason: "Recursive force delete can cause irreversible data loss",
			},
		];

		const result = await mod.evaluateDangerousCommand("rm -fr ./build", rules);

		expect(result).toEqual({
			block: true,
			reason:
				'Blocked dangerous command (matched "rm recursive force"): Recursive force delete can cause irreversible data loss',
		});
	});

	it("unescapes double-quoted YAML regex rules before matching", async () => {
		const mod = await import("../extensions/damage-control.ts");
		const parsed = mod.parseDamageControlRules(`
dangerous_commands:
  - pattern: "secret file read"
    regex: "\\\\b(?:cat|sed|awk|head|tail|base64)\\\\b[^|;&]*(?:\\\\.env\\\\b)"
    reason: "Reads secret-bearing files that must not be exposed"

zero_access_paths: []
no_delete_paths: []
`);

		const result = await mod.evaluateDangerousCommand(
			"cat .env >/dev/null",
			parsed.dangerous_commands,
		);

		expect(result).toEqual({
			block: true,
			reason:
				'Blocked dangerous command (matched "secret file read"): Reads secret-bearing files that must not be exposed',
		});
	});

	it("loads the tracked repo rules as an extension-relative fallback", async () => {
		const mod = await import("../extensions/damage-control.ts");
		const loaded = mod.loadRules("C:/definitely/not/a/real/project");

		expect(loaded.health.status).toBe("active");
		expect(loaded.health.ruleSource).toContain("damage-control-rules.yaml");
		expect(loaded.rules.dangerous_commands.length).toBeGreaterThan(0);
	});

	it("sets status and prompts through the registered bash handler", async () => {
		setPlatform("linux");
		const mod = await import("../extensions/damage-control.ts");
		type Handler = (
			event: {
				toolName?: string;
				input?: { command?: string };
				reason?: string;
			},
			ctx: {
				cwd: string;
				ui: {
					setStatus: ReturnType<typeof vi.fn>;
					notify: ReturnType<typeof vi.fn>;
					confirm: ReturnType<typeof vi.fn>;
				};
			},
		) => unknown;
		const handlers: Record<string, Handler[]> = {};
		const pi = {
			on: vi.fn((name: string, handler: Handler) => {
				handlers[name] ??= [];
				handlers[name].push(handler);
			}),
		};
		const confirm = vi.fn(async () => true);
		const ctx = {
			cwd: process.cwd(),
			ui: {
				setStatus: vi.fn(),
				notify: vi.fn(),
				confirm,
			},
		};

		mod.default(pi as Parameters<typeof mod.default>[0]);
		await handlers.session_start[0]({ reason: "startup" }, ctx);
		const result = await handlers.tool_call[0](
			{ toolName: "bash", input: { command: "docker compose down" } },
			ctx,
		);

		expect(ctx.ui.setStatus).toHaveBeenCalledWith(
			"damage-control",
			expect.stringContaining("damage-control: active"),
		);
		expect(confirm).toHaveBeenCalledWith(
			"Confirm dangerous command",
			"docker compose down stops and removes containers",
		);
		expect(result).toBeUndefined();
	});
});

describe("damage-control no_delete_paths enforcement", () => {
	describe("extractBashDeleteTargets", () => {
		it("extracts targets from rm <path>", async () => {
			const mod = await import("../extensions/damage-control.ts");
			expect(mod.extractBashDeleteTargets("rm package.json")).toContain(
				"package.json",
			);
		});

		it("extracts targets from rm with flags", async () => {
			const mod = await import("../extensions/damage-control.ts");
			expect(mod.extractBashDeleteTargets("rm -rf build/")).toContain("build/");
		});

		it("extracts target from truncating > redirection", async () => {
			const mod = await import("../extensions/damage-control.ts");
			const targets = mod.extractBashDeleteTargets("echo > package.json");
			expect(targets).toContain("package.json");
		});

		it("does NOT treat >> as truncating", async () => {
			const mod = await import("../extensions/damage-control.ts");
			const targets = mod.extractBashDeleteTargets("echo hi >> log.txt");
			expect(targets).not.toContain("log.txt");
		});

		it("extracts target from find -delete", async () => {
			const mod = await import("../extensions/damage-control.ts");
			const targets = mod.extractBashDeleteTargets(
				"find ./dist -name '*.bak' -delete",
			);
			expect(targets).toContain("./dist");
		});

		it("extracts targets from git rm", async () => {
			const mod = await import("../extensions/damage-control.ts");
			const targets = mod.extractBashDeleteTargets("git rm Makefile");
			expect(targets).toContain("Makefile");
		});

		it("returns empty for non-delete commands", async () => {
			const mod = await import("../extensions/damage-control.ts");
			expect(mod.extractBashDeleteTargets("ls -la")).toEqual([]);
			expect(mod.extractBashDeleteTargets("cat package.json")).toEqual([]);
		});
	});

	describe("extractPwshDeleteTargets", () => {
		it("extracts target from Remove-Item", async () => {
			const mod = await import("../extensions/damage-control.ts");
			const targets = mod.extractPwshDeleteTargets("Remove-Item package.json");
			expect(targets).toContain("package.json");
		});

		it("extracts target from Remove-Item -Path", async () => {
			const mod = await import("../extensions/damage-control.ts");
			const targets = mod.extractPwshDeleteTargets(
				"Remove-Item -Path 'C:/temp/Makefile' -Force",
			);
			expect(targets).toContain("C:/temp/Makefile");
		});

		it("extracts target from Clear-Content", async () => {
			const mod = await import("../extensions/damage-control.ts");
			const targets = mod.extractPwshDeleteTargets("Clear-Content config.json");
			expect(targets).toContain("config.json");
		});

		it("extracts target from [System.IO.File]::Delete", async () => {
			const mod = await import("../extensions/damage-control.ts");
			const targets = mod.extractPwshDeleteTargets(
				'[System.IO.File]::Delete("Makefile")',
			);
			expect(targets).toContain("Makefile");
		});

		it("returns empty for non-delete cmdlets", async () => {
			const mod = await import("../extensions/damage-control.ts");
			expect(mod.extractPwshDeleteTargets("Get-Item package.json")).toEqual([]);
		});
	});

	describe("extractTruncatingEditWriteTarget", () => {
		it("flags Write with empty content as truncating", async () => {
			const mod = await import("../extensions/damage-control.ts");
			expect(
				mod.extractTruncatingEditWriteTarget("write", {
					path: "package.json",
					content: "",
				}),
			).toBe("package.json");
		});

		it("flags Write with whitespace-only content as truncating", async () => {
			const mod = await import("../extensions/damage-control.ts");
			expect(
				mod.extractTruncatingEditWriteTarget("write", {
					path: "Makefile",
					content: "   \n\n",
				}),
			).toBe("Makefile");
		});

		it("does NOT flag Write with real content", async () => {
			const mod = await import("../extensions/damage-control.ts");
			expect(
				mod.extractTruncatingEditWriteTarget("write", {
					path: "package.json",
					content: '{"name":"x"}',
				}),
			).toBeUndefined();
		});

		it("flags Edit replacing non-trivial old_string with empty new_string", async () => {
			const mod = await import("../extensions/damage-control.ts");
			expect(
				mod.extractTruncatingEditWriteTarget("edit", {
					path: "Makefile",
					old_string: "all:\n\techo hi",
					new_string: "",
				}),
			).toBe("Makefile");
		});

		it("does NOT flag Edit when new_string is non-empty", async () => {
			const mod = await import("../extensions/damage-control.ts");
			expect(
				mod.extractTruncatingEditWriteTarget("edit", {
					path: "Makefile",
					old_string: "all:",
					new_string: "all: build",
				}),
			).toBeUndefined();
		});
	});

	describe("checkNoDeletePaths", () => {
		it("blocks when target matches a no_delete pattern by basename", async () => {
			const mod = await import("../extensions/damage-control.ts");
			const result = mod.checkNoDeletePaths(
				["./package.json"],
				["package.json"],
				process.cwd(),
			);
			expect(result?.block).toBe(true);
			expect(result?.reason).toContain("package.json");
		});

		it("returns undefined when no targets match", async () => {
			const mod = await import("../extensions/damage-control.ts");
			const result = mod.checkNoDeletePaths(
				["./readme.txt"],
				["package.json"],
				process.cwd(),
			);
			expect(result).toBeUndefined();
		});

		it("returns undefined when no patterns are configured", async () => {
			const mod = await import("../extensions/damage-control.ts");
			const result = mod.checkNoDeletePaths(
				["./package.json"],
				[],
				process.cwd(),
			);
			expect(result).toBeUndefined();
		});

		it("blocks malformed paths (NUL byte) by surfacing a block decision", async () => {
			const mod = await import("../extensions/damage-control.ts");
			const result = mod.checkNoDeletePaths(
				[`foo${String.fromCharCode(0)}bar`],
				["never-matched"],
				process.cwd(),
			);
			expect(result?.block).toBe(true);
			expect(result?.reason.toLowerCase()).toContain("malformed");
		});
	});
});

// ============================================================================
// SSH use/inspect split for zero_access_paths
// ============================================================================
//
// Mirror of claude/hooks/damage-control/tests/test_ssh_use_inspect_split.py
// adapted for pi's tool-based architecture: pi's bash handler does NOT run
// zero_access (so `bash: ssh -i ./key.pem ...` is unaffected by this rule
// either before or after this change). Only file-tool calls (read/write/
// edit/find/ls) hit checkZeroAccess. Of those:
//
//   - read/write/edit on ssh-protected patterns -> block (content exposure)
//   - ls/find on ssh-protected patterns         -> ask via ctx.ui.confirm
//   - any tool on non-ssh zero-access patterns  -> block (unchanged)
//
// "ssh-protected patterns" = ~/.ssh/, *.pem, *.ppk, *.p12, *.pfx in the
// configured zero_access_paths list.
import * as os from "node:os";
import * as path from "node:path";

// Tests use native-separator paths (path.join only) because expandPattern
// inside damage-control.ts uses path.join too; mixing forward/backslash
// breaks prefix matching on Windows.
function sshKeyPath(name = "id_ed25519"): string {
	return path.join(os.homedir(), ".ssh", name);
}
function pemPath(name = "aws-key.pem"): string {
	return path.join(process.cwd(), name);
}
function repoPath(name: string): string {
	return path.join(process.cwd(), name);
}

describe("damage-control checkZeroAccess (ssh use/inspect split)", () => {
	const SSH_AND_OTHER = [
		"~/.ssh/*",
		"*.pem",
		"*.ppk",
		"*.p12",
		"*.pfx",
		".env",
	];

	describe("ssh-protected pattern + content tool -> block", () => {
		it("blocks read on ~/.ssh/id_ed25519", async () => {
			const mod = await import("../extensions/damage-control.ts");
			const result = await mod.checkZeroAccess(
				sshKeyPath(),
				SSH_AND_OTHER,
				"read",
			);
			expect(result?.block).toBe(true);
			expect(result?.reason).toMatch(/zero-access/);
		});

		it("blocks write on ./aws-key.pem", async () => {
			const mod = await import("../extensions/damage-control.ts");
			const result = await mod.checkZeroAccess(
				pemPath(),
				SSH_AND_OTHER,
				"write",
			);
			expect(result?.block).toBe(true);
		});

		it("blocks edit on ./aws-key.pem", async () => {
			const mod = await import("../extensions/damage-control.ts");
			const result = await mod.checkZeroAccess(
				pemPath(),
				SSH_AND_OTHER,
				"edit",
			);
			expect(result?.block).toBe(true);
		});
	});

	describe("ssh-protected pattern + metadata tool -> ask via confirm", () => {
		it("allows ls on ~/.ssh when user confirms", async () => {
			const mod = await import("../extensions/damage-control.ts");
			const confirm = vi.fn(async () => true);
			const result = await mod.checkZeroAccess(
				sshKeyPath(),
				SSH_AND_OTHER,
				"ls",
				{
					hasUI: true,
					ui: { confirm },
				},
			);
			expect(confirm).toHaveBeenCalled();
			expect(result).toBeUndefined();
		});

		it("blocks ls on ~/.ssh when user denies", async () => {
			const mod = await import("../extensions/damage-control.ts");
			const confirm = vi.fn(async () => false);
			const result = await mod.checkZeroAccess(
				sshKeyPath(),
				SSH_AND_OTHER,
				"ls",
				{
					hasUI: true,
					ui: { confirm },
				},
			);
			expect(result?.block).toBe(true);
			expect(result?.reason.toLowerCase()).toContain("confirmation required");
		});

		it("allows find on ~/.ssh when user confirms", async () => {
			const mod = await import("../extensions/damage-control.ts");
			const confirm = vi.fn(async () => true);
			const result = await mod.checkZeroAccess(
				sshKeyPath(),
				SSH_AND_OTHER,
				"find",
				{
					hasUI: true,
					ui: { confirm },
				},
			);
			expect(result).toBeUndefined();
		});

		it("allows ls on ./aws-key.pem when user confirms", async () => {
			const mod = await import("../extensions/damage-control.ts");
			const confirm = vi.fn(async () => true);
			const result = await mod.checkZeroAccess(pemPath(), SSH_AND_OTHER, "ls", {
				hasUI: true,
				ui: { confirm },
			});
			expect(result).toBeUndefined();
		});

		it("blocks ls on ./aws-key.pem when no UI is available", async () => {
			const mod = await import("../extensions/damage-control.ts");
			const result = await mod.checkZeroAccess(pemPath(), SSH_AND_OTHER, "ls", {
				hasUI: false,
			});
			expect(result?.block).toBe(true);
			expect(result?.reason.toLowerCase()).toContain("confirmation required");
		});
	});

	describe("non-ssh patterns are unaffected", () => {
		it("blocks read on .env even with confirm available", async () => {
			const mod = await import("../extensions/damage-control.ts");
			const confirm = vi.fn(async () => true);
			const result = await mod.checkZeroAccess(
				repoPath(".env"),
				SSH_AND_OTHER,
				"read",
				{ hasUI: true, ui: { confirm } },
			);
			expect(result?.block).toBe(true);
			expect(confirm).not.toHaveBeenCalled();
		});

		it("blocks ls on .env (metadata tool but non-ssh pattern still blocks)", async () => {
			const mod = await import("../extensions/damage-control.ts");
			const confirm = vi.fn(async () => true);
			const result = await mod.checkZeroAccess(
				repoPath(".env"),
				SSH_AND_OTHER,
				"ls",
				{ hasUI: true, ui: { confirm } },
			);
			expect(result?.block).toBe(true);
			expect(confirm).not.toHaveBeenCalled();
		});

		it("returns undefined for paths that match no pattern", async () => {
			const mod = await import("../extensions/damage-control.ts");
			const result = await mod.checkZeroAccess(
				repoPath("readme.txt"),
				SSH_AND_OTHER,
				"read",
			);
			expect(result).toBeUndefined();
		});
	});

	describe("isSshProtectedPattern unit tests", () => {
		it.each([
			["~/.ssh/", true],
			["~/.ssh/*", true],
			["~/.ssh", true],
			["*.pem", true],
			["*.ppk", true],
			["*.p12", true],
			["*.pfx", true],
			[".env", false],
			["~/.aws/", false],
			["*.session", false],
			["", false],
		])("isSshProtectedPattern(%j) === %s", async (pattern, expected) => {
			const mod = await import("../extensions/damage-control.ts");
			expect(mod.isSshProtectedPattern(pattern)).toBe(expected);
		});
	});
});

describe("damage-control refactor hardening", () => {
	it("debug logging is disabled by default and opt-in redacts synthetic secrets", async () => {
		const fs = await import("node:fs");
		const logPath = path.join(process.cwd(), ".pi", "damage-control-debug.log");
		const mod = await import("../extensions/damage-control.ts");
		fs.rmSync(logPath, { force: true });
		const oldDebug = process.env.PI_DAMAGE_CONTROL_DEBUG;
		delete process.env.PI_DAMAGE_CONTROL_DEBUG;
		mod.debugLog("debug default", { value: `pass${"word"}=fake-value .env` });
		expect(fs.existsSync(logPath)).toBe(false);

		process.env.PI_DAMAGE_CONTROL_DEBUG = "1";
		mod.debugLog("debug enabled", {
			value: `pass${"word"}=fake-value tok${"en"}=fake-query Authorization: Bearer fakebearer .env id_ed25519 fake.pem`,
		});
		const log = fs.readFileSync(logPath, "utf-8");
		expect(log).toContain("debug enabled");
		expect(log).not.toContain("fake-value");
		expect(log).not.toContain("fakebearer");
		expect(log).toContain("[redacted]");
		fs.rmSync(logPath, { force: true });
		if (oldDebug === undefined) delete process.env.PI_DAMAGE_CONTROL_DEBUG;
		else process.env.PI_DAMAGE_CONTROL_DEBUG = oldDebug;
	});

	it("real tracked rules block synthetic secret reads and destructive commands", async () => {
		const mod = await import("../extensions/damage-control.ts");
		const loaded = mod.loadRules(process.cwd());
		expect(loaded.health.status).toBe("active");
		await expect(
			mod.evaluateDangerousCommand(
				"cat synthetic.env >/dev/null",
				loaded.rules.dangerous_commands,
			),
		).resolves.toMatchObject({ block: true });
		await expect(
			mod.evaluateDangerousCommand(
				"DROP TABLE fake_table",
				loaded.rules.dangerous_commands,
			),
		).resolves.toMatchObject({ block: true });
		await expect(
			mod.evaluateDangerousCommand(
				"rm -rf ./synthetic-build",
				loaded.rules.dangerous_commands,
			),
		).resolves.toMatchObject({ block: true });
	});

	it("real tracked rules block through the registered bash and file handlers", async () => {
		const mod = await import("../extensions/damage-control.ts");
		type Handler = (
			event: { toolName: string; input: Record<string, string> },
			ctx: { cwd: string; ui: Record<string, unknown> },
		) => unknown;
		const handlers: Handler[] = [];
		mod.default({
			on: vi.fn((name: string, handler: Handler) => {
				if (name === "tool_call") handlers.push(handler);
			}),
		} as unknown as Parameters<typeof mod.default>[0]);
		const ctx = {
			cwd: process.cwd(),
			ui: { setStatus: vi.fn(), notify: vi.fn(), confirm: vi.fn() },
		};
		const bashResult = await handlers[0](
			{ toolName: "bash", input: { command: "cat synthetic.env" } },
			ctx,
		);
		expect(bashResult).toMatchObject({ block: true });
		const fileResult = await handlers[2](
			{ toolName: "read", input: { path: ".env" } },
			ctx,
		);
		expect(fileResult).toMatchObject({ block: true });
	});

	it("policy schema rejects malformed rules with clear errors", async () => {
		const mod = await import("../extensions/damage-control.ts");
		for (const [name, yaml] of [
			[
				"invalid regex",
				'dangerous_commands:\n  - pattern: "x"\n    regex: "["\n    reason: "bad"\nzero_access_paths: []\nno_delete_paths: []\n',
			],
			[
				"invalid action",
				'dangerous_commands:\n  - pattern: "x"\n    reason: "bad"\n    action: "prompt"\nzero_access_paths: []\nno_delete_paths: []\n',
			],
			[
				"missing required",
				'dangerous_commands:\n  - pattern: "x"\nzero_access_paths: []\nno_delete_paths: []\n',
			],
			[
				"non-array section",
				'dangerous_commands: []\nzero_access_paths:\n  bad: "x"\nno_delete_paths: []\n',
			],
			[
				"unsupported schema value",
				'dangerous_commands:\n  - pattern: "x"\n    reason: "bad"\n    platforms: "linux"\nzero_access_paths: []\nno_delete_paths: []\n',
			],
		] as const) {
			expect(() => mod.parseDamageControlRules(yaml), name).toThrow();
		}
	});
});
