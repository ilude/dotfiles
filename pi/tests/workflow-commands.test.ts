/**
 * Command-flow integration tests for /commit — validates that duplicate-file
 * and missing-file plan rejections surface correctly through the full command
 * dispatch path, not just in the pure parseCommitPlan/validateCommitPlan helpers.
 *
 * Coverage goal: the error-handling branch in executeCommitCommand that catches
 * validateCommitPlan failures and falls back to single-commit mode.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockPi } from "./helpers/mock-pi.js";

// ── Module mocks (hoisted by vitest before imports) ───────────────────────────

vi.mock("node:child_process", () => ({
	spawnSync: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		// Intercept readFileSync so loadClaudeCommitInstructions() succeeds in tests.
		readFileSync: vi.fn((filePath: string, _enc?: any) => {
			if (typeof filePath === "string" && filePath.includes("commit-instructions")) {
				return "# Commit instructions (test stub)";
			}
			// Skill files and anything else — return safe empty content.
			return "// test stub";
		}),
		// Return isFile() = false so secret scanning skips every file (no findings).
		statSync: vi.fn(() => ({ isFile: () => false })),
	};
});

vi.mock("../lib/model-routing", () => ({
	resolveCommitPlanningModelFromRegistry: vi.fn(async () => ({
		provider: "openai",
		id: "gpt-4o-mini",
		name: "gpt-4o-mini",
	})),
}));

vi.mock("@mariozechner/pi-ai", () => ({
	completeSimple: vi.fn(),
}));

// ── Git mock helpers ──────────────────────────────────────────────────────────

import { spawnSync } from "node:child_process";
import { completeSimple } from "@mariozechner/pi-ai";
const mockSpawnSync = spawnSync as ReturnType<typeof vi.fn>;
const mockCompleteSimple = completeSimple as ReturnType<typeof vi.fn>;

/**
 * Wire up spawnSync so every git sub-command returns plausible output.
 * changedFiles: files returned by `git diff --name-only HEAD`.
 */
function setupGitMocks(changedFiles: string[]) {
	mockSpawnSync.mockImplementation((_cmd: string, args: string[], _opts: any) => {
		const joined = (args as string[]).join(" ");

		if (joined.includes("status --short")) {
			// Non-empty status so the command doesn't bail out early.
			return { status: 0, stdout: changedFiles.map((f) => ` M ${f}`).join("\n"), stderr: "" };
		}
		if (joined.includes("diff --stat HEAD")) {
			return { status: 0, stdout: `${changedFiles.length} files changed`, stderr: "" };
		}
		if (joined.includes("diff --name-only HEAD")) {
			return { status: 0, stdout: changedFiles.join("\n"), stderr: "" };
		}
		if (joined.includes("ls-files --others")) {
			return { status: 0, stdout: "", stderr: "" };
		}
		if (joined.includes("diff --cached --name-only")) {
			// No pre-staged files so chooseFilesToCommit takes the "stage all" path.
			return { status: 0, stdout: "", stderr: "" };
		}
		if (joined.startsWith("add")) {
			return { status: 0, stdout: "", stderr: "" };
		}
		if (joined.includes("diff --cached --stat")) {
			return { status: 0, stdout: "2 files changed, 10 insertions(+)", stderr: "" };
		}
		if (joined.includes("diff --cached --no-color")) {
			return { status: 0, stdout: "diff --git a/a.ts b/a.ts\n+// new", stderr: "" };
		}
		if (joined.startsWith("reset")) {
			return { status: 0, stdout: "", stderr: "" };
		}
		if (joined.includes("commit -m")) {
			return { status: 0, stdout: "[main abc1234] commit\n 1 file changed", stderr: "" };
		}
		if (joined.includes("rev-parse --short")) {
			return { status: 0, stdout: "abc1234", stderr: "" };
		}
		// Default: succeed silently.
		return { status: 0, stdout: "", stderr: "" };
	});
}

// ── Context factory ───────────────────────────────────────────────────────────

function makeAssistantMessage(text: string) {
	return { role: "assistant" as const, content: [{ type: "text", text }] };
}

/**
 * Create a mock ctx whose internal planner call returns the supplied LLM text.
 * ui.confirm defaults to false so the commit is always cancelled after any
 * fallback, keeping tests from needing real git commits.
 */
function createMockCtxWithLlmResponse(llmResponseText: string) {
	mockCompleteSimple.mockResolvedValue({
		role: "assistant",
		content: makeAssistantMessage(llmResponseText).content,
		api: "openai-responses",
		provider: "openai",
		model: "gpt-4o-mini",
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
	});

	return {
		cwd: "/test/repo",
		model: "claude-opus-4-5",
		modelRegistry: {
			models: [],
			getApiKeyAndHeaders: vi.fn(async () => ({ ok: true, apiKey: "test-key", headers: {} })),
		},
		sessionManager: { buildSessionContext: vi.fn(() => ({ messages: [] })) },
		getSystemPrompt: vi.fn(() => "test system prompt"),
		waitForIdle: vi.fn(async () => {}),
		ui: {
			notify: vi.fn(),
			// Return false to cancel the confirm dialogs — avoids real git ops.
			confirm: vi.fn(async () => false),
			input: vi.fn(async () => null),
			select: vi.fn(async () => null),
		},
	};
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("/commit command flow – plan validation rejection", () => {
	let mockPi: ReturnType<typeof createMockPi> & { setModel?: ReturnType<typeof vi.fn> };

	beforeEach(async () => {
		vi.clearAllMocks();
		mockPi = createMockPi() as any;
		// setModel is not in the shared mock factory; add it here.
		(mockPi as any).setModel = vi.fn(async () => {});
		const mod = await import("../extensions/workflow-commands.ts");
		mod.default(mockPi as any);
	});

	function getCommitHandler() {
		const cmd = mockPi._commands.find((c) => c.name === "commit");
		if (!cmd) throw new Error("commit command not registered");
		return cmd.handler as (args: string, ctx: any) => Promise<void>;
	}

	// ── duplicate file ──────────────────────────────────────────────────────────

	it("notifies fallback warning when LLM plan assigns the same file to multiple groups", async () => {
		setupGitMocks(["a.ts", "b.ts"]);

		// a.ts appears in both groups — validateCommitPlan must reject this.
		const duplicatePlan = JSON.stringify({
			groups: [
				{ files: ["a.ts"], subject: "feat(pi): add feature" },
				{ files: ["a.ts", "b.ts"], subject: "test(pi): add tests" },
			],
		});
		const ctx = createMockCtxWithLlmResponse(duplicatePlan);

		await getCommitHandler()("", ctx);

		const notifyCalls: [string, string][] = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock.calls;
		const fallback = notifyCalls.find(([msg]) => msg.includes("falling back"));

		expect(fallback).toBeDefined();
		expect(fallback![0]).toContain("multiple groups");
		expect(fallback![1]).toBe("warning");
	});

	// ── missing file ────────────────────────────────────────────────────────────

	it("notifies fallback warning when LLM plan omits a changed file", async () => {
		setupGitMocks(["a.ts", "b.ts"]);

		// b.ts is not covered by any group — validateCommitPlan must reject this.
		const incompletePlan = JSON.stringify({
			groups: [{ files: ["a.ts"], subject: "feat(pi): add feature" }],
		});
		const ctx = createMockCtxWithLlmResponse(incompletePlan);

		await getCommitHandler()("", ctx);

		const notifyCalls: [string, string][] = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock.calls;
		const fallback = notifyCalls.find(([msg]) => msg.includes("falling back"));

		expect(fallback).toBeDefined();
		expect(fallback![0]).toContain("omitted");
		expect(fallback![1]).toBe("warning");
	});

	// ── valid plan does not fall back ───────────────────────────────────────────

	it("does NOT emit a fallback warning when the LLM plan is valid and covers all files", async () => {
		setupGitMocks(["a.ts", "b.ts"]);

		// Each file in exactly one group, conventional subjects — validateCommitPlan accepts this.
		const validPlan = JSON.stringify({
			groups: [
				{ files: ["a.ts"], subject: "feat(pi): add feature" },
				{ files: ["b.ts"], subject: "test(pi): add tests" },
			],
		});
		const ctx = createMockCtxWithLlmResponse(validPlan);

		await getCommitHandler()("", ctx);

		const notifyCalls: [string, string][] = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock.calls;
		const fallback = notifyCalls.find(([msg]) => msg.includes("falling back"));

		// A valid plan must NOT trigger the fallback path.
		expect(fallback).toBeUndefined();
	});

	// ── plan with unknown file ──────────────────────────────────────────────────

	it("notifies fallback warning when LLM plan references a file not in the changed set", async () => {
		setupGitMocks(["a.ts"]);

		// ghost.ts was never changed — validateCommitPlan must reject this.
		const phantomFilePlan = JSON.stringify({
			groups: [
				{ files: ["a.ts"], subject: "feat(pi): add feature" },
				{ files: ["ghost.ts"], subject: "chore(pi): update ghost" },
			],
		});
		const ctx = createMockCtxWithLlmResponse(phantomFilePlan);

		await getCommitHandler()("", ctx);

		const notifyCalls: [string, string][] = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock.calls;
		const fallback = notifyCalls.find(([msg]) => msg.includes("falling back"));

		expect(fallback).toBeDefined();
		expect(fallback![0]).toContain("unknown file");
		expect(fallback![1]).toBe("warning");
	});
});
