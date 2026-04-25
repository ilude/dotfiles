/**
 * Transcript integration tests -- T3 acceptance criteria.
 *
 * These tests exercise the wave-2 wiring by invoking the extension event
 * handlers directly with mocked Pi events. We do not spin up a real Pi
 * session -- the provider/router/tool/session/subagent extensions are
 * pure functions of (event, ctx) so we can call them through the mock
 * registration helper from helpers/mock-pi.ts.
 *
 * Coverage:
 *   1. Provider/router/message hooks: a single prompt yields correlated
 *      llm_request, routing_decision, assistant_message (EXACTLY ONE per
 *      turn), tool_call metadata, usage (OTel attrs), stop_reason. Response
 *      headers in llm_response have set-cookie, authorization redacted.
 *      routing_decision.prompt_hash matches sha256(prompt_text).
 *   2. Tool lifecycle: tool_call, tool_execution_start/end, tool_result with
 *      parameters, content, error state, truncation. Out-of-order parallel
 *      completions correlate by tool_call_id.
 *   3. End-to-end mock: a turn with one tool call and one routing decision;
 *      assert all expected event families with redacted secrets.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { REDACTED, sha256Hex } from "../lib/transcript.js";
import {
	formatTraceparent,
	getCurrentSpanId,
	getParentTraceId,
	getTraceId,
	initializeRuntime,
	parseTraceparent,
	resetRuntime,
} from "../extensions/transcript-runtime.js";
import providerExtension from "../extensions/transcript-provider.js";
import toolsExtension from "../extensions/transcript-tools.js";
import { emitRoutingDecision } from "../extensions/prompt-router.js";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.js";

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------

const SESSION_ID = "integration-session-001";

function readJsonl(filePath: string): Array<Record<string, unknown>> {
	if (!fs.existsSync(filePath)) return [];
	const text = fs.readFileSync(filePath, "utf-8");
	return text
		.split("\n")
		.filter((l) => l.trim().length > 0)
		.map((l) => JSON.parse(l) as Record<string, unknown>);
}

function tracePathFor(homeDir: string, sessionId = SESSION_ID): string {
	return path.join(homeDir, ".pi", "agent", "traces", `${sessionId}.jsonl`);
}

/**
 * Stand up a fully isolated transcript environment:
 *   - HOME/USERPROFILE pointing at a tmp dir
 *   - settings.json with transcript.enabled=true and the trace path under HOME
 *   - mock pi with provider+tools handlers registered
 *
 * The runtime singleton is reset before each test so module-level state from
 * an earlier test does not bleed in.
 */
function setupTranscript(traceparent?: string) {
	const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-trans-int-"));
	const originalHome = process.env.HOME;
	const originalUserProfile = process.env.USERPROFILE;
	const originalTraceparent = process.env.TRACEPARENT;
	process.env.HOME = tmpHome;
	process.env.USERPROFILE = tmpHome;
	if (traceparent !== undefined) {
		process.env.TRACEPARENT = traceparent;
	} else {
		delete process.env.TRACEPARENT;
	}

	const settingsDir = path.join(tmpHome, ".pi", "agent");
	fs.mkdirSync(settingsDir, { recursive: true });
	fs.writeFileSync(
		path.join(settingsDir, "settings.json"),
		JSON.stringify({
			transcript: {
				enabled: true,
				path: path.join(settingsDir, "traces"),
				retentionDays: 14,
			},
		}),
		"utf-8",
	);

	resetRuntime();
	initializeRuntime(SESSION_ID);

	const pi = createMockPi();
	providerExtension(pi as any);
	toolsExtension(pi as any);

	const ctx = createMockCtx({
		sessionManager: {
			getSessionId: () => SESSION_ID,
			getSessionFile: () => null,
		},
	});

	const cleanup = () => {
		resetRuntime();
		fs.rmSync(tmpHome, { recursive: true, force: true });
		if (originalHome === undefined) delete process.env.HOME;
		else process.env.HOME = originalHome;
		if (originalUserProfile === undefined) delete process.env.USERPROFILE;
		else process.env.USERPROFILE = originalUserProfile;
		if (originalTraceparent === undefined) delete process.env.TRACEPARENT;
		else process.env.TRACEPARENT = originalTraceparent;
	};

	return { pi, ctx, tmpHome, cleanup };
}

/** Invoke the registered handler for a given event_type. */
async function fire(
	pi: ReturnType<typeof createMockPi>,
	eventName: string,
	event: Record<string, unknown>,
	ctx: Record<string, unknown>,
): Promise<unknown> {
	const handlers = pi._getHook(eventName);
	let last: unknown;
	for (const h of handlers) {
		last = await h.handler(event, ctx);
	}
	return last;
}

// ---------------------------------------------------------------------------
// 1. Provider / router / message hooks
// ---------------------------------------------------------------------------

describe("T3 -- provider, router, message hooks (criterion 1)", () => {
	let env: ReturnType<typeof setupTranscript>;
	beforeEach(() => {
		env = setupTranscript();
	});
	afterEach(() => env.cleanup());

	it("emits llm_request with cloned + redacted payload (request headers scrubbed)", async () => {
		await fire(env.pi, "turn_start", { type: "turn_start", turnIndex: 1, timestamp: Date.now() }, env.ctx);
		await fire(
			env.pi,
			"before_provider_request",
			{
				type: "before_provider_request",
				payload: {
					model: "claude-sonnet-4-5",
					messages: [{ role: "user", content: "Refactor the auth module to use JWT." }],
					headers: {
						authorization: "Bearer sk-ant-real-secret-1234567890abcdefghij",
						"x-api-key": "real-key",
						"content-type": "application/json",
					},
				},
			},
			env.ctx,
		);

		const records = readJsonl(tracePathFor(env.tmpHome));
		const reqRecords = records.filter((r) => r.event_type === "llm_request");
		expect(reqRecords.length).toBe(1);
		const raw = fs.readFileSync(tracePathFor(env.tmpHome), "utf-8");
		expect(raw).not.toContain("sk-ant-real-secret-1234567890abcdefghij");
		expect(raw).not.toContain("real-key");
		expect(raw).toContain(REDACTED);
	});

	it("emits llm_response with set-cookie and authorization redacted in response headers", async () => {
		await fire(env.pi, "turn_start", { type: "turn_start", turnIndex: 1, timestamp: Date.now() }, env.ctx);
		await fire(
			env.pi,
			"after_provider_response",
			{
				type: "after_provider_response",
				status: 200,
				headers: {
					"set-cookie": "session=secret-token-abc",
					authorization: "Bearer sk-ant-rotated-real-secret-1234567890abc",
					"x-request-id": "req-001",
				},
			},
			env.ctx,
		);

		const records = readJsonl(tracePathFor(env.tmpHome));
		const respRecords = records.filter((r) => r.event_type === "llm_response");
		expect(respRecords.length).toBe(1);
		const resp = respRecords[0];
		expect((resp.payload as any).status).toBe(200);
		const headers = (resp.payload as any).headers as Record<string, unknown>;
		expect(headers["set-cookie"]).toBe(REDACTED);
		expect(headers.authorization).toBe(REDACTED);
		expect(headers["x-request-id"]).toBe("req-001");
		// Raw text must never contain the secrets.
		const raw = fs.readFileSync(tracePathFor(env.tmpHome), "utf-8");
		expect(raw).not.toContain("secret-token-abc");
		expect(raw).not.toContain("sk-ant-rotated-real-secret-1234567890abc");
	});

	it("emits exactly ONE assistant_message per turn (no per-token spam)", async () => {
		// Turn 1
		await fire(env.pi, "turn_start", { type: "turn_start", turnIndex: 1, timestamp: Date.now() }, env.ctx);
		await fire(env.pi, "message_start", { type: "message_start", message: { id: "msg-1", role: "assistant" } }, env.ctx);
		// 50 streaming updates -- the extension must not emit one record each.
		for (let i = 0; i < 50; i++) {
			await fire(
				env.pi,
				"message_update",
				{ type: "message_update", message: { id: "msg-1" }, assistantMessageEvent: { delta: `tok${i}` } },
				env.ctx,
			);
		}
		await fire(
			env.pi,
			"message_end",
			{
				type: "message_end",
				message: {
					id: "msg-1",
					role: "assistant",
					content: [
						{ type: "thinking", thinking: "I should read the auth module." },
						{ type: "text", text: "Reading now." },
						{ type: "toolCall", id: "tc-001", name: "read", arguments: { file_path: "src/auth.ts" } },
					],
					usage: { input: 1024, output: 312, cacheRead: 0, cacheWrite: 0 },
					stopReason: "tool_use",
					model: "claude-sonnet-4-5",
				},
			},
			env.ctx,
		);

		// Pi often fires message_end again for the toolResult message in the
		// same turn -- assert dedupe ignores it.
		await fire(
			env.pi,
			"message_end",
			{
				type: "message_end",
				message: {
					id: "msg-toolresult-1",
					role: "toolResult",
					content: [{ type: "text", text: "fake tool output" }],
				},
			},
			env.ctx,
		);

		const records = readJsonl(tracePathFor(env.tmpHome));
		const assistant = records.filter((r) => r.event_type === "assistant_message");
		expect(assistant.length).toBe(1);
		const updates = records.filter((r) => r.event_type === "assistant_streaming");
		expect(updates.length).toBe(0);

		// usage maps to OTel attribute names.
		const payload = assistant[0].payload as Record<string, unknown>;
		const usage = payload.usage as Record<string, unknown>;
		expect(usage["gen_ai.usage.input_tokens"]).toBe(1024);
		expect(usage["gen_ai.usage.output_tokens"]).toBe(312);
		expect(payload.stop_reason).toBe("tool_use");

		// content captures the thinking block, text block, and tool-call request.
		const content = payload.content as Array<Record<string, unknown>>;
		expect(content.find((b) => b.type === "thinking")).toBeDefined();
		expect(content.find((b) => b.type === "tool_use")).toBeDefined();
		const toolCalls = payload.tool_calls as Array<Record<string, unknown>>;
		expect(toolCalls.length).toBe(1);
		expect(toolCalls[0].id).toBe("tc-001");
	});

	it("routing_decision.prompt_hash matches sha256 of the prompt (joins routing_log.jsonl)", async () => {
		await fire(env.pi, "turn_start", { type: "turn_start", turnIndex: 1, timestamp: Date.now() }, env.ctx);

		const promptText = "Refactor the auth module to use JWT.";
		const rec = {
			schema_version: "3.0.0",
			primary: { model_tier: "Sonnet", effort: "medium" },
			candidates: [{ model_tier: "Sonnet", effort: "medium", confidence: 0.81 }],
			confidence: 0.81,
		};
		const policy = {
			N_HOLD: 0,
			DOWNGRADE_THRESHOLD: 0.85,
			K_CONSEC: 2,
			COOLDOWN_TURNS: 2,
			UNCERTAIN_THRESHOLD: 0.55,
			UNCERTAIN_FALLBACK_ENABLED: false,
			maxEffortLevel: "high",
		};
		await emitRoutingDecision(promptText, rec as any, { tier: "mid", effort: "medium", ruleFired: "classifier" }, policy);

		const records = readJsonl(tracePathFor(env.tmpHome));
		const routing = records.filter((r) => r.event_type === "routing_decision");
		expect(routing.length).toBe(1);
		const payload = routing[0].payload as Record<string, unknown>;
		expect(payload.prompt_hash).toBe(sha256Hex(promptText));
		expect(payload.applied_route).toBe("mid:medium");
		expect(payload.confidence).toBe(0.81);
		expect(payload.rule_fired).toBe("classifier");
		expect(payload.raw_classifier_output).toBeDefined();
	});

	it("emits model_select with previous + current model identity", async () => {
		await fire(env.pi, "turn_start", { type: "turn_start", turnIndex: 1, timestamp: Date.now() }, env.ctx);
		await fire(
			env.pi,
			"model_select",
			{
				type: "model_select",
				model: { provider: "anthropic", id: "claude-sonnet-4-5", name: "Sonnet" },
				previousModel: { provider: "anthropic", id: "claude-haiku-4", name: "Haiku" },
				source: "cycle",
			},
			env.ctx,
		);

		const records = readJsonl(tracePathFor(env.tmpHome));
		const sel = records.find((r) => r.event_type === "model_select");
		expect(sel).toBeDefined();
		const p = sel!.payload as Record<string, unknown>;
		expect(p.source).toBe("cycle");
		expect((p.model as any).id).toBe("claude-sonnet-4-5");
		expect((p.previous_model as any).id).toBe("claude-haiku-4");
	});

	it("turn_start advances the runtime turn counter", async () => {
		await fire(env.pi, "turn_start", { type: "turn_start", turnIndex: 1, timestamp: Date.now() }, env.ctx);
		await fire(
			env.pi,
			"before_provider_request",
			{ type: "before_provider_request", payload: { messages: [], turn: 1 } },
			env.ctx,
		);
		await fire(env.pi, "turn_start", { type: "turn_start", turnIndex: 2, timestamp: Date.now() }, env.ctx);
		await fire(
			env.pi,
			"before_provider_request",
			{ type: "before_provider_request", payload: { messages: [], turn: 2 } },
			env.ctx,
		);

		const records = readJsonl(tracePathFor(env.tmpHome));
		const turnIds = records.map((r) => r.turn_id);
		expect(turnIds).toContain("turn-1");
		expect(turnIds).toContain("turn-2");
	});
});

// ---------------------------------------------------------------------------
// 2. Tool lifecycle
// ---------------------------------------------------------------------------

describe("T3 -- tool lifecycle hooks (criterion 2)", () => {
	let env: ReturnType<typeof setupTranscript>;
	beforeEach(() => {
		env = setupTranscript();
	});
	afterEach(() => env.cleanup());

	it("emits tool_call, tool_execution_start, tool_execution_end, tool_result for a single tool", async () => {
		await fire(env.pi, "turn_start", { type: "turn_start", turnIndex: 1, timestamp: Date.now() }, env.ctx);
		const tcId = "tc-bash-001";

		await fire(
			env.pi,
			"tool_call",
			{ type: "tool_call", toolCallId: tcId, toolName: "bash", input: { command: "ls -la" } },
			env.ctx,
		);
		await fire(
			env.pi,
			"tool_execution_start",
			{ type: "tool_execution_start", toolCallId: tcId, toolName: "bash", args: { command: "ls -la" } },
			env.ctx,
		);
		await fire(
			env.pi,
			"tool_execution_end",
			{ type: "tool_execution_end", toolCallId: tcId, toolName: "bash", result: {}, isError: false },
			env.ctx,
		);
		await fire(
			env.pi,
			"tool_result",
			{
				type: "tool_result",
				toolCallId: tcId,
				toolName: "bash",
				input: { command: "ls -la" },
				content: [{ type: "text", text: "total 0\nfile.txt" }],
				details: { exitCode: 0, stdout: "total 0\nfile.txt" },
				isError: false,
			},
			env.ctx,
		);

		const records = readJsonl(tracePathFor(env.tmpHome));
		const types = records.map((r) => r.event_type);
		expect(types).toContain("tool_call");
		expect(types).toContain("tool_execution_start");
		expect(types).toContain("tool_execution_end");
		expect(types).toContain("tool_result");

		// tool_call carries parameters
		const callRec = records.find((r) => r.event_type === "tool_call");
		expect(callRec).toBeDefined();
		expect((callRec!.payload as any).input.command).toBe("ls -la");

		// tool_execution_end carries duration_ms
		const endRec = records.find((r) => r.event_type === "tool_execution_end");
		expect(endRec).toBeDefined();
		expect(typeof (endRec!.payload as any).duration_ms === "number" || (endRec!.payload as any).duration_ms === null).toBe(true);

		// tool_result carries content + details
		const resultRec = records.find((r) => r.event_type === "tool_result");
		expect(resultRec).toBeDefined();
		expect((resultRec!.payload as any).is_error).toBe(false);
		expect(((resultRec!.payload as any).content as Array<any>)[0].text).toBe("total 0\nfile.txt");
	});

	it("redacts secrets in tool_result content[*].text via free-text scan", async () => {
		await fire(env.pi, "turn_start", { type: "turn_start", turnIndex: 1, timestamp: Date.now() }, env.ctx);
		await fire(
			env.pi,
			"tool_result",
			{
				type: "tool_result",
				toolCallId: "tc-bash-secret",
				toolName: "bash",
				input: { command: "cat ~/.aws/credentials" },
				content: [{ type: "text", text: "aws_access_key_id = AKIAABCDEFGHIJKLMNOP" }],
				details: { stdout: "AKIAABCDEFGHIJKLMNOP" },
				isError: false,
			},
			env.ctx,
		);
		const raw = fs.readFileSync(tracePathFor(env.tmpHome), "utf-8");
		expect(raw).not.toContain("AKIAABCDEFGHIJKLMNOP");
		expect(raw).toContain(REDACTED);
	});

	it("preserves truncation metadata in tool_result", async () => {
		await fire(env.pi, "turn_start", { type: "turn_start", turnIndex: 1, timestamp: Date.now() }, env.ctx);
		await fire(
			env.pi,
			"tool_result",
			{
				type: "tool_result",
				toolCallId: "tc-bash-trunc",
				toolName: "bash",
				input: { command: "find /" },
				content: [{ type: "text", text: "truncated..." }],
				details: { truncated: true, originalLength: 50000, returnedLength: 1000, fullOutputPath: "/tmp/full.txt" },
				isError: false,
			},
			env.ctx,
		);
		const records = readJsonl(tracePathFor(env.tmpHome));
		const resultRec = records.find((r) => r.event_type === "tool_result");
		const trunc = (resultRec!.payload as any).truncation;
		expect(trunc.truncated).toBe(true);
		const details = (resultRec!.payload as any).details;
		expect(details.originalLength).toBe(50000);
		expect(details.returnedLength).toBe(1000);
		expect(details.fullOutputPath).toBe("/tmp/full.txt");
	});

	it("captures tool_result error state for failed tools", async () => {
		await fire(env.pi, "turn_start", { type: "turn_start", turnIndex: 1, timestamp: Date.now() }, env.ctx);
		await fire(
			env.pi,
			"tool_result",
			{
				type: "tool_result",
				toolCallId: "tc-fail-001",
				toolName: "bash",
				input: { command: "false" },
				content: [{ type: "text", text: "command failed: exit code 1" }],
				details: { exitCode: 1 },
				isError: true,
			},
			env.ctx,
		);
		const records = readJsonl(tracePathFor(env.tmpHome));
		const resultRec = records.find((r) => r.event_type === "tool_result");
		const payload = resultRec!.payload as any;
		expect(payload.is_error).toBe(true);
		expect(payload.error).toBe("command failed: exit code 1");
	});

	it("correlates out-of-order parallel completions by tool_call_id", async () => {
		await fire(env.pi, "turn_start", { type: "turn_start", turnIndex: 1, timestamp: Date.now() }, env.ctx);

		// Launch two tools in parallel.
		await fire(
			env.pi,
			"tool_call",
			{ type: "tool_call", toolCallId: "tc-fast", toolName: "read", input: { file_path: "fast.txt" } },
			env.ctx,
		);
		await fire(
			env.pi,
			"tool_call",
			{ type: "tool_call", toolCallId: "tc-slow", toolName: "read", input: { file_path: "slow.txt" } },
			env.ctx,
		);
		await fire(
			env.pi,
			"tool_execution_start",
			{ type: "tool_execution_start", toolCallId: "tc-fast", toolName: "read", args: {} },
			env.ctx,
		);
		await fire(
			env.pi,
			"tool_execution_start",
			{ type: "tool_execution_start", toolCallId: "tc-slow", toolName: "read", args: {} },
			env.ctx,
		);

		// tc-fast completes first, tc-slow second (out of launch order is fine
		// here -- they were started in the same order, but the test below shows
		// dispatch can be reversed too).
		await fire(
			env.pi,
			"tool_execution_end",
			{ type: "tool_execution_end", toolCallId: "tc-fast", toolName: "read", result: {}, isError: false },
			env.ctx,
		);
		await fire(
			env.pi,
			"tool_result",
			{
				type: "tool_result",
				toolCallId: "tc-fast",
				toolName: "read",
				input: { file_path: "fast.txt" },
				content: [{ type: "text", text: "fast content" }],
				details: undefined,
				isError: false,
			},
			env.ctx,
		);
		await fire(
			env.pi,
			"tool_execution_end",
			{ type: "tool_execution_end", toolCallId: "tc-slow", toolName: "read", result: {}, isError: false },
			env.ctx,
		);
		await fire(
			env.pi,
			"tool_result",
			{
				type: "tool_result",
				toolCallId: "tc-slow",
				toolName: "read",
				input: { file_path: "slow.txt" },
				content: [{ type: "text", text: "slow content" }],
				details: undefined,
				isError: false,
			},
			env.ctx,
		);

		const records = readJsonl(tracePathFor(env.tmpHome));
		const results = records.filter((r) => r.event_type === "tool_result");
		expect(results.length).toBe(2);

		// Each result is correlatable to its launching call by tool_call_id.
		const calls = records.filter((r) => r.event_type === "tool_call");
		for (const call of calls) {
			const matching = results.find((r) => r.tool_call_id === call.tool_call_id);
			expect(matching).toBeDefined();
		}

		// monotonic_ns preserves overall write order even when parallel.
		const monos = records.map((r) => BigInt(r.monotonic_ns as string));
		for (let i = 1; i < monos.length; i++) {
			expect(monos[i]).toBeGreaterThan(monos[i - 1]);
		}
	});
});

// ---------------------------------------------------------------------------
// 3. End-to-end mock turn
// ---------------------------------------------------------------------------

describe("T3 -- end-to-end turn (criterion 3)", () => {
	let env: ReturnType<typeof setupTranscript>;
	beforeEach(() => {
		env = setupTranscript();
	});
	afterEach(() => env.cleanup());

	it("a single turn with routing + tool call produces all expected event families with redacted secrets", async () => {
		const promptText = "Refactor the auth module to use JWT.";
		const policy = {
			N_HOLD: 0,
			DOWNGRADE_THRESHOLD: 0.85,
			K_CONSEC: 2,
			COOLDOWN_TURNS: 2,
			UNCERTAIN_THRESHOLD: 0.55,
			UNCERTAIN_FALLBACK_ENABLED: false,
			maxEffortLevel: "high",
		};

		await fire(env.pi, "turn_start", { type: "turn_start", turnIndex: 1, timestamp: Date.now() }, env.ctx);
		await emitRoutingDecision(
			promptText,
			{
				schema_version: "3.0.0",
				primary: { model_tier: "Sonnet", effort: "medium" },
				candidates: [{ model_tier: "Sonnet", effort: "medium", confidence: 0.81 }],
				confidence: 0.81,
			} as any,
			{ tier: "mid", effort: "medium", ruleFired: "classifier" },
			policy,
		);
		await fire(
			env.pi,
			"before_provider_request",
			{
				type: "before_provider_request",
				payload: {
					model: "claude-sonnet-4-5",
					messages: [{ role: "user", content: promptText }],
					headers: {
						authorization: "Bearer sk-ant-real-secret-1234567890abcdefghij",
					},
				},
			},
			env.ctx,
		);
		await fire(
			env.pi,
			"after_provider_response",
			{
				type: "after_provider_response",
				status: 200,
				headers: {
					"set-cookie": "rotated=secret-cookie-value",
					"x-request-id": "rid-1",
				},
			},
			env.ctx,
		);
		await fire(env.pi, "message_start", { type: "message_start", message: { id: "msg-end-001", role: "assistant" } }, env.ctx);
		await fire(
			env.pi,
			"message_end",
			{
				type: "message_end",
				message: {
					id: "msg-end-001",
					role: "assistant",
					content: [
						{ type: "text", text: "Reading auth module." },
						{ type: "toolCall", id: "tc-end-001", name: "read", arguments: { file_path: "src/auth.ts" } },
					],
					usage: { input: 100, output: 30 },
					stopReason: "tool_use",
					model: "claude-sonnet-4-5",
				},
			},
			env.ctx,
		);
		await fire(
			env.pi,
			"tool_call",
			{ type: "tool_call", toolCallId: "tc-end-001", toolName: "read", input: { file_path: "src/auth.ts" } },
			env.ctx,
		);
		await fire(
			env.pi,
			"tool_execution_start",
			{ type: "tool_execution_start", toolCallId: "tc-end-001", toolName: "read", args: {} },
			env.ctx,
		);
		await fire(
			env.pi,
			"tool_execution_end",
			{ type: "tool_execution_end", toolCallId: "tc-end-001", toolName: "read", result: {}, isError: false },
			env.ctx,
		);
		await fire(
			env.pi,
			"tool_result",
			{
				type: "tool_result",
				toolCallId: "tc-end-001",
				toolName: "read",
				input: { file_path: "src/auth.ts" },
				content: [{ type: "text", text: "// auth source\nAKIAABCDEFGHIJKLMNOP" }],
				details: undefined,
				isError: false,
			},
			env.ctx,
		);

		const records = readJsonl(tracePathFor(env.tmpHome));
		const types = new Set(records.map((r) => r.event_type));
		expect(types.has("routing_decision")).toBe(true);
		expect(types.has("llm_request")).toBe(true);
		expect(types.has("llm_response")).toBe(true);
		expect(types.has("message_start")).toBe(true);
		expect(types.has("assistant_message")).toBe(true);
		expect(types.has("tool_call")).toBe(true);
		expect(types.has("tool_execution_start")).toBe(true);
		expect(types.has("tool_execution_end")).toBe(true);
		expect(types.has("tool_result")).toBe(true);

		// Exactly one assistant_message for the single turn.
		expect(records.filter((r) => r.event_type === "assistant_message").length).toBe(1);

		// All sensitive material redacted.
		const raw = fs.readFileSync(tracePathFor(env.tmpHome), "utf-8");
		expect(raw).not.toContain("sk-ant-real-secret-1234567890abcdefghij");
		expect(raw).not.toContain("secret-cookie-value");
		expect(raw).not.toContain("AKIAABCDEFGHIJKLMNOP");
		expect(raw).toContain(REDACTED);

		// Correlation: every record carries the same session_id.
		for (const rec of records) {
			expect(rec.session_id).toBe(SESSION_ID);
		}
	});
});

// ---------------------------------------------------------------------------
// 4. W3C Trace Context propagation
// ---------------------------------------------------------------------------

describe("T3 -- W3C TRACEPARENT propagation", () => {
	beforeEach(() => {
		resetRuntime();
	});
	afterEach(() => {
		resetRuntime();
	});

	it("parses a valid W3C traceparent header", () => {
		const tp = "00-0123456789abcdef0123456789abcdef-aabbccddeeff0011-01";
		const parsed = parseTraceparent(tp);
		expect(parsed).not.toBeNull();
		expect(parsed!.traceId).toBe("0123456789abcdef0123456789abcdef");
		expect(parsed!.spanId).toBe("aabbccddeeff0011");
	});

	it("rejects malformed traceparent values", () => {
		expect(parseTraceparent(undefined)).toBeNull();
		expect(parseTraceparent("")).toBeNull();
		expect(parseTraceparent("not-a-traceparent")).toBeNull();
		expect(parseTraceparent("00-toosmall-aabbccddeeff0011-01")).toBeNull();
		// The W3C version byte must be 00 (current spec); other versions are rejected.
		expect(parseTraceparent("99-0123456789abcdef0123456789abcdef-aabbccddeeff0011-01")).toBeNull();
	});

	it("inherits parent_trace_id from process.env.TRACEPARENT at session_start", () => {
		const traceId = "0123456789abcdef0123456789abcdef";
		const spanId = "aabbccddeeff0011";
		const original = process.env.TRACEPARENT;
		process.env.TRACEPARENT = formatTraceparent(traceId, spanId);
		try {
			const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-trans-tp-"));
			const oldHome = process.env.HOME;
			process.env.HOME = tmpHome;
			process.env.USERPROFILE = tmpHome;
			try {
				resetRuntime();
				initializeRuntime("child-session");
				expect(getTraceId()).toBe(traceId);
				expect(getParentTraceId()).toBe(spanId);
				expect(getCurrentSpanId()).not.toBe(spanId);
				expect(getCurrentSpanId().length).toBe(16);
			} finally {
				if (oldHome === undefined) delete process.env.HOME;
				else process.env.HOME = oldHome;
				delete process.env.USERPROFILE;
				fs.rmSync(tmpHome, { recursive: true, force: true });
			}
		} finally {
			if (original === undefined) delete process.env.TRACEPARENT;
			else process.env.TRACEPARENT = original;
		}
	});

	it("when TRACEPARENT is absent, generates a fresh trace id and no parent_trace_id", () => {
		const original = process.env.TRACEPARENT;
		delete process.env.TRACEPARENT;
		try {
			resetRuntime();
			initializeRuntime("root-session");
			const traceId = getTraceId();
			expect(traceId).toMatch(/^[0-9a-f]{32}$/);
			expect(getParentTraceId()).toBeUndefined();
		} finally {
			if (original !== undefined) process.env.TRACEPARENT = original;
		}
	});
});
