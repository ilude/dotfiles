import { beforeEach, describe, expect, it, vi } from "vitest";
import { Agent } from "@earendil-works/pi-agent-core";
import { createAssistantMessageEventStream, type AssistantMessageEventStream } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { CommandInvocationAuthority } from "../lib/command-invocations.ts";

vi.mock("../commands/commit/reviewer.ts", () => ({
	commitReviewerTool: (_pi: unknown, resolve: (id: string) => boolean | undefined) => ({
		name: "commit_run",
		label: "Commit",
		description: "fixture",
		parameters: {},
		execute: async (id: string) => ({
			content: [{ type: "text", text: "fixture" }],
			details: { push: resolve(id) },
		}),
	}),
}));

import profileCommands from "../extensions/commands.ts";

type Hook = (event: any, ctx?: any) => unknown;

function fixture() {
	const hooks = new Map<string, Hook[]>();
	const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void> }>();
	const tools = new Map<string, any>();
	const sent: Array<{ message: any; options?: any }> = [];
	let activeTools = ["read", "unrelated_tool"];
	const pi: any = {
		registerMessageRenderer: vi.fn(),
		registerTool: (tool: any) => tools.set(tool.name, tool),
		registerCommand: (name: string, definition: any) => commands.set(name, definition),
		on: (event: string, handler: Hook) => hooks.set(event, [...(hooks.get(event) ?? []), handler]),
		sendMessage: (message: any, options?: any) => sent.push({ message, options }),
		getActiveTools: () => [...activeTools],
		setActiveTools: (names: string[]) => { activeTools = [...names]; },
	};
	const ctx = { hasUI: true, ui: { notify: vi.fn() } };
	profileCommands(pi);
	const emit = async (name: string, event: any) => {
		let result: unknown;
		for (const handler of hooks.get(name) ?? []) result = await handler(event, ctx);
		return result;
	};
	return { pi, commands, tools, sent, ctx, emit, active: () => activeTools };
}

function promptMessages(f: ReturnType<typeof fixture>) {
	return f.sent.filter((entry) => entry.message.customType === "profile-command-prompt");
}

const runtimeModel = {
	id: "runtime-fixture", name: "Runtime fixture", api: "fixture", provider: "fixture", baseUrl: "fixture://offline",
	reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 16_000, maxTokens: 256,
};

function runtimeToolResponse(stream: AssistantMessageEventStream, name: string, id: string): void {
	const call = { type: "toolCall" as const, id, name, arguments: {} };
	const base = {
		role: "assistant" as const, content: [], api: "fixture", provider: "fixture", model: "runtime-fixture",
		usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
		stopReason: "toolUse" as const, timestamp: Date.now(),
	};
	const message = { ...base, content: [call] };
	stream.push({ type: "start", partial: base });
	stream.push({ type: "toolcall_start", contentIndex: 0, partial: base });
	stream.push({ type: "toolcall_end", contentIndex: 0, toolCall: call, partial: message });
	stream.push({ type: "done", reason: "toolUse", message });
	stream.end(message);
}

describe("profile command lifecycle", () => {
	beforeEach(() => vi.clearAllMocks());

	it("uses native steering, binds calls at delivery, and preserves old options", async () => {
		const f = fixture();
		await f.emit("session_start", { reason: "startup" });

		await f.commands.get("commit")!.handler("", f.ctx);
		const bare = promptMessages(f)[0]!;
		expect(bare.options).toMatchObject({ deliverAs: "steer", triggerTurn: true });
		expect(f.active()).toContain("commit_run");
		await f.emit("message_start", { message: { customType: "profile-command-prompt", details: bare.message.details } });
		await f.emit("tool_call", { toolCallId: "bare-call", toolName: "commit_run", input: {} });

		// The second submission is accepted while the first call is still active.
		await f.commands.get("commit")!.handler("push", f.ctx);
		const push = promptMessages(f)[1]!;
		const oldResult = await f.tools.get("commit_run")!.execute("bare-call", {}, undefined, undefined, f.ctx);
		expect(oldResult.details.push).toBe(false);
		// Ordinary user steering and retries do not replace the delivered owner.
		await f.emit("message_start", { message: { role: "user", content: "ordinary steering" } });
		await f.emit("agent_end", { messages: [], willRetry: true });
		await f.emit("session_compact", { reason: "threshold" });
		const retryResult = await f.tools.get("commit_run")!.execute("bare-call", {}, undefined, undefined, f.ctx);
		expect(retryResult.details.push).toBe(false);

		await f.emit("message_start", { message: { customType: "profile-command-prompt", details: push.message.details } });
		await f.emit("tool_call", { toolCallId: "push-call", toolName: "commit_run", input: {} });
		const pushResult = await f.tools.get("commit_run")!.execute("push-call", {}, undefined, undefined, f.ctx);
		expect(pushResult.details.push).toBe(true);

		// /bro is also accepted as native steering and does not mutate the bound call.
		await f.commands.get("bro")!.handler("", f.ctx);
		const bro = promptMessages(f)[2]!;
		expect(bro.options).toMatchObject({ deliverAs: "steer", triggerTurn: true });
		await f.emit("message_start", { message: { customType: "profile-command-prompt", details: bro.message.details } });
		const stillPush = await f.tools.get("commit_run")!.execute("push-call", {}, undefined, undefined, f.ctx);
		expect(stillPush.details.push).toBe(true);
	});

	it("does not let invalid invocations deactivate active work or remove unrelated tools", async () => {
		const f = fixture();
		await f.emit("session_start", { reason: "startup" });
		await f.commands.get("commit")!.handler("", f.ctx);
		const prompt = promptMessages(f)[0]!;
		await f.emit("message_start", { message: { customType: "profile-command-prompt", details: prompt.message.details } });
		await f.emit("tool_call", { toolCallId: "active", toolName: "commit_run", input: {} });

		await f.commands.get("commit")!.handler("not-push", f.ctx);
		expect(f.active()).toContain("commit_run");
		const stillActive = await f.tools.get("commit_run")!.execute("active", {}, undefined, undefined, f.ctx);
		expect(stillActive.details.push).toBe(false);

		await f.emit("tool_result", { toolCallId: "active" });
		await f.emit("agent_settled", {});
		expect(f.active()).toEqual(["read", "unrelated_tool"]);
		await f.emit("session_shutdown", { reason: "quit" });
		expect(f.active()).toEqual(["read", "unrelated_tool"]);
	});

	it("proves native steering sees prepared schemas before the earlier tool settles", async () => {
		const authority = new CommandInvocationAuthority();
		const requests: Array<{ tools: string[]; messages: any[] }> = [];
		let requestNumber = 0;
		let releaseHold!: () => void;
		let holdStarted!: () => void;
		const holdReady = new Promise<void>((resolve) => { holdStarted = resolve; });
		const holdRelease = new Promise<void>((resolve) => { releaseHold = resolve; });
		const empty = Type.Object({});
		const holdTool = { name: "hold_tool", label: "Hold", description: "Inert fixture tool", parameters: empty,
			execute: async () => { holdStarted(); await holdRelease; return { content: [{ type: "text" as const, text: "released" }], details: {} }; } };
		const commitTool = { name: "commit_run", label: "Commit", description: "Inert fixture command tool", parameters: empty,
			execute: async (id: string) => { const invocation = authority.getToolCall(id); if (!invocation) throw new Error("unbound fixture call"); return { content: [{ type: "text" as const, text: "read" }], details: { push: invocation.options.push } }; } };
		let preparedTools: any[] = [holdTool as any];
		const agent = new Agent({
			initialState: { model: runtimeModel as any, thinkingLevel: "off", systemPrompt: "fixture", tools: [holdTool as any] },
			convertToLlm: (messages) => messages.flatMap((message: any) => message.role === "custom" ? [{ role: "user", content: [{ type: "text", text: message.content }], timestamp: message.timestamp }] : [message]),
			streamFn: (_model, context) => {
				requests.push({ tools: (context.tools ?? []).map((tool) => tool.name), messages: context.messages });
				const stream = createAssistantMessageEventStream();
				if (requestNumber++ < 2) runtimeToolResponse(stream, requestNumber === 1 ? "hold_tool" : "commit_run", requestNumber === 1 ? "hold-call" : "commit-call");
				else {
					const message = { role: "assistant" as const, content: [{ type: "text" as const, text: "done" }], api: "fixture", provider: "fixture", model: "runtime-fixture",
						usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop" as const, timestamp: Date.now() };
					stream.push({ type: "start", partial: message }); stream.push({ type: "text_start", contentIndex: 0, partial: message }); stream.push({ type: "text_delta", contentIndex: 0, delta: "done", partial: message }); stream.push({ type: "done", reason: "stop", message }); stream.end(message);
				}
				return stream;
			},
			prepareNextTurnWithContext: (turn) => ({ context: { ...turn.context, tools: preparedTools } }),
			beforeToolCall: async ({ toolCall }) => { if (toolCall.name === "commit_run") authority.bindToolCall(toolCall.id, toolCall.name, "commit", new Map([["commit", new Set(["commit_run"])]])); return undefined; },
			afterToolCall: async ({ toolCall }) => { if (toolCall.name === "commit_run") authority.releaseToolCall(toolCall.id); return undefined; },
			toolExecution: "sequential",
		});
		let delivered = false;
		agent.subscribe((event) => { if (event.type === "message_start" && (event.message as any).role === "custom") delivered = authority.deliver((event.message as any).details); });

		const run = agent.prompt("begin");
		await holdReady;
		const invocation = authority.create("commit", { push: true });
		preparedTools = [holdTool as any, commitTool as any];
		agent.state.tools = preparedTools;
		agent.steer({ role: "custom", customType: "profile-command-prompt", content: "run commit", details: { invocationId: invocation.id }, timestamp: Date.now() } as any);
		releaseHold();
		await run;
		expect(requests[0]!.tools).toEqual(["hold_tool"]);
		expect(requests[1]!.tools).toContain("commit_run");
		expect(delivered).toBe(true);
		expect(requests[1]!.messages.some((message) => (message as any).role === "user" && (message as any).content?.[0]?.text === "run commit")).toBe(true);
		const result = agent.state.messages.find((message: any) => message.role === "toolResult" && message.toolCallId === "commit-call") as any;
		expect(result.details.push).toBe(true);
	});
});
