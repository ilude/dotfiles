import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import bedrock from "../extensions/bedrock/index.ts";

let dir: string;
afterEach(() => { vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
it("registers one management command, records once, normalizes cost, and reports outside context", async () => {
	dir = mkdtempSync(join(tmpdir(), "bedrock-report-")); vi.stubEnv("PI_CODING_AGENT_DIR", dir);
	const hooks = new Map<string, any[]>(); const commands = new Map<string, any>(); const statuses = new Map<string, string>(); const notify = vi.fn(); let provider: any;
	const exec = vi.fn(async (_command: string, args: string[]) => {
		if (args.includes("get-caller-identity")) return { code: 0, stdout: JSON.stringify({ Arn: "arn:aws:iam::058264305403:user/mike.glenn" }), stderr: "" };
		const outputFile = args[args.indexOf("--cli-binary-format") + 2];
		writeFileSync(outputFile, JSON.stringify({ schemaVersion: 1, billingMonth: new Date().toISOString().slice(0, 7), principal: "arn:aws:iam::058264305403:user/mike.glenn", displayName: "mike.glenn", amount: 1.75, models: [], source: "payer-cur-2-athena", generatedAt: new Date().toISOString(), latestUsageAt: null }));
		return { code: 0, stdout: "{}", stderr: "" };
	});
	const pi: any = { registerProvider: (value: any) => provider = value, on: (name: string, fn: any) => hooks.set(name, [...hooks.get(name) ?? [], fn]), registerCommand: (name: string, command: any) => commands.set(name, command), exec };
	bedrock(pi); expect(provider.id).toBe("bedrock-mantle"); expect([...commands.keys()]).toEqual(["bedrock"]);
	const ctx: any = { sessionManager: { getSessionFile: () => "session.jsonl" }, ui: { setStatus: (key: string, value: string) => statuses.set(key, value), notify }, modelRegistry: { getAll: () => provider.getModels(), refresh: vi.fn(async () => ({ errors: new Map() })) } };
	for (const fn of hooks.get("session_start") ?? []) await fn({}, ctx);
	const message: any = { role: "assistant", provider: "amazon-bedrock", model: "openai.gpt-5.6-luna", timestamp: Date.now(), usage: { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } } };
	const onMessage = hooks.get("message_end")?.[0]!; const command = commands.get("bedrock")!;
	const result = await onMessage({ message }, ctx); expect(result.message.usage.cost.total).toBeCloseTo(0.22); expect(statuses.get("bedrock")).toContain("$0.22");
	await onMessage({ message }, ctx); await command.handler("", ctx); expect(notify.mock.calls.at(-1)?.[0]).toContain("1 request(s)");
	await command.handler("refresh", ctx); expect(ctx.modelRegistry.refresh).toHaveBeenCalledWith(expect.objectContaining({ providers: ["bedrock-mantle"] }));
	await command.handler("reconcile", ctx); expect(exec).toHaveBeenCalledWith("aws", expect.arrayContaining(["sts", "get-caller-identity"]), { timeout: 30_000 }); expect(exec).toHaveBeenCalledWith("aws", expect.arrayContaining(["lambda", "invoke"]), { timeout: 300_000 }); expect(notify.mock.calls.at(-1)?.[0]).toContain("Personal AWS CUR baseline for mike.glenn");
	await expect(command.handler("reconcile", ctx)).rejects.toThrow("already exists");
});
