import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import bedrock, { CUR_REFRESH_INTERVAL } from "../extensions/bedrock/index.ts";
import accountingOnly from "../extensions/bedrock/accounting.ts";
import { appendRecord, makeRecord } from "../lib/bedrock/ledger.ts";
import { readCurSnapshot, writeCurSnapshot } from "../lib/bedrock/cur-snapshot.ts";

const { readClaudeLocalContribution, queryPersonalCur } = vi.hoisted(() => ({ readClaudeLocalContribution: vi.fn(async () => 0), queryPersonalCur: vi.fn() }));
vi.mock("../lib/bedrock/claude-status-usage.js", () => ({ readClaudeLocalContribution }));
vi.mock("../lib/bedrock/cur-query.js", () => ({ queryPersonalCur }));

let dir: string;
let hooks: Map<string, any>;
let commands: Map<string, any>;
let statuses: Map<string, string>;
let ctx: any;
const snapshot = (amount = 1.75) => ({ schema_version: 1, source: "payer-cur2", billing_month: new Date().toISOString().slice(0, 7), currency: "USD", generated_at: new Date().toISOString(), username: "mike.glenn", month_to_date: amount, capturedAt: new Date().toISOString() });
function setup() {
	dir = mkdtempSync(join(tmpdir(), "bedrock-report-")); vi.stubEnv("PI_CODING_AGENT_DIR", dir); vi.stubEnv("BEDROCK_MANTLE_AWS_PROFILE", "billing");
	hooks = new Map(); commands = new Map(); statuses = new Map();
	ctx = { sessionManager: { getSessionFile: () => "session.jsonl" }, ui: { setStatus: (key: string, value: string) => statuses.set(key, value), notify: vi.fn() }, modelRegistry: { getAll: () => [], refresh: vi.fn(async () => ({ errors: new Map() })) } };
	const pi: any = { registerProvider: vi.fn(), on: (name: string, fn: any) => hooks.set(name, fn), registerCommand: (name: string, command: any) => commands.set(name, command), exec: vi.fn() };
	queryPersonalCur.mockRejectedValue(new Error("offline")); bedrock(pi); return pi;
}
afterEach(async () => {
	await hooks?.get("session_shutdown")?.();
	readClaudeLocalContribution.mockReset(); readClaudeLocalContribution.mockResolvedValue(0); queryPersonalCur.mockReset(); vi.useRealTimers(); vi.unstubAllEnvs(); if (dir) rmSync(dir, { recursive: true, force: true });
});
async function localCost(timestamp = Date.now(), session = "child") {
	await appendRecord(makeRecord({ timestamp, session, provider: "amazon-bedrock", model: "openai.gpt-5.6-luna", usage: { input: 1_000_000 } }));
}

it("starts a nonblocking, single-flight query, keeps request-time usage, and periodically rebases", async () => {
	setup(); vi.useFakeTimers();
	let finish!: (value: any) => void;
	const captured = snapshot(58.82);
	queryPersonalCur.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
	await hooks.get("session_start")({}, ctx);
	expect(queryPersonalCur).toHaveBeenCalledWith(expect.any(Function), "billing", expect.any(AbortSignal));
	expect(statuses.get("bedrock")).toBe("bedrock: $0.00");
	await vi.advanceTimersByTimeAsync(1_000); await localCost();
	await hooks.get("agent_settled")({}, ctx); expect(statuses.get("bedrock")).toBe("bedrock: $0.22");
	await vi.advanceTimersByTimeAsync(CUR_REFRESH_INTERVAL); expect(queryPersonalCur).toHaveBeenCalledTimes(1);
	finish(captured);
	await vi.waitFor(() => expect(statuses.get("bedrock")).toBe("bedrock: $59.04"));
	expect((await readCurSnapshot())?.capturedAt).toBe(captured.capturedAt);
	queryPersonalCur.mockResolvedValueOnce(snapshot(60));
	await vi.advanceTimersByTimeAsync(CUR_REFRESH_INTERVAL);
	await vi.waitFor(() => expect(statuses.get("bedrock")).toBe("bedrock: $60.00"));
	await hooks.get("session_shutdown")(); expect(vi.getTimerCount()).toBe(0);
});

it("preserves the successful baseline and local accumulation on failure and across clear/new/resume", async () => {
	setup();
	const cached = snapshot(58.82); cached.capturedAt = new Date(Date.now() - 10_000).toISOString();
	await writeCurSnapshot(cached); await localCost();
	// A historical CloudWatch value must never be added to CUR or local fallback.
	writeFileSync(join(dir, "bedrock-cost-baseline.json"), JSON.stringify({ schemaVersion: 1, source: "cloudwatch-bedrock-invocation-logs", month: cached.billing_month, principal: "old", amount: 1000, invocations: 1, capturedAt: cached.capturedAt }));
	readClaudeLocalContribution.mockResolvedValue(0.5);
	for (const reason of ["startup", "new", "resume"]) {
		await hooks.get("session_start")({ reason }, ctx);
		expect(statuses.get("bedrock")).toBe("bedrock: $59.54");
		await hooks.get("session_shutdown")();
	}
	expect(queryPersonalCur).toHaveBeenCalledTimes(3);
	expect((await readCurSnapshot())?.month_to_date).toBe(58.82);
	expect(readClaudeLocalContribution).toHaveBeenLastCalledWith(cached.billing_month, { month: cached.billing_month, capturedAt: cached.capturedAt });
});

it("accounts and reprices local usage without an AWS baseline; manual reconcile is optional", async () => {
	setup(); await hooks.get("session_start")({}, ctx);
	const message = { role: "assistant", provider: "bedrock-mantle", model: "anthropic.claude-haiku-4-5", responseModel: "anthropic.claude-haiku-4-5", timestamp: Date.now(), usage: { input: 1_000_000 } };
	const result = await hooks.get("message_end")({ message }, ctx); expect(result.message.usage.cost.total).toBe(1);
	await hooks.get("message_end")({ message }, { ...ctx }); expect(statuses.get("bedrock")).toBe("bedrock: $1.00");
	queryPersonalCur.mockResolvedValueOnce(snapshot(2));
	await commands.get("bedrock").handler("reconcile", { ...ctx });
	expect(statuses.get("bedrock")).toBe("bedrock: $2.00");
	expect(ctx.ui.notify.mock.calls.at(-1)[0]).toContain("CUR query:");
});

it("aborts pending query at shutdown without replacing the cache, and accounting-only children never query", async () => {
	const pi = setup();
	let finish!: (value: any) => void;
	queryPersonalCur.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
	await hooks.get("session_start")({}, ctx);
	const stop = hooks.get("session_shutdown")();
	expect(queryPersonalCur.mock.calls[0][2].aborted).toBe(true);
	finish(snapshot()); await stop; expect(await readCurSnapshot()).toBeUndefined();
	// Native new/clear/resume dispatch shutdown before the replacement start.
	queryPersonalCur.mockResolvedValueOnce(snapshot(3));
	const replacement = { ...ctx };
	await hooks.get("session_start")({ reason: "new" }, replacement);
	await vi.waitFor(() => expect(statuses.get("bedrock")).toBe("bedrock: $3.00"));
	expect(queryPersonalCur).toHaveBeenCalledTimes(2);
	const childHooks = new Map(); accountingOnly({ ...pi, on: (name: string, fn: any) => childHooks.set(name, fn) });
	expect([...childHooks.keys()]).toEqual(["message_end"]); expect(queryPersonalCur).toHaveBeenCalledTimes(2);
});
