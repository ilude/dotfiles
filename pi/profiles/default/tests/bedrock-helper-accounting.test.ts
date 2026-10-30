import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAssistantMessageEventStream, type AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { accountHelperCompletion, accountHelperStream, helperResponseAccounting, type HelperAccountingAPI } from "../lib/bedrock/helper-accounting.ts";
import { readRecords } from "../lib/bedrock/ledger.ts";
import { notifyGoalAccounting } from "../lib/bedrock/goal-notification.ts";
import { accountBedrockMessage } from "../lib/bedrock/accounting.ts";

const dirs: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function setup() {
	const dir = mkdtempSync(join(tmpdir(), "bedrock-helper-")); dirs.push(dir); vi.stubEnv("PI_CODING_AGENT_DIR", dir);
	let currentSession = "exact/origin-session.jsonl";
	const ctx = { sessionManager: { getSessionFile: () => currentSession, getSessionId: () => "fallback-session-id" } } as unknown as ExtensionContext;
	return { ctx, switchSession: () => { currentSession = "other-session.jsonl"; } };
}
function message(stopReason: AssistantMessage["stopReason"] = "stop", responseModel = "openai.gpt-5.6-luna"): AssistantMessage {
	return { role: "assistant", content: [], api: "openai-responses", provider: "bedrock-mantle", model: "logical-luna", responseModel,
		stopReason, timestamp: Date.now(), usage: { input: 100, output: 20, cacheRead: 5, cacheWrite: 0, totalTokens: 125, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
}

describe("helper response Bedrock accounting", () => {
	it.each(["result", "iterator"] as const)("records final errors once via %s with actual route and original session", async consumer => {
		const { ctx, switchSession } = setup();
		const account = helperResponseAccounting(ctx);
		switchSession();
		const source = createAssistantMessageEventStream();
		const response = message("error");
		source.push({ type: "error", reason: "error", error: response });
		const stream = accountHelperStream(source, account);
		if (consumer === "iterator") for await (const event of stream) expect(event.type).toBe("error");
		expect(await stream.result()).toBe(response);
		expect(await stream.result()).toBe(response);
		const records = await readRecords();
		expect(records).toHaveLength(1);
		expect(records[0]).toMatchObject({ session: "exact/origin-session.jsonl", provider: "bedrock-mantle", model: "logical-luna", target: "openai.gpt-5.6-luna", usage: { input: 100, output: 20, cacheRead: 5 }, pricing: { status: "estimated" } });
	});

	it("records late aborted completions after the caller's cancellation race", async () => {
		const { ctx, switchSession } = setup();
		let resolve!: (value: AssistantMessage) => void;
		const provider = new Promise<AssistantMessage>(done => { resolve = done; });
		const completion = accountHelperCompletion(provider, helperResponseAccounting(ctx));
		expect(await Promise.race([completion, Promise.resolve("cancelled")])).toBe("cancelled");
		switchSession(); resolve(message("aborted", "unknown-target"));
		await completion;
		const [record] = await readRecords();
		expect(record.session).toBe("exact/origin-session.jsonl");
		expect(record.pricing.status).toBe("unpriced");
		expect(record.pricing.total).toBeUndefined();
	});

	it("waits for goal acknowledgement on both consumer paths and propagates its failure", async () => {
		let reject!: (reason: Error) => void;
		const acknowledgement = new Promise<void>((_resolve, fail) => { reject = fail; });
		const emit = vi.fn((name: string, event: unknown) => {
			if (name === "goal-run-id") (event as { respond: (run: string) => void }).respond("run-1");
			if (name === "goal-accounting") (event as { pending: Promise<void>[] }).pending.push(acknowledgement);
		});
		const pi = { events: { emit } } as unknown as HelperAccountingAPI;
		const { ctx } = setup();
		const source = createAssistantMessageEventStream(), response = message();
		source.push({ type: "done", reason: "stop", message: response });
		const stream = accountHelperStream(source, helperResponseAccounting(ctx, pi));
		const result = stream.result();
		const iterator = stream[Symbol.asyncIterator]().next();
		await vi.waitFor(() => expect(emit).toHaveBeenCalledWith("goal-accounting", expect.objectContaining({ type: "goal-accounting", runId: "run-1", session: "exact/origin-session.jsonl", persisted: true })));
		let settled = false; void result.then(() => { settled = true; }, () => {});
		await Promise.resolve(); expect(settled).toBe(false);
		const checks = [expect(result).rejects.toThrow("ack failed"), expect(iterator).rejects.toThrow("ack failed")];
		reject(new Error("ack failed")); await Promise.all(checks);
		expect(emit.mock.calls.filter(([name]) => name === "goal-accounting")).toHaveLength(1);
		expect(await readRecords()).toHaveLength(1);
	});

	it("records without a goal and skips notification when the session has no active run", async () => {
		const { ctx } = setup();
		const emit = vi.fn();
		const pi = { events: { emit } } as unknown as HelperAccountingAPI;
		await accountHelperCompletion(Promise.resolve(message()), helperResponseAccounting(ctx, pi));
		expect(await readRecords()).toHaveLength(1);
		expect(emit.mock.calls.map(([name]) => name)).toEqual(["goal-run-id"]);
	});

	it("notifies a failed ledger write as incomplete rather than silently reporting zero", async () => {
		setup();
		// An existing directory cannot be opened as the ledger file.
		mkdirSync(join(process.env.PI_CODING_AGENT_DIR!, "bedrock-usage.jsonl"));
		const result = await accountBedrockMessage(message(), "exact/origin-session.jsonl");
		expect(result?.persisted).toBe(false);
		const emit = vi.fn((name: string, event: unknown) => {
			if (name === "goal-run-id") (event as { respond: (run: string) => void }).respond("run-1");
		});
		await notifyGoalAccounting({ events: { emit } } as unknown as HelperAccountingAPI, result!);
		expect(emit).toHaveBeenCalledWith("goal-accounting", expect.objectContaining({ persisted: false }));
	});
});
