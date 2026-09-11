import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import bedrock from "../extensions/bedrock/index.ts";
import { appendRecord, createBaseline, makeRecord, readBaseline } from "../lib/bedrock/ledger.ts";

let dir: string;
afterEach(() => { vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
it("registers one management command, records once, normalizes cost, and reports outside context", async () => {
	dir = mkdtempSync(join(tmpdir(), "bedrock-report-")); vi.stubEnv("PI_CODING_AGENT_DIR", dir);
	const hooks = new Map<string, any[]>(); const commands = new Map<string, any>(); const statuses = new Map<string, string>(); const notify = vi.fn(); let provider: any;
	const exec = vi.fn(async (_command: string, args: string[]) => {
		if (args.includes("get-caller-identity")) return { code: 0, stdout: JSON.stringify({ Arn: "arn:aws:iam::058264305403:user/mike.glenn" }), stderr: "" };
		if (args.includes("get-dashboard")) return { code: 0, stdout: JSON.stringify({ DashboardBody: JSON.stringify({ widgets: [{ properties: { title: "Estimated Bedrock Cost by User", query: `SOURCE '/aws/bedrock/ccb'
| fields identity.arn as userArn
| stats coalesce(sum(inputCost), 0) + coalesce(sum(outputCost), 0) + coalesce(sum(cacheWriteCost), 0) + coalesce(sum(cacheReadCost), 0) as estimatedCost, count() as invocations by userArn` } }] }) }), stderr: "" };
		if (args.includes("start-query")) return { code: 0, stdout: JSON.stringify({ queryId: "q1" }), stderr: "" };
		return { code: 0, stdout: JSON.stringify({ status: "Complete", results: [[{ field: "userArn", value: "arn:aws:iam::058264305403:user/mike.glenn" }, { field: "estimatedCost", value: "1.75" }, { field: "invocations", value: "2" }]] }), stderr: "" };
	});
	const pi: any = { registerProvider: (value: any) => provider = value, on: (name: string, fn: any) => hooks.set(name, [...hooks.get(name) ?? [], fn]), registerCommand: (name: string, command: any) => commands.set(name, command), exec };
	bedrock(pi); expect(provider.id).toBe("bedrock-mantle"); expect([...commands.keys()]).toEqual(["bedrock"]);
	const ctx: any = { sessionManager: { getSessionFile: () => "session.jsonl" }, ui: { setStatus: (key: string, value: string) => statuses.set(key, value), notify }, modelRegistry: { getAll: () => provider.getModels(), refresh: vi.fn(async () => ({ errors: new Map() })) } };
	for (const fn of hooks.get("session_start") ?? []) await fn({}, ctx);
	const message: any = { role: "assistant", provider: "amazon-bedrock", model: "openai.gpt-5.6-luna", timestamp: Date.now(), usage: { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } } };
	const onMessage = hooks.get("message_end")?.[0]!; const command = commands.get("bedrock")!;
	const result = await onMessage({ message }, ctx); expect(result.message.usage.cost.total).toBeCloseTo(0.22); expect(statuses.get("bedrock")).toContain("$0.22");
	await onMessage({ message }, ctx); await command.handler("", ctx); expect(notify.mock.calls.at(-1)?.[0]).toContain("openai.gpt-5.6-luna: $0.22 Tokens: 1.0M in");
	await appendRecord(makeRecord({ timestamp: Date.now() + 1, session: "child-session", provider: "amazon-bedrock", model: "openai.gpt-5.6-luna", usage: { input: 1_000_000 } }));
	for (const fn of hooks.get("agent_settled") ?? []) await fn({}, ctx);
	expect(statuses.get("bedrock")).toContain("$0.44");
	await command.handler("refresh", ctx); expect(ctx.modelRegistry.refresh).toHaveBeenCalledWith(expect.objectContaining({ providers: ["bedrock-mantle"] }));
	await command.handler("reconcile", ctx); expect(exec).toHaveBeenCalledWith("aws", expect.arrayContaining(["logs", "start-query"]), { timeout: 30_000 }); expect(notify.mock.calls.at(-1)?.[0]).toContain("CloudWatch baseline: $1.75 (2 invocation(s))");
	await expect(command.handler("reconcile", ctx)).rejects.toThrow("already exists");
});

it("restores a footer with historical Mantle prices and accounts future replies", async () => {
	dir = mkdtempSync(join(tmpdir(), "bedrock-report-")); vi.stubEnv("PI_CODING_AGENT_DIR", dir);
	const now = Date.now();
	const old = makeRecord({ timestamp: now, session: "old", provider: "bedrock-mantle", model: "anthropic.claude-opus-5", target: "anthropic.claude-opus-5", usage: { input: 1_000_000 } });
	old.pricing = { status: "unpriced", basis: "old-catalog" };
	await appendRecord(old);
	const hooks = new Map<string, any>(); const statuses = new Map<string, string>();
	bedrock({ registerProvider: () => {}, registerCommand: () => {}, on: (name: string, fn: any) => hooks.set(name, fn) } as any);
	const ctx: any = { sessionManager: { getSessionFile: () => "new-session" }, ui: { setStatus: (key: string, value: string) => statuses.set(key, value) } };
	await hooks.get("session_start")({ reason: "reload" }, ctx);
	expect(statuses.get("bedrock")).toBe("bedrock: $5.00");
	const message = { role: "assistant", provider: "bedrock-mantle", model: "anthropic.claude-haiku-4-5", responseModel: "anthropic.claude-haiku-4-5", timestamp: now + 1, usage: { input: 1_000_000 } };
	const result = await hooks.get("message_end")({ message }, ctx);
	expect(result.message.usage.cost.total).toBe(1);
	expect(result.message.bedrockPricing.status).toBe("estimated");
	expect(statuses.get("bedrock")).toBe("bedrock: $6.00");
	await hooks.get("message_end")({ message }, ctx);
	await hooks.get("agent_settled")({}, ctx);
	expect(statuses.get("bedrock")).toBe("bedrock: $6.00");
});

it("rejects a delayed reconciliation when another creator publishes first", async () => {
	dir = mkdtempSync(join(tmpdir(), "bedrock-report-")); vi.stubEnv("PI_CODING_AGENT_DIR", dir);
	let releaseResults!: () => void; let resultsRequested!: () => void;
	const requested = new Promise<void>(resolve => resultsRequested = resolve); const released = new Promise<void>(resolve => releaseResults = resolve);
	const exec = vi.fn(async (_command: string, args: string[]) => {
		if (args.includes("get-caller-identity")) return { code: 0, stdout: JSON.stringify({ Arn: "arn:aws:iam::058264305403:user/mike.glenn" }), stderr: "" };
		if (args.includes("get-dashboard")) return { code: 0, stdout: JSON.stringify({ DashboardBody: JSON.stringify({ widgets: [{ properties: { title: "Estimated Bedrock Cost by User", query: `SOURCE '/aws/bedrock/ccb'
| fields identity.arn as userArn
| stats coalesce(sum(inputCost), 0) + coalesce(sum(outputCost), 0) + coalesce(sum(cacheWriteCost), 0) + coalesce(sum(cacheReadCost), 0) as estimatedCost, count() as invocations by userArn` } }] }) }), stderr: "" };
		if (args.includes("start-query")) return { code: 0, stdout: JSON.stringify({ queryId: "q1" }), stderr: "" };
		resultsRequested(); await released;
		return { code: 0, stdout: JSON.stringify({ status: "Complete", results: [[{ field: "userArn", value: "arn:aws:iam::058264305403:user/mike.glenn" }, { field: "estimatedCost", value: "1.75" }, { field: "invocations", value: "2" }]] }), stderr: "" };
	});
	const commands = new Map<string, any>(); const pi: any = { registerProvider: () => {}, on: () => {}, registerCommand: (name: string, command: any) => commands.set(name, command), exec };
	bedrock(pi); const ctx: any = { ui: { setStatus: () => {}, notify: () => {} }, modelRegistry: { getAll: () => [] } };
	const reconciliation = commands.get("bedrock").handler("reconcile", ctx); await requested;
	const winner = { schemaVersion: 1, month: "2026-08", principal: "winner", amount: 9, invocations: 3, capturedAt: "2026-08-20T00:00:00.000Z", source: "cloudwatch-bedrock-invocation-logs" } as const;
	expect(await createBaseline(winner)).toBe(true); releaseResults();
	await expect(reconciliation).rejects.toThrow("already exists"); expect(await readBaseline()).toEqual(winner);
});
