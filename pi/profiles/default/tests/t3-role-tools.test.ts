import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { modelFixture, registryFixture } from "./helpers/model-selection.ts";
import type { ExtensionAPI, ExtensionToolContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { createMockPi } from "./helpers/mock-pi.ts";
import { createT3RoleRuntime } from "../lib/subagents/t3/bootstrap.ts";
import { registerT3RoleTools, type T3RoleToolOptions } from "../lib/subagents/t3/launch.ts";
import { createHandoffStore } from "../lib/subagents/t3/handoffs.ts";
import type { T3ThreadIdentity } from "../lib/subagents/t3/contracts.ts";

const directories: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });
async function fixture(options: Pick<T3RoleToolOptions, "captureGoal"> = {}) {
  vi.stubEnv("PI_SUBAGENT_AUTHORITY", "");
  const profile = mkdtempSync(join(tmpdir(), "t3-role-tools-")); directories.push(profile);
  mkdirSync(join(profile, "agents"));
  for (const agent of ["reader", "strategist"]) writeFileSync(join(profile, "agents", `${agent}.md`), `---\nname: ${agent}\ndescription: Inspect\ntools: [read, subagent_parent, subagent_control]\nmodel: fixture/reader\neffort: low\n---\nInspect the assignment.`);
  let identity: T3ThreadIdentity = { threadId: "parent", cwd: profile, runId: "parent-run" };
  const child = { threadId: "child", parentThreadId: "parent", latestRunId: "child-run" };
  const metadata = { currentThread: vi.fn(async () => identity), thread: vi.fn(async () => ({ thread: child })), capabilities: vi.fn(async () => ({ inheritedProviderInstanceId: "pi-actual", providers: [{ driverKind: "pi", providerInstanceId: "pi-other", canRunChildTask: true, models: [{ id: "fixture/reader", options: [{ id: "thinking", values: ["low", "high"] }] }] }, { driverKind: "pi", providerInstanceId: "pi-actual", canRunChildTask: true, models: [{ id: "fixture/reader", options: [{ id: "thinking", values: ["low", "high"] }] }] }] })) };
  const mock = createMockPi();
  const publicTools: ToolDefinition[] = [];
  const entries: Array<{ type: "custom"; customType: string; data: unknown }> = [];
  const pi = { ...mock, registerTool: (tool: ToolDefinition) => publicTools.push(tool), appendEntry: vi.fn((customType: string, data: unknown) => entries.push({ type: "custom", customType, data })) };
  const operations = ["delegate_task", "orchestrator_capabilities", "task_status", "task_cancel", "t3_thread_send", "t3_thread_read", "t3_thread_wait", "t3_pending_request"];
  let bridgeSource = "/bridge.ts";
  mock.getAllTools.mockImplementation(() => [...operations.map(op => ({ name: `mcp__t3_code__${op}`, sourceInfo: { path: bridgeSource }, exposure: "codemode" })), ...publicTools.map(tool => ({ ...tool, sourceInfo: { path: "/role.ts" } }))] as never);
  const store = createHandoffStore(profile);
  const runtime = createT3RoleRuntime(pi as unknown as ExtensionAPI, { profile, store, metadata, bridgePath: "/bridge.ts" });
  registerT3RoleTools(pi as unknown as ExtensionAPI, runtime, { profile, store, metadata, bridgePath: "/bridge.ts", ...options });
  const domains: Record<string, Record<string, unknown>> = {
    delegate_task: { childThreadId: "child", childRunId: "child-run", taskId: "task-one", status: "running", hasPendingQuestion: false, link: "t3://child", next: "Completion wakes this thread, so end your turn. Do not wait on it or poll it." },
    task_status: { childThreadId: "child", childRunId: "child-run", taskId: "task-one", status: "completed", summary: "done" },
    task_cancel: { taskId: "task-one", status: "cancel_requested" },
    t3_thread_send: { threadId: "child", runId: "follow-run", taskId: "task-two", status: "running", delivery: "started", link: "t3://child" },
    t3_thread_wait: { threadId: "child", runId: "child-run", status: "running", timedOut: true },
    t3_pending_request: { requestIds: ["question-one"] }, t3_thread_read: { thread: child },
  };
  let rejection = false;
  const executeTool = vi.fn(async (name: string, args: unknown, _options?: unknown) => {
    const op = name.split("__").at(-1)!;
    const block = await emit("tool_call", { toolName: name, toolCallId: "public/1", parentToolCallId: activeCall, input: args });
    if (block || rejection) return { toolCall: { id: "nested", name, arguments: args }, isError: true, result: { content: [{ type: "text", text: "Approval denied" }], details: { denied: true } } };
    return { toolCall: { id: "nested", name, arguments: args }, isError: false, result: { content: [{ type: "text", text: "Native result" }], details: {}, structuredContent: { content: [{ type: "text", text: JSON.stringify(domains[op]) }], structuredContent: domains[op] } } };
  });
  const input = vi.fn(async () => "answer");
  const ctx = { cwd: profile, isProjectTrusted: () => false, modelRegistry: { getAvailable: () => [{ provider: "fixture", id: "reader" }] }, sessionManager: { getSessionId: () => "session", getSessionFile: () => join(profile, "session.jsonl"), getBranch: () => entries }, tools: operations.map(op => ({ name: `mcp__t3_code__${op}` })), executeTool, ui: { input, notify: vi.fn() } } as unknown as ExtensionToolContext;
  async function emit(event: string, data: unknown = {}) { for (const hook of mock._getHook(event)) { const value = await hook.handler(data, ctx); if (value !== undefined) return value; } }
  await emit("session_start");
  let activeCall = ""; let count = 0;
  async function run(name: string, args: unknown, signal?: AbortSignal) {
    activeCall = `public-${++count}`;
    const blocked = await emit("tool_call", { toolName: name, toolCallId: activeCall, input: args });
    if (blocked) throw new Error(JSON.stringify(blocked));
    const tool = publicTools.find(tool => tool.name === name)!;
    try { return await tool.execute(activeCall, args as never, signal, undefined, ctx); }
    finally { await emit("tool_execution_end", { toolCallId: activeCall }); }
  }
  const launch = () => run("t3_delegate_role", { agent: "reader", instructions: "Inspect the parser", background: true });
  return { profile, pi, ctx, runtime, publicTools, store, metadata, domains, executeTool, input, entries, run, launch, emit, child, setIdentity: (value: T3ThreadIdentity) => { identity = value; }, reject: () => { rejection = true; }, wrongBridge: () => { bridgeSource = "/imposter.ts"; } };
}
it("launches source-verified actual callable delegation with bootstrap prefix, real target and stable request identity", async () => {
  const f = await fixture(); const output = await f.launch();
  expect(output.isError).not.toBe(true);
  expect(f.publicTools.map(tool => tool.name)).toEqual(["t3_delegate_role", "t3_role_control", "t3_role_parent"]);
  const [name, args] = f.executeTool.mock.calls[0];
  expect(name).toBe("mcp__t3_code__delegate_task");
  expect(args).toMatchObject({ task: expect.stringMatching(/^\/t3-role-bootstrap [a-f0-9]+\n\nInspect the parser$/), title: expect.stringMatching(/^\[reader\] Inspect the parser \[pi-role:[a-f0-9]{64}\]$/), isolation: "shared", mode: "async", clientRequestId: expect.any(String), target: { providerInstanceId: "pi-actual", model: "fixture/reader", options: { thinking: "low" } } });
  expect(args).not.toHaveProperty("role"); expect(args).not.toHaveProperty("cwd");
  expect(output.details).toMatchObject({ threadId: "child", taskId: "task-one", runId: "child-run", childLink: "t3://child", t3Status: "running" });
  expect(await f.store.read((args as Record<string, string>).clientRequestId)).toMatchObject({ commissioner: { threadId: "parent", runId: "parent-run" } });
});
it("routes Opus high to the AWS model in the actual T3 launch target", async () => {
  const f = await fixture();
  const model = "bedrock-mantle/anthropic.claude-opus-5-5";
  Object.assign(f.ctx, { modelRegistry: registryFixture([modelFixture("bedrock-mantle", "anthropic.claude-opus-5"), modelFixture("bedrock-mantle", "anthropic.claude-opus-5-5"), modelFixture("anthropic", "claude-opus-5-5")], ["bedrock-mantle", "anthropic"]) });
  f.metadata.capabilities.mockResolvedValue({ inheritedProviderInstanceId: "pi-actual", providers: [{ driverKind: "pi", providerInstanceId: "pi-actual", canRunChildTask: true, models: [{ id: model, options: [{ id: "thinking", values: ["low", "high"] }] }] }] });
  expect((await f.run("t3_delegate_role", { agent: "reader", instructions: "Inspect", model: "opus", effort: "high", background: true })).isError).not.toBe(true);
  expect(f.executeTool.mock.calls[0][1]).toMatchObject({ target: { providerInstanceId: "pi-actual", model, options: { thinking: "high" } } });
});
it("rejects accidental direct Anthropic and ccyl-as-Pi before any launch or handoff", async () => {
  const f = await fixture();
  f.metadata.currentThread.mockClear(); // Ignore session-start identity discovery.
  for (const model of ["anthropic/claude-opus-5-5", "ccyl/claude-opus-5-5"]) {
    expect(await f.run("t3_delegate_role", { agent: "reader", instructions: "Inspect", model, background: true })).toMatchObject({ isError: true });
  }
  expect(f.executeTool).not.toHaveBeenCalled();
  expect(f.metadata.currentThread).not.toHaveBeenCalled();
  expect(await f.store.ownedHandoffs("parent")).toEqual([]);
});
it("retains a user-requested direct-Anthropic override without rerouting it", async () => {
  const f = await fixture();
  const model = "anthropic/claude-opus-5-5";
  f.metadata.capabilities.mockResolvedValue({ inheritedProviderInstanceId: "pi-actual", providers: [{ driverKind: "pi", providerInstanceId: "pi-actual", canRunChildTask: true, models: [{ id: model, options: [{ id: "thinking", values: ["low", "high"] }] }] }] });
  expect((await f.run("t3_delegate_role", { agent: "reader", instructions: "Inspect", model, providerOverride: "anthropic", background: true })).isError).not.toBe(true);
  expect(f.executeTool.mock.calls[0][1]).toMatchObject({ target: { model } });
});
it("omits unadvertised T3 options while retaining the exact Pi bootstrap setting", async () => {
  const f = await fixture();
  const caps = await f.metadata.capabilities();
  f.metadata.capabilities.mockResolvedValue({ ...caps, providers: caps.providers.map(provider => ({ ...provider, models: provider.models.map(model => ({ ...model, options: [] })) })) });
  expect((await f.launch()).isError).not.toBe(true);
  const args = f.executeTool.mock.calls[0][1];
  expect(args).toMatchObject({ target: { providerInstanceId: "pi-actual", model: "fixture/reader" } });
  expect(args).not.toHaveProperty("target.options");
  const [handoff] = await f.store.ownedHandoffs("parent");
  expect(handoff.snapshot.effort).toBe("low");
});
it("preserves approval rejection and rejects a same-name wrong-source tool", async () => {
  const f = await fixture(); f.reject(); expect(await f.launch()).toMatchObject({ isError: true, details: { denied: true }, content: [{ type: "text", text: "Approval denied" }] });
  const g = await fixture(); g.wrongBridge(); expect(await g.launch()).toMatchObject({ isError: true }); expect(g.executeTool).not.toHaveBeenCalled();
});
it("honors foreground justification, Strategist wait and wait timeout without cancellation", async () => {
  const f = await fixture(); expect(await f.run("t3_delegate_role", { agent: "reader", instructions: "Inspect", background: false })).toMatchObject({ isError: true });
  expect(f.executeTool).not.toHaveBeenCalled();
  expect(await f.run("t3_delegate_role", { agent: "reader", instructions: "Inspect" })).toMatchObject({ isError: true });
  f.domains.delegate_task.hasPendingQuestion = true; f.domains.delegate_task.waitTimedOut = true;
  expect(await f.run("t3_delegate_role", { agent: "strategist", instructions: "Plan", background: true })).not.toHaveProperty("isError", true);
  expect(f.executeTool.mock.calls[0][1]).toMatchObject({ mode: "wait" });
  expect(f.executeTool).toHaveBeenCalledTimes(1);
});
it("rejects unowned control, uses real question schemas and event wait without polling", async () => {
  const f = await fixture(); await f.launch(); f.executeTool.mockClear();
  expect(await f.run("t3_role_control", { id: "stranger", action: "cancel" })).toMatchObject({ isError: true }); expect(f.executeTool).not.toHaveBeenCalled();
  await f.run("t3_role_control", { id: "child", action: "questions" });
  await f.run("t3_role_control", { id: "child", action: "answer", requestId: "question-one", answers: { answer: "yes" } });
  await f.run("t3_role_control", { id: "child", action: "wait", blockingReason: "Interrupted join; no other work", timeoutMs: 10 });
  expect(f.executeTool.mock.calls.map(call => call[1])).toEqual([{ threadId: "child", action: "list" }, { threadId: "child", action: "respond", requestId: "question-one", answers: { answer: "yes" } }, { threadId: "child", runId: "child-run", untilDelegatedWorkSettled: true, timeoutMs: 10 }]);
});
it("tracks the completed-child follow-up's new task, sends active modes and cancels current work through T3", async () => {
  const f = await fixture(); await f.launch();
  const followup = await f.run("t3_role_control", { id: "child", action: "message", message: "Continue implementation", mode: "queue", freshContext: true });
  expect(f.executeTool.mock.calls.at(-1)?.[1]).toMatchObject({ freshContext: true });
  expect(followup.details).toMatchObject({ taskId: "task-two", runId: "follow-run" });
  f.child.latestRunId = "follow-run";
  await f.run("t3_role_control", { id: "task-one", action: "cancel", message: "Stop descendants too" });
  expect(f.executeTool.mock.calls.at(-1)?.slice(0, 2)).toEqual(["mcp__t3_code__task_cancel", { taskId: "task-two", reason: "Stop descendants too", clientRequestId: expect.any(String) }]);
  f.reject(); expect(await f.run("t3_role_control", { id: "child", action: "cancel" })).toMatchObject({ isError: true });
});
it("keeps owned history readable without guessing an external current assignment", async () => {
  const f = await fixture(); await f.launch();
  await f.run("t3_role_control", { id: "child", action: "message", message: "Continue" });
  f.child.latestRunId = "external-run";
  expect((await f.run("t3_role_control", { id: "task-one", action: "inspect" })).details).toMatchObject({ taskId: "task-one", t3Status: "completed" });
  expect((await f.run("t3_role_control", { id: "child", action: "read" })).isError).not.toBe(true);
  expect(await f.run("t3_role_control", { id: "child", action: "cancel" })).toMatchObject({ isError: true });
});
it("uses UI input, persists intent, denies raw bypass, and records actual-run outcomes before wait returns a task receipt", async () => {
  const f = await fixture(); await f.launch();
  const receipts = await f.store.receipts("parent"); const receipt = receipts[0];
  await f.store.claim(receipt.launchId, { identity: { threadId: "child", parentThreadId: "parent", cwd: f.profile, runId: "child-run" }, profile: f.profile, cwd: f.profile, actualParentThreadId: "parent" });
  f.setIdentity({ threadId: "child", parentThreadId: "parent", cwd: f.profile, runId: "early-run" });
  await f.emit("session_tree");
  const question = await f.run("t3_role_parent", { action: "question", message: "Which parser?" });
  expect(question.details).toEqual({ answered: true, answer: "answer" }); expect(f.input).toHaveBeenCalledWith("Which parser?", "Answer for the child", { signal: undefined });
  expect(f.entries.filter(entry => entry.customType === "t3-role-question").map(entry => (entry.data as Record<string, unknown>).state)).toEqual(["pending", "answered"]);
  await f.run("t3_role_parent", { action: "report", outcome: "blocked", message: "Missing parser" });
  expect(await f.store.outcomes("child")).toEqual([expect.objectContaining({ runId: "early-run", taskId: undefined, roleOutcome: "blocked" })]);
  expect(await f.emit("tool_call", { toolName: "mcp__t3_code__task_cancel", toolCallId: "escape", input: { taskId: "other" } })).toMatchObject({ block: true });
});
it("merges substantive outcome only for the actual run, separate from execution completion", async () => {
  const f = await fixture(); await f.launch(); const receipt = (await f.store.receipts("parent"))[0];
  await f.store.outcome({ version: 1, launchId: receipt.launchId, threadId: "child", runId: "old-run", roleOutcome: "failed", summary: "Old failure" });
  let output = await f.run("t3_role_control", { id: "child", action: "inspect" }); expect(output.details).toMatchObject({ t3Status: "completed", roleOutcome: undefined });
  await f.store.outcome({ version: 1, launchId: receipt.launchId, threadId: "child", runId: "child-run", roleOutcome: "partial", summary: "Some files remain" });
  output = await f.run("t3_role_control", { id: "child", action: "inspect" }); expect(output.details).toMatchObject({ t3Status: "completed", roleOutcome: "partial", roleSummary: "Some files remain" });
});
it("preserves inner MCP error flags, not only the Pi outcome flag", async () => {
  const f = await fixture(); f.domains.delegate_task = { isError: true, message: "Ceiling refused" };
  expect(await f.launch()).toMatchObject({ isError: true }); expect(await f.store.receipts("parent")).toEqual([]);
});
it("selects explicit effort over the role default and rejects catalog incompatibility", async () => {
  const f = await fixture();
  expect(await f.run("t3_delegate_role", { agent: "reader", instructions: "Inspect", background: true, effort: "high", isolation: "worktree" })).not.toHaveProperty("isError", true);
  expect(f.executeTool.mock.calls[0][1]).toMatchObject({ isolation: "worktree", target: { model: "fixture/reader", options: { thinking: "high" } } });
  const g = await fixture(); g.domains.orchestrator_capabilities = { providers: [] };
  expect(await g.run("t3_delegate_role", { agent: "reader", instructions: "Inspect", background: true, effort: "max" })).toMatchObject({ isError: true });
  expect(g.executeTool.mock.calls.map(call => call[0])).toEqual(["mcp__t3_code__orchestrator_capabilities"]);
  expect(await g.store.receipts("parent")).toEqual([]);
});
it("captures goal scope before persisting the handoff without adding task lifecycle fields", async () => {
  const goal = { runId: "goal-run", ownerSessionId: "goal-owner", ownerSessionFile: "goal-owner.jsonl" };
  const captureGoal = vi.fn(async () => goal);
  const f = await fixture({ captureGoal }); await f.launch();
  const receipt = (await f.store.receipts("parent"))[0];
  expect(captureGoal).toHaveBeenCalledWith(f.ctx, receipt.launchId, undefined);
  expect((await f.store.read(receipt.launchId)).goal).toEqual(goal);
});
it("checks live lineage before touching owned-looking receipts", async () => {
  const f = await fixture(); await f.launch(); f.executeTool.mockClear(); f.child.parentThreadId = "different-parent";
  expect(await f.run("t3_role_control", { id: "child", action: "cancel" })).toMatchObject({ isError: true });
  expect(f.executeTool).not.toHaveBeenCalled();
});
it("passes the wait cancellation signal through without issuing a task cancellation", async () => {
  const f = await fixture(); await f.launch(); f.executeTool.mockClear();
  const controller = new AbortController(); controller.abort(); f.reject();
  expect(await f.run("t3_role_control", { id: "child", action: "wait", blockingReason: "Rejoin interrupted work" }, controller.signal)).toMatchObject({ isError: true });
  expect(f.executeTool.mock.calls).toEqual([["mcp__t3_code__t3_thread_wait", { threadId: "child", runId: "child-run", untilDelegatedWorkSettled: true }, { signal: controller.signal, onUpdate: undefined }]]);
});
