import { spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatConfiguredUsageReport } from "../extensions/codex-status.ts";
import { createMockPi } from "./helpers/mock-pi.js";

vi.mock("node:child_process", () => ({
	spawn: vi.fn(),
	spawnSync: vi.fn(),
}));

vi.mock("../extensions/codex-status.ts", () => ({
	formatConfiguredUsageReport: vi.fn(async () => "Codex:\n 5h     7% used"),
}));

const mockInspectGitStateAsync = vi.hoisted(() => vi.fn());
const mockPreflightGitStateAsync = vi.hoisted(() => vi.fn());
const mockScanSecrets = vi.hoisted(() => vi.fn(() => []));
const mockTypedAgentRun = vi.hoisted(() => vi.fn());
vi.mock("../lib/commit/plan.ts", () => ({
	inspectGitStateAsync: mockInspectGitStateAsync,
	preflightGitStateAsync: mockPreflightGitStateAsync,
}));
vi.mock("../lib/secret-scan.ts", () => ({
	scanSecrets: mockScanSecrets,
}));
vi.mock("../lib/typed-agent.ts", () => ({
	defineAgent: (config: { id: string }) => ({
		id: config.id,
		run: (input: unknown, ctx: unknown) =>
			mockTypedAgentRun(config.id, input, ctx),
	}),
}));

const mockSpawn = spawn as ReturnType<typeof vi.fn>;
const mockSpawnSync = spawnSync as ReturnType<typeof vi.fn>;
const mockFormatConfiguredUsageReport =
	formatConfiguredUsageReport as ReturnType<typeof vi.fn>;

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

	function modifiedStatus(files: string[]) {
		const entries = files
			.map(
				(file) =>
					`1 .M N... 100644 100644 100644 abcdef1 abcdef2 ${file}\0`,
			)
			.join("");
		return `# branch.head main\0${entries}`;
	}

	function stagedStatus(files: string[]) {
		const entries = files
			.map(
				(file) =>
					`1 M. N... 100644 100644 100644 abcdef1 abcdef2 ${file}\0`,
			)
			.join("");
		return `# branch.head main\0${entries}`;
	}

	function untrackedStatus(file: string) {
		return `# branch.head main\0? ${file}\0`;
	}

	beforeEach(async () => {
		vi.clearAllMocks();
		mockSpawn.mockImplementation(() => mockGitSpawn());
		mockSpawnSync.mockReturnValue({ status: 0, stdout: "", stderr: "" });
		mockInspectGitStateAsync.mockImplementation(
			async (
				cwd: string,
				runner: (
					cwd: string,
					args: string[],
					signal?: AbortSignal,
				) => Promise<{ code: number; stdout: string; stderr: string }>,
				signal?: AbortSignal,
			) => {
				const status = await runner(
					cwd,
					[
						"status",
						"--porcelain=v2",
						"--branch",
						"--no-renames",
						"-z",
						"--untracked-files=all",
					],
					signal,
				);
				if (status.code !== 0) {
					throw new Error(
						(status.stderr || status.stdout || "git status failed").trim(),
					);
				}
				return {
					preflight: { ok: true, blocked: [] },
					statusOutput: status.stdout,
				};
			},
		);
		mockPreflightGitStateAsync.mockResolvedValue({ ok: true, blocked: [] });
		mockScanSecrets.mockReturnValue([]);
		mockTypedAgentRun.mockImplementation(
			async (id: string, input: Record<string, unknown>) => {
				if (id === "untracked-classifier") {
					return {
						output: {
							classifications: (input.files as string[]).map((file) => ({
								path: file,
								decision: "do_not_ignore",
								confidence: 100,
								reason: "Source file.",
							})),
						},
						attempts: 1,
					};
				}
				if (id === "secret-reviewer") {
					return {
						output: { findings: [] },
						attempts: 1,
					};
				}
				return {
					output: {
						groups: [
							{
								files: input.files,
								subject: "chore(pi): update tracked changes",
							},
						],
					},
					attempts: 1,
				};
			},
		);
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
		mockFormatConfiguredUsageReport.mockImplementationOnce(async () => {
			order.push("format-configured-usage-report");
			return "Codex:\n 5h     7% used\n\nBedrock: no usage recorded this month.";
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
		expect(mockFormatConfiguredUsageReport).toHaveBeenCalledOnce();
		expect(appendCustomMessageEntry).toHaveBeenNthCalledWith(
			1,
			"workflow-clear-codex-status",
			"Codex:\n 5h     7% used\n\nBedrock: no usage recorded this month.",
			true,
		);
		expect(appendCustomMessageEntry).toHaveBeenNthCalledWith(
			2,
			"workflow-clear-usage",
			"Previous session usage: 12% (12k/100k tokens)",
			true,
		);
		expect(order).toEqual([
			"format-configured-usage-report",
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
			[
				"status",
				"--porcelain=v2",
				"--branch",
				"--no-renames",
				"-z",
				"--untracked-files=all",
			],
			expect.objectContaining({ cwd: "/repo" }),
		);
		expect(mockPi.sendMessage).not.toHaveBeenCalledWith(
			expect.objectContaining({ customType: "workflow.hiddenPrompt" }),
			expect.anything(),
		);
		expect(mockPi.sendMessage).not.toHaveBeenCalledWith(
			expect.objectContaining({ customType: "workflow-commit-activity" }),
			expect.anything(),
		);
		expect(notify).toHaveBeenCalledWith("Working tree is clean", "info");
	});

	it.each([
		["merge", "Blocked during merge."],
		["rebase", "Blocked during rebase."],
		["cherry-pick", "Blocked during cherry-pick."],
		["bisect", "Blocked during bisect."],
		["detached HEAD", "Blocked during detached HEAD."],
		["unresolved paths", "Blocked during unmerged paths."],
	])("refuses %s before planning or mutation", async (_state, blocked) => {
		const notify = vi.fn();
		mockInspectGitStateAsync.mockResolvedValueOnce({
			preflight: { ok: false, blocked: [blocked] },
			statusOutput: "",
		});

		await getHandler("commit")("", { cwd: "/repo", ui: { notify } });

		expect(mockInspectGitStateAsync).toHaveBeenCalledWith(
			"/repo",
			expect.any(Function),
			undefined,
		);
		expect(mockSpawn).not.toHaveBeenCalled();
		expect(mockTypedAgentRun).not.toHaveBeenCalled();
		expect(notify).toHaveBeenCalledWith(
			`Commit failed: Git state preflight failed:\n${blocked}`,
			"error",
		);
	});

	it("retries invalid planner coverage before multi-group commit execution", async () => {
		const notify = vi.fn();
		const cwd = path.resolve(process.cwd(), "..");
		const files = ["pi/lib/extension-utils.ts", "pi/lib/model-routing.ts"];
		let hashIndex = 0;
		let stagedFiles: string[] = [];
		mockSpawn.mockImplementation((_command, args: string[]) => {
			const signature = args.join(" ");
			if (args[0] === "status") {
				return mockGitSpawn({
					stdout:
						stagedFiles.length > 0
							? stagedStatus(stagedFiles)
							: modifiedStatus(files),
				});
			}
			if (
				signature ===
				"diff --stat --no-ext-diff HEAD -- pi/lib/extension-utils.ts pi/lib/model-routing.ts"
			) {
				return mockGitSpawn({ stdout: "2 files changed\n" });
			}
			if (
				signature ===
				"diff --no-color --no-ext-diff HEAD -- pi/lib/extension-utils.ts pi/lib/model-routing.ts"
			) {
				return mockGitSpawn({ stdout: "diff --git synthetic\n" });
			}
			if (args[0] === "add") {
				const separator = args.indexOf("--");
				stagedFiles = args.slice(separator + 1);
				return mockGitSpawn();
			}
			if (args[0] === "commit") stagedFiles = [];
			if (signature === "rev-parse --short HEAD") {
				hashIndex += 1;
				return mockGitSpawn({ stdout: `abc000${hashIndex}\n` });
			}
			if (args[0] === "check-ignore") {
				return mockGitSpawn({ code: 1 });
			}
			return mockGitSpawn();
		});
		const validGroups = [
			{
				files: [files[0]],
				subject: "chore(pi): update utilities",
			},
			{
				files: [files[1]],
				subject: "chore(pi): update routing",
			},
		];
		mockTypedAgentRun.mockImplementation(
			async (id: string, input: Record<string, unknown>) => ({
				output:
					id === "secret-reviewer"
						? {
								findings: (
									input.findings as Array<{ id: number }>
								).map(({ id }) => ({
									id,
									classification: "false_positive",
									reason: "Synthetic diff has no credential value.",
								})),
							}
						: {
								groups: input.validationCorrection
									? validGroups
									: [validGroups[0], { ...validGroups[1], files }],
							},
				attempts: 1,
			}),
		);

		await getHandler("commit")("", { cwd, ui: { notify } });

		const plannerCalls = mockTypedAgentRun.mock.calls.filter(
			([id]) => id === "commit-planner",
		);
		expect(plannerCalls).toHaveLength(2);
		expect(plannerCalls[1]?.[1]).toEqual(
			expect.objectContaining({
				validationCorrection: expect.stringContaining(
					"Assign every listed changed file to exactly one group",
				),
			}),
		);
		const commitCalls = mockSpawn.mock.calls.filter(
			([, args]) => (args as string[])[0] === "commit",
		);
		expect(commitCalls.map(([, args]) => args)).toEqual([
			["commit", "-m", "chore(pi): update utilities"],
			["commit", "-m", "chore(pi): update routing"],
		]);
		const gitArgs = mockSpawn.mock.calls.map(([, callArgs]) =>
			(callArgs as string[]).join(" "),
		);
		expect(
			gitArgs.filter((call) =>
				call.startsWith("status --porcelain=v2 --branch --no-renames -z"),
			),
		).toHaveLength(3);
		expect(gitArgs).not.toContain("diff --cached --name-only -z");
		expect(gitArgs).not.toContain("rev-parse --verify HEAD");
		expect(gitArgs.some((call) => call.startsWith("diff-index "))).toBe(false);
		expect(
			gitArgs.some((call) =>
				call.startsWith("config --bool core.sparseCheckout"),
			),
		).toBe(false);
		expect(gitArgs.some((call) => call.startsWith("reset "))).toBe(false);
		expect(notify).not.toHaveBeenCalledWith(
			expect.stringContaining("Commit failed:"),
			"error",
		);
	});

	it("verifies directory migrations without rename collapse", async () => {
		const notify = vi.fn();
		const cwd = "/repo";
		const oldFiles = [
			"tools/menos-youtube/api_config.py",
			"tools/menos-youtube/search.py",
		];
		const newFiles = [
			"tools/onclave-youtube/api_config.py",
			"tools/onclave-youtube/search.py",
		];
		const files = [...oldFiles, ...newFiles].sort();
		const unstagedStatus = `# branch.head main\0${oldFiles
			.map(
				(file) =>
					`1 .D N... 100644 100644 000000 abcdef1 abcdef1 ${file}\0`,
			)
			.join("")}${newFiles.map((file) => `? ${file}\0`).join("")}`;
		const indexedStatus = `# branch.head main\0${oldFiles
			.map(
				(file) =>
					`1 D. N... 100644 000000 000000 abcdef1 abcdef1 ${file}\0`,
			)
			.join("")}${newFiles
			.map(
				(file) =>
					`1 A. N... 000000 100644 100644 abcdef2 abcdef2 ${file}\0`,
			)
			.join("")}`;
		let staged = false;
		mockSpawn.mockImplementation((_command, args: string[]) => {
			if (args[0] === "status")
				return mockGitSpawn({
					stdout: staged ? indexedStatus : unstagedStatus,
				});
			if (args[0] === "add") {
				staged = true;
				return mockGitSpawn();
			}
			if (args[0] === "commit") {
				staged = false;
				return mockGitSpawn();
			}
			if (args[0] === "rev-parse")
				return mockGitSpawn({ stdout: "abc1234\n" });
			if (args[0] === "check-ignore") return mockGitSpawn({ code: 1 });
			return mockGitSpawn();
		});

		await getHandler("commit")("", { cwd, ui: { notify } });

		expect(mockSpawn).toHaveBeenCalledWith(
			expect.any(String),
			[
				"status",
				"--porcelain=v2",
				"--branch",
				"--no-renames",
				"-z",
				"--untracked-files=all",
			],
			expect.objectContaining({ cwd }),
		);
		expect(mockTypedAgentRun).toHaveBeenCalledWith(
			"commit-planner",
			expect.objectContaining({ files }),
			expect.anything(),
		);
		expect(
			mockSpawn.mock.calls.filter(
				([, args]) => (args as string[])[0] === "commit",
			),
		).toHaveLength(1);
		expect(notify).not.toHaveBeenCalledWith(
			expect.stringContaining("Commit failed:"),
			"error",
		);
	});

	it("uses the shared secret scanner on staged content during /commit", async () => {
		const notify = vi.fn();
		const file = "pi/lib/secret-scan.ts";
		let staged = false;
		mockSpawn.mockImplementation((_command, args: string[]) => {
			if (args[0] === "status") {
				return mockGitSpawn({
					stdout: staged ? stagedStatus([file]) : modifiedStatus([file]),
				});
			}
			if (args[0] === "check-ignore") return mockGitSpawn({ code: 1 });
			if (args[0] === "add") {
				staged = true;
				return mockGitSpawn();
			}
			if (args[0] === "ls-files") {
				return mockGitSpawn({
					stdout: `100644 ${"a".repeat(40)} 0\t${file}\0`,
				});
			}
			if (args[0] === "cat-file") {
				return mockGitSpawn({ stdout: "export function scanSecrets() {}\n" });
			}
			return mockGitSpawn();
		});
		mockScanSecrets.mockImplementationOnce(() => {
			throw new Error("shared scanner sentinel");
		});

		await getHandler("commit")("", {
			cwd: path.resolve(process.cwd(), ".."),
			ui: { notify },
		});

		expect(mockScanSecrets).toHaveBeenCalledOnce();
		expect(mockScanSecrets).toHaveBeenCalledWith(
			"export function scanSecrets() {}\n",
		);
		expect(notify).toHaveBeenCalledWith(
			"Commit failed: shared scanner sentinel",
			"error",
		);
	});

	it("does not scan worktree content for staged deletions", async () => {
		const notify = vi.fn();
		const file = "generated/ignored.tf";
		const status = `# branch.head main\0${`1 D. N... 100644 000000 000000 abcdef1 abcdef1 ${file}\0`}`;
		mockSpawn.mockImplementation((_command, args: string[]) => {
			if (args[0] === "status") return mockGitSpawn({ stdout: status });
			if (args[0] === "check-ignore") {
				return mockGitSpawn({ stdout: `${file}\0` });
			}
			if (args.includes("--diff-filter=D")) {
				return mockGitSpawn({ stdout: `${file}\0` });
			}
			if (args[0] === "ls-files") return mockGitSpawn();
			if (args[0] === "rev-parse") {
				return mockGitSpawn({ stdout: "abc1234\n" });
			}
			return mockGitSpawn();
		});

		await getHandler("commit")("", { cwd: "/repo", ui: { notify } });

		expect(mockScanSecrets).not.toHaveBeenCalled();
		expect(
			mockSpawn.mock.calls.filter(
				([, args]) => (args as string[])[0] === "commit",
			),
		).toHaveLength(1);
	});

	it("skips secret review for staged paths marked commit-secrets=allow", async () => {
		const notify = vi.fn();
		const cwd = path.resolve(process.cwd(), "..");
		const file = "pi/lib/extension-utils.ts";
		let staged = false;
		mockSpawn.mockImplementation((_command, args: string[]) => {
			if (args[0] === "status") {
				return mockGitSpawn({
					stdout: staged ? stagedStatus([file]) : modifiedStatus([file]),
				});
			}
			if (args[0] === "check-attr") {
				return mockGitSpawn({
					stdout: `${file}\0commit-secrets\0allow\0`,
				});
			}
			if (args[0] === "check-ignore") return mockGitSpawn({ code: 1 });
			if (args[0] === "add") {
				staged = true;
				return mockGitSpawn();
			}
			if (args[0] === "ls-files") {
				return mockGitSpawn({
					stdout: `100644 ${"a".repeat(40)} 0\t${file}\0`,
				});
			}
			if (args[0] === "cat-file") return mockGitSpawn({ stdout: "secret\n" });
			if (args[0] === "commit") {
				staged = false;
				return mockGitSpawn();
			}
			if (args[0] === "rev-parse") {
				return mockGitSpawn({ stdout: "abc1234\n" });
			}
			return mockGitSpawn();
		});
		mockScanSecrets.mockReturnValueOnce([
			{
				kind: "secret-assignment",
				line: 1,
				column: 1,
				offset: 0,
				length: 6,
				redacted: "[REDACTED]",
			},
		]);

		await getHandler("commit")("", { cwd, ui: { notify } });

		expect(mockSpawn).toHaveBeenCalledWith(
			expect.any(String),
			["check-attr", "--cached", "-z", "commit-secrets", "--", file],
			expect.objectContaining({ cwd }),
		);
		expect(
			mockTypedAgentRun.mock.calls.some(([id]) => id === "secret-reviewer"),
		).toBe(false);
		expect(mockPi.sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				customType: "workflow-commit-activity",
				content:
					"commit-secrets=allow for 1 selected path(s); skipping secret review for those paths.",
				display: true,
			}),
		);
	});

	it("retries incomplete secret-review coverage with stable candidate IDs", async () => {
		const notify = vi.fn();
		const file = "pi/lib/extension-utils.ts";
		let staged = false;
		mockSpawn.mockImplementation((_command, args: string[]) => {
			const signature = args.join(" ");
			if (args[0] === "status") {
				return mockGitSpawn({
					stdout: staged ? stagedStatus([file]) : modifiedStatus([file]),
				});
			}
			if (args[0] === "check-attr") {
				return mockGitSpawn({
					stdout: `${file}\0commit-secrets\0unspecified\0`,
				});
			}
			if (signature.startsWith("diff --stat --no-ext-diff HEAD")) {
				return mockGitSpawn({ stdout: `${file} | 1 +\n` });
			}
			if (signature.startsWith("diff --no-color --no-ext-diff HEAD")) {
				return mockGitSpawn({
					stdout: `diff --git a/${file} b/${file}\n`,
				});
			}
			if (args[0] === "check-ignore") return mockGitSpawn({ code: 1 });
			if (args[0] === "add") {
				staged = true;
				return mockGitSpawn();
			}
			if (args[0] === "ls-files") {
				return mockGitSpawn({
					stdout: `100644 ${"a".repeat(40)} 0\t${file}\0`,
				});
			}
			if (args[0] === "cat-file") return mockGitSpawn({ stdout: "secret\n" });
			return mockGitSpawn();
		});
		mockScanSecrets.mockReturnValueOnce([
			{
				kind: "secret-assignment",
				line: 1,
				column: 1,
				offset: 0,
				length: 6,
				redacted: "[REDACTED]",
			},
		]);
		mockTypedAgentRun
			.mockResolvedValueOnce({
				output: {
					groups: [
						{
							files: [file],
							subject: "chore(pi): update extension utilities",
						},
					],
				},
				attempts: 1,
			})
			.mockResolvedValueOnce({ output: { findings: [] }, attempts: 1 })
			.mockResolvedValueOnce({
				output: {
					findings: [
						{
							id: 1,
							classification: "false_positive",
							reason: "No credential value is present.",
						},
					],
				},
				attempts: 1,
			});

		await getHandler("commit")("", {
			cwd: path.resolve(process.cwd(), ".."),
			ui: { notify },
		});

		expect(mockTypedAgentRun).toHaveBeenNthCalledWith(
			1,
			"commit-planner",
			expect.anything(),
			expect.anything(),
		);
		expect(mockTypedAgentRun).toHaveBeenNthCalledWith(
			2,
			"secret-reviewer",
			expect.objectContaining({
				findings: [expect.objectContaining({ id: 1, path: file })],
			}),
			expect.anything(),
		);
		expect(mockTypedAgentRun).toHaveBeenNthCalledWith(
			3,
			"secret-reviewer",
			expect.objectContaining({
				coverageCorrection: expect.stringContaining(
					"Return exactly 1 findings covering IDs 1 through 1",
				),
			}),
			expect.anything(),
		);
	});

	it("surfaces planner warnings before commit mutation", async () => {
		const notify = vi.fn();
		const file = "pi/lib/extension-utils.ts";
		for (const result of [
			{ stdout: modifiedStatus([file]) },
			{},
			{ stdout: `${file}\n` },
			{},
			{},
			{},
			{ stdout: `${file} | 1 +\n` },
			{ code: 1 },
			{},
			{ stdout: `${file} | 1 +\n` },
			{ stdout: `diff --git a/${file} b/${file}\n` },
			{ code: 1, stderr: "stop after warning\n" },
		]) {
			mockSpawn.mockImplementationOnce(() => mockGitSpawn(result));
		}
		mockTypedAgentRun.mockResolvedValueOnce({
			output: {
				groups: [
					{
						files: [file],
						subject: "chore(pi): update secret scanner",
					},
				],
				warnings: ["Review generated files before committing."],
			},
			attempts: 1,
		});

		await getHandler("commit")("", {
			cwd: path.resolve(process.cwd(), ".."),
			ui: { notify },
		});

		expect(mockPi.sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				customType: "workflow-commit-activity",
				content: "Planner warning: Review generated files before committing.",
				display: true,
			}),
		);
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
				content: "Commit failed: fatal: not a git repository",
				display: true,
			}),
		);
		expect(notify).toHaveBeenCalledWith(
			"Commit failed: fatal: not a git repository",
			"error",
		);
	});

	it("surfaces untracked classifier provider failures through /commit", async () => {
		const notify = vi.fn();
		const model = {
			provider: "openai-codex",
			id: "gpt-5.4-mini",
		};
		for (const result of [
			{ stdout: untrackedStatus("new-file.ts") },
			{},
			{},
			{ stdout: "new-file.ts\n" },
			{},
			{},
		]) {
			mockSpawn.mockImplementationOnce(() => mockGitSpawn(result));
		}
		mockTypedAgentRun.mockRejectedValueOnce(
			new Error("synthetic upstream failure"),
		);

		await getHandler("commit")("", {
			cwd: "/repo",
			modelRegistry: {
				getAvailable: () => [model],
				getApiKeyAndHeaders: async () => ({ ok: true }),
			},
			ui: { notify },
		});

		expect(mockTypedAgentRun).toHaveBeenCalledWith(
			"untracked-classifier",
			{ files: ["new-file.ts"] },
			expect.anything(),
		);
		expect(mockPi.sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				customType: "workflow-commit-activity",
				content: "Commit failed: synthetic upstream failure",
				display: true,
			}),
		);
		expect(notify).toHaveBeenCalledWith(
			"Commit failed: synthetic upstream failure",
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
				content: "Commit failed: Operation cancelled",
				display: true,
			}),
		);
		expect(notify).toHaveBeenCalledWith(
			"Commit failed: Operation cancelled",
			"error",
		);
	});

	it("cancels /commit with Esc through the loader signal", async () => {
		const { initTheme } = await import("@earendil-works/pi-coding-agent");
		initTheme("dark");
		const notify = vi.fn();
		mockInspectGitStateAsync.mockImplementationOnce(
			async (_cwd, _runner, signal: AbortSignal) => {
				await new Promise<void>((resolve) => {
					signal.addEventListener("abort", () => resolve(), { once: true });
				});
				return {
					preflight: { ok: true, blocked: [] },
					statusOutput: "",
				};
			},
		);
		const custom = vi.fn(
			async (
				factory: (
					tui: unknown,
					theme: unknown,
					keybindings: unknown,
					done: (value: undefined) => void,
				) => { handleInput: (input: string) => void },
			) =>
				new Promise<void>((resolve) => {
					const component = factory(
						{ requestRender: vi.fn() },
						{
							fg: (_color: string, text: string) => text,
							bold: (text: string) => text,
						},
						{},
						() => resolve(),
					);
					queueMicrotask(() => component.handleInput("\u001b"));
				}),
		);

		await getHandler("commit")("", {
			cwd: "/repo",
			mode: "tui",
			ui: { custom, notify },
		});

		expect(custom).toHaveBeenCalledOnce();
		expect(notify).toHaveBeenCalledWith("Commit cancelled", "info");
	});

	it("keeps every mixed-surface path in one fallback commit", async () => {
		const { buildDeterministicCommitFallback } = await import(
			"../extensions/workflow-commands.ts"
		);
		const files = [
			"CHANGELOG.md",
			"pi/extensions/session-hooks.ts",
			"test/test_config_patterns.py",
			"tools/dolos/internal/state/state_test.go",
		];
		const result = buildDeterministicCommitFallback({
			files,
			diffStat: "",
			diff: "",
			hint: "",
		});

		expect(result.plan.groups).toHaveLength(1);
		expect(result.plan.groups[0]?.files).toEqual([...files].sort());
		expect(result.plan.warnings).toEqual([
			"Using deterministic single-commit fallback.",
		]);
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
