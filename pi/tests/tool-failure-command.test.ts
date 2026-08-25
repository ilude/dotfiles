import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import toolFailureTriageExtension from "../extensions/tool-failure-triage.ts";
import { DIAGNOSTIC_DECISION_TOOL_NAME, DIAGNOSTIC_INSPECTION_TOOL_NAME } from "../lib/tool-failure-diagnostic-turn.ts";
import { ToolFailureStore } from "../lib/tool-failure-store.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.js";

function handler(pi: ReturnType<typeof createMockPi>) {
	const command = pi._commands.find((item) => item.name === "find-fails");
	if (!command) throw new Error("find-fails command not registered");
	return command.handler;
}

const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
async function context() {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "tool-failure-command-")); roots.push(root);
	return createMockCtx({ cwd: root, sessionManager: { getSessionDir: () => root, getSessionId: () => "session-1" } });
}

function selectedScan() {
	return {
		schemaVersion: 1, asOf: "2026-08-25T00:00:00Z", timestampDiagnostics: { missing: 0, malformed: 0, future: 0 }, timestampOmissions: 0,
		manifestDigest: "scan-digest", sourceWindow: { first: "2026-08-20T00:00:00Z", last: "2026-08-20T00:00:00Z" }, scannedResults: 1, unmatchedResults: 0, duplicateCalls: 0, malformedOmissions: 0,
		candidates: [{ candidateId: "candidate-1", fingerprintVersion: 1, tool: "custom", errorClass: "internal-missing-method", contract: "runtime:missing-method", classification: "candidate", occurrences: 1, sessions: 1, firstObserved: "2026-08-20T00:00:00Z", lastObserved: "2026-08-20T00:00:00Z", coordinates: ["opaque-token"], occurrences7d: 1, sessions7d: 1, occurrences14d: 1, sessions14d: 1, occurrences30d: 1, sessions30d: 1 }],
	} as any;
}

describe("find-fails TypeScript authority", () => {
	it("returns a bounded no-findings outcome without starting a provider turn", async () => {
		const pi = createMockPi(); const ctx = await context(); toolFailureTriageExtension(pi as never);
		await handler(pi)("", ctx);
		expect(pi.exec).not.toHaveBeenCalled();
		expect(pi.sendMessage).not.toHaveBeenCalled();
		expect(pi.sendUserMessage).not.toHaveBeenCalled();
		expect(ctx.ui.notify).toHaveBeenCalledWith("No tool-failure findings are currently due for inspection.", "info");
	});
	it("rejects arguments without mutating the authority", async () => {
		const pi = createMockPi(); const ctx = await context(); toolFailureTriageExtension(pi as never);
		await handler(pi)("extra", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith("Usage: /find-fails", "warning");
		expect(pi.sendUserMessage).not.toHaveBeenCalled();
	});
	it("keeps the run and restriction active after dispatch for inspect and decide, then clears both on agent end", async () => {
		const pi = createMockPi(); const ctx = await context(); const evidencePath = path.join(ctx.cwd, "session.jsonl");
		await fs.writeFile(evidencePath, "tool failure evidence\n");
		pi.registerTool({ name: "custom", description: "custom", parameters: {}, sourceInfo: { source: "local" }, execute: async () => ({ content: [] }) });
		const scan = selectedScan();
		vi.spyOn(ToolFailureStore, "open").mockResolvedValue({ refreshSessionCorpus: vi.fn(), scan: vi.fn(async () => scan), saveScan: vi.fn(), selectedCoordinates: vi.fn(async () => new Map([["candidate-1", [{ filePath: evidencePath, line: 1, token: "opaque-token" }]]])), close: vi.fn() } as any);
		const priorAgentDir = process.env.PI_AGENT_DIR; process.env.PI_AGENT_DIR = ctx.cwd;
		try {
			toolFailureTriageExtension(pi as never);
			await handler(pi)("", ctx);
			expect(pi.sendUserMessage).toHaveBeenCalledTimes(1);
			expect(pi.getActiveTools()).toEqual([DIAGNOSTIC_INSPECTION_TOOL_NAME, DIAGNOSTIC_DECISION_TOOL_NAME]);
			const inspect = pi._getTool(DIAGNOSTIC_INSPECTION_TOOL_NAME)!;
			const decide = pi._getTool(DIAGNOSTIC_DECISION_TOOL_NAME)!;
			expect((await inspect.execute("call-1", { coordinate: "opaque-token" })).content[0].text).toBe("tool failure evidence");
			await decide.execute("call-2", { candidateId: "candidate-1", disposition: "safety-rejection", reason: "documented safety rule", evidence: [] });
			expect((await fs.readFile(path.join(ctx.cwd, "tool-failures", "decisions.jsonl"), "utf8"))).toContain('"disposition":"expected"');
			pi._getHook("agent_end")[0].handler();
			expect(pi.getActiveTools()).toContain("custom");
			await expect(inspect.execute("call-3", { coordinate: "opaque-token" })).rejects.toThrow("no diagnostic inspection");
			await expect(decide.execute("call-4", { candidateId: "candidate-1", disposition: "external", reason: "external", evidence: [], revisitAfter: "2026-09-01" })).rejects.toThrow("no diagnostic decision");
		} finally { if (priorAgentDir === undefined) delete process.env.PI_AGENT_DIR; else process.env.PI_AGENT_DIR = priorAgentDir; }
	});
});
