import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import toolFailureTriageExtension, { sessionAnalyticsRoots } from "../extensions/tool-failure-triage.ts";
import { DIAGNOSTIC_DECISION_TOOL_NAME, DIAGNOSTIC_INSPECTION_TOOL_NAME } from "../lib/tool-failure-diagnostic-turn.ts";
import { coordinateId } from "../lib/tool-failure-classifier.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.js";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
function handler(pi: ReturnType<typeof createMockPi>) {
	const command = pi._commands.find((item) => item.name === "find-fails");
	if (!command) throw new Error("find-fails command not registered");
	return command.handler;
}
async function context() {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "tool-failure-command-"));
	roots.push(root);
	const sessions = path.join(root, "sessions");
	await fs.mkdir(sessions);
	await fs.writeFile(path.join(sessions, "one.jsonl"), [
		{ type: "message", id: "call-entry", timestamp: "2026-08-20T00:01:00Z", message: { role: "assistant", content: [{ type: "toolCall", id: "one", name: "custom" }] } },
		{ type: "message", id: "result-entry", timestamp: "2026-08-20T00:02:00Z", message: { role: "toolResult", toolCallId: "one", isError: true, content: [{ type: "text", text: "this.broker.reconcile is not a function" }] } },
	].map(JSON.stringify).join("\n") + "\n");
	return createMockCtx({ cwd: root, sessionManager: { getSessionDir: () => sessions, getSessionId: () => "session-1" } });
}

describe("find-fails TypeScript authority", () => {
	it("resolves both session-root and cwd-specific session directories", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "tool-failure-roots-")); roots.push(root);
		const sessions = path.join(root, "sessions");
		expect(sessionAnalyticsRoots(sessions)).toEqual({ analyticsRoot: root, transcriptRoot: sessions });
		expect(sessionAnalyticsRoots(path.join(sessions, "--encoded-cwd--"))).toEqual({ analyticsRoot: root, transcriptRoot: sessions });
	});
	it("echoes the submitted command into the TUI transcript", async () => {
		const pi = createMockPi(); const ctx = await context(); toolFailureTriageExtension(pi as never);
		ctx.mode = "tui";
		ctx.ui.custom = vi.fn(async () => undefined);
		await handler(pi)("", ctx);
		expect(pi.appendEntry).toHaveBeenCalledWith("slash-echo", { kind: "submitted", text: "/find-fails" });
	});

	it("returns a bounded no-findings outcome without starting a provider turn", async () => {
		const pi = createMockPi(); const ctx = await context(); toolFailureTriageExtension(pi as never);
		await handler(pi)("", ctx);
		expect(pi.exec).not.toHaveBeenCalled();
		expect(pi.sendUserMessage).not.toHaveBeenCalled();
		expect(ctx.ui.notify).toHaveBeenCalledWith("No custom-tool finding selected: 1 failure groups scanned; 0 custom-tool groups; 0 suppressed by unchanged decisions; 0 resolved; 0 below current eligibility thresholds.", "info");
	});

	it("queries session entries, preserves bounded inspection, and records decisions", async () => {
		const pi = createMockPi(); const ctx = await context();
		pi.registerTool({ name: "custom", description: "custom", parameters: {}, sourceInfo: { source: "local" }, execute: async () => ({ content: [] }) });
		const priorAgentDir = process.env.PI_AGENT_DIR; process.env.PI_AGENT_DIR = ctx.cwd;
		try {
			toolFailureTriageExtension(pi as never);
			await handler(pi)("", ctx);
			expect(pi.sendUserMessage).toHaveBeenCalledTimes(1);
			expect(pi.getActiveTools()).toEqual([DIAGNOSTIC_INSPECTION_TOOL_NAME, DIAGNOSTIC_DECISION_TOOL_NAME]);
			const inspect = pi._getTool(DIAGNOSTIC_INSPECTION_TOOL_NAME)!;
			const decide = pi._getTool(DIAGNOSTIC_DECISION_TOOL_NAME)!;
			expect((await inspect.execute("call-1", { coordinate: coordinateId("call-entry", "one", path.join(ctx.sessionManager.getSessionDir(), "one.jsonl")) })).content[0].text).toContain("this.broker.reconcile");
			const prompt = String(pi.sendUserMessage.mock.calls[0]?.[0]);
			const candidateId = prompt.match(/tf-v\d+-[a-f0-9]+/)?.[0];
			expect(candidateId).toBeTruthy();
			await decide.execute("call-2", { candidateId, disposition: "safety-rejection", reason: "documented safety rule", evidence: [{ type: "note", text: "verified intended rejection" }] });
			expect(await fs.readFile(path.join(ctx.cwd, "tool-failures", "decisions.jsonl"), "utf8")).toContain('"disposition":"expected"');
		} finally { if (priorAgentDir === undefined) delete process.env.PI_AGENT_DIR; else process.env.PI_AGENT_DIR = priorAgentDir; }
	});
});
