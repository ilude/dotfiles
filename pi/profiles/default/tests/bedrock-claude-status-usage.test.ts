import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readClaudeLocalContribution } from "../lib/bedrock/claude-status-usage.ts";

let dir: string;
afterEach(() => { vi.unstubAllEnvs(); if (dir) rmSync(dir, { recursive: true, force: true }); });

it("adds Claude observed-time increments after the matching AWS baseline cutoff", async () => {
	dir = mkdtempSync(join(tmpdir(), "bedrock-claude-"));
	const cutoff = "2026-06-10T12:00:00.000Z";
	const baseline = { schemaVersion: 1 as const, month: "2026-06", principal: "test", amount: 4, invocations: 1, capturedAt: cutoff, source: "cloudwatch-bedrock-invocation-logs" as const };
	const file = join(dir, "state.json");
	writeFileSync(file, JSON.stringify({ version: 1, startedAt: cutoff, sessions: {}, increments: [
		{ month: "2026-06", at: "2026-06-10T12:00:00.000Z", amount: 2, sessionId: "old" },
		{ month: "2026-06", at: "2026-06-10T12:00:01.000Z", amount: 0.5, sessionId: "new" },
		{ month: "2026-05", at: "2026-05-20T00:00:00.000Z", amount: 8, sessionId: "other" },
		{ month: "2026-06", at: "invalid", amount: 3, sessionId: "bad" },
	] }));
	expect(await readClaudeLocalContribution("2026-06", baseline, file)).toBe(0.5);
	expect(await readClaudeLocalContribution("2026-06", undefined, file)).toBe(2.5);
});

it("ignores missing or malformed Claude state", async () => {
	dir = mkdtempSync(join(tmpdir(), "bedrock-claude-")); vi.stubEnv("PI_CODING_AGENT_DIR", dir);
	const file = join(dir, "state.json");
	expect(await readClaudeLocalContribution("2026-06", undefined, file)).toBe(0);
	writeFileSync(file, "not json"); expect(await readClaudeLocalContribution("2026-06", undefined, file)).toBe(0);
	expect(await readClaudeLocalContribution("2026-06", undefined, file)).toBe(0);
});
