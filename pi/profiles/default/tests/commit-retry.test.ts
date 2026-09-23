import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { realpathSync } from "node:fs";
import { createAssistantMessageEventStream, type AssistantMessage, type Model, type Tool, type TranscriptContext } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, ModelRuntime, createBashTool } from "@earendil-works/pi-coding-agent";
import { commitReviewerTool } from "../commands/commit/reviewer.ts";

// Keep the real Agent and its stream/tool lifecycle. Only provider and shell/Git
// boundaries are replaced: these tests never send requests or mutate a repository.
const doubles = vi.hoisted(() => ({
	stream: vi.fn<ModelRuntime["streamSimple"]>(),
	shell: vi.fn<ReturnType<typeof createBashTool>["execute"]>(),
	getAvailable: vi.fn<ModelRuntime["getAvailable"]>(),
}));
vi.mock("../lib/model-runtime.ts", () => ({
	createProfileModelRuntime: async () => ({ getAvailable: doubles.getAvailable, streamSimple: doubles.stream } satisfies Pick<ModelRuntime, "getAvailable" | "streamSimple">),
}));
vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
	const original = await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
	return { ...original, createBashTool: (cwd: string) => ({ ...original.createBashTool(cwd), execute: doubles.shell }) };
});

const model: Model<"openai-codex-responses"> = {
	id: "gpt-6-luna", name: "offline", api: "openai-codex-responses", provider: "openai-codex",
	baseUrl: "https://unused.invalid", reasoning: false, input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1000, maxTokens: 1000,
};
function message(content: AssistantMessage["content"], stopReason: AssistantMessage["stopReason"] = "stop", errorMessage?: string): AssistantMessage {
	return {
		role: "assistant", content, stopReason, errorMessage,
		model: model.id, api: model.api, provider: model.provider, timestamp: Date.now(),
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
	};
}
const toolCall = (command: string) => ({ type: "toolCall" as const, id: command, name: "bash", arguments: { command } });
const done = () => message([{ type: "text", text: "Done" }]);
const failed = (error = "WebSocket error") => message([toolCall("must-not-execute")], "error", error);
type Response = { message: AssistantMessage; started?: boolean };
let responses: Response[];
let requests: Array<{ systemPrompt: string; messages: TranscriptContext["messages"]; tools?: Tool[] }>;
let commits: string[];
let progress: string[];
let git: ReturnType<typeof vi.fn<ExtensionAPI["exec"]>>;
const root = realpathSync(process.cwd());

beforeEach(() => {
	responses = [];
	requests = [];
	commits = [];
	progress = [];
	doubles.getAvailable.mockReset().mockResolvedValue([{ ...model, id: "gpt-5.6-luna" }, model]);
	doubles.shell.mockReset().mockImplementation(async (_id, { command }) => {
		commits.push(command);
		return { content: [{ type: "text", text: `completed ${command}` }], details: {} };
	});
	doubles.stream.mockReset().mockImplementation((_model, context, options) => {
		expect(options?.maxRetries).toBe(0);
		const system = context.messages.find((message) => message.role === "system");
		requests.push({
			systemPrompt: typeof system?.content === "string" ? system.content : "",
			messages: structuredClone(context.messages),
			tools: system?.toolsAdded,
		});
		const response = responses.shift();
		if (!response) throw new Error("Unexpected model request");
		const stream = createAssistantMessageEventStream();
		const emit = () => {
			if (response.started !== false) {
				stream.push({ type: "start", partial: response.message });
				const call = response.message.content.find(part => part.type === "toolCall");
				if (call) stream.push({ type: "toolcall_end", contentIndex: 0, toolCall: call, partial: response.message });
			}
			if (response.message.stopReason === "pending") throw new Error("Test response must be terminal");
			if (response.message.stopReason === "error" || response.message.stopReason === "aborted")
				stream.push({ type: "error", reason: response.message.stopReason, error: response.message });
			else stream.push({ type: "done", reason: response.message.stopReason, message: response.message });
		};
		emit();
		return stream;
	});
	git = vi.fn<ExtensionAPI["exec"]>().mockImplementation(async (_command, args) => {
		const operation = args.slice(2);
		let stdout: string;
		if (operation.join(" ") === "rev-parse --show-toplevel") stdout = root;
		else if (operation[0] === "rev-parse") stdout = commits.length ? "new-head" : "old-head";
		else if (operation[0] === "log") stdout = commits.map((commit, index) => `abc${index} ${commit}`).join("\n");
		else if (operation[0] === "status") stdout = "";
		else if (operation[0] === "submodule" || operation[0] === "ls-files") stdout = "";
		else if (operation[0] === "branch") stdout = "main";
		else throw new Error(`Unexpected Git operation: ${operation.join(" ")}`);
		return { stdout, stderr: "", code: 0, killed: false };
	});
});
afterEach(() => vi.restoreAllMocks());

function start(signal?: AbortSignal, push = false, update?: (text: string) => void) {
	// This tool accesses only exec and cwd/hasUI unless ask_ignore is called.
	// Casts keep the test doubles limited to the external boundary under test.
	const pi = { exec: git } as unknown as ExtensionAPI;
	const ctx = { cwd: root, hasUI: false } as ExtensionContext;
	const permission = vi.fn(() => push);
	const run = commitReviewerTool(pi, permission).execute("test", {}, signal, result => {
		const text = result.content.filter(part => part.type === "text").map(part => part.text).join("\n");
		progress.push(text);
		update?.(text);
	}, ctx);
	return { run, permission };
}

it.each([false, true])("retries the same response context after a completed tool (stream started=%s)", async started => {
	responses.push(
		{ message: message([toolCall("child commit")], "toolUse") },
		{ message: failed(), started },
		{ message: message([toolCall("parent commit")], "toolUse") },
		{ message: done() },
	);
	const { run, permission } = start();
	const result = await run;
	expect(result.details).toMatchObject({ model: "openai-codex/gpt-6-luna:low" });
	expect(doubles.getAvailable).toHaveBeenCalledWith("openai-codex", { signal: expect.any(AbortSignal) });
	expect(commits).toEqual(["child commit", "parent commit"]);
	expect(requests[2]).toEqual(requests[1]);
	expect(requests[2]!.messages.filter(item => item.role === "user")).toHaveLength(1);
	expect(requests[2]!.messages.at(-1)).toMatchObject({ role: "toolResult", content: [{ type: "text", text: "completed child commit" }] });
	expect(result.content).toEqual([{ type: "text", text: "abc0 child commit\nabc1 parent commit" }]);
	expect(progress.filter(text => text.startsWith("Retrying"))).toEqual(["Retrying model response (1/3)…"]);
	expect(permission).toHaveBeenCalledTimes(1);
	expect(git.mock.calls.some(([, args]) => args[2] === "branch")).toBe(false);
});

it.each(["WebSocket closed", "WebSocket stream closed before response.completed", "503 Service unavailable"])("recovers transient provider failure: %s", async error => {
	responses.push({ message: failed(error) }, { message: done() });
	const { run } = start();
	await run;
	expect(requests).toHaveLength(2);
	expect(requests[1]).toEqual(requests[0]);
	expect(commits).toEqual([]);
});

it("allows exactly three retries, then reports completed work", async () => {
	responses.push({ message: message([toolCall("child commit")], "toolUse") });
	for (let index = 0; index < 4; index++) responses.push({ message: failed() });
	const { run } = start();
	await expect(run).rejects.toThrow(/WebSocket error\nabc0 child commit[\s\S]*Stopped/);
	expect(requests).toHaveLength(5); // completed tool response + failed response + three retries
	expect(commits).toEqual(["child commit"]);
	expect(progress.filter(text => text.startsWith("Retrying"))).toHaveLength(3);
	for (const request of requests.slice(2)) expect(request).toEqual(requests[1]);
});

it.each([
	"Invalid API key", "401 Unauthorized", "403 Forbidden", "Invalid request",
	"insufficient_quota", "maximum context length exceeded",
	"WebSocket connect timeout after 10000ms", "Request timed out",
])("does not retry terminal provider failure: %s", async error => {
	responses.push({ message: failed(error) });
	const { run } = start();
	await expect(run).rejects.toThrow(error);
	expect(requests).toHaveLength(1);
	expect(commits).toEqual([]);
});

it("never retries a transport-looking tool failure or executes queued mutations", async () => {
	doubles.shell.mockRejectedValueOnce(new Error("WebSocket error from Git hook"));
	responses.push({ message: message([toolCall("git commit"), toolCall("queued mutation")], "toolUse") });
	const { run } = start();
	await expect(run).rejects.toThrow(/shell command: git commit failed[\s\S]*WebSocket error from Git hook/);
	expect(requests).toHaveLength(1);
	expect(doubles.shell).toHaveBeenCalledTimes(1);
	expect(progress.some(text => text.startsWith("Retrying"))).toBe(false);
});

it("cancels availability lookup without starting the review agent", async () => {
	doubles.getAvailable.mockImplementation((_provider, options) => new Promise((_resolve, reject) => {
		options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
	}));
	const controller = new AbortController();
	const { run } = start(controller.signal);
	await vi.waitFor(() => expect(doubles.getAvailable).toHaveBeenCalled());
	controller.abort();
	await expect(run).rejects.toThrow("Cancelled");
	expect(requests).toHaveLength(0);
	expect(commits).toHaveLength(0);
});

it("cancels during backoff without another request", async () => {
	const controller = new AbortController();
	responses.push({ message: failed() });
	const { run } = start(controller.signal, false, text => {
		if (text.startsWith("Retrying")) setTimeout(() => controller.abort(), 500);
	});
	await expect(run).rejects.toThrow("Cancelled");
	expect(requests).toHaveLength(1);
});

it("does not retry an aborted provider response", async () => {
	responses.push({ message: message([], "aborted", "Request aborted") });
	const { run } = start();
	await expect(run).rejects.toThrow("Request aborted");
	expect(requests).toHaveLength(1);
});

it("shares the original active deadline across retries and backoff", async () => {
	// Shorten only the outer deadline. Native promise backoff and cancellation stay real.
	const setTimeout = globalThis.setTimeout;
	const deadline = vi.spyOn(globalThis, "setTimeout").mockImplementation((...args) => {
		if (args[1] === 180_000) args[1] = 1100;
		return setTimeout(...args);
	});
	responses.push({ message: failed() }, { message: failed() }, { message: done() });
	const { run } = start();
	await expect(run).rejects.toThrow("Timed out");
	expect(requests).toHaveLength(2); // one retry completes; original deadline interrupts next backoff
	expect(deadline.mock.calls.filter(([, ms]) => ms === 180_000)).toHaveLength(1);
});

it("retains captured push permission and annotations through recovery", async () => {
	responses.push({ message: failed() }, { message: message([{ type: "text", text: "Pushed" }]) });
	const { run, permission } = start(undefined, true);
	const result = await run;
	expect(permission).toHaveBeenCalledTimes(1);
	expect(requests[1]).toEqual(requests[0]);
	expect(JSON.stringify(requests[1])).toContain("Publication: eligible");
	expect(git.mock.calls.filter(([, args]) => args[2] === "branch")).toHaveLength(1);
	expect(result.content).toEqual([{ type: "text", text: "No commits created.\nPushed." }]);
});
