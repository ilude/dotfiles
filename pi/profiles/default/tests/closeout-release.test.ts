import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentSession, SessionManager, SettingsManager } from "../node_modules/@earendil-works/pi-coding-agent/dist/index.js";
import { DefaultResourceLoader } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/resource-loader.js";
import { createAssistantMessageEventStream, type AssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import subagents from "../extensions/subagents.ts";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
// Bypass this profile's unit-test API alias to exercise the installed SDK.
import type { AgentSession } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js";
import { createCodemodeExtension } from "../node_modules/@earendil-works/pi-coding-agent/dist/extensions/codemode/index.js";

// Replace only child transport/catalog boundaries. The production facade, SDK
// extension runner, tool pipeline, codemode and complete settlement loop are real.
const state = vi.hoisted(() => ({ failure: "", release: vi.fn(), flush: vi.fn(), bind: vi.fn() }));
vi.mock("../lib/subagents/runtime.ts", () => ({
  getSubagentRuntime: () => ({ bind: state.bind, unbind: vi.fn(), flush: state.flush }),
  retireSubagentRuntime: vi.fn(), resetSubagentRuntime: vi.fn(), SUBAGENT_RUNTIME_RESET: "reset",
}));
vi.mock("../lib/subagents/closeout-handoff.ts", () => ({
  CloseoutSuccessorHandoff: class {
    async release(owner: string) { state.release(owner); if (state.failure) throw new Error(state.failure); }
    async inspect() { return { phase: "available" }; }
    async close() {}
  }, extractCloseoutHandoff: vi.fn(),
}));
vi.mock("../lib/subagents/definitions.ts", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/subagents/definitions.ts")>(),
  loadDefinitions: () => ({ agents: new Map(), errors: [] }),
}));
let cwd: string;
let session: AgentSession | undefined;
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "closeout-release-"));
  writeFileSync(join(cwd, "read.txt"), "fixture");
  state.failure = ""; vi.clearAllMocks();
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("HERDR_") || key.startsWith("PI_SUBAGENT_") || key.startsWith("PI_HERDR_")) vi.stubEnv(key, undefined);
  }
});
afterEach(() => { session?.dispose(); session = undefined; vi.unstubAllEnvs(); rmSync(cwd, { recursive: true, force: true }); });
const call = (name: string, args: ToolCall["arguments"], id = name): ToolCall => ({ type: "toolCall", id, name, arguments: args });
async function fixture(calls: ToolCall[], execution: "parallel" | "sequential" = "parallel", extraContinuation = false) {
  let requests = 0;
  const events: string[] = [];
  const shutdown = vi.fn(() => events.push("shutdown"));
  const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
  const loader = new DefaultResourceLoader({ cwd, agentDir: cwd, settingsManager,
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true,
    extensionFactories: [subagents, createCodemodeExtension({ mode: "on" }), pi => {
      pi.registerProvider("release-fixture", { baseUrl: "http://invalid.test", apiKey: "inert-fixture", api: "release-fixture",
        models: [{ id: "inert", name: "inert", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 32000, maxTokens: 100 }],
        streamSimple(model) {
          const stream = createAssistantMessageEventStream(); requests++;
          const message: AssistantMessage = { role: "assistant", content: requests === 1 ? calls : [{ type: "text", text: "ORIGIN FINAL REPORT" }], api: model.api, provider: model.provider, model: model.id,
            usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: requests === 1 ? "toolUse" : "stop", timestamp: Date.now() };
          queueMicrotask(() => { stream.push({ type: "done", reason: message.stopReason as "stop" | "toolUse", message }); stream.end(); });
          return stream;
        },
      });
      pi.on("agent_end", () => { events.push("end"); });
      pi.on("agent_before_settle", () => { events.push("before-settle"); if (extraContinuation) return { continue: true }; });
      pi.on("agent_settled", () => { events.push("settled"); });
    }],
  });
  await loader.reload();
  const created = await createAgentSession({ cwd, agentDir: cwd, resourceLoader: loader, settingsManager, sessionManager: SessionManager.inMemory(cwd),
    model: { id: "inert", name: "inert", api: "release-fixture", provider: "release-fixture", baseUrl: "http://invalid.test", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 32000, maxTokens: 100 }, tools: ["closeout_successor", "read", "codemode"] });
  session = created.session;
  session.agent.toolExecution = execution;
  await session.bindExtensions({ shutdownHandler: shutdown });
  return { run: () => session!.prompt("fixture"), requests: () => requests, shutdown, events, owner: session.sessionManager.getSessionId() };
}
describe("production closeout release loop control", () => {
  it.each(["parallel", "sequential"] as const)("suppresses mixed inspect/read release continuation in %s batches", async execution => {
    const f = await fixture([call("closeout_successor", { action: "inspect" }, "inspect"), call("read", { path: "read.txt" }), call("closeout_successor", { action: "release" }, "release")], execution, true);
    await f.run();
    expect(state.release).toHaveBeenCalledWith(f.owner);
    expect(f.requests()).toBe(1);
    expect(session!.getLastAssistantText()).toBeUndefined();
    expect(f.shutdown).toHaveBeenCalledTimes(1);
    expect(f.events).toEqual(["end", "shutdown", "settled"]);
    expect(state.flush).not.toHaveBeenCalled();
    expect(state.bind.mock.calls.at(-1)![1].deliver({ origin: f.owner })).toBe(false);
  });
  it("suppresses continuation when real codemode consumes the nested release result", async () => {
    const f = await fixture([call("codemode", { code: 'await tools.closeout_successor({action: "release"}); return "nested done";' })], "parallel", true);
    await f.run();
    expect(state.release).toHaveBeenCalledWith(f.owner);
    expect(f.requests()).toBe(1);
    expect(f.shutdown).toHaveBeenCalledTimes(1);
    expect(f.events).toEqual(["end", "shutdown", "settled"]);
  });
  it.each(["Integration is not ready", "Successor host unavailable"])("preserves failed release continuation: %s", async failure => {
    state.failure = failure;
    const f = await fixture([call("closeout_successor", { action: "release" })]);
    await f.run();
    expect(f.requests()).toBe(2);
    expect(session!.getLastAssistantText()).toBe("ORIGIN FINAL REPORT");
    expect(f.shutdown).not.toHaveBeenCalled();
    expect(state.flush).toHaveBeenCalledWith(f.owner);
  });
  it("uses the released context shutdown only at matching session settlement", async () => {
    const context = (owner: string) => ({ cwd, isProjectTrusted: () => false, abort: vi.fn(), shutdown: vi.fn(),
      sessionManager: { getSessionId: () => owner, getBranch: () => [] } });
    type Context = ReturnType<typeof context>;
    type Handler = (event: unknown, ctx: Context) => unknown;
    type Tool = { name: string; execute: (id: string, args: { action: "release" }, signal: undefined, update: undefined, ctx: Context) => Promise<unknown> };
    const handlers = new Map<string, Handler>(), tools = new Map<string, Tool>();
    // This controlled adapter invokes only session_start/agent_settled/release;
    // the other cases above use complete real SDK contexts and tool execution.
    subagents({ on: (name: string, handler: Handler) => handlers.set(name, handler), appendEntry: vi.fn(),
      registerTool: (tool: Tool) => tools.set(tool.name, tool), registerCommand: vi.fn() } as unknown as ExtensionAPI);
    const released = context("released"), ordinary = context("ordinary"), settled = context("released");
    handlers.get("session_start")!({}, released);
    await tools.get("closeout_successor")!.execute("release", { action: "release" }, undefined, undefined, released);
    expect(released.abort).toHaveBeenCalledTimes(1); expect(released.shutdown).not.toHaveBeenCalled();
    handlers.get("session_start")!({}, ordinary);
    handlers.get("agent_settled")!({}, ordinary);
    expect(ordinary.abort).not.toHaveBeenCalled(); expect(ordinary.shutdown).not.toHaveBeenCalled();
    expect(state.flush).toHaveBeenCalledWith("ordinary");
    handlers.get("agent_settled")!({}, settled);
    expect(released.shutdown).toHaveBeenCalledTimes(1); expect(settled.shutdown).not.toHaveBeenCalled();
  });
  it("leaves ordinary nonreleased settlement and delivery unchanged", async () => {
    const f = await fixture([call("read", { path: "read.txt" })]);
    await f.run();
    expect(f.requests()).toBe(2); expect(f.shutdown).not.toHaveBeenCalled();
    expect(state.flush).toHaveBeenCalledWith(f.owner);
  });
});
