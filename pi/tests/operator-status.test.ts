import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

let tmpRoot: string;
let prevOperatorDir: string | undefined;

beforeEach(() => {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-operator-status-"));
	prevOperatorDir = process.env.PI_OPERATOR_DIR;
	process.env.PI_OPERATOR_DIR = tmpRoot;
});

afterEach(() => {
	if (prevOperatorDir === undefined) delete process.env.PI_OPERATOR_DIR;
	else process.env.PI_OPERATOR_DIR = prevOperatorDir;
	fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function ctxWithStatus() {
	const ctx = createMockCtx();
	ctx.ui.setStatus = vi.fn();
	return ctx;
}

describe("summarizeTaskCounts / formatTaskStatus", () => {
	it("filters status bar tasks to running/blocked tasks from current session", async () => {
		const mod = await import("../extensions/operator-status.ts");
		const sessionStartedAt = "2026-01-01T00:00:00.000Z";
		const records = [
			{ state: "failed", createdAt: "2026-01-01T00:01:00.000Z" },
			{ state: "completed", createdAt: "2026-01-01T00:01:00.000Z" },
			{ state: "running", createdAt: "2025-12-31T23:59:00.000Z" },
			{ state: "running", createdAt: "2026-01-01T00:01:00.000Z" },
			{ state: "blocked", createdAt: "2026-01-01T00:02:00.000Z" },
		] as any[];

		const filtered = mod.filterCurrentSessionActiveTasks(records, sessionStartedAt);
		expect(filtered.map((t) => t.state)).toEqual(["running", "blocked"]);
	});

	it("returns null label when nothing is in flight", async () => {
		const mod = await import("../extensions/operator-status.ts");
		const counts = mod.summarizeTaskCounts([]);
		expect(counts.nonTerminal).toBe(0);
		expect(mod.formatTaskStatus(counts)).toBeNull();
	});

	it("counts only non-terminal states toward the active total", async () => {
		const { createTask, transitionTask } = await import("../lib/task-registry.ts");
		const mod = await import("../extensions/operator-status.ts");
		const a = createTask({ origin: "subagent", summary: "a", state: "running" });
		const b = createTask({ origin: "subagent", summary: "b", state: "running" });
		transitionTask(b.id, "blocked", { blockReason: "needs creds" });
		const c = createTask({ origin: "subagent", summary: "c", state: "running" });
		transitionTask(c.id, "completed");
		void a;

		const { listTasks } = await import("../lib/task-registry.ts");
		const counts = mod.summarizeTaskCounts(listTasks());
		expect(counts.running).toBe(1);
		expect(counts.blocked).toBe(1);
		expect(counts.completed).toBe(1);
		expect(counts.nonTerminal).toBe(2);
		expect(counts.urgent).toBe(1);

		const label = mod.formatTaskStatus(counts);
		expect(label).toContain("tasks 2");
		expect(label).toContain("1 running");
		expect(label).toContain("1 blocked");
	});
});

describe("formatPiStatusLine", () => {
	it("omits reload suffix when reload is not needed", async () => {
		const mod = await import("../extensions/operator-status.ts");
		const line = mod.formatPiStatusLine({
			cwd: tmpRoot,
			branch: null,
			model: { id: "test-model" },
			pi: createMockPi() as any,
			piVersion: "0.72.0",
			reloadNeeded: false,
			router: null,
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
			router: null,
			width: 120,
		});

		expect(line).toContain("π v0.72.0");
		expect(line).toContain("\x1b[37m[\x1b[38;5;205mreload\x1b[37m]\x1b[0m");
	});

	it("renders colored context usage immediately after model reasoning", async () => {
		const mod = await import("../extensions/operator-status.ts");
		const pi = Object.assign(createMockPi(), { getThinkingLevel: () => "low" });
		const line = mod.formatPiStatusLine({
			cwd: tmpRoot,
			branch: null,
			model: { id: "gpt-5.5" },
			pi: pi as any,
			piVersion: "0.72.0",
			contextUsage: { tokens: 168_000, contextWindow: 200_000, percent: 84 },
			router: null,
			width: 120,
		});

		expect(line).toContain(
			"gpt-5.5\x1b[0m\x1b[37m[\x1b[36mlow\x1b[37m]\x1b[0m \x1b[33m84%\x1b[0m \x1b[90m168k/200k\x1b[0m",
		);
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
		expect(mod.colorForThinkingLevel("gpt-5.5", "medium")).toBe("\x1b[38;5;205m");
		expect(mod.colorForThinkingLevel("gpt-5.5", "high")).toBe("\x1b[38;5;205m");
		expect(mod.colorForThinkingLevel("gpt-5.5", "xhigh")).toBe("\x1b[38;5;205m");
		expect(mod.colorForThinkingLevel("claude-opus", "medium")).toBe("\x1b[36m");
		expect(mod.colorForThinkingLevel("claude-opus", "high")).toBe("\x1b[38;5;205m");
		expect(mod.colorForThinkingLevel("claude-opus", "off")).toBe("\x1b[33m");
		const pi = Object.assign(createMockPi(), { getThinkingLevel: () => "off" });
		const line = mod.formatPiStatusLine({
			cwd: tmpRoot,
			branch: null,
			model: { id: "gpt-5.5" },
			pi: pi as any,
			piVersion: "0.72.0",
			router: null,
			width: 120,
		});
		expect(line).toContain("\x1b[37m[\x1b[33moff\x1b[37m]\x1b[0m");
	});
});

describe("formatElevatedStatus", () => {
	it("returns null when no approvals", async () => {
		const mod = await import("../extensions/operator-status.ts");
		expect(mod.formatElevatedStatus(0)).toBeNull();
	});

	it("formats count > 0", async () => {
		const mod = await import("../extensions/operator-status.ts");
		expect(mod.formatElevatedStatus(3)).toBe("elevated (3)");
	});
});

describe("session_start hook", () => {
	it("sets the pi version slot and clears task/elevated when registries are empty", async () => {
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
		// pi version may not be resolvable in CI / hermetic env; both forms ok.
		const value = piCall?.[1] as string;
		expect(value === "π" || /^π v\d+\.\d+\.\d+/.test(value)).toBe(true);

		const taskCall = calls.find(([k]: string[]) => k === "task");
		const elevatedCall = calls.find(([k]: string[]) => k === "elevated");
		expect(taskCall?.[1]).toBe(""); // empty -- not displayed
		expect(elevatedCall?.[1]).toBe("");
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
		createTask({ origin: "subagent", summary: "x", state: "running" });
		await toolHook.handler({}, ctx);

		const calls = (ctx.ui.setStatus as ReturnType<typeof vi.fn>).mock.calls;
		const taskCall = calls.filter(([k]: string[]) => k === "task").at(-1);
		expect(taskCall?.[1]).toContain("tasks 1");
	});
});

describe("/doctor command", () => {
	async function runDoctor(args: string) {
		const pi = createMockPi();
		const mod = await import("../extensions/operator-status.ts");
		mod.default(pi as any);
		const command = pi._commands.find((c) => c.name === "doctor");
		expect(command).toBeDefined();
		const ctx = ctxWithStatus();
		await command!.handler(args, ctx);
		const notify = ctx.ui.notify as ReturnType<typeof vi.fn>;
		expect(notify).toHaveBeenCalledTimes(1);
		const [text, level] = notify.mock.calls[0];
		return { text: text as string, level };
	}

	it("compact mode reports registry health and optional pi version availability", async () => {
		const { text, level } = await runDoctor("");
		if (text.includes("pi runtime")) {
			expect(level).toBe("warning");
			expect(text).toContain("pi-coding-agent install not found");
		} else {
			expect(level).toBe("info");
			expect(text).toContain("checks passed");
		}
	});

	it("--verbose prints multi-line diagnostic output", async () => {
		const { text } = await runDoctor("--verbose");
		expect(text).toContain("doctor:");
		expect(text).toContain("checks:");
		expect(text).toContain("permissions:");
	});

	it("--json returns parseable JSON", async () => {
		const { text } = await runDoctor("--json");
		const parsed = JSON.parse(text);
		expect(parsed.checks).toBeDefined();
		expect(Array.isArray(parsed.checks)).toBe(true);
		expect(parsed.platform).toBeDefined();
	});
});
