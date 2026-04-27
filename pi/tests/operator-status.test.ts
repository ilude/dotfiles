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
		expect(label).toContain("task 2");
		expect(label).toContain("1 blocked");
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
		expect(value === "pi" || /^pi v\d+\.\d+\.\d+/.test(value)).toBe(true);

		const taskCall = calls.find(([k]: string[]) => k === "task");
		const elevatedCall = calls.find(([k]: string[]) => k === "elevated");
		expect(taskCall?.[1]).toBe(""); // empty -- not displayed
		expect(elevatedCall?.[1]).toBe("");
	});

	it("populates the task slot when a task is running", async () => {
		const { createTask } = await import("../lib/task-registry.ts");
		createTask({ origin: "subagent", summary: "x", state: "running" });

		const pi = createMockPi();
		const mod = await import("../extensions/operator-status.ts");
		mod.default(pi as any);
		const hook = pi._getHook("session_start")[0];
		const ctx = ctxWithStatus();
		await hook.handler({}, ctx);

		const calls = (ctx.ui.setStatus as ReturnType<typeof vi.fn>).mock.calls;
		const taskCall = calls.find(([k]: string[]) => k === "task");
		expect(taskCall?.[1]).toContain("task 1");
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

	it("compact mode reports a single passing line when registries are healthy", async () => {
		const { text, level } = await runDoctor("");
		expect(level).toBe("info");
		expect(text).toContain("checks passed");
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
