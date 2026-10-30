import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { realpathSync } from "node:fs";
import { createAssistantMessageEventStream, type AssistantMessage, type Model, type Tool, type TranscriptContext } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, ModelRuntime, createBashTool } from "@earendil-works/pi-coding-agent";
import { runCommitReviewer } from "../commands/commit/reviewer.ts";
import * as accounting from "../lib/bedrock/accounting.ts";

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

const model: Model<"openai-responses"> = {
	id: "gpt-6-luna", name: "offline", api: "openai-responses", provider: "openai",
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
const inspect = (command: string) => ({ type: "toolCall" as const, id: command, name: "inspect", arguments: { command } });
const submit = (subject: string, paths = ["unfinished.txt"]) => ({ type: "toolCall" as const, id: subject, name: "submit_commit_plan", arguments: { repo: ".", commits: [{ subject, paths }], exclusions: [] } });
const done = () => message([{ type: "text", text: "Done" }]);
const failed = (error = "WebSocket error") => message([submit("must-not-execute")], "error", error);
type Response = { message: AssistantMessage; started?: boolean };
let responses: Response[];
let requests: Array<{ systemPrompt: string; messages: TranscriptContext["messages"]; tools?: Tool[] }>;
let commits: string[];
let progress: string[];
let changed: Map<string, string>;
let index: string[];
let committedPaths: string[];
let git: ReturnType<typeof vi.fn<ExtensionAPI["exec"]>>;
const root = realpathSync(process.cwd());

beforeEach(() => {
	responses = []; requests = []; commits = []; progress = []; changed = new Map(); index = []; committedPaths = [];
	doubles.getAvailable.mockReset().mockResolvedValue([{ ...model, id: "gpt-5.6-luna" }, model]);
	doubles.shell.mockReset().mockImplementation(async (id) => ({ content: [{ type: "text", text: `completed ${id}` }], details: {} }));
	doubles.stream.mockReset().mockImplementation((_model, context, options) => {
		expect(options?.maxRetries).toBe(0);
		const system = context.messages.find((message) => message.role === "system");
		requests.push({ systemPrompt: typeof system?.content === "string" ? system.content : "", messages: structuredClone(context.messages), tools: system?.toolsAdded });
		const response = responses.shift();
		if (!response) throw new Error("Unexpected model request");
		const stream = createAssistantMessageEventStream();
		if (response.started !== false) {
			stream.push({ type: "start", partial: response.message });
			const call = response.message.content.find(part => part.type === "toolCall");
			if (call) stream.push({ type: "toolcall_end", contentIndex: 0, toolCall: call, partial: response.message });
		}
		if (response.message.stopReason === "pending") throw new Error("Test response must be terminal");
		if (response.message.stopReason === "error" || response.message.stopReason === "aborted")
			stream.push({ type: "error", reason: response.message.stopReason, error: response.message });
		else stream.push({ type: "done", reason: response.message.stopReason, message: response.message });
		return stream;
	});
	git = vi.fn<ExtensionAPI["exec"]>().mockImplementation(async (_command, args) => {
		const operation = args.slice(args[2] === "--literal-pathspecs" ? 3 : 2);
		let stdout = "";
		if (operation.join(" ") === "rev-parse --show-toplevel") stdout = root;
		else if (operation[0] === "rev-parse") stdout = commits.length ? `new-head-${commits.length}` : "old-head";
		else if (operation[0] === "log") stdout = operation.includes("-1") ? commits.at(-1)! : commits.map((commit, i) => `abc${i} ${commit}`).join("\n");
		else if (operation[0] === "status") stdout = [...changed].map(([path, xy]) => `${xy} ${path}${operation.includes("-z") ? "\0" : "\n"}`).join("");
		else if (operation[0] === "add") {
			index = [...changed.keys()];
			for (const path of index) changed.set(path, "M ");
		} else if (operation[0] === "write-tree") stdout = "reviewed-tree";
		else if (operation[0] === "read-tree") {
			index = [];
			for (const path of changed.keys()) changed.set(path, " M");
		} else if (operation[0] === "restore") {
			index = operation.slice(operation.indexOf("--") + 1);
			for (const path of index) changed.set(path, "M ");
		} else if (operation[0] === "diff") stdout = index.map(path => `${path}\0`).join("");
		else if (operation[0] === "commit") {
			commits.push(operation[2]!); committedPaths = [...index];
			for (const path of index) changed.delete(path);
			index = [];
		} else if (operation[0] === "diff-tree") stdout = committedPaths.map(path => `${path}\0`).join("");
		else if (operation[0] === "stash") stdout = operation[1] === "create" ? "retained-index-oid" : "";
		else if (operation[0] === "submodule" || operation[0] === "ls-files" || operation[0] === "for-each-ref") stdout = "";
		else if (operation[0] === "branch") stdout = "main";
		else if (operation[0] === "pull" || operation[0] === "push") stdout = "";
		else throw new Error(`Unexpected Git operation: ${operation.join(" ")}`);
		return { stdout, stderr: "", code: 0, killed: false };
	});
});
afterEach(() => vi.restoreAllMocks());

function start(signal?: AbortSignal, push = false, update?: (text: string) => void) {
	const pi = { exec: git } as unknown as ExtensionAPI;
	const ctx = { cwd: root, hasUI: false, sessionManager: { getSessionFile: () => "commit-origin.jsonl" } } as ExtensionContext;
	const run = runCommitReviewer(pi, ctx, push, signal, text => { progress.push(text); update?.(text); });
	return { run };
}

it("accounts each finalized reviewer response including failed partial usage, not returned totals", async () => {
	const account = vi.spyOn(accounting, "accountBedrockMessage").mockResolvedValue(undefined);
	const partial = { ...failed(), provider: "bedrock-mantle", responseModel: "openai.gpt-5.6-luna" };
	const success = { ...done(), provider: "bedrock-mantle", responseModel: "unknown-target" };
	responses.push({ message: partial }, { message: success });
	await start().run;
	expect(account).toHaveBeenCalledTimes(2);
	expect(account).toHaveBeenNthCalledWith(1, partial, "commit-origin.jsonl");
	expect(account).toHaveBeenNthCalledWith(2, success, "commit-origin.jsonl");
});

it.each([false, true])("retries the same response context after a completed inspection (stream started=%s)", async started => {
	changed.set("unfinished.txt", " M");
	responses.push({ message: message([inspect("staged review")], "toolUse") }, { message: failed(), started }, { message: message([submit("reviewed commit")], "toolUse") });
	const result = await start().run;
	expect(result.model).toBe("openai/gpt-6-luna:low");
	expect(doubles.getAvailable).toHaveBeenCalledWith("openai", { signal: expect.any(AbortSignal) });
	expect(commits).toEqual(["reviewed commit"]);
	expect(requests[2]).toEqual(requests[1]);
	expect(requests[2]!.messages.filter(item => item.role === "user")).toHaveLength(1);
	expect(requests[2]!.messages.at(-1)).toMatchObject({ role: "toolResult", content: [{ type: "text", text: "completed staged review" }] });
	expect(result.text).toBe("abc0 reviewed commit");
	expect(progress.filter(text => text.startsWith("Retrying"))).toEqual(["Retrying model response (1/3)…"]);
	expect(git.mock.calls.some(([, args]) => args[2] === "branch")).toBe(false);
	expect(requests[0]!.tools?.map(tool => tool.name)).toEqual(["submit_commit_plan", "inspect", "read", "ask_ignore"]);
	expect(requests).toHaveLength(3); // Accepted submission ends without a post-submit response.
});

it.each(["WebSocket closed", "WebSocket stream closed before response.completed", "503 Service unavailable"])("recovers transient provider failure: %s", async error => {
	responses.push({ message: failed(error) }, { message: done() });
	await start().run;
	expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0]); expect(commits).toEqual([]);
});

it("allows exactly three retries and retains completed inspection history", async () => {
	responses.push({ message: message([inspect("completed review")], "toolUse") });
	for (let i = 0; i < 4; i++) responses.push({ message: failed() });
	await expect(start().run).rejects.toThrow(/WebSocket error\nNo commits created\.[\s\S]*Stopped/);
	expect(requests).toHaveLength(5);
	expect(doubles.shell).toHaveBeenCalledTimes(1); expect(commits).toEqual([]);
	expect(progress.filter(text => text.startsWith("Retrying"))).toHaveLength(3);
	for (const request of requests.slice(2)) expect(request).toEqual(requests[1]);
});

it.each([
	"Invalid API key", "401 Unauthorized", "403 Forbidden", "Invalid request", "insufficient_quota", "maximum context length exceeded",
	"WebSocket connect timeout after 10000ms", "Request timed out",
])("does not retry terminal provider failure: %s", async error => {
	responses.push({ message: failed(error) });
	await expect(start().run).rejects.toThrow(error);
	expect(requests).toHaveLength(1); expect(commits).toEqual([]);
});

it("never retries a transport-looking code-executed hook failure or executes later groups", async () => {
	changed.set("unfinished.txt", "M "); changed.set("later.txt", "M ");
	const original = git.getMockImplementation()!;
	git.mockImplementation(async (command, args, options) => args[2] === "commit"
		? { stdout: "", stderr: "WebSocket error from Git hook", code: 1, killed: false }
		: original(command, args, options));
	responses.push({ message: message([{ ...submit("first"), arguments: { repo: ".", commits: [{ subject: "first", paths: ["unfinished.txt"] }, { subject: "queued", paths: ["later.txt"] }], exclusions: [] } }], "toolUse") });
	await expect(start().run).rejects.toThrow(/Git commit failed: WebSocket error from Git hook/);
	expect(requests).toHaveLength(1);
	expect(git.mock.calls.filter(([, args]) => args[2] === "commit")).toHaveLength(1);
	expect(progress.some(text => text.startsWith("Retrying"))).toBe(false);
});

it("cancels availability lookup without starting the review agent", async () => {
	doubles.getAvailable.mockImplementation((_provider, options) => new Promise((_resolve, reject) => {
		options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
	}));
	const controller = new AbortController(); const { run } = start(controller.signal);
	await vi.waitFor(() => expect(doubles.getAvailable).toHaveBeenCalled()); controller.abort();
	await expect(run).rejects.toThrow("Cancelled"); expect(requests).toHaveLength(0); expect(commits).toHaveLength(0);
});

it("cancels during backoff without another request", async () => {
	const controller = new AbortController(); responses.push({ message: failed() });
	await expect(start(controller.signal, false, text => { if (text.startsWith("Retrying")) setTimeout(() => controller.abort(), 500); }).run).rejects.toThrow("Cancelled");
	expect(requests).toHaveLength(1);
});

it("does not retry an aborted provider response", async () => {
	responses.push({ message: message([], "aborted", "Request aborted") });
	await expect(start().run).rejects.toThrow("Request aborted"); expect(requests).toHaveLength(1);
});

it("shares the original active deadline across retries and backoff", async () => {
	const setTimeout = globalThis.setTimeout;
	const deadline = vi.spyOn(globalThis, "setTimeout").mockImplementation((...args) => { if (args[1] === 180_000) args[1] = 1100; return setTimeout(...args); });
	responses.push({ message: failed() }, { message: failed() }, { message: done() });
	await expect(start().run).rejects.toThrow("Timed out");
	expect(requests).toHaveLength(2); expect(deadline.mock.calls.filter(([, ms]) => ms === 180_000)).toHaveLength(1);
});

it("retains captured push permission and annotations through recovery without a publication tool", async () => {
	responses.push({ message: failed() }, { message: done() });
	const result = await start(undefined, true).run;
	expect(requests[1]).toEqual(requests[0]); expect(JSON.stringify(requests[1])).toContain("Publication: code-owned");
	expect(requests[0]!.tools?.map(tool => tool.name)).not.toContain("publish_repository");
	expect(git.mock.calls.filter(([, args]) => args[2] === "branch")).toHaveLength(1);
	expect(result.text).toBe("No commits created.\nPushed.");
});

it.each(["M ", " M", "??"])("refuses success or publication when no plan is submitted for %s changes", async xy => {
	changed.set("unfinished.txt", xy); responses.push({ message: done() });
	const error = await start(undefined, true).run.catch(error => error as Error);
	expect(error).toBeInstanceOf(Error); expect(String(error)).toContain("No valid submit_commit_plan received");
	expect(String(error)).toContain("unfinished.txt"); expect(String(error)).not.toContain("Pushed."); expect(commits).toEqual([]);
	expect(git.mock.calls.some(([, args]) => args[2] === "push" || args[2] === "pull")).toBe(false);
});

it("publishes only after code executes an accepted plan, never the unfinished unchanged HEAD", async () => {
	changed.set("unfinished.txt", "M ");
	const original = git.getMockImplementation()!;
	git.mockImplementation(async (command, args, options) => { if (args[2] === "push") expect(commits).toEqual(["finish eligible commit"]); return original(command, args, options); });
	responses.push({ message: message([submit("finish eligible commit")], "toolUse") });
	const result = await start(undefined, true).run;
	expect(result.text).toContain("abc0 finish eligible commit"); expect(result.text).toContain("Pushed."); expect(result.text).not.toContain("Remaining changes");
});

it("corrects an invalid plan in the same Agent using exact validator errors", async () => {
	changed.set("unfinished.txt", "M ");
	responses.push({ message: message([submit("incomplete", ["unknown.txt"])], "toolUse") }, { message: message([submit("corrected")], "toolUse") });
	const result = await start().run;
	expect(commits).toEqual(["corrected"]); expect(result.text).toContain("corrected");
	expect(requests).toHaveLength(2); expect(requests[1]!.messages.filter(item => item.role === "user")).toHaveLength(1);
	expect(requests[1]!.messages.at(-1)).toMatchObject({ role: "toolResult", isError: true });
	expect(JSON.stringify(requests[1]!.messages.at(-1))).toContain('Unknown path: \\"unknown.txt\\"');
	expect(JSON.stringify(requests[1]!.messages.at(-1))).toContain('Missing path: \\"unfinished.txt\\"');
});

it.each([false, true])("stops after the initial invalid plan and two corrections without index mutations (schema error=%s)", async schemaError => {
	changed.set("unfinished.txt", "M ");
	const invalid = schemaError ? { type: "toolCall" as const, id: "bad-schema", name: "submit_commit_plan", arguments: { repo: "." } } : submit("incomplete", ["unknown.txt"]);
	for (let i = 0; i < 3; i++) responses.push({ message: message([invalid], "toolUse") });
	await expect(start().run).rejects.toThrow(/Commit plan invalid after 2 corrections/);
	expect(requests).toHaveLength(3); expect(commits).toEqual([]); expect(index).toEqual(["unfinished.txt"]);
	expect(git.mock.calls.some(([, args]) => ["read-tree", "restore", "commit"].includes(args[2]!))).toBe(false);
});

it("rejects a plan omitting a staged file rather than committing the covered group", async () => {
	changed.set("unfinished.txt", "M "); changed.set("omitted.txt", "M ");
	responses.push({ message: message([submit("partial")], "toolUse") }, { message: done() });
	await expect(start().run).rejects.toThrow('Missing path: "omitted.txt"');
	expect(commits).toEqual([]); expect(index).toEqual(["unfinished.txt", "omitted.txt"]);
});

it.each([false, true])("code unstages explicit exclusions while preserving their reason (initially staged=%s)", async staged => {
	changed.set("excluded.txt", staged ? "M " : " M");
	responses.push({ message: message([{ type: "toolCall", id: "exclude", name: "submit_commit_plan", arguments: { repo: ".", commits: [], exclusions: [{ path: "excluded.txt", reason: "applicable repository rule" }] } }], "toolUse") });
	const result = await start().run;
	expect(result.text).toContain("Left out: excluded.txt: applicable repository rule");
	expect(changed.get("excluded.txt")).toBe(" M"); expect(index).toEqual([]); expect(commits).toEqual([]);
});

it("uses a longer timeout only for publication", async () => {
	responses.push({ message: done() }); await start(undefined, true).run;
	expect(git.mock.calls.find(([, args]) => args[2] === "push")?.[2]?.timeout).toBe(120_000);
	expect(git.mock.calls.find(([, args]) => args[2] === "pull")?.[2]?.timeout).toBe(120_000);
	expect(git.mock.calls.filter(([, args]) => args[2] !== "push" && args[2] !== "pull").every(([, , options]) => options?.timeout === 15_000)).toBe(true);
});

it("confirms a timed-out push from the remote without retrying it", async () => {
	const original = git.getMockImplementation()!;
	git.mockImplementation(async (command, args, options) => {
		if (args[2] === "push") return { stdout: "", stderr: "", code: 1, killed: true };
		if (args[2] === "ls-remote") return { stdout: "old-head\trefs/heads/main\n", stderr: "", code: 0, killed: false };
		return original(command, args, options);
	});
	responses.push({ message: done() }); const result = await start(undefined, true).run;
	expect(result.text).toContain("Pushed."); expect(git.mock.calls.filter(([, args]) => args[2] === "push")).toHaveLength(1);
	const verification = git.mock.calls.find(([, args]) => args[2] === "ls-remote");
	expect(verification?.[1].slice(2)).toEqual(["ls-remote", "--heads", "origin", "refs/heads/main"]);
	expect(verification?.[2]).toMatchObject({ signal: undefined, timeout: 120_000 });
});

it.each(["different-head", "unavailable"])("reports unknown publication when timed-out push verification is %s", async remote => {
	const original = git.getMockImplementation()!;
	git.mockImplementation(async (command, args, options) => {
		if (args[2] === "push") return { stdout: "", stderr: "", code: 1, killed: true };
		if (args[2] === "ls-remote") return { stdout: "other-head\trefs/heads/main\n", stderr: "network unavailable", code: remote === "unavailable" ? 1 : 0, killed: false };
		return original(command, args, options);
	});
	responses.push({ message: done() }); const error = await start(undefined, true).run.catch(error => error as Error);
	expect(error).toBeInstanceOf(Error); expect(String(error)).toContain("Push outcome unknown for: ."); expect(String(error)).not.toContain("No pushes performed.");
	expect(git.mock.calls.filter(([, args]) => args[2] === "push")).toHaveLength(1); expect(doubles.shell).not.toHaveBeenCalled();
});

it("reports a code-retained index reference without losing confirmed publication", async () => {
	changed.set("unfinished.txt", "MM"); responses.push({ message: message([submit("working contents")], "toolUse") });
	const result = await start(undefined, true).run;
	expect(result.text).toContain("Preserved index content: retained-index-oid (.; retained in refs/stash)"); expect(result.text).toContain("Pushed.");
	const operations = git.mock.calls.map(([, args]) => args.slice(2).join(" "));
	expect(operations.indexOf("stash create")).toBeLessThan(operations.indexOf("add -A"));
});

const haiku = { ...model, id: "claude-haiku-4-5", provider: "anthropic", api: "anthropic-messages" } as unknown as Model<"openai-responses">;
const withHaiku = () => doubles.getAvailable.mockImplementation(async provider => provider === "anthropic"
	? [{ ...haiku, id: "claude-haiku-4-5-20251001" }, { ...haiku, id: "claude-haiku-4-4" }, haiku] : [model]);

it("continues the same transcript on the latest Anthropic Haiku after Luna fails", async () => {
	withHaiku(); changed.set("unfinished.txt", "M ");
	const models: string[] = [];
	doubles.stream.mockImplementation(((original) => (m, c, o) => { models.push(m.id); return original(m, c, o); })(doubles.stream.getMockImplementation()!));
	responses.push({ message: message([inspect("staged review")], "toolUse") }, { message: failed("insufficient_quota") }, { message: message([submit("reviewed commit")], "toolUse") });
	const result = await start().run;
	expect(models).toEqual(["gpt-6-luna", "gpt-6-luna", "claude-haiku-4-5"]); expect(requests[2]!.messages).toEqual(requests[1]!.messages);
	expect(result.model).toBe("anthropic/claude-haiku-4-5:low"); expect(commits).toEqual(["reviewed commit"]);
});

it("uses Haiku when no Luna model is available", async () => {
	doubles.getAvailable.mockImplementation(async provider => provider === "anthropic" ? [haiku] : []); responses.push({ message: done() });
	expect((await start().run).model).toBe("anthropic/claude-haiku-4-5:low");
});

it("does not fall back again when Haiku also fails", async () => {
	withHaiku(); responses.push({ message: failed("insufficient_quota") }, { message: failed("Invalid request") });
	await expect(start().run).rejects.toThrow("Invalid request"); expect(requests).toHaveLength(2);
});
