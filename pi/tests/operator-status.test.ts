import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ReadonlyFooterDataProvider } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeTaskDatabase, initializeTaskStore } from "../lib/task-store.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

let tmpRoot: string;
let prevOperatorDir: string | undefined;

beforeEach(() => {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-operator-status-"));
	prevOperatorDir = process.env.PI_OPERATOR_DIR;
	process.env.PI_OPERATOR_DIR = tmpRoot;
	initializeTaskStore(tmpRoot);
});

afterEach(() => {
	closeTaskDatabase(tmpRoot);
	if (prevOperatorDir === undefined) delete process.env.PI_OPERATOR_DIR;
	else process.env.PI_OPERATOR_DIR = prevOperatorDir;
	fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function ctxWithStatus() {
	const ctx = createMockCtx({
		sessionManager: { getSessionId: () => "current-session" },
	});
	ctx.ui.setStatus = vi.fn();
	return ctx;
}

describe("summarizeTaskCounts / formatTaskStatus", () => {
	it("filters status bar tasks to assigned tasks from the current session", async () => {
		const mod = await import("../extensions/operator-status.ts");
		const sessionId = "current-session";
		const records = [
			{ state: "failed", sessionId },
			{ state: "completed", sessionId },
			{ state: "assigned", sessionId: "other-session" },
			{ state: "assigned", sessionId },
			{ state: "unassigned", sessionId },
		] as any[];

		const filtered = mod.filterCurrentSessionActiveTasks(records, sessionId);
		expect(filtered.map((task) => task.state)).toEqual(["assigned"]);
	});

	it("returns null label when nothing is in flight", async () => {
		const mod = await import("../extensions/operator-status.ts");
		const counts = mod.summarizeTaskCounts([]);
		expect(counts.nonTerminal).toBe(0);
		expect(mod.formatTaskStatus(counts)).toBeNull();
	});

	it("counts current non-terminal states and renders assigned work", async () => {
		const { createTask, transitionTask } = await import(
			"../lib/task-registry.ts"
		);
		const mod = await import("../extensions/operator-status.ts");
		createTask({ origin: "subagent", summary: "unassigned" });
		const assigned = createTask({
			origin: "subagent",
			summary: "assigned",
			state: "assigned",
		});
		const failed = createTask({
			origin: "subagent",
			summary: "failed",
			state: "assigned",
		});
		transitionTask(failed.id, "failed", { errorReason: "failed check" });
		const completed = createTask({
			origin: "subagent",
			summary: "completed",
			state: "assigned",
		});
		transitionTask(completed.id, "completed", {
			outcome: { summary: "completed", evidence: ["focused status fixture"] },
		});
		void assigned;

		const { listTasks } = await import("../lib/task-registry.ts");
		const counts = mod.summarizeTaskCounts(listTasks());
		expect(counts.unassigned).toBe(1);
		expect(counts.assigned).toBe(1);
		expect(counts.failed).toBe(1);
		expect(counts.completed).toBe(1);
		expect(counts.nonTerminal).toBe(3);
		expect(counts.urgent).toBe(1);

		expect(mod.formatTaskStatus(counts)).toBe("tasks 1 (1 assigned)");
	});
});

describe("footer extension status placement", () => {
	function footerData(
		statuses: Record<string, string>,
	): ReadonlyFooterDataProvider {
		return {
			getExtensionStatuses: () => new Map(Object.entries(statuses)),
		} as ReadonlyFooterDataProvider;
	}

	it("keeps codex on the primary line and right-aligns Bedrock spend", async () => {
		const mod = await import("../extensions/operator-status.ts");
		const data = footerData({
			bedrock: "bedrock $17.49",
			"damage-control": "damage-control: active",
			codex: "codex: 5h 42% | wk 61%",
			tps: "done -- 42 tok/s",
		});
		const status = "done -- 42 tok/s | bedrock $17.49";

		expect(mod.rightAnchoredStatus(data)).toBe("codex: 5h 42% | wk 61%");
		expect(mod.formatExtensionStatuses(data)).toBe(status);
		expect(mod.formatExtensionStatusLine(data, 50)).toBe(
			"done -- 42 tok/s                    bedrock $17.49",
		);
	});

	it("orders loop and active tasks before compact Bedrock cost", async () => {
		const mod = await import("../extensions/operator-status.ts");
		const data = footerData({
			bedrock: "bedrock $71.64",
			loop: "loop rationalization-345 T:35/48",
			task: "tasks 2 (2 running)",
		});
		const expected =
			"loop rationalization-345 T:35/48 | tasks 2 (2 running) | bedrock $71.64";

		expect(mod.formatExtensionStatuses(data)).toBe(expected);
		expect(mod.formatExtensionStatusLine(data, expected.length)).toBe(
			"loop rationalization-345 T:35/48 | tasks 2 (2 running)   bedrock $71.64",
		);
	});

	it("places token throughput after Onclave and keeps Bedrock spend right-aligned", async () => {
		const mod = await import("../extensions/operator-status.ts");
		const onclave =
			"Onclave[2]: \x1b[32mpi-01a0115194f6\x1b[0m";
		const data = footerData({
			"onclave-v2": onclave,
			schedule: "sched@ 9:32am",
			subagents: "subagents 11 running",
			task: "tasks 2 (2 running)",
			bedrock: "bedrock $71.64",
			tps: "done - 42 tok/s",
		});
		const line = mod.formatExtensionStatusLine(data, 160);

		const rendered = line ?? "";
		expect(line).not.toBeNull();
		expect(rendered).toContain(
			`${onclave} | sched@ 9:32am | subagents 11 running | tasks 2 (2 running) | done - 42 tok/s`,
		);
		expect(rendered.endsWith("bedrock $71.64")).toBe(true);
		expect(visibleWidth(rendered)).toBe(160);
		expect(rendered.indexOf("sched@ 9:32am")).toBeGreaterThan(
			rendered.indexOf(onclave),
		);
		expect(rendered.indexOf("subagents 11 running")).toBeGreaterThan(
			rendered.indexOf("sched@ 9:32am"),
		);
		expect(rendered.indexOf("done - 42 tok/s")).toBeGreaterThan(
			rendered.indexOf(onclave),
		);
		expect(rendered.indexOf("bedrock $71.64")).toBeGreaterThan(
			rendered.indexOf("done - 42 tok/s"),
		);
	});
});

describe("formatPiStatusDirectory", () => {
	it("caches the git-root display until cwd changes", async () => {
		const mod = await import("../extensions/operator-status.ts");
		childProcess.execFileSync("git", ["init"], {
			cwd: tmpRoot,
			stdio: "ignore",
		});
		const subdir = path.join(tmpRoot, "subdir");
		fs.mkdirSync(subdir);

		const first = mod.formatPiStatusDirectory(tmpRoot);
		fs.rmSync(path.join(tmpRoot, ".git"), { recursive: true, force: true });

		expect(mod.formatPiStatusDirectory(tmpRoot)).toBe(first);
		expect(mod.formatPiStatusDirectory(subdir)).not.toBe(first);
	});
});

describe("formatPiStatusLine", () => {
	it.each([
		["anthropic.claude-fable-5", "fable-5"],
		["us.anthropic.claude-opus-5", "opus-5"],
		["openai.gpt-5.6-luna", "gpt-5.6-luna"],
		["anthropic/claude-sonnet-5", "sonnet-5"],
		["gpt-5.6-sol", "gpt-5.6-sol"],
	])("formats %s as concise model name %s", async (id, expected) => {
		const mod = await import("../extensions/operator-status.ts");
		expect(mod.formatModelName({ id })).toBe(expected);
	});

	it("omits reload suffix when reload is not needed", async () => {
		const mod = await import("../extensions/operator-status.ts");
		const line = mod.formatPiStatusLine({
			cwd: tmpRoot,
			branch: null,
			model: { id: "test-model" },
			pi: createMockPi() as any,
			piVersion: "0.72.0",
			reloadNeeded: false,
			rightStatus: null,
			width: 120,
		});

		expect(line).toContain("π v0.72.0");
		expect(line).not.toContain("reload");
	});

	it("appends pink reload suffix when reload is needed", async () => {
		const mod = await import("../extensions/operator-status.ts");
		const line = mod.formatPiStatusLine({
			cwd: tmpRoot,
			branch: null,
			model: { id: "test-model" },
			pi: createMockPi() as any,
			piVersion: "0.72.0",
			reloadNeeded: true,
			rightStatus: null,
			width: 120,
		});

		expect(line).toContain("π v0.72.0");
		expect(line).toContain("\x1b[37m[\x1b[38;5;205mreload\x1b[37m]\x1b[0m");
	});

	it("renders pipe-delimited context usage after model reasoning", async () => {
		const mod = await import("../extensions/operator-status.ts");
		const pi = Object.assign(createMockPi(), { getThinkingLevel: () => "low" });
		const line = mod.formatPiStatusLine({
			cwd: tmpRoot,
			branch: null,
			model: { id: "gpt-5.6-sol" },
			pi: pi as any,
			piVersion: "0.72.0",
			contextUsage: { tokens: 168_000, contextWindow: 200_000, percent: 84 },
			rightStatus: null,
			width: 120,
		});

		expect(line).toContain(
			"gpt-5.6-sol\x1b[0m\x1b[37m[\x1b[36mlow\x1b[37m]\x1b[0m | " +
				"\x1b[33m84%\x1b[0m \x1b[90m168k/200k\x1b[0m",
		);
	});

	it("preserves context and provider quota before identity at narrow widths", async () => {
		const mod = await import("../extensions/operator-status.ts");
		const pi = Object.assign(createMockPi(), { getThinkingLevel: () => "low" });
		const line = mod.formatPiStatusLine({
			cwd: tmpRoot,
			branch: "feature/footer",
			model: { id: "gpt-5.6-sol" },
			pi: pi as any,
			piVersion: "0.72.0",
			contextUsage: { tokens: 84_000, contextWindow: 100_000, percent: 84 },
			rightStatus: "codex wk 99%",
			width: 40,
		});

		expect(line).toContain("84%");
		expect(line).toContain("codex wk 99%");
		expect(line).not.toContain("feature/footer");
	});

	it("preserves reload ahead of provider quota when both cannot fit", async () => {
		const mod = await import("../extensions/operator-status.ts");
		const line = mod.formatPiStatusLine({
			cwd: tmpRoot,
			branch: "feature/footer",
			model: { id: "gpt-5.6-sol" },
			pi: createMockPi() as any,
			piVersion: "0.72.0",
			reloadNeeded: true,
			rightStatus: "codex weekly 99%",
			width: 10,
		});

		expect(line).toContain("reload");
		expect(line).not.toContain("codex");
	});

	it("uses warning and error colors at context thresholds", async () => {
		const mod = await import("../extensions/operator-status.ts");
		expect(
			mod.formatContextUsageSegment({
				tokens: 66_000,
				contextWindow: 100_000,
				percent: 66,
			}),
		).toBe("\x1b[32m66%\x1b[0m \x1b[90m66k/100k\x1b[0m");
		expect(
			mod.formatContextUsageSegment({
				tokens: 67_000,
				contextWindow: 100_000,
				percent: 67,
			}),
		).toBe("\x1b[33m67%\x1b[0m \x1b[90m67k/100k\x1b[0m");
		expect(
			mod.formatContextUsageSegment({
				tokens: 90_000,
				contextWindow: 100_000,
				percent: 90,
			}),
		).toBe("\x1b[31m90%\x1b[0m \x1b[90m90k/100k\x1b[0m");
	});

	it("colors thinking levels by model risk", async () => {
		const mod = await import("../extensions/operator-status.ts");
		expect(mod.colorForThinkingLevel("gpt-5.6-sol", "medium")).toBe(
			"\x1b[38;5;205m",
		);
		expect(mod.colorForThinkingLevel("gpt-5.6-sol", "high")).toBe(
			"\x1b[38;5;205m",
		);
		expect(mod.colorForThinkingLevel("gpt-5.6-sol", "xhigh")).toBe(
			"\x1b[38;5;205m",
		);
		expect(mod.colorForThinkingLevel("claude-opus", "medium")).toBe("\x1b[36m");
		expect(mod.colorForThinkingLevel("claude-opus", "high")).toBe(
			"\x1b[38;5;205m",
		);
		expect(mod.colorForThinkingLevel("claude-opus", "off")).toBe("\x1b[33m");
		const pi = Object.assign(createMockPi(), { getThinkingLevel: () => "off" });
		const line = mod.formatPiStatusLine({
			cwd: tmpRoot,
			branch: null,
			model: { id: "gpt-5.6-sol" },
			pi: pi as any,
			piVersion: "0.72.0",
			rightStatus: null,
			width: 120,
		});
		expect(line).toContain("\x1b[37m[\x1b[33moff\x1b[37m]\x1b[0m");
	});
});

describe("session_start hook", () => {
	it("sets the pi version slot and clears task when registries are empty", async () => {
		const pi = createMockPi();
		const mod = await import("../extensions/operator-status.ts");
		mod.default(pi as any);
		const hook = pi._getHook("session_start")[0];
		expect(hook).toBeDefined();

		const ctx = ctxWithStatus();
		await hook.handler({}, ctx);

		const calls = (ctx.ui.setStatus as ReturnType<typeof vi.fn>).mock.calls;
		const piCall = calls.find(([k]: string[]) => k === "pi");
		expect(piCall).toBeDefined();
		const value = piCall?.[1] as string;
		expect(value).toMatch(/^π v\d+\.\d+\.\d+/);

		const taskCall = calls.find(([k]: string[]) => k === "task");
		expect(taskCall?.[1]).toBe(""); // empty -- not displayed
	});

	it("populates the task slot only for current-session running tasks", async () => {
		const pi = createMockPi();
		const mod = await import("../extensions/operator-status.ts");
		mod.default(pi as any);
		const sessionHook = pi._getHook("session_start")[0];
		const toolHook = pi._getHook("tool_result")[0];
		const ctx = ctxWithStatus();
		await sessionHook.handler({}, ctx);

		const { createTask } = await import("../lib/task-registry.ts");
		createTask({
			origin: "subagent",
			summary: "x",
			state: "running",
			sessionId: "current-session",
		});
		await toolHook.handler({}, ctx);

		const calls = (ctx.ui.setStatus as ReturnType<typeof vi.fn>).mock.calls;
		const taskCall = calls.filter(([k]: string[]) => k === "task").at(-1);
		expect(taskCall?.[1]).toContain("tasks 1");
	});
});
