import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionManager } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js";
import { PlanEventRecorder, PLAN_EVENT_TYPE, formatPlanEvent } from "../lib/plan-events.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
	const root = mkdtempSync(join(tmpdir(), "plan-events-"));
	roots.push(root);
	const sessionManager = SessionManager.create(root, join(root, "sessions"));
	const entries: Array<{ type: string; data: any }> = [];
	const pi = { appendEntry: (type: string, data: unknown) => { entries.push({ type, data }); sessionManager.appendCustomEntry(type, data); } };
	const ctx = { cwd: root, sessionManager, ui: { notify: vi.fn() } } as any;
	return { root, sessionManager, entries, pi, ctx };
}

const assistant = {
	role: "assistant", content: [{ type: "text", text: "done" }], provider: "fixture", model: "fixture",
	api: "fixture", usage: { input: 0, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 1, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
	stopReason: "stop", timestamp: Date.now(),
};

describe("plan action history", () => {
	it("uses one structured contract, excludes events from context, and replays persisted entries", () => {
		const f = fixture();
		const recorder = new PlanEventRecorder(f.pi as any, f.ctx);
		const attempt = recorder.request("run-here", { stub: "demo", path: ".specs/demo/plan.md" });
		recorder.outcome(attempt, "run-here", "success", { phase: "submission", plan: { stub: "demo", path: ".specs/demo/plan.md" } });
		recorder.outcome(attempt, "run-here", "success", { plan: { stub: "demo", path: ".specs/demo/plan.md" } });
		const event = f.entries.find(item => item.type === PLAN_EVENT_TYPE)!.data;
		expect(event).toMatchObject({ schemaVersion: 1, action: "run-here", phase: "request", outcome: "requested", plan: { stub: "demo" } });
		expect(event.eventId).toEqual(expect.any(String));
		expect(event.invocationId).toEqual(expect.any(String));
		expect(event.actionAttemptId).toEqual(attempt);
		expect(f.sessionManager.buildSessionContext().messages).toEqual([]);

		const sessionFile = f.sessionManager.getSessionFile()!;
		expect(existsSync(sessionFile)).toBe(false);
		f.sessionManager.appendMessage({ role: "user", content: "persist this", timestamp: Date.now() });
		f.sessionManager.appendMessage(assistant as any);
		expect(existsSync(sessionFile)).toBe(true);
		const replayed = SessionManager.open(sessionFile);
		expect(replayed.getEntries().some(entry => entry.type === "custom" && entry.customType === PLAN_EVENT_TYPE)).toBe(true);
		expect(replayed.buildSessionContext().messages.map(message => message.role)).toEqual(["user", "assistant"]);
		expect(JSON.parse(readFileSync(sessionFile, "utf8").split(/\r?\n/)[0]!).type).toBe("session");
	});

	it("exposes the fresh picker-only persistence limitation and logging failures", () => {
		const f = fixture();
		const notify = vi.fn();
		const recorder = new PlanEventRecorder({ appendEntry: () => { throw new Error("append unavailable"); } } as any, { ...f.ctx, ui: { notify } }, { onLoggingFailure: error => notify(`Plan action history logging failed: ${error instanceof Error ? error.message : String(error)}`, "warning") });
		recorder.request("plans");
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("append unavailable"), "warning");
		const missingNotify = vi.fn();
		new PlanEventRecorder({} as any, { ...f.ctx, ui: { notify: missingNotify } }, { onLoggingFailure: error => missingNotify(String(error), "warning") }).request("plans");
		expect(missingNotify).toHaveBeenCalledWith(expect.stringContaining("appendEntry is unavailable"), "warning");
		expect(existsSync(f.sessionManager.getSessionFile()!)).toBe(false);
		expect(formatPlanEvent({ action: "run-new-tab", phase: "outcome", outcome: "ambiguous", plan: { stub: "demo" }, error: { stage: "launch", message: "inspect tab" } })).toContain("Run in new tab · demo · outcome · ambiguous · inspect tab");
	});
});
